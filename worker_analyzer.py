import os
import sys
import re
import sqlite3
import urllib.request
import urllib.parse
import json
import html
import hashlib
import time
import random
import threading
from datetime import datetime, timezone
import concurrent.futures
import gc
from db_utils import get_db_connection
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "osint_matrix.db")
CACHE_PATH = os.path.join(BASE_DIR, "data", "geo_cache.json")
WATCHCON_PATH = os.path.join(BASE_DIR, "data", "watchcon.json")

# ─── Thread-safety lock for geo_cache file I/O ───────────────────────────────
geo_cache_lock = threading.RLock()

# Environment
for env_file in [".env.local", ".env"]:
    env_path = os.path.join(BASE_DIR, env_file)
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ[k.strip()] = v.strip().strip('"').strip("'")
        except Exception:
            pass

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "exaone3.5"

# ─── VRAM idle management (Phase 4.2) ─────────────────────────────────────────
VRAM_IDLE_TIMEOUT = 300          # seconds (5 min) of inference inactivity → unload
last_inference_time = time.time()
model_unloaded = False           # guard so we POST keep_alive=0 only once per idle period


def maybe_unload_vram():
    """Unload the model from the RTX 5070 after VRAM_IDLE_TIMEOUT of inactivity.

    Sends keep_alive=0 to Ollama exactly once per idle period (tracked via
    model_unloaded) so we never spam the API each loop tick.
    """
    global model_unloaded
    if model_unloaded:
        return
    if time.time() - last_inference_time <= VRAM_IDLE_TIMEOUT:
        return
    try:
        payload = json.dumps({"model": MODEL_NAME, "keep_alive": 0}).encode("utf-8")
        req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as res:
            res.read()
        model_unloaded = True
        print("[VRAM] Model unloaded from GPU due to 5m idle")
    except Exception as e:
        print(f"[VRAM] unload request failed: {e}")

TACTICAL_KNOWN_LOCATIONS = {
    "GAZA": {"lat": 31.5000, "lng": 34.4667, "country": "PALESTINE"},
    "GAZA CITY": {"lat": 31.5000, "lng": 34.4667, "country": "PALESTINE"},
    "GAZA STRIP": {"lat": 31.5000, "lng": 34.4667, "country": "PALESTINE"},
    "RAFAH": {"lat": 31.5000, "lng": 34.4667, "country": "PALESTINE"},
    "JERUSALEM": {"lat": 31.7683, "lng": 35.2137, "country": "ISRAEL"},
    "TEL AVIV": {"lat": 32.0853, "lng": 34.7818, "country": "ISRAEL"},
    "LEBANON": {"lat": 33.8938, "lng": 35.5018, "country": "LEBANON"},
    "BEIRUT": {"lat": 33.8938, "lng": 35.5018, "country": "LEBANON"},
    "TYRE": {"lat": 33.8938, "lng": 35.5018, "country": "LEBANON"},
    "TEHRAN": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"},
    "IRAN": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"},
    "IRANIAN TERRITORY": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"},
    "SOUTHERN IRAN": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"},
    "STRAIT OF HORMUZ": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"},
    "DAMASCUS": {"lat": 33.5138, "lng": 36.2765, "country": "SYRIA"},
    "BAGHDAD": {"lat": 33.3152, "lng": 44.3661, "country": "IRAQ"},
    "KYIV": {"lat": 50.4501, "lng": 30.5234, "country": "UKRAINE"},
    "MOSCOW": {"lat": 55.7558, "lng": 37.6173, "country": "RUSSIA"},
    "TAIPEI": {"lat": 25.0330, "lng": 121.5654, "country": "TAIWAN"},
    "SEOUL": {"lat": 37.5665, "lng": 126.9780, "country": "SOUTH KOREA"},
    "NORTH KOREA": {"lat": 39.0271, "lng": 125.7570, "country": "NORTH KOREA"},
    "PYONGYANG": {"lat": 39.0271, "lng": 125.7570, "country": "NORTH KOREA"},
    "TOKYO": {"lat": 35.6762, "lng": 139.6503, "country": "JAPAN"},
    "EUROPE": {"lat": 50.8503, "lng": 4.3517, "country": "BELGIUM"},
    "BRUSSELS": {"lat": 50.8503, "lng": 4.3517, "country": "BELGIUM"},
    "GLOBAL": {"lat": 20.0000, "lng": 0.0000, "country": "GLOBAL"},
    "WALL STREET": {"lat": 40.7060, "lng": -74.0088, "country": "UNITED STATES"},
    "WALLSTREET": {"lat": 40.7060, "lng": -74.0088, "country": "UNITED STATES"},
    "SILICON VALLEY": {"lat": 37.3875, "lng": -122.0575, "country": "UNITED STATES"},
    "FED": {"lat": 38.8922, "lng": -77.0398, "country": "UNITED STATES"},
    "FEDERAL RESERVE": {"lat": 38.8922, "lng": -77.0398, "country": "UNITED STATES"},
    "IMF": {"lat": 38.8996, "lng": -77.0435, "country": "UNITED STATES"},
    "WORLD BANK": {"lat": 38.8988, "lng": -77.0425, "country": "UNITED STATES"},
    "OPEC": {"lat": 48.2185, "lng": 16.3601, "country": "AUSTRIA"}
}

# ─── Geo-cache: thread-safe load / save ──────────────────────────────────────
def load_geo_cache():
    with geo_cache_lock:
        if os.path.exists(CACHE_PATH):
            try:
                with open(CACHE_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

def save_geo_cache(cache_data):
    with geo_cache_lock:
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)

# ─── Keyword helpers ─────────────────────────────────────────────────────────
def get_keywords(text):
    if not text: return set()
    return set(re.findall(r'[a-zA-Z]{3,}', text.lower()))

def calculate_jaccard_similarity(text1, text2):
    kw1 = get_keywords(text1)
    kw2 = get_keywords(text2)
    if not kw1 or not kw2: return 0.0
    return len(kw1.intersection(kw2)) / len(kw1.union(kw2))

def safe_str(val, default=""):
    if val is None:
        return default
    if isinstance(val, list):
        return ", ".join(str(v) for v in val)
    return str(val)

# ─── Watchcon helpers ─────────────────────────────────────────────────────────
def read_watchcon_file():
    try:
        if os.path.exists(WATCHCON_PATH):
            with open(WATCHCON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {"stage": 4, "override": False}

def write_watchcon_file(stage, override):
    try:
        os.makedirs(os.path.dirname(WATCHCON_PATH), exist_ok=True)
        wc = read_watchcon_file()
        wc["stage"] = stage
        wc["override"] = override
        wc["timestamp"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        with open(WATCHCON_PATH, "w", encoding="utf-8") as f:
            json.dump(wc, f, indent=2)
    except Exception:
        pass


# ─── Ollama AI analysis ───────────────────────────────────────────────────────
def process_ai_intel_analysis(article_title, article_summary, channel):
    if channel == "ECONOMY":
        category_desc = 'Choose exactly one from ["RECESSSION", "MARKET_CRASH", "INFLATION", "TRADE_WAR", "ENERGY", "TECH_CRISIS"].'
        summary_instruction = "Write a concise 3 to 4 sentence objective economic summary in KOREAN (한국어). Focus ONLY on confirmed facts, numbers, and direct events. Do NOT include any subjective opinions, predictions, or exaggerated/dramatic tone."
        prompt = f"""
        [MILITARY & DISASTER OSINT INTELLIGENCE BRIEFING PROTOCOL]
        Analyze this raw breaking news article and extract structured geopolitical/economic crisis telemetry.
        Article Title: {article_title}
        Article Summary: {article_summary}
        You must output exactly in JSON format, no preamble, no markdown.
        JSON Schema fields required:
        - region: Specific city, town, or province. MUST BE ONLY IN ENGLISH ALPHABET. NO KOREAN.
          CRITICAL RULE: If the location is in the United States, specify the state name alongside the city.
        - country: The sovereign country name in English.
        - category: {category_desc}
        - severity: Floating point number from 0.00 to 1.00 indicating threat/crisis gravity.
        - sanity_score: Number from 0.00 to 1.00 scoring the factual reliability based on the source and tone.
        - tactical_summary: {summary_instruction} Use a serious military/analyst reporting tone.
        JSON Output:
        """
    elif channel == "TELEGRAM":
        category_desc = 'Choose exactly one from ["WAR", "EXPLOSION", "CYBERATTACK", "MILITARY", "DISASTER", "UNREST", "CONFLICT", "AIRSTRIKE", "EVACUATION", "NUCLEAR"].'
        summary_instruction = "Write a concise 3 to 4 sentence objective tactical summary in KOREAN (한국어). Focus ONLY on confirmed facts, locations, and actions. Do NOT include any subjective opinions, political bias, or exaggerated/dramatic tone. TELEGRAM OSINT source — treat as unverified but high-priority field intelligence."
        prompt = f"""
        [MILITARY & DISASTER OSINT INTELLIGENCE BRIEFING PROTOCOL]
        Analyze this raw breaking news article and extract structured geopolitical/economic crisis telemetry.
        Article Title: {article_title}
        Article Summary: {article_summary}
        You must output exactly in JSON format, no preamble, no markdown.
        JSON Schema fields required:
        - region: Specific city, town, or province. MUST BE ONLY IN ENGLISH ALPHABET. NO KOREAN.
          CRITICAL RULE: If the location is in the United States, specify the state name alongside the city.
        - country: The sovereign country name in English.
        - category: {category_desc}
        - severity: Floating point number from 0.00 to 1.00 indicating threat/crisis gravity.
        - sanity_score: Number from 0.00 to 1.00 scoring the factual reliability based on the source and tone.
        - tactical_summary: {summary_instruction} Use a serious military/analyst reporting tone.
        - pin_worthy: Boolean (true/false) indicating whether this represents breaking news, immediate threat to life, nuclear/chemical weapons, airstrikes, or major military operations.
        - watchcon_trigger: Boolean (true/false) indicating whether this represents a direct interstate clash, nuclear threat, large-scale airstrike, or direct engagement of US/South Korean forces.
        JSON Output:
        """
    elif channel == "CYBER_AI":
        category_desc = 'Choose exactly one from ["CYBERATTACK", "DATA_BREACH", "ZERO_DAY", "RANSOMWARE", "AI_INCIDENT", "DEEPFAKE", "MODEL_LEAK", "BOTNET", "ESPIONAGE", "INFRASTRUCTURE_ATTACK"].'
        summary_instruction = "Write a concise 3 to 4 sentence objective technical summary in KOREAN (한국어). Focus on confirmed CVEs, threat actors, affected systems, and impact. No speculation."
        prompt = f"""
        [CYBER & AI OSINT INTELLIGENCE BRIEFING PROTOCOL]
        Analyze this cybersecurity or AI incident report and extract structured threat telemetry.
        Article Title: {article_title}
        Article Summary: {article_summary}
        You must output exactly in JSON format, no preamble, no markdown.
        JSON Schema fields required:
        - region: Specific city, town, or province where the attack originated or impacted. MUST BE ONLY IN ENGLISH ALPHABET. NO KOREAN.
          CRITICAL RULE: If the location is in the United States, specify the state name alongside the city.
        - country: The sovereign country name in English.
        - category: {category_desc}
        - severity: Floating point number from 0.00 to 1.00 indicating threat/crisis gravity.
        - sanity_score: Number from 0.00 to 1.00 scoring the factual reliability based on the source and tone.
        - tactical_summary: {summary_instruction} Use a serious technical analyst reporting tone.
        - pin_worthy: Boolean (true/false) indicating whether this is a critical breaking cybersecurity event, major AI model exfiltration, or large-scale infrastructure attack.
        - watchcon_trigger: Boolean (true/false) indicating whether this represents a nation-state attack on critical infrastructure, major AI model exfiltration, or large-scale ransomware affecting hospitals or power grids.
        JSON Output:
        """
    elif channel == "WEATHER":
        category_desc = 'Choose exactly one from ["EARTHQUAKE", "TYPHOON", "FLOOD", "VOLCANO", "DROUGHT", "WILDFIRE", "WEATHER_ALERT", "DISASTER", "EPIDEMIC"].'
        summary_instruction = "Write a concise 3 to 4 sentence objective summary of the natural disaster/weather event in KOREAN (한국어). Focus ONLY on confirmed facts, locations, and impact. Do NOT include any subjective opinions, predictions, or exaggerated/dramatic tone."
        prompt = f"""
        [NATURAL DISASTER & WEATHER OSINT INTELLIGENCE BRIEFING PROTOCOL]
        Analyze this raw breaking weather or natural disaster alert and extract structured telemetry.
        Article Title: {article_title}
        Article Summary: {article_summary}
        You must output exactly in JSON format, no preamble, no markdown.
        JSON Schema fields required:
        - region: Specific city, town, or province. MUST BE ONLY IN ENGLISH ALPHABET. NO KOREAN.
          CRITICAL RULE: If the location is in the United States, specify the state name alongside the city.
        - country: The sovereign country name in English.
        - category: {category_desc}
        - severity: Floating point number from 0.00 to 1.00 indicating threat/crisis gravity.
        - sanity_score: Number from 0.00 to 1.00 scoring the factual reliability based on the source and tone.
        - tactical_summary: {summary_instruction} Use a serious reporting tone.
        JSON Output:
        """
    else:
        category_desc = 'Choose exactly one from ["WAR", "EXPLOSION", "CYBERATTACK", "MILITARY", "DISASTER", "UNREST"].'
        summary_instruction = "Write a concise 3 to 4 sentence objective tactical summary in KOREAN (한국어). Focus ONLY on confirmed facts, locations, and actions. Do NOT include any subjective opinions, political bias, or exaggerated/dramatic tone."
        prompt = f"""
        [MILITARY & DISASTER OSINT INTELLIGENCE BRIEFING PROTOCOL]
        Analyze this raw breaking news article and extract structured geopolitical/economic crisis telemetry.
        Article Title: {article_title}
        Article Summary: {article_summary}
        You must output exactly in JSON format, no preamble, no markdown.
        JSON Schema fields required:
        - region: Specific city, town, or province. MUST BE ONLY IN ENGLISH ALPHABET. NO KOREAN.
          CRITICAL RULE: If the location is in the United States, specify the state name alongside the city.
        - country: The sovereign country name in English.
        - category: {category_desc}
        - severity: Floating point number from 0.00 to 1.00 indicating threat/crisis gravity.
        - sanity_score: Number from 0.00 to 1.00 scoring the factual reliability based on the source and tone.
        - tactical_summary: {summary_instruction} Use a serious military/analyst reporting tone.
        JSON Output:
        """
    try:
        req_data = json.dumps({"model": MODEL_NAME, "prompt": prompt, "stream": False, "format": "json"}).encode("utf-8")
        req = urllib.request.Request(OLLAMA_URL, data=req_data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=45) as res:
            result = json.loads(json.loads(res.read().decode("utf-8"))["response"].strip())
        # Mark GPU as active so the idle-unload timer resets
        global last_inference_time, model_unloaded
        last_inference_time = time.time()
        model_unloaded = False
        return result
    except Exception:
        return None

# ─── Geocoding (thread-safe cache access) ─────────────────────────────────────
def geocode_threat_zone(location_text, country_text, geo_cache):
    loc_clean = (location_text or "").upper().strip()
    country_clean = (country_text or "").upper().strip()

    is_loc_unknown = not loc_clean or any(x in loc_clean for x in ["UNKNOWN", "NOT SPECIFIED", "NOT_SPECIFIED"])
    is_country_unknown = not country_clean or any(x in country_clean for x in ["UNKNOWN", "NOT SPECIFIED", "NOT_SPECIFIED"])

    if is_loc_unknown or is_country_unknown:
        return {"lat": 20.0, "lng": 0.0, "country": "GLOBAL"}, True

    if "SOUTH LEBANON" in loc_clean or "LEBANON" in loc_clean or "LEBANON" in country_clean:
        return {"lat": 33.32, "lng": 35.42, "country": "LEBANON"}, True

    if "GAZA" in loc_clean or "GAZA" in country_clean:
        return {"lat": 31.43, "lng": 34.39, "country": "PALESTINE"}, True

    if loc_clean in TACTICAL_KNOWN_LOCATIONS:
        return TACTICAL_KNOWN_LOCATIONS[loc_clean], True

    # Thread-safe cache read
    with geo_cache_lock:
        cached = geo_cache.get(loc_clean)
    if cached:
        return cached, True

    query_text = (
        f"{location_text.strip()}, {country_text.strip()}"
        if country_clean and loc_clean and loc_clean != country_clean
        else (location_text.strip() if location_text else country_text.strip())
    )

    try:
        quoted_loc = urllib.parse.quote(query_text)
        url = f"https://nominatim.openstreetmap.org/search?q={quoted_loc}&format=json&limit=1"
        req = urllib.request.Request(url, headers={"User-Agent": "TacticalGlobeOpsCore/16.0"})
        with urllib.request.urlopen(req, timeout=8) as res:
            data = json.loads(res.read().decode("utf-8"))
            if data:
                lat, lng = float(data[0]["lat"]), float(data[0]["lon"])
                country = data[0].get("display_name", "UNKNOWN").split(",")[-1].strip().upper()
                res_data = {"lat": lat, "lng": lng, "country": country}
                # Thread-safe cache write
                with geo_cache_lock:
                    geo_cache[loc_clean] = res_data
                save_geo_cache(geo_cache)
                time.sleep(1.1)
                return res_data, False
            time.sleep(1.1)
    except Exception:
        time.sleep(1.1)

    for known_loc, known_data in TACTICAL_KNOWN_LOCATIONS.items():
        if known_data["country"] in loc_clean or loc_clean in known_data["country"]:
            return known_data, True

    return {"lat": 20.0, "lng": 0.0, "country": "GLOBAL"}, True

# ─── X Media search ─────────────────────────────────────────────────────────
def search_x_media(region, keyword):
    token = os.environ.get("X_BEARER_TOKEN")
    if not token:
        return None, None
    try:
        query = urllib.parse.quote(f'"{region}" "{keyword}" has:media')
        url = f"https://api.twitter.com/2/tweets/search/recent?query={query}&max_results=10&tweet.fields=attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type,variants"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=5) as response:
            res = json.loads(response.read().decode('utf-8'))
            includes = res.get("includes", {})
            media_list = includes.get("media", [])
            if media_list:
                first_media = media_list[0]
                media_type = first_media.get("type")
                if media_type in ["video", "animated_gif"]:
                    variants = first_media.get("variants", [])
                    video_variants = [v for v in variants if v.get("url") and v.get("bitrate") is not None]
                    if video_variants:
                        video_variants.sort(key=lambda x: x["bitrate"], reverse=True)
                        return video_variants[0]["url"], "video"
                    elif variants:
                        urls = [v["url"] for v in variants if v.get("url")]
                        if urls:
                            return urls[0], "video"
                url = first_media.get("url") or first_media.get("preview_image_url")
                return url, "image" if media_type == "photo" else "video"
    except Exception as e:
        print(f"⚠️ [X API ERROR] {e}")
    return None, None

# ─── Archive threshold ────────────────────────────────────────────────────────
ARCHIVE_MERGE_THRESHOLD = 3

def archive_incident(cursor, node_id):
    """Copy an incident row to archived_news before it is overwritten by a merge."""
    try:
        cursor.execute("""
            INSERT OR REPLACE INTO archived_news
            SELECT * FROM incidents WHERE id = ?
        """, (node_id,))
    except Exception as e:
        print(f"⚠️ [ARCHIVE ERROR] {e}")

# ─── Per-feed processing (runs inside ThreadPoolExecutor) ─────────────────────
def process_single_feed(feed, geo_cache):
    article_id = feed["id"]
    channel = feed["channel"]
    title = feed["title"]
    link = feed["link"]
    summary = feed["summary"]
    source = feed["source"]
    pub_date = feed["pub_date"]

    intel_pack = process_ai_intel_analysis(title, summary, channel)
    time.sleep(3)
    if not intel_pack:
        return article_id, None

    raw_category = intel_pack.get("category")
    if isinstance(raw_category, list) and len(raw_category) > 0:
        raw_category = raw_category[0]
    category = safe_str(raw_category or "WAR").upper().strip()

    valid_geo = {"WAR", "EXPLOSION", "CYBERATTACK", "MILITARY", "DISASTER", "UNREST", "CONFLICT", "AIRSTRIKE", "EVACUATION", "NUCLEAR"}
    valid_eco = {"RECESSSION", "MARKET_CRASH", "INFLATION", "TRADE_WAR", "ENERGY", "TECH_CRISIS"}
    valid_weather = {"EARTHQUAKE", "TYPHOON", "FLOOD", "VOLCANO", "DROUGHT", "WILDFIRE", "WEATHER_ALERT", "DISASTER", "EPIDEMIC"}
    valid_cyber_ai = {"CYBERATTACK", "DATA_BREACH", "ZERO_DAY", "RANSOMWARE", "AI_INCIDENT", "DEEPFAKE", "MODEL_LEAK", "BOTNET", "ESPIONAGE", "INFRASTRUCTURE_ATTACK"}

    if channel == "WEATHER" and category not in valid_weather:
        print(f"⚠️ [WEATHER CATEGORY OVERRIDE] {channel} 카테고리 '{category}'를 'DISASTER'로 강제 치환")
        category = "DISASTER"

    elif channel == "CYBER_AI" and category not in valid_cyber_ai:
        print(f"⚠️ [CYBER_AI CATEGORY OVERRIDE] 카테고리 '{category}'를 'CYBERATTACK'으로 강제 치환")
        category = "CYBERATTACK"

    is_valid = (
        (channel in ["GEOPOLITICS", "TELEGRAM"] and category in valid_geo) or
        (channel == "ECONOMY" and category in valid_eco) or
        (channel == "WEATHER" and category in valid_weather) or
        (channel == "CYBER_AI" and category in valid_cyber_ai)
    )
    if not is_valid:
        print(f"🚫 [CATEGORY FILTER] {channel} 기사 제외 (유효하지 않은 카테고리 '{category}'): {title}")
        return article_id, False

    region = safe_str(intel_pack.get("region", "UNKNOWN")).upper().strip()
    if re.search(r'[가-힣]', region) or len(region) >= 30:
        region = safe_str(intel_pack.get("country", "GLOBAL")).upper().strip()

    coords, _ = geocode_threat_zone(region, safe_str(intel_pack.get("country", "")), geo_cache)
    if not coords:
        coords = TACTICAL_KNOWN_LOCATIONS["GLOBAL"]

    # ── Media: X (SNS) first, else RSS-extracted article image ─────────────────
    media_url, media_type, sns_source = None, None, None
    if channel in ["GEOPOLITICS", "TELEGRAM"]:
        media_url, media_type = search_x_media(region, intel_pack.get("category", "WAR"))
        if media_url:
            sns_source = "X"
    # Fallback to the article's own image carried from RSS ingest
    if not media_url and feed.get("media_url"):
        media_url = feed.get("media_url")
        media_type = feed.get("media_type") or "image"
        sns_source = feed.get("source") or "RSS"

    # ── Deduplication & Merge ─────────────────────────────────────────────────
    two_hours_ago = (
        datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - 7200, timezone.utc)
        .isoformat().replace("+00:00", "Z")
    )

    with get_db_connection() as conn:
        cursor = conn.cursor()
        existing_nodes = cursor.execute(
            "SELECT id, update_count, title, summary, lng, lat, verified_sources, child_feeds FROM incidents "
            "WHERE region=? AND country=? AND channel=? AND created_at >= ?",
            (region, coords["country"], channel, two_hours_ago)
        ).fetchall()

        matched_node = None
        for node in existing_nodes:
            similarity = calculate_jaccard_similarity(
                title + " " + summary,
                (node[2] or "") + " " + (node[3] or "")
            )
            if similarity >= 0.6:
                matched_node = node
                break

        current_time = pub_date or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        severity = intel_pack.get("severity", 0.5)
        level = "CRITICAL" if severity >= 0.8 else "ELEVATED" if severity >= 0.5 else "NOMINAL"

        new_child = {
            "title": title,
            "summary": intel_pack.get("tactical_summary", summary),
            "source": source,
            "link": link,
            "created_at": current_time,
            "sanity_score": intel_pack.get("sanity_score", 0.5)
        }

        if matched_node:
            node_id, update_count, existing_title, existing_summary, existing_lng, existing_lat, existing_sources_json, existing_child_json = matched_node
            final_lat, final_lng = (
                (coords["lat"], coords["lng"])
                if (existing_lat == 20.0 and existing_lng == 0.0)
                else (existing_lat, existing_lng)
            )

            try: v_srcs = json.loads(existing_sources_json) if existing_sources_json else []
            except: v_srcs = []
            if source not in v_srcs: v_srcs.append(source)
            verified_sources_json = json.dumps(v_srcs, ensure_ascii=False)

            try: c_feeds = json.loads(existing_child_json) if existing_child_json else []
            except: c_feeds = []
            c_feeds.append(new_child)
            child_feeds_json = json.dumps(c_feeds, ensure_ascii=False)

            new_count = update_count + 1

            # Archive history when merge count crosses threshold
            if update_count >= ARCHIVE_MERGE_THRESHOLD:
                archive_incident(cursor, node_id)

            if "[추가 속보]" in (existing_summary or ""):
                cursor.execute("""
                    UPDATE incidents SET update_count=?, verified_sources=?, child_feeds=?,
                    lat=?, lng=?, created_at=?,
                    media_url=COALESCE(?, media_url),
                    media_type=COALESCE(?, media_type),
                    sns_source=COALESCE(?, sns_source)
                    WHERE id=?
                """, (new_count, verified_sources_json, child_feeds_json,
                      final_lat, final_lng, current_time,
                      media_url, media_type, sns_source,
                      node_id))
            else:
                new_title = existing_title + f"\n\n[추가 속보] {title}"
                new_summary = existing_summary + f"\n\n[추가 속보] {intel_pack.get('tactical_summary', summary)}"
                cursor.execute("""
                    UPDATE incidents SET title=?, summary=?, update_count=?,
                    verified_sources=?, child_feeds=?, lat=?, lng=?,
                    threat_velocity=threat_velocity+0.05, created_at=?,
                    media_url=COALESCE(?, media_url),
                    media_type=COALESCE(?, media_type),
                    sns_source=COALESCE(?, sns_source)
                    WHERE id=?
                """, (new_title, new_summary, new_count,
                      verified_sources_json, child_feeds_json,
                      final_lat, final_lng, current_time,
                      media_url, media_type, sns_source,
                      node_id))
            conn.commit()
            print(f"🔄 [MERGED] {region} (merge #{new_count})")
        else:
            if len(existing_nodes) > 0:
                coords["lat"] += random.uniform(-0.015, 0.015)
                coords["lng"] += random.uniform(-0.015, 0.015)

            verified_sources_json = json.dumps([source], ensure_ascii=False)
            child_feeds_json = json.dumps([new_child], ensure_ascii=False)

            watchcon_trigger_val = 1 if (
                channel in ["TELEGRAM", "CYBER_AI"] and
                severity >= 0.85 and
                intel_pack.get("watchcon_trigger") is True
            ) else 0

            cursor.execute("""
                INSERT OR REPLACE INTO incidents (
                    id, country, region, lng, lat, severity, category, title, source,
                    created_at, summary, hash, embedding, status, update_count, first_seen,
                    region_risk_index, threat_velocity, trajectory, channel,
                    verified_sources, child_feeds,
                    media_url, media_type, sns_source, watchcon_trigger
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                article_id, coords["country"], region, coords["lng"], coords["lat"],
                severity, category,
                title, source, current_time, intel_pack.get("tactical_summary", summary),
                article_id, "[]", level, 1, current_time,
                min(round(severity * 1.15, 2), 1.0),
                0.10 if level == "CRITICAL" else 0.02,
                "ESCALATING" if level == "CRITICAL" else "SUSTAINED",
                channel, verified_sources_json, child_feeds_json,
                media_url, media_type, sns_source, watchcon_trigger_val
            ))
            conn.commit()
            print(f"💥 [NEW THREAT] {region}")

    # ── TELEGRAM-specific logic (WATCHCON Escalation & Incident Pinning) ──────
    final_id = node_id if matched_node else article_id
    if channel == "TELEGRAM":
        # 1. WATCHCON Trigger Check
        if severity >= 0.85 and intel_pack.get("watchcon_trigger") is True:
            wc = read_watchcon_file()
            current_stage = wc.get("stage", 4)
            if current_stage > 1:
                new_stage = current_stage - 1
                now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                
                # Log the auto-trigger event
                try:
                    with get_db_connection() as conn:
                        log_id = hashlib.sha256(f"{now_str}_{final_id}_{new_stage}".encode()).hexdigest()
                        conn.execute("""
                            INSERT INTO watchcon_log (
                                id, timestamp, previous_stage, new_stage, trigger_type,
                                triggered_by_incident_id, incident_title, incident_severity, region, country
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            log_id, now_str, current_stage, new_stage, 'AUTO',
                            final_id, title, severity, region, coords["country"]
                        ))
                        conn.commit()
                except Exception as e:
                    print(f"⚠️ [WATCHCON LOG ERROR] {e}")

                update_watchcon_trigger(new_stage, wc.get("override", False), final_id, now_str)
                print(f"📡 [WATCHCON TRIGGERED] Stage escalated to {new_stage} due to incident {final_id}")
            with get_db_connection() as conn:
                conn.cursor().execute("UPDATE incidents SET watchcon_trigger = 1 WHERE id = ?", (final_id,))
                conn.commit()

        # 2. Pinned System Check
        if severity >= 0.75 or intel_pack.get("pin_worthy") is True:
            with get_db_connection() as conn:
                conn.cursor().execute("UPDATE incidents SET pinned = 1 WHERE id = ?", (final_id,))
                conn.commit()
                print(f"📌 [PINNED INCIDENT] Incident {final_id} has been pinned.")

    # ── CYBER_AI-specific logic (WATCHCON Escalation & Incident Pinning) ────────
    if channel == "CYBER_AI":
        # 1. WATCHCON Trigger Check
        if severity >= 0.85 and intel_pack.get("watchcon_trigger") is True:
            wc = read_watchcon_file()
            current_stage = wc.get("stage", 4)
            if current_stage > 1:
                new_stage = current_stage - 1
                now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                try:
                    with get_db_connection() as conn:
                        log_id = hashlib.sha256(f"{now_str}_{final_id}_{new_stage}".encode()).hexdigest()
                        conn.execute("""
                            INSERT INTO watchcon_log (
                                id, timestamp, previous_stage, new_stage, trigger_type,
                                triggered_by_incident_id, incident_title, incident_severity, region, country
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            log_id, now_str, current_stage, new_stage, 'AUTO',
                            final_id, title, severity, region, coords["country"]
                        ))
                        conn.commit()
                except Exception as e:
                    print(f"⚠️ [WATCHCON LOG ERROR] {e}")
                update_watchcon_trigger(new_stage, wc.get("override", False), final_id, now_str)
                print(f"🔐 [CYBER_AI WATCHCON] Stage escalated to {new_stage} due to incident {final_id}")
            with get_db_connection() as conn:
                conn.cursor().execute("UPDATE incidents SET watchcon_trigger = 1 WHERE id = ?", (final_id,))
                conn.commit()

        # 2. Pinned System Check
        if severity >= 0.75 or intel_pack.get("pin_worthy") is True:
            with get_db_connection() as conn:
                conn.cursor().execute("UPDATE incidents SET pinned = 1 WHERE id = ?", (final_id,))
                conn.commit()
                print(f"📌 [CYBER_AI PINNED] Incident {final_id} pinned.")

    return article_id, True

# ─── Watchcon auto-adjustment ─────────────────────────────────────────────────
def adjust_watchcon():
    watchcon = read_watchcon_file()
    if watchcon.get("override", False):
        return

    fifteen_mins_ago = (
        datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - 900, timezone.utc)
        .isoformat().replace("+00:00", "Z")
    )
    with get_db_connection() as conn:
        threat_count = conn.cursor().execute(
            "SELECT COUNT(*) FROM incidents WHERE created_at >= ? AND severity >= 0.5 "
            "AND (category='WAR' OR title LIKE '%explosion%' OR title LIKE '%missile%' "
            "OR title LIKE '%strike%' OR title LIKE '%airstrike%' OR title LIKE '%war%' "
            "OR category='CYBERATTACK' OR category='INFRASTRUCTURE_ATTACK' OR category='ZERO_DAY' "
            "OR title LIKE '%ransomware%' OR title LIKE '%critical infrastructure%')",
            (fifteen_mins_ago,)
        ).fetchone()[0]

    stage = watchcon.get("stage", 4)
    new_stage = 1 if threat_count >= 5 else 2 if threat_count >= 3 else 3 if threat_count >= 1 else 4

    if new_stage != stage:
        # Log the auto-trigger event from threat count
        try:
            now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            with get_db_connection() as conn:
                log_id = hashlib.sha256(f"{now_str}_adjust_{new_stage}".encode()).hexdigest()
                conn.execute("""
                    INSERT INTO watchcon_log (
                        id, timestamp, previous_stage, new_stage, trigger_type
                    ) VALUES (?, ?, ?, ?, ?)
                """, (log_id, now_str, stage, new_stage, 'AUTO'))
                conn.commit()
        except Exception as e:
            print(f"⚠️ [WATCHCON LOG ERROR] {e}")

        write_watchcon_file(new_stage, False)
        print(f"📡 [WATCHCON DYNAMIC] Updated to {new_stage} due to {threat_count} threats.")

def update_watchcon_trigger(stage, override, triggered_by, last_triggered):
    try:
        os.makedirs(os.path.dirname(WATCHCON_PATH), exist_ok=True)
        wc = read_watchcon_file()
        wc["stage"] = stage
        wc["override"] = override
        wc["triggered_by"] = triggered_by
        wc["last_triggered"] = last_triggered
        wc["timestamp"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        with open(WATCHCON_PATH, "w", encoding="utf-8") as f:
            json.dump(wc, f, indent=2)
    except Exception:
        pass

# ─── Main analyzer loop ───────────────────────────────────────────────────────
def run_analyzer():
    print("🧠 [ANALYZER WORKER] Intelligence Processing Pipeline Initiated.")
    
    # DB Migration: Add pinned column if not exists
    with get_db_connection() as conn:
        try:
            conn.execute("ALTER TABLE incidents ADD COLUMN pinned INTEGER DEFAULT 0")
            conn.commit()
            print("🔧 [DB MIGRATION] Added 'pinned' column to incidents table.")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE archived_news ADD COLUMN pinned INTEGER DEFAULT 0")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE incidents ADD COLUMN watchcon_trigger INTEGER DEFAULT 0")
            conn.commit()
            print("🔧 [DB MIGRATION] Added 'watchcon_trigger' column to incidents table.")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE archived_news ADD COLUMN watchcon_trigger INTEGER DEFAULT 0")
            conn.commit()
            print("🔧 [DB MIGRATION] Added 'watchcon_trigger' column to archived_news table.")
        except sqlite3.OperationalError:
            pass

        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS watchcon_log (
                  id TEXT PRIMARY KEY,
                  timestamp TEXT NOT NULL,
                  previous_stage INTEGER NOT NULL,
                  new_stage INTEGER NOT NULL,
                  trigger_type TEXT NOT NULL,
                  triggered_by_incident_id TEXT,
                  incident_title TEXT,
                  incident_severity REAL,
                  region TEXT,
                  country TEXT
                )
            """)
            conn.commit()
            print("🔧 [DB MIGRATION] Added 'watchcon_log' table.")
        except Exception as e:
            print(f"⚠️ [DB MIGRATION ERROR] {e}")

    geo_cache = load_geo_cache()
    once_mode = "--once" in sys.argv

    while True:
        with get_db_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            pending_feeds = cursor.execute(
                "SELECT * FROM raw_feeds WHERE status='PENDING' LIMIT 3"
            ).fetchall()

        if not pending_feeds:
            gc.collect()
            if once_mode:
                print("🧠 [ANALYZER WORKER] Single-pass completed. Exiting.")
                break
            maybe_unload_vram()  # free RTX 5070 VRAM after 5m idle
            time.sleep(30)
            continue

        print(f"🔬 [ANALYZER] Found {len(pending_feeds)} pending artifacts. Processing...")

        feed_dicts = [dict(f) for f in pending_feeds]

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            futures = {executor.submit(process_single_feed, feed, geo_cache): feed for feed in feed_dicts}
            for future in concurrent.futures.as_completed(futures):
                try:
                    article_id, success = future.result()
                    if success is not None:
                        with get_db_connection() as conn:
                            conn.cursor().execute(
                                "UPDATE raw_feeds SET status='PROCESSED' WHERE id=?", (article_id,)
                            )
                            conn.commit()
                except Exception as e:
                    print(f"⚠️ [ANALYZER ERROR] {e}")

        gc.collect()
        adjust_watchcon()

        if once_mode:
            # Check if there are still pending feeds
            with get_db_connection() as conn:
                count = conn.cursor().execute("SELECT COUNT(*) FROM raw_feeds WHERE status='PENDING'").fetchone()[0]
            if count == 0:
                print("🧠 [ANALYZER WORKER] Single-pass completed. Exiting.")
                break
        else:
            time.sleep(30)

if __name__ == "__main__":
    run_analyzer()
