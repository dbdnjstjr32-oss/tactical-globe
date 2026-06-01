import os
import re
import sqlite3
import urllib.request
import urllib.parse
import json
import html
import hashlib
import base64
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import time
import random

def parse_pub_date(pub_date_str):
    """RSS <pubDate> 문자열을 UTC ISO 8601 형식으로 변환. 실패 시 현재 시간 반환."""
    if not pub_date_str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        dt = parsedate_to_datetime(pub_date_str.strip())
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def get_keywords(text):
    if not text:
        return set()
    # Find all alphabetic words of length >= 3
    return set(re.findall(r'[a-zA-Z]{3,}', text.lower()))

def calculate_jaccard_similarity(text1, text2):
    kw1 = get_keywords(text1)
    kw2 = get_keywords(text2)
    if not kw1 or not kw2:
        return 0.0
    return len(kw1.intersection(kw2)) / len(kw1.union(kw2))

# 📡 Load environment variables from Next.js context (.env.local or .env)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
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
        except Exception as e:
            print(f"⚠️ [ENV ERROR] Failed to parse {env_file}: {e}")


# ==========================================
# 📡 [OSINT ENGINE CONFIGURATION V16.0 - FULL SPECTRUM DOMINANCE]
# ==========================================
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "exaone3.5"
SCAN_INTERVAL = 900

# --- 채널별 RSS 소스 ---
GEOPOLITICS_SOURCES = [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://apnews.com/hub/ap-top-news?output=rss",
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://feeds.skynews.com/feeds/rss/world.xml",
]

ECONOMY_SOURCES = [
    "https://search.cnbc.com/rs/search/combinedseo.xml?partnerId=401&id=100003114",
    "https://www.reutersagency.com/feed/?best-topics=business&post_type=best",
    "https://finance.yahoo.com/news/rssindex",
    "https://rss.marketwatch.com/marketwatch/topstories/",
    "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml",
    "https://feeds.a.dj.com/rss/RSSWorldNews.xml",
    "https://feeds.bbci.co.uk/news/business/rss.xml",
]

MILITARY_SOURCES = [
    "https://www.defensenews.com/rss/",
    "https://feeds.feedburner.com/defense-aerospace-press-releases",
    "https://www.military.com/rss-feeds/news",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://apnews.com/hub/ap-top-news?output=rss",
]

CYBER_SOURCES = [
    "https://feeds.feedburner.com/TheHackersNews",
    "https://krebsonsecurity.com/feed/",
    "https://www.bleepingcomputer.com/feed/",
    "https://www.darkreading.com/rss.xml",
    "https://threatpost.com/feed/",
]

HEALTH_SOURCES = [
    "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
    "https://feeds.bbci.co.uk/news/health/rss.xml",
    "https://www.who.int/rss-feeds/news-english.xml",
    "https://apnews.com/hub/health?output=rss",
]

# --- 채널별 키워드 가중치 ---
TACTICAL_KEYWORDS = {
    "explosion": 4, "blast": 3, "missile": 5, "strike": 3, "attack": 2,
    "earthquake": 5, "evacuation": 4, "military": 2, "drone": 3, "airport": 3,
    "crash": 4, "wildfire": 4, "nuclear": 5, "border": 2, "clash": 3,
    "forces": 2, "cyberattack": 4, "hacking": 3, "killed": 3, "injured": 3,
    "uav": 3, "tiltrotor": 2, "vtol": 2, "airspace": 3, "interception": 4,
    "airbase": 3, "radar": 2, "jamming": 3, "anti-aircraft": 4,
    "assassination": 5, "casualty": 4, "deploy": 2, "artillery": 4, "hostage": 5,
    # 한국어 위협 키워드
    "전쟁": 5, "미사일": 5, "공습": 5, "폭발": 4, "공격": 3, "사망": 3,
    "긴급": 3, "비상": 4, "핵": 5, "군사": 2, "충돌": 3, "격추": 4,
}

ECONOMY_KEYWORDS = {
    "crash": 5, "recession": 5, "bankruptcy": 5, "default": 5, "sanction": 5,
    "trade war": 5, "collapse": 5, "inflation": 3, "rate hike": 3, "fed": 3,
    "deficit": 3, "subsidy": 3, "tariff": 3, "boycott": 3, "crisis": 3,
    "stocks": 2, "bonds": 2, "currency": 2, "oil": 2, "energy": 2,
    "gdp": 2, "unemployment": 2, "tariffs": 3, "sanctions": 5,
    "interest rate": 3, "layoffs": 3, "economic crisis": 3,
}

MILITARY_KEYWORDS = {
    "warship": 5, "aircraft carrier": 5, "fighter jet": 4, "submarine": 4,
    "special forces": 4, "airstrike": 5, "bombing": 5, "troops": 3,
    "battalion": 3, "regiment": 3, "brigade": 3, "nato": 3, "pentagon": 3,
    "defense ministry": 3, "arms deal": 4, "weapons": 3, "armor": 3,
    "deployment": 3, "military exercise": 4, "wargame": 4, "drill": 2,
    "ballistic": 5, "hypersonic": 5, "stealth": 4, "munition": 4,
    "tank": 3, "artillery": 4, "rocket": 4, "torpedo": 4,
}

CYBER_KEYWORDS = {
    "cyberattack": 5, "ransomware": 5, "data breach": 5, "hack": 4,
    "malware": 4, "phishing": 3, "ddos": 4, "zero-day": 5, "exploit": 4,
    "vulnerability": 3, "critical infrastructure": 5, "espionage": 4,
    "state-sponsored": 5, "apt": 4, "intrusion": 4, "botnet": 3,
    "supply chain attack": 5, "spyware": 4, "government hack": 5,
    "power grid": 5, "water system": 5, "hospital attack": 5,
}

HEALTH_KEYWORDS = {
    "pandemic": 5, "outbreak": 5, "epidemic": 5, "virus": 4, "pathogen": 4,
    "quarantine": 4, "lockdown": 4, "fatality": 4, "death toll": 4,
    "vaccine": 3, "mutation": 4, "variant": 4, "who": 2, "cdc": 2,
    "health emergency": 5, "bioterrorism": 5, "contagion": 4, "infection": 3,
    "hospitalization": 3, "mpox": 4, "ebola": 5, "cholera": 4, "plague": 5,
}

FILTER_THRESHOLD = 4

# 💡 [광역 클러스터링 방어막] 잘게 쪼개지는 지역들을 거대한 전선(Front)으로 강제 병합하여 중복 방지
TACTICAL_KNOWN_LOCATIONS = {
    "GAZA": {"lat": 31.5000, "lng": 34.4667, "country": "PALESTINE"},
    "GAZA CITY": {"lat": 31.5000, "lng": 34.4667, "country": "PALESTINE"},
    "GAZA STRIP": {"lat": 31.5000, "lng": 34.4667, "country": "PALESTINE"},
    "RAFAH": {"lat": 31.5000, "lng": 34.4667, "country": "PALESTINE"}, # 가자 전역으로 묶음
    "JERUSALEM": {"lat": 31.7683, "lng": 35.2137, "country": "ISRAEL"},
    "TEL AVIV": {"lat": 32.0853, "lng": 34.7818, "country": "ISRAEL"},
    "LEBANON": {"lat": 33.8938, "lng": 35.5018, "country": "LEBANON"},
    "BEIRUT": {"lat": 33.8938, "lng": 35.5018, "country": "LEBANON"},
    "TYRE": {"lat": 33.8938, "lng": 35.5018, "country": "LEBANON"}, # 레바논 남부도 베이루트(국가 대표)로 묶음
    "TEHRAN": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"},
    "IRAN": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"},
    "IRANIAN TERRITORY": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"}, 
    "SOUTHERN IRAN": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"}, # 이란 남부도 본토로 묶음
    "STRAIT OF HORMUZ": {"lat": 35.6892, "lng": 51.3890, "country": "IRAN"}, # 호르무즈도 이란 위협으로 묶음
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
    
    # 📊 가상 금융/경제 허브 좌표 매핑
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
US_STATES_LOCATIONS = {
    "ALABAMA": {"lat": 32.806671, "lng": -86.791130, "country": "UNITED STATES"},
    "ALASKA": {"lat": 61.370716, "lng": -152.404419, "country": "UNITED STATES"},
    "ARIZONA": {"lat": 33.729759, "lng": -111.431221, "country": "UNITED STATES"},
    "ARKANSAS": {"lat": 34.969704, "lng": -92.373123, "country": "UNITED STATES"},
    "CALIFORNIA": {"lat": 36.116203, "lng": -119.681564, "country": "UNITED STATES"},
    "COLORADO": {"lat": 39.059811, "lng": -105.311104, "country": "UNITED STATES"},
    "CONNECTICUT": {"lat": 41.597782, "lng": -72.755371, "country": "UNITED STATES"},
    "DELAWARE": {"lat": 39.318523, "lng": -75.507141, "country": "UNITED STATES"},
    "FLORIDA": {"lat": 27.766279, "lng": -81.686783, "country": "UNITED STATES"},
    "GEORGIA": {"lat": 33.040619, "lng": -83.643074, "country": "UNITED STATES"},
    "HAWAII": {"lat": 21.094318, "lng": -157.498337, "country": "UNITED STATES"},
    "IDAHO": {"lat": 44.240459, "lng": -114.478828, "country": "UNITED STATES"},
    "ILLINOIS": {"lat": 40.349457, "lng": -88.986137, "country": "UNITED STATES"},
    "INDIANA": {"lat": 39.849426, "lng": -86.258278, "country": "UNITED STATES"},
    "IOWA": {"lat": 42.011539, "lng": -93.210526, "country": "UNITED STATES"},
    "KANSAS": {"lat": 38.526600, "lng": -96.726486, "country": "UNITED STATES"},
    "KENTUCKY": {"lat": 37.668140, "lng": -84.670067, "country": "UNITED STATES"},
    "LOUISIANA": {"lat": 31.169546, "lng": -91.867805, "country": "UNITED STATES"},
    "MAINE": {"lat": 44.693947, "lng": -69.381927, "country": "UNITED STATES"},
    "MARYLAND": {"lat": 39.063946, "lng": -76.802101, "country": "UNITED STATES"},
    "MASSACHUSETTS": {"lat": 42.230171, "lng": -71.530106, "country": "UNITED STATES"},
    "MICHIGAN": {"lat": 43.326618, "lng": -84.536095, "country": "UNITED STATES"},
    "MINNESOTA": {"lat": 45.694454, "lng": -93.900192, "country": "UNITED STATES"},
    "MISSISSIPPI": {"lat": 32.741646, "lng": -89.678696, "country": "UNITED STATES"},
    "MISSOURI": {"lat": 38.456085, "lng": -92.288368, "country": "UNITED STATES"},
    "MONTANA": {"lat": 46.921925, "lng": -110.454353, "country": "UNITED STATES"},
    "NEBRASKA": {"lat": 41.125370, "lng": -98.268082, "country": "UNITED STATES"},
    "NEVADA": {"lat": 38.313515, "lng": -117.055374, "country": "UNITED STATES"},
    "NEW HAMPSHIRE": {"lat": 43.452492, "lng": -71.563896, "country": "UNITED STATES"},
    "NEW JERSEY": {"lat": 40.298904, "lng": -74.521011, "country": "UNITED STATES"},
    "NEW MEXICO": {"lat": 34.840515, "lng": -106.248482, "country": "UNITED STATES"},
    "NEW YORK": {"lat": 42.165726, "lng": -74.948051, "country": "UNITED STATES"},
    "NORTH CAROLINA": {"lat": 35.630066, "lng": -79.806419, "country": "UNITED STATES"},
    "NORTH DAKOTA": {"lat": 47.528912, "lng": -99.784012, "country": "UNITED STATES"},
    "OHIO": {"lat": 40.388783, "lng": -82.764915, "country": "UNITED STATES"},
    "OKLAHOMA": {"lat": 35.565342, "lng": -96.928917, "country": "UNITED STATES"},
    "OREGON": {"lat": 44.572021, "lng": -122.070938, "country": "UNITED STATES"},
    "PENNSYLVANIA": {"lat": 40.590752, "lng": -77.209755, "country": "UNITED STATES"},
    "RHODE ISLAND": {"lat": 41.680893, "lng": -71.511780, "country": "UNITED STATES"},
    "SOUTH CAROLINA": {"lat": 33.836082, "lng": -81.163727, "country": "UNITED STATES"},
    "SOUTH DAKOTA": {"lat": 44.299782, "lng": -99.438828, "country": "UNITED STATES"},
    "TENNESSEE": {"lat": 35.747845, "lng": -86.692345, "country": "UNITED STATES"},
    "TEXAS": {"lat": 31.054487, "lng": -97.563461, "country": "UNITED STATES"},
    "UTAH": {"lat": 40.150032, "lng": -111.862434, "country": "UNITED STATES"},
    "VERMONT": {"lat": 44.045876, "lng": -72.710686, "country": "UNITED STATES"},
    "VIRGINIA": {"lat": 37.769337, "lng": -78.169968, "country": "UNITED STATES"},
    "WASHINGTON": {"lat": 47.400902, "lng": -121.490494, "country": "UNITED STATES"},
    "WEST VIRGINIA": {"lat": 38.491226, "lng": -80.954453, "country": "UNITED STATES"},
    "WISCONSIN": {"lat": 44.268543, "lng": -89.616508, "country": "UNITED STATES"},
    "WYOMING": {"lat": 42.755966, "lng": -107.302490, "country": "UNITED STATES"},
    "WASHINGTON D.C.": {"lat": 38.9072, "lng": -77.0369, "country": "UNITED STATES"}
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "osint_matrix.db")
CACHE_PATH = os.path.join(BASE_DIR, "data", "geo_cache.json")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def init_tactical_db():
    with get_db_connection() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=15000;")
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY, country TEXT, region TEXT, lng REAL, lat REAL,
                severity REAL, category TEXT, title TEXT, source TEXT,
                created_at TEXT, summary TEXT, hash TEXT, embedding TEXT,
                status TEXT, update_count INTEGER, first_seen TEXT,
                related_titles TEXT, region_risk_index REAL,
                threat_velocity REAL, trajectory TEXT, related_articles TEXT,
                channel TEXT DEFAULT 'GEOPOLITICS',
                media_url TEXT, media_type TEXT, sns_source TEXT,
                verified_sources TEXT DEFAULT '[]',
                child_feeds TEXT DEFAULT '[]'
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS archived_news (
                id TEXT PRIMARY KEY, country TEXT, region TEXT, lng REAL, lat REAL,
                severity REAL, category TEXT, title TEXT, source TEXT,
                created_at TEXT, summary TEXT, hash TEXT, embedding TEXT,
                status TEXT, update_count INTEGER, first_seen TEXT,
                related_titles TEXT, region_risk_index REAL,
                threat_velocity REAL, trajectory TEXT, related_articles TEXT,
                channel TEXT DEFAULT 'GEOPOLITICS',
                media_url TEXT, media_type TEXT, sns_source TEXT,
                verified_sources TEXT DEFAULT '[]',
                child_feeds TEXT DEFAULT '[]'
            )
        """)
        # 🆕 V16.0: 커스텀 키워드 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS custom_keywords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL UNIQUE,
                weight INTEGER NOT NULL DEFAULT 3,
                channel TEXT NOT NULL DEFAULT 'GEOPOLITICS',
                created_at TEXT
            )
        """)
        # 🆕 V16.0: USGS/NOAA 자연재해 경보 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS natural_alerts (
                id TEXT PRIMARY KEY,
                alert_type TEXT,
                title TEXT,
                severity REAL,
                lat REAL,
                lng REAL,
                country TEXT,
                region TEXT,
                created_at TEXT,
                detail TEXT
            )
        """)
        # Safe migration
        cursor.execute("PRAGMA table_info(incidents)")
        columns = [row[1] for row in cursor.fetchall()]
        for col, dflt in [('channel',"TEXT DEFAULT 'GEOPOLITICS'"), ('media_url','TEXT'),
                          ('media_type','TEXT'), ('sns_source','TEXT'),
                          ('verified_sources',"TEXT DEFAULT '[]'"), ('child_feeds',"TEXT DEFAULT '[]'")]:
            if col not in columns:
                cursor.execute(f"ALTER TABLE incidents ADD COLUMN {col} {dflt}")
        cursor.execute("PRAGMA table_info(archived_news)")
        archived_cols = [row[1] for row in cursor.fetchall()]
        for col, dflt in [('channel',"TEXT DEFAULT 'GEOPOLITICS'"), ('media_url','TEXT'),
                          ('media_type','TEXT'), ('sns_source','TEXT'),
                          ('verified_sources',"TEXT DEFAULT '[]'"), ('child_feeds',"TEXT DEFAULT '[]'")]:
            if col not in archived_cols:
                cursor.execute(f"ALTER TABLE archived_news ADD COLUMN {col} {dflt}")
        conn.commit()

def load_geo_cache():
    if os.path.exists(CACHE_PATH):
        try:
            with open(CACHE_PATH, "r", encoding="utf-8") as f: return json.load(f)
        except: return {}
    return {}

def save_geo_cache(cache_data):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache_data, f, ensure_ascii=False, indent=2)

WATCHCON_PATH = os.path.join(BASE_DIR, "data", "watchcon.json")

def read_watchcon_file():
    try:
        if os.path.exists(WATCHCON_PATH):
            with open(WATCHCON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            # Create default file if missing
            os.makedirs(os.path.dirname(WATCHCON_PATH), exist_ok=True)
            default_watchcon = {
                "stage": 4,
                "override": False,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            with open(WATCHCON_PATH, "w", encoding="utf-8") as f:
                json.dump(default_watchcon, f, indent=2)
            return default_watchcon
    except Exception as e:
        print(f"⚠️ [WATCHCON READ ERROR] {e}")
    return {"stage": 4, "override": False}

def write_watchcon_file(stage, override):
    try:
        os.makedirs(os.path.dirname(WATCHCON_PATH), exist_ok=True)
        with open(WATCHCON_PATH, "w", encoding="utf-8") as f:
            json.dump({
                "stage": stage,
                "override": override,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, f, indent=2)
    except Exception as e:
        print(f"⚠️ [WATCHCON WRITE ERROR] {e}")

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

def fetch_usgs_earthquakes():
    """USGS 실시간 지진 데이터 수집 (규모 4.5 이상)"""
    try:
        url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
        req = urllib.request.Request(url, headers={'User-Agent': 'TacticalGlobeOpsCore/16.0'})
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode('utf-8'))
            alerts = []
            now = datetime.now(timezone.utc)
            for feature in data.get("features", []):
                props = feature.get("properties", {})
                coords = feature.get("geometry", {}).get("coordinates", [0, 0, 0])
                mag = props.get("mag", 0)
                if mag < 4.5:
                    continue
                eq_time = datetime.fromtimestamp(props["time"] / 1000, timezone.utc)
                if (now - eq_time).total_seconds() > 86400:
                    continue
                severity = min(1.0, (mag - 4.5) / 4.0)
                alerts.append({
                    "id": f"usgs_{feature['id']}",
                    "alert_type": "EARTHQUAKE",
                    "title": f"M{mag:.1f} Earthquake — {props.get('place', 'Unknown')}",
                    "severity": round(severity, 2),
                    "lat": coords[1],
                    "lng": coords[0],
                    "country": props.get("place", "UNKNOWN").split(", ")[-1].upper(),
                    "region": props.get("place", "UNKNOWN"),
                    "created_at": eq_time.isoformat().replace("+00:00", "Z"),
                    "detail": json.dumps({"magnitude": mag, "depth_km": coords[2], "url": props.get("url", "")})
                })
            print(f"🌍 [USGS] 지진 경보 {len(alerts)}건 수집 완료")
            return alerts
    except Exception as e:
        print(f"⚠️ [USGS ERROR] {e}")
        return []

def fetch_noaa_alerts():
    """NOAA 미국 기상 경보 수집 (사이클론, 허리케인, 토네이도 등)"""
    try:
        url = "https://api.weather.gov/alerts/active?status=actual&message_type=alert&urgency=Immediate,Expected"
        req = urllib.request.Request(url, headers={'User-Agent': 'TacticalGlobeOpsCore/16.0', 'Accept': 'application/geo+json'})
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode('utf-8'))
            alerts = []
            severe_events = ["Tornado", "Hurricane", "Typhoon", "Tsunami", "Extreme Wind", "Blizzard", "Ice Storm", "Flash Flood Emergency"]
            for feature in data.get("features", [])[:20]:
                props = feature.get("properties", {})
                event = props.get("event", "")
                if not any(s in event for s in severe_events):
                    continue
                area = props.get("areaDesc", "USA")
                severity_map = {"Extreme": 1.0, "Severe": 0.8, "Moderate": 0.6, "Minor": 0.4}
                sev = severity_map.get(props.get("severity", "Minor"), 0.5)
                alerts.append({
                    "id": f"noaa_{props.get('id', hashlib.md5(event.encode()).hexdigest())}",
                    "alert_type": "WEATHER",
                    "title": f"{event} — {area[:60]}",
                    "severity": sev,
                    "lat": 37.0902,
                    "lng": -95.7129,
                    "country": "UNITED STATES",
                    "region": area[:80],
                    "created_at": props.get("sent", datetime.now(timezone.utc).isoformat()),
                    "detail": json.dumps({"headline": props.get("headline", ""), "description": props.get("description", "")[:500]})
                })
            print(f"🌪️ [NOAA] 기상 경보 {len(alerts)}건 수집 완료")
            return alerts
    except Exception as e:
        print(f"⚠️ [NOAA ERROR] {e}")
        return []

def sync_natural_alerts(alerts):
    """USGS/NOAA 경보를 natural_alerts 테이블에 upsert"""
    if not alerts:
        return
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for a in alerts:
            cursor.execute("""
                INSERT OR REPLACE INTO natural_alerts
                (id, alert_type, title, severity, lat, lng, country, region, created_at, detail)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (a["id"], a["alert_type"], a["title"], a["severity"],
                   a["lat"], a["lng"], a["country"], a["region"], a["created_at"], a["detail"]))
        conn.commit()

def load_custom_keywords(channel):
    """DB에서 채널별 커스텀 키워드 로드"""
    try:
        with get_db_connection() as conn:
            rows = conn.execute(
                "SELECT keyword, weight FROM custom_keywords WHERE channel=?", (channel,)
            ).fetchall()
            return {row[0]: row[1] for row in rows}
    except:
        return {}

def fetch_multi_source_intel(sources, channel_label):
    print(f"📡 [INGESTION] [{channel_label}] 피드 인프라 감시 개시... ({len(sources)}개 소스)")
    raw_articles = []
    for url in sources:
        source_name = "RAW"
        if "bbc" in url: source_name = "BBC"
        elif "apnews" in url: source_name = "AP NEWS"
        elif "aljazeera" in url: source_name = "AL JAZEERA"
        elif "nytimes" in url: source_name = "NY TIMES"
        elif "sky" in url: source_name = "SKY NEWS"
        elif "yonhap" in url or "yna.co.kr" in url: source_name = "YONHAP"
        elif "kbs.co.kr" in url: source_name = "KBS WORLD"
        elif "defensenews" in url: source_name = "DEFENSE NEWS"
        elif "military.com" in url: source_name = "MILITARY.COM"
        elif "thehackernews" in url: source_name = "HACKER NEWS"
        elif "krebsonsecurity" in url: source_name = "KREBS"
        elif "bleepingcomputer" in url: source_name = "BLEEPING"
        elif "darkreading" in url: source_name = "DARK READING"
        elif "who.int" in url: source_name = "WHO"
        elif "reuters" in url: source_name = "REUTERS"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as response:
                xml_data = response.read().decode('utf-8', errors='ignore')
                items = re.findall(r'<item(?:.*?)>(.*?)</item>', xml_data, re.DOTALL)
                for item in items:
                    title_m = re.search(r'<title(?:.*?)>(.*?)</title>', item, re.DOTALL)
                    link_m = re.search(r'<link(?:.*?)>(.*?)</link>', item, re.DOTALL)
                    desc_m = re.search(r'<description(?:.*?)>(.*?)</description>', item, re.DOTALL)
                    pub_m = re.search(r'<pubDate(?:.*?)>(.*?)</pubDate>', item, re.DOTALL)
                    if title_m and link_m:
                        title = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', title_m.group(1), flags=re.DOTALL).strip()
                        title = html.unescape(title).replace("\n", " ")
                        link = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', link_m.group(1), flags=re.DOTALL).strip()
                        summary = ""
                        if desc_m:
                            summary = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', desc_m.group(1), flags=re.DOTALL).strip()
                            summary = re.sub(r'<[^>]*>', '', summary)
                            summary = html.unescape(summary).replace("\n", " ")
                        pub_date = parse_pub_date(pub_m.group(1) if pub_m else None)
                        raw_articles.append({"title": title, "link": link, "summary": summary if summary else title, "source": source_name, "pub_date": pub_date})
        except:
            continue
    return raw_articles

def evaluate_tactical_priority(article, keywords):
    text = (article["title"] + " " + article["summary"]).lower()
    return sum(weight for keyword, weight in keywords.items() if keyword in text)

def geocode_threat_zone(location_text, country_text, title_text, geo_cache):
    loc_clean = (location_text or "").upper().strip()
    country_clean = (country_text or "").upper().strip()
    title_clean = (title_text or "").upper().strip()
    
    # 1. UNKNOWN / empty / NOT SPECIFIED safeguard -> force GLOBAL coordinate
    is_loc_unknown = not loc_clean or any(x in loc_clean for x in ["UNKNOWN", "NOT SPECIFIED", "NOT_SPECIFIED"])
    is_country_unknown = not country_clean or any(x in country_clean for x in ["UNKNOWN", "NOT SPECIFIED", "NOT_SPECIFIED"])
    
    if is_loc_unknown or is_country_unknown:
        return {"lat": 20.0, "lng": 0.0, "country": "GLOBAL"}, True

    # 2. Hardcoded override keywords in region/title/country BEFORE calling external API
    # "South Lebanon" or "Lebanon" related threat -> South Lebanon border (lat: 33.32, lng: 35.42)
    if "SOUTH LEBANON" in loc_clean or "SOUTH LEBANON" in title_clean or "LEBANON" in loc_clean or "LEBANON" in country_clean or "LEBANON" in title_clean:
        return {"lat": 33.32, "lng": 35.42, "country": "LEBANON"}, True

    # "Gaza" -> Gaza center (lat: 31.43, lng: 34.39)
    if "GAZA" in loc_clean or "GAZA" in title_clean or "GAZA" in country_clean:
        return {"lat": 31.43, "lng": 34.39, "country": "PALESTINE"}, True

    # 3. Standard check in local dictionary/cache
    if loc_clean in TACTICAL_KNOWN_LOCATIONS:
        return TACTICAL_KNOWN_LOCATIONS[loc_clean], True
    if loc_clean in US_STATES_LOCATIONS:
        return US_STATES_LOCATIONS[loc_clean], True
    if loc_clean in geo_cache:
        return geo_cache[loc_clean], True

    # 4. Construct combined query for Nominatim (Cross-validation)
    if country_clean and loc_clean and loc_clean != country_clean:
        query_text = f"{location_text.strip()}, {country_text.strip()}"
    else:
        query_text = location_text.strip() if location_text else country_text.strip()

    try:
        quoted_loc = urllib.parse.quote(query_text)
        url = f"https://nominatim.openstreetmap.org/search?q={quoted_loc}&format=json&limit=1"
        req = urllib.request.Request(url, headers={'User-Agent': 'TacticalGlobeOpsCore/12.4'})
        with urllib.request.urlopen(req, timeout=8) as res:
            data = json.loads(res.read().decode('utf-8'))
            if data:
                lat, lng = float(data[0]["lat"]), float(data[0]["lon"])
                country = data[0].get("display_name", "UNKNOWN").split(",")[-1].strip().upper()
                res_data = {"lat": lat, "lng": lng, "country": country}
                geo_cache[loc_clean] = res_data
                save_geo_cache(geo_cache)
                time.sleep(1.1) 
                return res_data, False
            time.sleep(1.1)
    except Exception as e:
        print(f"⚠️ [GEOCODING WARNING] API 호출 예외 발생 ({e}). 안전 폴백 시도...")
        time.sleep(1.1)
        pass

    # 5. Last resort fallback in known locations by country matching
    for known_loc, known_data in TACTICAL_KNOWN_LOCATIONS.items():
        if known_data["country"] in loc_clean or loc_clean in known_data["country"]:
            return known_data, True
            
    return None, False




def process_ai_intel_analysis(article, channel):
    if channel == "ECONOMY":
        category_desc = 'Choose exactly one from ["RECESSSION", "MARKET_CRASH", "INFLATION", "TRADE_WAR", "ENERGY", "TECH_CRISIS"].'
        summary_instruction = "Write a detailed, in-depth 3 to 4 sentence economic/financial threat briefing in KOREAN (한국어)."
    else:
        category_desc = 'Choose exactly one from ["WAR", "EXPLOSION", "CYBERATTACK", "MILITARY", "DISASTER", "UNREST"].'
        summary_instruction = "Write a detailed, in-depth 3 to 4 sentence tactical briefing in KOREAN (한국어)."

    prompt = f"""
    [MILITARY & DISASTER OSINT INTELLIGENCE BRIEFING PROTOCOL]
    Analyze this raw breaking news article and extract structured geopolitical/economic crisis telemetry.
    Article Title: {article["title"]}
    Article Summary: {article["summary"]}
    You must output exactly in JSON format, no preamble, no markdown.
    JSON Schema fields required:
    - region: Specific city, town, or province. MUST BE ONLY IN ENGLISH ALPHABET. NO KOREAN. NO PARENTHESES. 
      CRITICAL RULE: If the location is in the United States, you MUST specify the state name alongside the city to prevent geolocation conflicts (e.g., "Longview, Washington", "Austin, Texas").
    - country: The sovereign country name in English.
    - category: {category_desc}
    - severity: Floating point number from 0.00 to 1.00 indicating threat/crisis gravity.
    - tactical_summary: {summary_instruction} Use a serious military/analyst reporting tone.
    JSON Output:
    """
    try:
        req_data = json.dumps({"model": MODEL_NAME, "prompt": prompt, "stream": False, "format": "json"}).encode('utf-8')
        req = urllib.request.Request(OLLAMA_URL, data=req_data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=45) as res:
            return json.loads(json.loads(res.read().decode('utf-8'))["response"].strip())
    except:
        return None

def run_tactical_ops_stream():
    init_tactical_db()
    geo_cache = load_geo_cache()
    print("🚀 [TACTICAL ENGINE V14.0] 멀티 채널 수집 및 워치콘 제어 커널 가동 완료.")
    
    while True:
        cycle_start_time = time.time()
        
        geo_requests = 0
        geo_hits = 0
        duplicate_articles = 0
        ai_time_list = []
        
        rss_fetch_start = time.time()
        geopolitics_feeds = fetch_multi_source_intel(GEOPOLITICS_SOURCES, "GEOPOLITICS")
        economy_feeds = fetch_multi_source_intel(ECONOMY_SOURCES, "ECONOMY")
        rss_fetch_latency = time.time() - rss_fetch_start

        # WATCHCON 제어 커널 로딩
        watchcon = read_watchcon_file()
        override = watchcon.get("override", False)
        stage = watchcon.get("stage", 4)

        # 커스텀 키워드 DB 로드 후 기본 키워드에 병합
        custom_geo = load_custom_keywords("GEOPOLITICS")
        custom_eco = load_custom_keywords("ECONOMY")
        merged_geo = {**TACTICAL_KEYWORDS, **custom_geo}
        merged_eco = {**ECONOMY_KEYWORDS, **custom_eco}
        channels_data = [
            ("GEOPOLITICS", geopolitics_feeds, merged_geo, FILTER_THRESHOLD),
            ("ECONOMY",     economy_feeds,     merged_eco, 3),
        ]

        valid_count = 0
        total_articles = sum(len(f) for _, f, _, _ in channels_data)
        
        for channel_name, raw_feeds, keywords, threshold in channels_data:
            for feed in raw_feeds:
                if evaluate_tactical_priority(feed, keywords) < threshold:
                    continue
                
                # 🚫 정치(Politics) 관련 기사 필터링 (정부, 정당, 선거 기사 원천 차단)
                content_lower = (feed.get("title", "") + " " + feed.get("summary", "")).lower()
                politics_keywords = ["politics", "election", "parliament", "congress", "senate", "ballot", "정치", "선거", "국회", "대선", "총선", "여야", "정당"]
                if any(kw in content_lower for kw in politics_keywords):
                    print(f"🚫 [POLITICS FILTER] 정치 기사 제외 처리: [{feed.get('source')}] {feed.get('title')}")
                    continue

                # 🚨 워치콘 2단계 이상 고빈도 속보 락다운: 핵심 위협 키워드가 포함되지 않으면 스킵 (한국어 대응 추가)
                if stage <= 2:
                    if not any(kw in content_lower for kw in ["explosion", "airstrike", "missile", "war", "전쟁", "미사일", "공습", "폭발"]):
                        continue
                
                article_hash = hashlib.md5(feed["link"].encode()).hexdigest()
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    if cursor.execute("SELECT id FROM incidents WHERE id=?", (article_hash,)).fetchone():
                        duplicate_articles += 1
                        continue 
                
                ai_start = time.time()
                intel_pack = process_ai_intel_analysis(feed, channel_name)
                ai_time_list.append(time.time() - ai_start)
                
                if not intel_pack:
                    continue
                
                category = (intel_pack.get("category") or "WAR").upper().strip()
                valid_geo = {"WAR", "EXPLOSION", "CYBERATTACK", "MILITARY", "DISASTER", "UNREST"}
                valid_eco = {"RECESSSION", "MARKET_CRASH", "INFLATION", "TRADE_WAR", "ENERGY", "TECH_CRISIS"}
                
                is_valid = (channel_name == "GEOPOLITICS" and category in valid_geo) or (channel_name == "ECONOMY" and category in valid_eco)
                if not is_valid:
                    print(f"🚫 [CATEGORY FILTER] {channel_name} 기사 제외 (유효하지 않은 카테고리 '{category}'): {feed['title']}")
                    continue
                
                valid_count += 1
                
                region_raw = intel_pack.get("region", "UNKNOWN").upper().strip()
                if re.search(r'[가-힣]', region_raw) or any(x in region_raw for x in ["NOT SPECIFIED", "UNKNOWN", "NOT "]) or len(region_raw) >= 30:
                    region = intel_pack.get("country", "GLOBAL").upper()
                else:
                    region = region_raw
 
                geo_requests += 1
                coords, is_hit = geocode_threat_zone(region, intel_pack.get("country", ""), feed["title"], geo_cache)
                if not coords:
                    coords, is_hit = geocode_threat_zone(intel_pack.get("country", ""), intel_pack.get("country", ""), feed["title"], geo_cache)
                
                # 최종 안전망: 지오코딩 3단계 실패 시 GLOBAL 디폴트 좌표로 강제 안착
                if not coords:
                    coords = TACTICAL_KNOWN_LOCATIONS["GLOBAL"]
                    is_hit = True
                
                if is_hit:
                    geo_hits += 1
                
                if not coords:
                    continue 

                # 🇰🇷 국내 언론사(YONHAP, KBS WORLD)의 기사 중 국내(SOUTH KOREA) 관련 기사 필터링
                if feed.get("source") in ["YONHAP", "KBS WORLD"]:
                    article_country = (coords.get("country") or intel_pack.get("country") or "").upper().strip()
                    if "SOUTH KOREA" in article_country or "KOREA" == article_country or "SEOUL" in article_country:
                        print(f"🚫 [DOMESTIC FILTER] 국내 사건 기사 제외 처리: [{feed.get('source')}] {feed.get('title')}")
                        continue
                
                # 클러스터링 좌표(통일된 이름)를 최종 지역명으로 채택하여 파편화 방지
                final_region = region
                if region in TACTICAL_KNOWN_LOCATIONS:
                    matches = [k for k, v in TACTICAL_KNOWN_LOCATIONS.items() if v == TACTICAL_KNOWN_LOCATIONS[region]]
                    if matches:
                        final_region = matches[0]
 
                # 𝕏 미디어 수집 통합 (V13.0-X 파이프라인 복원)
                media_url, media_type = None, None
                sns_source = None
                if channel_name == "GEOPOLITICS":
                    media_url, media_type = search_x_media(final_region, intel_pack.get("category", "WAR"))
                    if media_url:
                        sns_source = "X"

                two_hours_ago = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - 7200, timezone.utc).isoformat().replace("+00:00", "Z")
                
                with get_db_connection() as conn:
                    conn.execute("PRAGMA journal_mode=WAL;")
                    conn.execute("PRAGMA busy_timeout=15000;")
                    cursor = conn.cursor()
                    
                    # Fetch all nodes in this region & country & channel within last 2 hours
                    existing_nodes = cursor.execute(
                        "SELECT id, update_count, title, summary, lng, lat, verified_sources, child_feeds FROM incidents WHERE region=? AND country=? AND channel=? AND created_at >= ?",
                        (final_region, coords["country"], channel_name, two_hours_ago)
                    ).fetchall()
                    
                    matched_node = None
                    for node in existing_nodes:
                        existing_title = node[2] or ""
                        existing_summary = node[3] or ""
                        # Compare incoming text with existing text (Jaccard similarity)
                        similarity = calculate_jaccard_similarity(feed["title"] + " " + feed["summary"], existing_title + " " + existing_summary)
                        if similarity >= 0.6:
                            matched_node = node
                            break
                    
                    if matched_node:
                        # 1. Same physical event -> Perform Spatial Merge & Coordinate Inheritance
                        node_id, update_count, existing_title, existing_summary, existing_lng, existing_lat, existing_sources_json, existing_child_json = matched_node
                        
                        # Coordinate Inheritance: inherit specific coordinates if existing is coarse/GLOBAL
                        final_lat = existing_lat
                        final_lng = existing_lng
                        is_existing_coarse = (existing_lat == 20.0 and existing_lng == 0.0) or (existing_lat is None)
                        is_incoming_specific = (coords["lat"] != 20.0 or coords["lng"] != 0.0)
                        if is_existing_coarse and is_incoming_specific:
                            final_lat = coords["lat"]
                            final_lng = coords["lng"]
                            print(f"🎯 [COORDINATE INHERITANCE] {final_region} ({coords['country']}) 노드 좌표 갱신 ({existing_lat},{existing_lng} -> {final_lat},{final_lng})")
                        
                        # Decode verified sources
                        try:
                            v_srcs = json.loads(existing_sources_json) if existing_sources_json else []
                        except:
                            v_srcs = []
                        if feed["source"] not in v_srcs:
                            v_srcs.append(feed["source"])
                        verified_sources_json = json.dumps(v_srcs, ensure_ascii=False)
                        
                        # Decode child feeds
                        try:
                            c_feeds = json.loads(existing_child_json) if existing_child_json else []
                        except:
                            c_feeds = []
                        
                        new_child = {
                            "title": feed["title"],
                            "summary": intel_pack.get("tactical_summary", feed["summary"]),
                            "source": feed["source"],
                            "link": feed["link"],
                            "created_at": feed.get("pub_date", datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
                        }
                        c_feeds.append(new_child)
                        child_feeds_json = json.dumps(c_feeds, ensure_ascii=False)
                        
                        new_count = update_count + 1
                        current_time = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                        
                        # Determine if we should append to main title/summary (1-time append check)
                        if "[추가 속보]" in existing_summary:
                            # 1회 초과: 메인 요약은 보존하되, child_feeds/sources만 갱신하며 아카이브 테이블에 적치
                            cursor.execute("""
                                UPDATE incidents SET 
                                    update_count=?,
                                    verified_sources=?,
                                    child_feeds=?,
                                    lat=?,
                                    lng=?,
                                    created_at=?
                                WHERE id=?
                            """, (new_count, verified_sources_json, child_feeds_json, final_lat, final_lng, current_time, node_id))
                            
                            # 아카이브 보관
                            severity = intel_pack.get("severity", 0.5)
                            level = "CRITICAL" if severity >= 0.8 else "ELEVATED" if severity >= 0.5 else "NOMINAL"
                            cursor.execute("""
                                INSERT OR REPLACE INTO archived_news (
                                    id, country, region, lng, lat, severity, category, title, source, 
                                    created_at, summary, hash, embedding, status, update_count, first_seen, 
                                    region_risk_index, threat_velocity, trajectory, channel,
                                    media_url, media_type, sns_source, verified_sources, child_feeds
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                article_hash, coords["country"], final_region, coords["lng"], coords["lat"], severity, intel_pack.get("category", "WAR"),
                                feed["title"], feed["source"], current_time, intel_pack.get("tactical_summary", feed["summary"]),
                                article_hash, "[]", level, 1, current_time,
                                min(round(severity * 1.15, 2), 1.0), 0.05, "SUSTAINED",
                                channel_name, media_url, media_type, sns_source,
                                json.dumps([feed["source"]]), json.dumps([new_child])
                            ))
                            conn.commit()
                            print(f"📦 [ARCHIVE] [{channel_name}] [{feed['source']}] {final_region} 중복 1회 초과로 아카이브 및 자식 피드 병합 완료.")
                            continue
                        else:
                            # 1회 추가 속보 누적: 메인 텍스트 병합
                            new_title = existing_title + f"\n\n[추가 속보] {feed['title']}"
                            new_summary = existing_summary + f"\n\n[추가 속보] {intel_pack.get('tactical_summary', feed['summary'])}"
                            cursor.execute("""
                                UPDATE incidents SET 
                                    title=?,
                                    summary=?,
                                    update_count=?,
                                    verified_sources=?,
                                    child_feeds=?,
                                    lat=?,
                                    lng=?,
                                    threat_velocity=threat_velocity+0.05,
                                    media_url=COALESCE(media_url, ?),
                                    media_type=COALESCE(media_type, ?),
                                    sns_source=COALESCE(sns_source, ?),
                                    created_at=?
                                WHERE id=?
                            """, (new_title, new_summary, new_count, verified_sources_json, child_feeds_json, final_lat, final_lng, media_url, media_type, sns_source, current_time, node_id))
                            conn.commit()
                            print(f"🔄 [TACTICAL MERGE] [{channel_name}] [{feed['source']}] {final_region} 심층 분석망 병합 완료 (위협 카운트: {new_count})")
                            continue
                    else:
                        # 2. Different event in the same region -> Apply spatial offset
                        if len(existing_nodes) > 0:
                            coords["lat"] += random.uniform(-0.015, 0.015)
                            coords["lng"] += random.uniform(-0.015, 0.015)
                            print(f"🔀 [SPATIAL DISAMBIGUATION] {final_region} 동일 지역 다른 사건 발견으로 좌표 미세 오프셋 적용 ({coords['lat']:.4f}, {coords['lng']:.4f})")
                
                # Default Insert Block (New Event)
                evt_id = article_hash
                severity = intel_pack.get("severity", 0.5)
                level = "CRITICAL" if severity >= 0.8 else "ELEVATED" if severity >= 0.5 else "NOMINAL"
                # 기사 발행 시간 우선 사용, 없으면 현재 시간 폴백
                current_time = feed.get("pub_date", datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
                
                verified_sources_json = json.dumps([feed["source"]], ensure_ascii=False)
                new_child = {
                    "title": feed["title"],
                    "summary": intel_pack.get("tactical_summary", feed["summary"]),
                    "source": feed["source"],
                    "link": feed["link"],
                    "created_at": current_time
                }
                child_feeds_json = json.dumps([new_child], ensure_ascii=False)
                
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        INSERT OR REPLACE INTO incidents (
                            id, country, region, lng, lat, severity, category, title, source, 
                            created_at, summary, hash, embedding, status, update_count, first_seen, 
                            region_risk_index, threat_velocity, trajectory, channel,
                            media_url, media_type, sns_source, verified_sources, child_feeds
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        evt_id, coords["country"], final_region, coords["lng"], coords["lat"], severity, intel_pack.get("category", "WAR"),
                        feed["title"], feed["source"], current_time, intel_pack.get("tactical_summary", feed["summary"]),
                        evt_id, "[]", level, 1, current_time,
                        min(round(severity * 1.15, 2), 1.0), 0.10 if level == "CRITICAL" else 0.02, "ESCALATING" if level == "CRITICAL" else "SUSTAINED",
                        channel_name, media_url, media_type, sns_source, verified_sources_json, child_feeds_json
                    ))
                    conn.commit()
                    print(f"💥 [TACTICAL INTERCEPT] [{channel_name}] [{feed['source']}] {final_region} 심층 분석 노드 락온 성공.")
                    
        # [정량적 성능 측정 엔진 출력]
        duplicate_rate = (duplicate_articles / total_articles * 100) if total_articles > 0 else 0
        ai_processing_time = (sum(ai_time_list) / len(ai_time_list)) if ai_time_list else 0
        geo_cache_hit_rate = (geo_hits / geo_requests * 100) if geo_requests > 0 else 0
        
        print(f"\n📊 [PERFORMANCE METRICS TELEMETRY]")
        print(f"   - RSS Fetch Latency: {rss_fetch_latency:.2f}초")
        print(f"   - Duplicate Rate: {duplicate_rate:.1f}% ({duplicate_articles}/{total_articles})")
        print(f"   - AI Processing Time: {ai_processing_time:.2f}초/건")
        print(f"   - Geo Cache Hit Rate: {geo_cache_hit_rate:.1f}%")
        print(f"💾 [SQLITE CORE SYNC] 동기화 완수. 수집 및 심층 분석 처리 대상: {valid_count}건\n")
 
        # [HUD 텔레메트리 연동] data/telemetry.json 저장
        telemetry_path = os.path.join(BASE_DIR, "data", "telemetry.json")
        telemetry_data = {
            "rss_fetch_latency": round(rss_fetch_latency, 2),
            "duplicate_rate": round(duplicate_rate, 1),
            "ai_processing_time": round(ai_processing_time, 2),
            "geo_cache_hit_rate": round(geo_cache_hit_rate, 1),
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        try:
            with open(telemetry_path, "w", encoding="utf-8") as f:
                json.dump(telemetry_data, f, ensure_ascii=False, indent=2)
            print(f"📊 [TELEMETRY CORE SYNC] {telemetry_path} 업데이트 완료.")
        except Exception as e:
            print(f"⚠️ [TELEMETRY WRITE ERROR] {e}")
        
        # 15분 단위 DB 실시간 위협 밀집도 연산 및 워치콘 동적 자동 격상 (지휘관 오버라이드가 없을 시)
        if not override:
            fifteen_mins_ago = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - 900, timezone.utc).isoformat().replace("+00:00", "Z")
            with get_db_connection() as conn:
                cursor = conn.cursor()
                # 15분 이내 생성된 심각도 0.5 이상의 지정학 전쟁 및 폭발/공습/타격 관련 노드 세기
                threat_count = cursor.execute(
                    "SELECT COUNT(*) FROM incidents WHERE created_at >= ? AND severity >= 0.5 AND (category='WAR' OR title LIKE '%explosion%' OR title LIKE '%missile%' OR title LIKE '%strike%' OR title LIKE '%airstrike%' OR title LIKE '%war%')",
                    (fifteen_mins_ago,)
                ).fetchone()[0]
            
            # 15분 위협 밀집도 기반 자동 격상 매트릭스
            if threat_count >= 5:
                new_stage = 1
            elif threat_count >= 3:
                new_stage = 2
            elif threat_count >= 1:
                new_stage = 3
            else:
                new_stage = 4
                
            if new_stage != stage:
                stage = new_stage
                write_watchcon_file(stage, False)
                print(f"📡 [WATCHCON TEMPORAL BURST] 실시간 15분 위협 밀집도({threat_count}건)에 의해 워치콘 단계 자동 조정: WATCHCON {stage}")

        # 워치콘 연계 대기 주기 결정
        if stage == 1:
            scan_interval = 60
        elif stage == 2:
            scan_interval = 180
        elif stage == 3:
            scan_interval = 600
        else:
            scan_interval = 1800
            
        print(f"⏳ STANDBY... NEXT SATELLITE SCAN IN {scan_interval} SECONDS (WATCHCON {stage}, OVERRIDE={override})")
        
        # 하이브리드 대기 커널 가동 (1초 단위 정밀 동기화)
        elapsed = 0
        while elapsed < scan_interval:
            time.sleep(1)
            elapsed += 1
            current_watchcon = read_watchcon_file()
            if current_watchcon.get("stage") != stage or current_watchcon.get("override") != override:
                print(f"⚡ [WATCHCON KERNEL INTERRUPT] 워치콘 갱신 포착 (WATCHCON {current_watchcon.get('stage')}, OVERRIDE={current_watchcon.get('override')}). 즉시 새로운 수집 주기를 기동합니다.")
                break

if __name__ == "__main__":
    print("=" * 70)
    print("  ⛔  app.py IS RETIRED AND NO LONGER THE ACTIVE PIPELINE")
    print("=" * 70)
    print()
    print("  The ingestion pipeline has been migrated to two dedicated workers:")
    print("    ► python worker_ingest.py   — RSS/USGS/NOAA collection")
    print("    ► python worker_analyzer.py — AI analysis & DB writes")
    print()
    print("  Running app.py directly would cause CONCURRENT DB LOCKUPS.")
    print("  This process will now exit safely. Use the workers above.")
    print()
    import sys
    sys.exit(0)