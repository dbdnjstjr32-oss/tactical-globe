"""worker_adsb.py — Kinematic Vector Engine (Phase 1)

Polls the OpenSky Network for live aircraft state vectors over the Korean
peninsula bbox, computes per-aircraft kinematic derivatives (turn rate /
descent rate), and flags aerodynamically anomalous tracks into the incidents
table with a normalized kinematic_score and the raw state vector.

DEPENDENCY: requires migration_kinematic.py to have been run first
(adds incidents.kinematic_score and incidents.sensor_raw_vector).

Run:  python worker_adsb.py            (daemon, 10s poll)
      python worker_adsb.py --once     (single pass)
"""

import os
import sys
import json
import time
import math
import hashlib
import urllib.request
import urllib.error
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from db_utils import get_db_connection

# ─── Config ───────────────────────────────────────────────────────────────────
OPENSKY_URL = (
    "https://opensky-network.org/api/states/all"
    "?lamin=24&lomin=34&lamax=40&lomax=60"  # Middle East (Israel/Iran/Hormuz)
)
POLL_INTERVAL = 10          # seconds between polls
REQUEST_TIMEOUT = 12        # HTTP timeout

# Kinematic anomaly thresholds
TURN_RATE_LIMIT = 3.0       # deg/sec — exceeds standard commercial turn rate
DESCENT_RATE_LIMIT = -3000  # ft/min — extreme nosedive (ignores STAR profiles)

# Normalization ceilings (deviation beyond threshold that maps to score 1.0)
TURN_RATE_CEILING = 12.0       # deg/sec above which turn score saturates
DESCENT_RATE_CEILING = -15000  # ft/min below which descent score saturates

KINEMATIC_INSERT_THRESHOLD = 0.5  # minimum score to persist an anomaly

# Unit conversions
M_TO_FT = 3.28084
MS_TO_KTS = 1.94384

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# ─── State memory ───────────────────────────────────────────────────────────────
# active_tracks[icao24] = {
#   "lat", "lng", "alt_ft", "velocity_kts", "heading_deg", "timestamp"
# }
active_tracks: dict = {}


# ─── Kinematic math ─────────────────────────────────────────────────────────────
def calc_turn_rate(h1, h2, dt):
    """Absolute heading change in deg/sec. Normalizes delta to [-180, 180]."""
    if h1 is None or h2 is None or dt <= 0:
        return 0.0
    delta = ((h2 - h1 + 180) % 360) - 180
    return abs(delta) / dt


def calc_descent_rate(alt1, alt2, dt):
    """Vertical speed in ft/min. Returns 0.0 if either altitude is missing."""
    if alt1 is None or alt2 is None or dt <= 0:
        return 0.0
    return (alt2 - alt1) / (dt / 60.0)


def _normalize(value, threshold, ceiling):
    """Map a value's deviation beyond `threshold` into 0.0–1.0 up to `ceiling`."""
    span = abs(ceiling - threshold)
    if span == 0:
        return 1.0
    frac = abs(value - threshold) / span
    return max(0.0, min(1.0, frac))


# ─── Geographical context zones (Middle East) ────────────────────────────────
GEO_CONTEXT_ZONES = {
    "SAFE": [   # airports — sharp turns/descents are normal arrivals
        {"name": "TLV Ben Gurion", "lat": 32.00, "lng": 34.88, "radius_km": 30.0},
        {"name": "DXB Dubai",      "lat": 25.25, "lng": 55.36, "radius_km": 30.0},
    ],
    "CONFLICT": [  # any anomaly here is highly suspicious
        {"name": "Strait of Hormuz", "lat": 26.56, "lng": 56.25, "radius_km": 100.0},
        {"name": "Lebanon Border",   "lat": 33.20, "lng": 35.30, "radius_km": 100.0},
    ],
}
SAFE_ZONE_PENALTY = 0.4    # multiply score down inside airport zones
CONFLICT_ZONE_BONUS = 1.5  # multiply score up inside conflict zones (capped 1.0)


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def classify_zone(lat, lng):
    """Return 'SAFE', 'CONFLICT', or None for a coordinate."""
    if lat is None or lng is None:
        return None
    for z in GEO_CONTEXT_ZONES["CONFLICT"]:   # conflict takes precedence
        if _haversine_km(lat, lng, z["lat"], z["lng"]) <= z["radius_km"]:
            return "CONFLICT"
    for z in GEO_CONTEXT_ZONES["SAFE"]:
        if _haversine_km(lat, lng, z["lat"], z["lng"]) <= z["radius_km"]:
            return "SAFE"
    return None


def compute_kinematic_score(turn_rate, descent_rate):
    """Combine turn/descent deviations into a single 0.0–1.0 anomaly score.

    Uses the max of the two normalized components so a single severe
    deviation alone can produce a high score.
    """
    turn_component = 0.0
    descent_component = 0.0

    if turn_rate > TURN_RATE_LIMIT:
        turn_component = _normalize(turn_rate, TURN_RATE_LIMIT, TURN_RATE_CEILING)

    if descent_rate < DESCENT_RATE_LIMIT:
        descent_component = _normalize(descent_rate, DESCENT_RATE_LIMIT, DESCENT_RATE_CEILING)

    return round(max(turn_component, descent_component), 4)


# ─── OpenSky fetch with exponential backoff ──────────────────────────────────────
def fetch_opensky(max_retries=4):
    """Fetch state vectors. Exponential backoff on 429 / timeout / network error."""
    delay = 5
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(OPENSKY_URL)
            req.add_header("User-Agent", USER_AGENT)
            req.add_header("Accept", "application/json")
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"  [ADSB] HTTP 429 rate-limited. Backoff {delay}s (try {attempt}/{max_retries})")
                time.sleep(delay)
                delay *= 2
                continue
            print(f"  [ADSB] HTTP {e.code}: {e.reason}")
            return None
        except Exception as e:
            print(f"  [ADSB] fetch error ({type(e).__name__}): backoff {delay}s (try {attempt}/{max_retries})")
            time.sleep(delay)
            delay *= 2
            continue
    print("  [ADSB] max retries exceeded; skipping this poll cycle.")
    return None


# ─── Parse a raw OpenSky state vector into a normalized dict ──────────────────────
def parse_state(state):
    """OpenSky /states/all array → dict. Returns None if essential coords missing.

    Index map: 0 icao24, 1 callsign, 5 lon, 6 lat, 7 baro_alt(m),
               9 velocity(m/s), 10 true_track(deg), 13 geo_alt(m)
    """
    try:
        icao24 = (state[0] or "").strip()
        callsign = (state[1] or "").strip()
        lng = state[5]
        lat = state[6]
        baro_alt_m = state[7]
        velocity_ms = state[9]
        heading = state[10]
        geo_alt_m = state[13] if len(state) > 13 else None
    except (IndexError, TypeError):
        return None

    if not icao24 or lat is None or lng is None:
        return None

    alt_m = geo_alt_m if geo_alt_m is not None else baro_alt_m
    alt_ft = round(alt_m * M_TO_FT, 1) if alt_m is not None else None
    velocity_kts = round(velocity_ms * MS_TO_KTS, 1) if velocity_ms is not None else None

    return {
        "icao24": icao24,
        "callsign": callsign or icao24,
        "lat": lat,
        "lng": lng,
        "alt_ft": alt_ft,
        "velocity_kts": velocity_kts,
        "heading_deg": heading,
        "timestamp": time.time(),
    }


# ─── Anomaly persistence ──────────────────────────────────────────────────────────
def insert_anomaly(curr, turn_rate, descent_rate, kinematic_score):
    """Insert a kinematic anomaly into the incidents table (ADSB channel)."""
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    # Unique per aircraft per poll-second to avoid floods while staying dedupable
    incident_id = hashlib.md5(
        f"adsb_{curr['icao24']}_{int(curr['timestamp'])}".encode()
    ).hexdigest()

    sensor_raw_vector = json.dumps({
        "icao24": curr["icao24"],
        "callsign": curr["callsign"],
        "lat": curr["lat"],
        "lng": curr["lng"],
        "alt_ft": curr["alt_ft"],
        "velocity_kts": curr["velocity_kts"],
        "heading_deg": curr["heading_deg"],
        "turn_rate_deg_s": round(turn_rate, 3),
        "descent_rate_ft_min": round(descent_rate, 1),
        "timestamp": curr["timestamp"],
    }, ensure_ascii=False)

    anomaly_type = []
    if turn_rate > TURN_RATE_LIMIT:
        anomaly_type.append(f"TURN {turn_rate:.1f}°/s")
    if descent_rate < DESCENT_RATE_LIMIT:
        anomaly_type.append(f"DESCENT {descent_rate:.0f}ft/min")
    title = f"KINEMATIC ANOMALY [{curr['callsign']}] — {', '.join(anomaly_type)}"
    summary = (
        f"항공기 {curr['callsign']} (ICAO {curr['icao24']})에서 비정상 기동 탐지. "
        f"고도 {curr['alt_ft']}ft, 속도 {curr['velocity_kts']}kts, "
        f"선회율 {turn_rate:.1f}°/s, 수직속도 {descent_rate:.0f}ft/min."
    )

    level = "CRITICAL" if kinematic_score >= 0.8 else "ELEVATED" if kinematic_score >= 0.6 else "NOMINAL"

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Dedup guard
            if cur.execute("SELECT id FROM incidents WHERE id=?", (incident_id,)).fetchone():
                return False
            cur.execute("""
                INSERT INTO incidents (
                    id, country, region, lng, lat, severity, category, title, source,
                    created_at, summary, status, update_count, first_seen,
                    region_risk_index, threat_velocity, trajectory, channel,
                    verified_sources, child_feeds, pinned, watchcon_trigger,
                    kinematic_score, sensor_raw_vector
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                incident_id, "UNKNOWN", curr["callsign"], curr["lng"], curr["lat"],
                kinematic_score, "KINEMATIC_ANOMALY", title, "OPENSKY_ADSB",
                now_iso, summary, level, 1, now_iso,
                round(kinematic_score, 2), 0.0, "SUSTAINED", "ADSB",
                "[]", "[]", 0, 0,
                kinematic_score, sensor_raw_vector
            ))
            conn.commit()
        return True
    except Exception as e:
        print(f"  [ADSB] DB insert error: {e}")
        return False


# ─── Main poll cycle ──────────────────────────────────────────────────────────────
def poll_cycle():
    data = fetch_opensky()
    if not data or "states" not in data or not data["states"]:
        print("  [ADSB] no state vectors this cycle.")
        return 0

    flagged = 0
    seen_icao = set()

    for state in data["states"]:
        curr = parse_state(state)
        if not curr:
            continue
        icao = curr["icao24"]
        seen_icao.add(icao)

        prev = active_tracks.get(icao)
        if prev:
            dt = curr["timestamp"] - prev["timestamp"]
            if dt > 0:
                turn_rate = calc_turn_rate(prev["heading_deg"], curr["heading_deg"], dt)
                descent_rate = calc_descent_rate(prev["alt_ft"], curr["alt_ft"], dt)

                if turn_rate > TURN_RATE_LIMIT or descent_rate < DESCENT_RATE_LIMIT:
                    score = compute_kinematic_score(turn_rate, descent_rate)
                    zone = classify_zone(curr["lat"], curr["lng"])
                    if zone == "SAFE":
                        score = round(score * SAFE_ZONE_PENALTY, 4)
                    elif zone == "CONFLICT":
                        score = round(min(score * CONFLICT_ZONE_BONUS, 1.0), 4)
                    if score >= KINEMATIC_INSERT_THRESHOLD:
                        if insert_anomaly(curr, turn_rate, descent_rate, score):
                            flagged += 1
                            print(f"  [ADSB] ⚠ {curr['callsign']} score={score} zone={zone or 'OPEN'} "
                                  f"turn={turn_rate:.1f}°/s descent={descent_rate:.0f}ft/min")

        # Update state memory
        active_tracks[icao] = curr

    # Prune stale tracks no longer in coverage
    stale = [k for k in active_tracks if k not in seen_icao]
    for k in stale:
        del active_tracks[k]

    print(f"  [ADSB] cycle done | tracked={len(active_tracks)} | flagged={flagged}")
    return flagged


def run():
    once_mode = "--once" in sys.argv
    print("🛩️  [ADSB WORKER] Kinematic Vector Engine initiated.")
    print(f"   bbox=KR peninsula | poll={POLL_INTERVAL}s | "
          f"turn>{TURN_RATE_LIMIT}°/s | descent<{DESCENT_RATE_LIMIT}ft/min")

    while True:
        cycle_start = time.time()
        try:
            poll_cycle()
        except Exception as e:
            print(f"  [ADSB] cycle exception: {e}")

        if once_mode:
            print("🛩️  [ADSB WORKER] Single-pass completed. Exiting.")
            break

        elapsed = time.time() - cycle_start
        sleep_for = max(1, POLL_INTERVAL - elapsed)
        time.sleep(sleep_for)


if __name__ == "__main__":
    run()
