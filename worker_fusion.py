"""worker_fusion.py — Fusion Core & Time-Decay Engine (Phase 2)

Cross-checks physical sensor anomalies (ADSB kinematic events) against text
OSINT incidents that are close in SPACE and TIME, producing a fused alert
weight W_alert. When a fused signal crosses the critical threshold, escalates
the global WATCHCON level and promotes the matched incidents to CRITICAL.

    W_alert = ALPHA * s_sensor + BETA * t_osint * exp(-LAMBDA * delta_t_minutes)

This worker does NOT import from worker_analyzer.py — the minimal WATCHCON
file/log update logic is reimplemented inline to avoid any circular-import
risk between the analysis and fusion pipelines.

Run:  python worker_fusion.py            (daemon, 30s poll)
      python worker_fusion.py --once     (single pass)
"""

import os
import sys
import json
import time
import math
import hashlib
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from db_utils import get_db_connection

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WATCHCON_PATH = os.path.join(BASE_DIR, "data", "watchcon.json")

# ─── Fusion model constants ───────────────────────────────────────────────────
ALPHA = 0.6          # sensor weight
BETA = 0.4           # text OSINT weight
LAMBDA = 0.02        # time-decay rate (per minute; ~50min → e^-1 ≈ 0.37)

W_CRITICAL = 0.85    # fused weight above which WATCHCON escalates

POLL_INTERVAL = 5    # seconds between fusion passes (low-latency tuning)
LOOKBACK_HOURS = 2   # only fuse incidents created within this window
MATCH_RADIUS_KM = 50.0  # spatial gate for sensor↔OSINT correlation

# status text → numeric fallback (used only if severity is non-numeric)
STATUS_TO_SCORE = {
    "CRITICAL": 1.0,
    "HIGH": 0.85,
    "ELEVATED": 0.6,
    "MODERATE": 0.45,
    "NOMINAL": 0.25,
    "LOW": 0.2,
}


# ─── Math helpers ─────────────────────────────────────────────────────────────
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def osint_score(severity, status):
    """Map an OSINT incident to a 0.0–1.0 text-confidence value.

    The incidents.severity column is already a float (0.0–1.0), so it is used
    directly when numeric. If for any reason it is non-numeric, fall back to
    mapping the status text (CRITICAL/HIGH/ELEVATED/...).
    """
    try:
        val = float(severity)
        return max(0.0, min(1.0, val))
    except (TypeError, ValueError):
        return STATUS_TO_SCORE.get(str(status or "").upper().strip(), 0.0)


def fusion_score(s_sensor, t_osint, delta_t_minutes):
    return ALPHA * s_sensor + BETA * t_osint * math.exp(-LAMBDA * delta_t_minutes)


def parse_iso(ts):
    """Parse an ISO8601 'Z' timestamp into an aware datetime. None on failure."""
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


# ─── Inline WATCHCON helpers (no worker_analyzer import) ──────────────────────
def read_watchcon_file():
    try:
        if os.path.exists(WATCHCON_PATH):
            with open(WATCHCON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {"stage": 4, "override": False}


def escalate_watchcon(triggered_by, title, severity, region, country):
    """Lower WATCHCON stage by 1 (higher alert). Respects manual override.

    Writes watchcon.json and appends a watchcon_log row. Returns the new stage,
    or None if no escalation occurred (override active or already at stage 1).
    """
    wc = read_watchcon_file()
    if wc.get("override", False):
        print("  [FUSION] WATCHCON override active — skipping auto escalation.")
        return None

    current_stage = wc.get("stage", 4)
    if current_stage <= 1:
        return None

    new_stage = current_stage - 1
    now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # 1. watchcon_log entry
    try:
        with get_db_connection() as conn:
            log_id = hashlib.sha256(f"{now_str}_{triggered_by}_{new_stage}".encode()).hexdigest()
            conn.execute("""
                INSERT INTO watchcon_log (
                    id, timestamp, previous_stage, new_stage, trigger_type,
                    triggered_by_incident_id, incident_title, incident_severity, region, country
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                log_id, now_str, current_stage, new_stage, "FUSION",
                triggered_by, title, severity, region, country
            ))
            conn.commit()
    except Exception as e:
        print(f"  [FUSION] watchcon_log insert error: {e}")

    # 2. watchcon.json update
    try:
        os.makedirs(os.path.dirname(WATCHCON_PATH), exist_ok=True)
        wc["stage"] = new_stage
        wc["override"] = False
        wc["triggered_by"] = triggered_by
        wc["last_triggered"] = now_str
        wc["timestamp"] = now_str
        with open(WATCHCON_PATH, "w", encoding="utf-8") as f:
            json.dump(wc, f, indent=2)
    except Exception as e:
        print(f"  [FUSION] watchcon.json write error: {e}")

    print(f"  [FUSION] 📡 WATCHCON escalated {current_stage} → {new_stage} by {triggered_by}")
    return new_stage


def promote_status(incident_id, status="CRITICAL"):
    try:
        with get_db_connection() as conn:
            conn.execute("UPDATE incidents SET status=? WHERE id=?", (status, incident_id))
            conn.commit()
    except Exception as e:
        print(f"  [FUSION] status promote error for {incident_id}: {e}")


# ─── Fusion pass ──────────────────────────────────────────────────────────────
def fetch_recent_incidents():
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)) \
        .isoformat().replace("+00:00", "Z")
    with get_db_connection() as conn:
        conn.row_factory = None
        rows = conn.execute("""
            SELECT id, region, country, lat, lng, severity, status, channel,
                   kinematic_score, created_at, title
            FROM incidents
            WHERE created_at >= ?
        """, (cutoff,)).fetchall()
    # tuple → dict
    keys = ["id", "region", "country", "lat", "lng", "severity", "status",
            "channel", "kinematic_score", "created_at", "title"]
    return [dict(zip(keys, r)) for r in rows]


def fusion_pass():
    incidents = fetch_recent_incidents()
    if not incidents:
        print("  [FUSION] no recent incidents in window.")
        return 0

    # Split into physical-sensor anchors and text-OSINT candidates
    sensor_events = [i for i in incidents
                     if i["kinematic_score"] is not None and i["channel"] == "ADSB"]
    osint_events = [i for i in incidents if i["channel"] != "ADSB"]

    if not sensor_events:
        print(f"  [FUSION] {len(incidents)} incidents, no sensor anchors — nothing to fuse.")
        return 0

    escalations = 0

    for sensor in sensor_events:
        s_sensor = float(sensor["kinematic_score"] or 0.0)
        if sensor["lat"] is None or sensor["lng"] is None:
            continue
        s_time = parse_iso(sensor["created_at"])

        # Find the best (highest fused) spatially+temporally matched OSINT event
        best = None
        for osint in osint_events:
            if osint["lat"] is None or osint["lng"] is None:
                continue
            dist = haversine_km(sensor["lat"], sensor["lng"], osint["lat"], osint["lng"])
            if dist > MATCH_RADIUS_KM:
                continue

            o_time = parse_iso(osint["created_at"])
            if s_time and o_time:
                delta_min = abs((s_time - o_time).total_seconds()) / 60.0
            else:
                delta_min = 0.0

            t_osint = osint_score(osint["severity"], osint["status"])
            w = fusion_score(s_sensor, t_osint, delta_min)

            if best is None or w > best["w"]:
                best = {"w": w, "osint": osint, "dist": dist,
                        "delta_min": delta_min, "t_osint": t_osint}

        # No nearby OSINT → sensor-only baseline weight
        if best is None:
            matched_osint = None
            t_osint = 0.0
            # Pre-Alert bypass: severe SIGINT alone uses raw S_sensor (skip 0.6 weight)
            if s_sensor >= 0.85:
                w_alert = s_sensor
            else:
                w_alert = fusion_score(s_sensor, 0.0, 0.0)
        else:
            w_alert = best["w"]
            matched_osint = best["osint"]
            t_osint = best["t_osint"]

        if w_alert >= W_CRITICAL and t_osint > 0:
            # ── Confirmed Alert: sensor + OSINT corroboration ──
            tag = matched_osint["region"]
            print(f"  [FUSION] ⚡ CONFIRMED W_alert={w_alert:.3f} @ {tag} "
                  f"(s_sensor={s_sensor:.2f}, t_osint={t_osint:.2f}, "
                  f"Δt={best['delta_min']:.1f}min, {best['dist']:.1f}km)")
            promote_status(sensor["id"], "CRITICAL")
            promote_status(matched_osint["id"], "CRITICAL")
            new_stage = escalate_watchcon(
                triggered_by=sensor["id"], title=sensor["title"], severity=w_alert,
                region=matched_osint["region"], country=matched_osint["country"],
            )
            if new_stage is not None:
                escalations += 1
            s_created = parse_iso(sensor["created_at"])
            if s_created:
                print(f"  [FUSION] ⏱ Latency from creation: "
                      f"{(datetime.now(timezone.utc) - s_created).total_seconds():.1f}s")
        elif w_alert >= W_CRITICAL and t_osint == 0:
            # ── Pre-Alert: severe SIGINT, no OSINT yet → flag but DON'T escalate WATCHCON ──
            print(f"  [FUSION] 🛰️ SIGINT PRE-ALERT W_alert={w_alert:.3f} @ {sensor['region']} "
                  f"(s_sensor={s_sensor:.2f}, awaiting OSINT corroboration)")
            promote_status(sensor["id"], "HIGH")
            s_created = parse_iso(sensor["created_at"])
            if s_created:
                print(f"  [FUSION] ⏱ Latency from creation: "
                      f"{(datetime.now(timezone.utc) - s_created).total_seconds():.1f}s")

    print(f"  [FUSION] pass done | sensors={len(sensor_events)} "
          f"osint={len(osint_events)} | escalations={escalations}")
    return escalations


def run():
    once_mode = "--once" in sys.argv
    print("🔮 [FUSION WORKER] Fusion Core & Time-Decay Engine initiated.")
    print(f"   α={ALPHA} β={BETA} λ={LAMBDA} | W_crit={W_CRITICAL} | "
          f"radius={MATCH_RADIUS_KM}km | poll={POLL_INTERVAL}s")

    while True:
        cycle_start = time.time()
        try:
            fusion_pass()
        except Exception as e:
            print(f"  [FUSION] cycle exception: {e}")

        if once_mode:
            print("🔮 [FUSION WORKER] Single-pass completed. Exiting.")
            break

        elapsed = time.time() - cycle_start
        time.sleep(max(1, POLL_INTERVAL - elapsed))


if __name__ == "__main__":
    run()
