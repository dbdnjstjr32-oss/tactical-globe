import os
import sys
import re
import sqlite3
import urllib.request
import urllib.parse
import urllib.error
import ssl
import json
import html
import hashlib
import time
import random
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from db_utils import get_db_connection

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15",
]

import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "osint_matrix.db")
WATCHCON_PATH = os.path.join(BASE_DIR, "data", "watchcon.json")

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

# ─── RSS Sources ──────────────────────────────────────────────────────────────
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

# Ported from app.py — merged into GEOPOLITICS channel
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

TELEGRAM_SOURCES = [
    "https://rsshub.rssforever.com/telegram/channel/mirra_sentdefender",
    "https://rsshub.rssforever.com/telegram/channel/OSINTdefender",
    "https://rsshub.rssforever.com/telegram/channel/bellingcat",
    "https://rsshub.rssforever.com/telegram/channel/Conflict_telegram",
]

TELEGRAM_FALLBACK_DOMAINS = [
    "https://rsshub.rssforever.com",
    "https://rss.fatman.top",
]

# ─── CYBER_AI Sources ─────────────────────────────────────────────────────────
CYBER_AI_RSS_SOURCES = [
    "https://feeds.feedburner.com/TheHackersNews",
    "https://www.bleepingcomputer.com/feed/",
    "https://www.hackthebox.com/rss/blog/news",
    "https://openai.com/news/rss.xml",
    "https://blog.google/technology/ai/rss/",
    "https://www.theverge.com/rss/index.xml",
    "https://www.darkreading.com/rss.xml",
    "https://krebsonsecurity.com/feed/",
    "https://threatpost.com/feed/",
]

CYBER_AI_TELEGRAM_SOURCES = [
    "https://t.me/s/vxunderground",               # 글로벌 악성코드/해킹 그룹 속보
    "https://t.me/s/techsparks",                  # AI 및 테크 뉴스
    "https://t.me/s/ai_machinelearning_big_data",  # AI, 머신러닝, 빅데이터
    "https://t.me/s/certikalert",                 # Web3/DeFi 해킹 실시간 경고 (CertiK)
]

# ─── Keyword Weight Dictionaries ─────────────────────────────────────────────
TACTICAL_KEYWORDS = {
    "explosion": 4, "blast": 3, "missile": 5, "strike": 3, "attack": 2,
    "earthquake": 5, "evacuation": 4, "military": 2, "drone": 3, "airport": 3,
    "crash": 4, "wildfire": 4, "nuclear": 5, "border": 2, "clash": 3,
    "forces": 2, "cyberattack": 4, "hacking": 3, "killed": 3, "injured": 3,
    "uav": 3, "tiltrotor": 2, "vtol": 2, "airspace": 3, "interception": 4,
    "airbase": 3, "radar": 2, "jamming": 3, "anti-aircraft": 4,
    "assassination": 5, "casualty": 4, "deploy": 2, "artillery": 4, "hostage": 5,
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

# Ported from app.py
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

CYBER_AI_KEYWORDS = {
    "cyberattack": 5, "ransomware": 5, "data breach": 5, "zero-day": 5,
    "exploit": 4, "vulnerability": 4, "malware": 4, "ddos": 4,
    "apt": 4, "supply chain attack": 5, "critical infrastructure": 5,
    "state-sponsored": 5, "botnet": 3, "phishing": 3, "spyware": 4,
    "ai model": 3, "llm": 3, "gpt": 3, "artificial intelligence": 2,
    "ai safety": 4, "deepfake": 4, "ai regulation": 3, "model leak": 5,
    "training data": 3, "alignment": 3, "open source ai": 2,
    "hack": 4, "breach": 4, "leaked": 4, "backdoor": 5,
    "intrusion": 4, "remote code execution": 5, "rce": 5,
    "사이버": 4, "해킹": 4, "악성코드": 4, "인공지능": 2, "딥페이크": 4,
}

# ─── Source Tier Crawl Intervals ─────────────────────────────────────────────
SOURCE_TIER = {
    "PUBLIC_API":        60,    # USGS, NOAA, GDACS, JMA, ReliefWeb — always safe
    "TELEGRAM":         180,    # Telegram RSS/web — moderately safe
    "CYBER_AI_TELEGRAM": 180,
    "NEWS_RSS":         600,    # BBC, AP, NYTimes, BleepingComputer etc — ban risk
}

WATCHCON_TIER_OVERRIDES = {
    1: {"PUBLIC_API":  60, "TELEGRAM":  60, "CYBER_AI_TELEGRAM":  60, "NEWS_RSS": 600},
    2: {"PUBLIC_API":  60, "TELEGRAM": 120, "CYBER_AI_TELEGRAM": 120, "NEWS_RSS": 600},
    3: {"PUBLIC_API": 120, "TELEGRAM": 180, "CYBER_AI_TELEGRAM": 180, "NEWS_RSS": 600},
    4: {"PUBLIC_API": 300, "TELEGRAM": 180, "CYBER_AI_TELEGRAM": 900, "NEWS_RSS": 1800},
    5: {"PUBLIC_API": 600, "TELEGRAM": 300, "CYBER_AI_TELEGRAM": 900, "NEWS_RSS": 3600},
}

FILTER_THRESHOLD = 4
# 리프레시(--once) 시 각 소스에서 강제 수집할 시간 윈도우 (최근 N시간만)
REFRESH_LOOKBACK_HOURS = 5
POLITICS_KEYWORDS = [
    "politics", "election", "parliament", "congress", "senate", "ballot",
    "정치", "선거", "국회", "대선", "총선", "여야", "정당"
]

# ─── DB helpers ───────────────────────────────────────────────────────────────
def evaluate_tactical_priority(article, keywords):
    text = (article["title"] + " " + article["summary"]).lower()
    return sum(weight for keyword, weight in keywords.items() if keyword in text)

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_db_connection() as conn:
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
                child_feeds TEXT DEFAULT '[]',
                pinned INTEGER DEFAULT 0,
                watchcon_trigger INTEGER DEFAULT 0
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
                child_feeds TEXT DEFAULT '[]',
                pinned INTEGER DEFAULT 0,
                watchcon_trigger INTEGER DEFAULT 0
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS custom_keywords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL UNIQUE,
                weight INTEGER NOT NULL DEFAULT 3,
                channel TEXT NOT NULL DEFAULT 'GEOPOLITICS',
                created_at TEXT
            )
        """)
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
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS raw_feeds (
                id TEXT PRIMARY KEY,
                channel TEXT,
                title TEXT,
                link TEXT,
                summary TEXT,
                source TEXT,
                pub_date TEXT,
                status TEXT DEFAULT 'PENDING',
                created_at TEXT,
                region_code TEXT,
                disaster_category TEXT
            )
        """)
        try:
            cursor.execute("ALTER TABLE raw_feeds ADD COLUMN region_code TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE raw_feeds ADD COLUMN disaster_category TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        conn.commit()

# ─── Date parsing ─────────────────────────────────────────────────────────────
def parse_pub_date(pub_date_str):
    if not pub_date_str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        dt = parsedate_to_datetime(pub_date_str.strip())
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def within_lookback_hours(pub_date_iso, hours):
    """pub_date(ISO 8601 UTC, 'Z')가 최근 N시간 이내인지. 날짜 불명이면 포함(True)."""
    if not pub_date_iso:
        return True
    try:
        dt = datetime.fromisoformat(pub_date_iso.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt) <= timedelta(hours=hours)
    except Exception:
        return True

# ─── RSS Fetcher (supports all source sets) ───────────────────────────────────
SOURCE_NAME_MAP = {
    "bbc": "BBC",
    "apnews": "AP NEWS",
    "aljazeera": "AL JAZEERA",
    "nytimes": "NY TIMES",
    "sky": "SKY NEWS",
    "yonhap": "YONHAP",
    "yna.co.kr": "YONHAP",
    "kbs.co.kr": "KBS WORLD",
    "reuters": "REUTERS",
    "defensenews": "DEFENSE NEWS",
    "military.com": "MILITARY.COM",
    "thehackernews": "HACKER NEWS",
    "krebsonsecurity": "KREBS",
    "bleepingcomputer": "BLEEPING",
    "darkreading": "DARK READING",
    "threatpost": "THREATPOST",
    "who.int": "WHO",
    "defense-aerospace": "DEFENSE AEROSPACE",
    "telegram/channel/mirra_sentdefender": "@mirra_sentdefender",
    "telegram/channel/OSINTdefender": "@OSINTdefender",
    "telegram/channel/bellingcat": "@bellingcat",
    "telegram/channel/Conflict_telegram": "@Conflict_telegram",
    # CYBER_AI sources
    "hackthebox": "HACK THE BOX",
    "openai.com": "OPENAI",
    "blog.google/technology/ai": "GOOGLE AI",
    "theverge.com/rss/ai": "THE VERGE AI",
    "t.me/s/vxunderground": "@vx_underground",
    "t.me/s/techsparks": "@techsparks",
    "t.me/s/ai_machinelearning_big_data": "@ai_ml_bigdata",
    "t.me/s/certikalert": "@certikalert",
}

def get_source_name(url):
    for key, name in SOURCE_NAME_MAP.items():
        if key in url:
            return name
    return "RAW"

# ─── RSS media extraction (Media RSS / enclosure) ────────────────────────────
_IMG_EXT_RE = re.compile(r"\.(jpg|jpeg|png|webp|gif)(\?|$)", re.IGNORECASE)


def extract_media_url(item_xml):
    """Pull a representative image URL from an RSS <item>.

    Tries <media:content>, <media:thumbnail>, then <enclosure>. Returns a URL
    only if it is https and has an allowed image extension (jpg/png/webp/gif).
    SVG and non-https are rejected (safety). Returns None if nothing valid.
    """
    if not item_xml:
        return None
    candidates = []
    # Media RSS: <media:content url="..." medium="image" type="image/*">
    for m in re.finditer(r"<media:content\b[^>]*\burl=[\"']([^\"']+)[\"'][^>]*>", item_xml, re.IGNORECASE):
        candidates.append(m.group(1))
    # <media:thumbnail url="...">
    for m in re.finditer(r"<media:thumbnail\b[^>]*\burl=[\"']([^\"']+)[\"']", item_xml, re.IGNORECASE):
        candidates.append(m.group(1))
    # <enclosure url="..." type="image/*">
    for m in re.finditer(r"<enclosure\b[^>]*\burl=[\"']([^\"']+)[\"'][^>]*>", item_xml, re.IGNORECASE):
        tag = m.group(0)
        if "image" in tag.lower() or _IMG_EXT_RE.search(m.group(1)):
            candidates.append(m.group(1))

    for raw in candidates:
        url = html.unescape(raw).strip()
        if not url.lower().startswith("https://"):
            continue            # reject http / mixed-content
        if ".svg" in url.lower():
            continue            # reject scriptable SVG
        if _IMG_EXT_RE.search(url):
            return url
    return None


def fetch_rss_sources(sources):
    raw_articles = []
    
    # Alternate RSSHub domains as fallbacks
    rsshub_fallbacks = [
        "https://rsshub.app",
        "https://rsshub.rssforever.com",
        "https://rsshub.moeyy.cn",
        "https://rsshub.pseudoyu.com"
    ]
    
    for url in sources:
        source_name = get_source_name(url)
        xml_data = None
        
        # Telegram-specific fallback: rsshub.rssforever.com → rss.fatman.top
        if "telegram/channel" in url:
            channel = url.split("/telegram/channel/")[-1]
            for domain in TELEGRAM_FALLBACK_DOMAINS:
                alt_url = f"{domain}/telegram/channel/{channel}"
                try:
                    req = urllib.request.Request(alt_url)
                    req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    req.add_header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    req.add_header("Accept-Language", "en-US,en;q=0.9,ko;q=0.8")
                    with urllib.request.urlopen(req, timeout=10) as response:
                        xml_data = response.read().decode("utf-8", errors="ignore")
                        print(f"  [TELEGRAM] OK: {alt_url}")
                        break
                except urllib.error.HTTPError as e:
                    if e.code == 403:
                        print(f"  [TELEGRAM] 403 on {alt_url}, trying next fallback...")
                        continue
                    continue
                except Exception:
                    print(f"  [TELEGRAM] Timeout/error on {alt_url}, trying next fallback...")
                    continue
        # If url targets rsshub.app, run fallback retry loop
        elif "rsshub.app" in url:
            for domain in rsshub_fallbacks:
                alt_url = url.replace("https://rsshub.app", domain)
                try:
                    req = urllib.request.Request(alt_url)
                    req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    req.add_header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8")
                    req.add_header("Accept-Language", "en-US,en;q=0.9,ko;q=0.8")
                    with urllib.request.urlopen(req, timeout=10) as response:
                        xml_data = response.read().decode("utf-8", errors="ignore")
                        break
                except Exception:
                    continue
        elif "bleepingcomputer" in url:
            try:
                req = urllib.request.Request(url)
                req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                req.add_header("Referer", "https://www.bleepingcomputer.com/")
                req.add_header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                req.add_header("Accept-Language", "en-US,en;q=0.9")
                with urllib.request.urlopen(req, timeout=10) as response:
                    xml_data = response.read().decode("utf-8", errors="ignore")
            except Exception:
                continue
        elif "openai.com" in url:
            try:
                req = urllib.request.Request(url)
                req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
                    xml_data = response.read().decode("utf-8", errors="ignore")
            except Exception:
                continue
        else:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": random.choice(USER_AGENTS)})
                with urllib.request.urlopen(req, timeout=10) as response:
                    xml_data = response.read().decode("utf-8", errors="ignore")
            except Exception:
                continue

        if not xml_data:
            continue

        # Rate-limit: random delay between source fetches to avoid IP bans
        time.sleep(random.uniform(1.5, 4.0))
            
        try:
            items = re.findall(r"<item(?:.*?)>(.*?)</item>", xml_data, re.DOTALL)
            for item in items:
                title_m = re.search(r"<title(?:.*?)>(.*?)</title>", item, re.DOTALL)
                link_m = re.search(r"<link(?:.*?)>(.*?)</link>", item, re.DOTALL)
                desc_m = re.search(r"<description(?:.*?)>(.*?)</description>", item, re.DOTALL)
                pub_m = re.search(r"<pubDate(?:.*?)>(.*?)</pubDate>", item, re.DOTALL)
                if title_m and link_m:
                    title = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", title_m.group(1), flags=re.DOTALL).strip()
                    title = html.unescape(title).replace("\n", " ")
                    link = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", link_m.group(1), flags=re.DOTALL).strip()
                    summary = ""
                    if desc_m:
                        summary = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", desc_m.group(1), flags=re.DOTALL).strip()
                        summary = re.sub(r"<[^>]*>", "", summary)
                        summary = html.unescape(summary).replace("\n", " ")
                    pub_date = parse_pub_date(pub_m.group(1) if pub_m else None)
                    media_url = extract_media_url(item)
                    raw_articles.append({
                        "title": title,
                        "link": link,
                        "summary": summary if summary else title,
                        "source": source_name,
                        "pub_date": pub_date,
                        "media_url": media_url,
                        "media_type": "image" if media_url else None
                    })
        except Exception:
            continue
    return raw_articles

# ─── USGS Earthquakes (ported from app.py) ───────────────────────────────────
def fetch_usgs_earthquakes():
    """USGS 실시간 지진 데이터 수집 (규모 4.5 이상, 24시간 이내)"""
    try:
        url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
        req = urllib.request.Request(url, headers={"User-Agent": "TacticalGlobeOpsCore/16.0"})
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
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
                    "detail": json.dumps({
                        "magnitude": mag,
                        "depth_km": coords[2],
                        "url": props.get("url", "")
                    })
                })
            print(f"🌍 [USGS] 지진 경보 {len(alerts)}건 수집 완료")
            return alerts
    except Exception as e:
        print(f"⚠️ [USGS ERROR] {e}")
        return []

# ─── NOAA Weather Alerts (ported from app.py) ────────────────────────────────
def fetch_noaa_alerts():
    """NOAA 미국 기상 경보 수집 (사이클론, 허리케인, 토네이도 등)"""
    try:
        url = "https://api.weather.gov/alerts/active?status=actual&message_type=alert&urgency=Immediate,Expected"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "TacticalGlobeOpsCore/16.0", "Accept": "application/geo+json"}
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
            alerts = []
            severe_events = [
                "Tornado", "Hurricane", "Typhoon", "Tsunami",
                "Extreme Wind", "Blizzard", "Ice Storm", "Flash Flood Emergency"
            ]
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
                    "detail": json.dumps({
                        "headline": props.get("headline", ""),
                        "description": props.get("description", "")[:500]
                    })
                })
            print(f"🌪️ [NOAA] 기상 경보 {len(alerts)}건 수집 완료")
            return alerts
    except Exception as e:
        print(f"⚠️ [NOAA ERROR] {e}")
        return []

def fetch_and_queue_telegram_feeds():
    """Telegram 채널 RSS 수집 및 raw_feeds 큐 삽입"""
    print("📢 [TELEGRAM INGEST] Fetching Telegram RSS feeds...")
    tg_feeds = fetch_rss_sources(TELEGRAM_SOURCES)
    inserted = 0
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for feed in tg_feeds:
            # 1. Keyword priority filter
            if evaluate_tactical_priority(feed, TACTICAL_KEYWORDS) < FILTER_THRESHOLD:
                continue

            # 2. Politics filter
            content_lower = (feed.get("title", "") + " " + feed.get("summary", "")).lower()
            if any(kw in content_lower for kw in POLITICS_KEYWORDS):
                print(f"🚫 [POLITICS FILTER] TELEGRAM 정치 기사 제외: [{feed.get('source')}] {feed.get('title')[:60]}")
                continue

            article_hash = hashlib.md5(feed["link"].encode()).hexdigest()

            # 3. Dedup check (incidents + raw_feeds)
            if (
                cursor.execute("SELECT id FROM incidents WHERE id=?", (article_hash,)).fetchone() or
                cursor.execute("SELECT id FROM raw_feeds WHERE id=?", (article_hash,)).fetchone()
            ):
                continue

            cursor.execute("""
                INSERT INTO raw_feeds (id, channel, title, link, summary, source, pub_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                article_hash, "TELEGRAM",
                feed["title"], feed["link"], feed["summary"],
                feed["source"], feed["pub_date"],
                datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            ))
            inserted += 1
        conn.commit()
    print(f"📥 [TELEGRAM INGEST] {inserted} new Telegram articles queued.")
    return inserted

# ─── CYBER_AI Telegram Web Scraper ───────────────────────────────────────────
def fetch_and_queue_cyber_ai_telegram():
    """CYBER_AI Telegram 채널 t.me/s/ 웹페이지 스크랩 및 raw_feeds 큐 삽입.
    HTML 파싱 실패 시 RSS fallback 사용."""
    print("🔐 [CYBER_AI TELEGRAM] Fetching CYBER_AI Telegram sources...")
    inserted = 0

    with get_db_connection() as conn:
        cursor = conn.cursor()

        for tg_url in CYBER_AI_TELEGRAM_SOURCES:
            source_name = get_source_name(tg_url)
            articles = []

            # ── 1. Try HTML scrape of t.me/s/ page ───────────────────────────
            try:
                req = urllib.request.Request(tg_url)
                req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                req.add_header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                req.add_header("Accept-Language", "en-US,en;q=0.9")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    raw_html = resp.read().decode("utf-8", errors="ignore")

                # Extract message text from tgme_widget_message_text divs
                msg_texts = re.findall(
                    r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
                    raw_html, re.DOTALL
                )
                msg_links = re.findall(
                    r'class="tgme_widget_message_wrap[^"]*".*?href="(https://t\.me/[^"]+)"',
                    raw_html, re.DOTALL
                )

                for i, text_html in enumerate(msg_texts):
                    clean_text = re.sub(r"<[^>]+>", " ", text_html)
                    clean_text = html.unescape(clean_text).replace("\n", " ").strip()
                    if len(clean_text) < 20:
                        continue
                    link = msg_links[i] if i < len(msg_links) else tg_url
                    articles.append({
                        "title": clean_text[:120],
                        "link": link,
                        "summary": clean_text,
                        "source": source_name,
                        "pub_date": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    })
                print(f"  [CYBER_AI TG] HTML: {len(articles)} msgs from {tg_url}")
            except Exception as e:
                print(f"  [CYBER_AI TG] HTML fetch failed for {tg_url}: {e}")

            # ── 2. Fallback: treat as RSS ─────────────────────────────────────
            if len(articles) == 0:
                try:
                    rss_articles = fetch_rss_sources([tg_url])
                    articles = rss_articles
                    print(f"  [CYBER_AI TG] RSS fallback: {len(articles)} items from {tg_url}")
                except Exception as e:
                    print(f"  [CYBER_AI TG] RSS fallback also failed for {tg_url}: {e}")

            # ── 3. Filter + dedup + insert ────────────────────────────────────
            for feed in articles:
                if evaluate_tactical_priority(feed, CYBER_AI_KEYWORDS) < 4:
                    continue

                link = feed.get("link", "")
                if not link:
                    continue
                article_hash = hashlib.md5(link.encode()).hexdigest()

                if (
                    cursor.execute("SELECT id FROM incidents WHERE id=?", (article_hash,)).fetchone() or
                    cursor.execute("SELECT id FROM raw_feeds WHERE id=?", (article_hash,)).fetchone()
                ):
                    continue

                cursor.execute("""
                    INSERT INTO raw_feeds (id, channel, title, link, summary, source, pub_date, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    article_hash, "CYBER_AI",
                    feed.get("title", "")[:255],
                    link,
                    feed.get("summary", ""),
                    feed.get("source", source_name),
                    feed.get("pub_date", datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")),
                    datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                ))
                inserted += 1

        conn.commit()

    print(f"📥 [CYBER_AI TELEGRAM] {inserted} new CYBER_AI Telegram articles queued.")
    return inserted

# ─── Weather / Natural Disaster Harvester ─────────────────────────────────────
REGIONS = {
    "ASIA_PACIFIC": [(35.68, 139.69), (14.59, 120.98), (-6.21, 106.84)],
    "EUROPE": [(51.50, -0.12), (48.85, 2.35)],
    "AMERICAS": [(40.71, -74.00), (25.77, -80.19), (19.43, -99.13)],
    "AFRICA_MIDEAST": [(30.04, 31.23), (-1.28, 36.81)],
    "CENTRAL_ASIA": [(19.07, 72.87), (24.86, 67.01)]
}

last_gdacs_run = 0
last_jma_run = 0
last_reliefweb_run = 0
last_owm_run = 0

def get_region_code(lat, lng):
    min_dist = float('inf')
    best_region = "ASIA_PACIFIC"
    for region, cities in REGIONS.items():
        for c_lat, c_lng in cities:
            d_lng = abs(lng - c_lng)
            if d_lng > 180:
                d_lng = 360 - d_lng
            d_lat = lat - c_lat
            dist = d_lat**2 + d_lng**2
            if dist < min_dist:
                min_dist = dist
                best_region = region
    return best_region

def get_region_by_country_name(country_name):
    if not country_name:
        return "ASIA_PACIFIC"
    name = country_name.lower()
    americas_keywords = ["united states", "usa", "canada", "mexico", "brazil", "argentina", "colombia", "peru", "chile", "haiti", "cuba", "barbados", "guatemala", "honduras", "venezuela", "ecuador", "bolivia", "paraguay", "uruguay", "costa rica", "panama", "nicaragua", "el salvador", "jamaica", "trinidad", "bahamas", "dominican"]
    if any(k in name for k in americas_keywords):
        return "AMERICAS"
    europe_keywords = ["united kingdom", "uk", "great britain", "england", "scotland", "ireland", "france", "germany", "italy", "spain", "ukraine", "poland", "greece", "norway", "sweden", "finland", "belgium", "netherlands", "switzerland", "austria", "portugal", "denmark", "romania", "hungary", "czech", "slovakia", "bulgaria", "croatia", "estonia", "latvia", "lithuania", "belarus"]
    if any(k in name for k in europe_keywords):
        return "EUROPE"
    africa_mideast_keywords = ["egypt", "kenya", "syria", "iraq", "yemen", "saudi", "israel", "gaza", "lebanon", "congo", "uganda", "sudan", "ethiopia", "somalia", "nigeria", "south africa", "angola", "zambia", "gabon", "madagascar", "libya", "algeria", "tunisia", "morocco", "jordan", "iran", "turkey", "uae", "qatar", "kuwait", "oman", "bahrain", "mali", "niger", "chad", "cameroon", "ghana", "ivory coast", "senegal", "zimbabwe", "mozambique", "tanzania", "rwanda", "burundi"]
    if any(k in name for k in africa_mideast_keywords):
        return "AFRICA_MIDEAST"
    central_asia_keywords = ["india", "pakistan", "bangladesh", "nepal", "sri lanka", "kazakhstan", "uzbekistan", "kyrgyzstan", "tajikistan", "turkmenistan", "afghanistan", "bhutan", "maldives"]
    if any(k in name for k in central_asia_keywords):
        return "CENTRAL_ASIA"
    asia_pacific_keywords = ["japan", "tokyo", "philippines", "manila", "indonesia", "jakarta", "korea", "china", "australia", "new zealand", "vietnam", "thailand", "malaysia", "myanmar", "laos", "cambodia", "taiwan", "singapore", "mongolia", "pacific", "fiji", "papua", "solomon", "samoa", "tonga", "vanuatu"]
    if any(k in name for k in asia_pacific_keywords):
        return "ASIA_PACIFIC"
    return "ASIA_PACIFIC"

def find_key_recursive(data, target_key):
    results = []
    if isinstance(data, dict):
        for k, v in data.items():
            if k == target_key:
                results.append(v)
            else:
                results.extend(find_key_recursive(v, target_key))
    elif isinstance(data, list):
        for item in data:
            results.extend(find_key_recursive(item, target_key))
    return results

def parse_iso6709(coord_str):
    if not coord_str:
        return None, None
    m = re.match(r'([+-]\d+\.?\d*)([+-]\d+\.?\d*)/?', coord_str)
    if not m:
        return None, None
    lat_part, lng_part = m.group(1), m.group(2)
    
    if '.' in lat_part:
        lat = float(lat_part)
    else:
        sign = -1 if lat_part.startswith('-') else 1
        digits = lat_part[1:]
        if len(digits) == 4:
            lat = sign * (float(digits[:2]) + float(digits[2:]) / 60.0)
        elif len(digits) == 6:
            lat = sign * (float(digits[:2]) + float(digits[2:4]) / 60.0 + float(digits[4:]) / 3600.0)
        elif len(digits) == 2:
            lat = sign * float(digits)
        else:
            lat = float(lat_part)
            
    if '.' in lng_part:
        lng = float(lng_part)
    else:
        sign = -1 if lng_part.startswith('-') else 1
        digits = lng_part[1:]
        if len(digits) == 5:
            lng = sign * (float(digits[:3]) + float(digits[3:]) / 60.0)
        elif len(digits) == 7:
            lng = sign * (float(digits[:3]) + float(digits[3:5]) / 60.0 + float(digits[5:]) / 3600.0)
        elif len(digits) == 3:
            lng = sign * float(digits)
        else:
            lng = float(lng_part)
            
    return lat, lng

def fetch_gdacs_disasters():
    url = "https://www.gdacs.org/xml/rss.xml"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    events = []
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
            root = ET.fromstring(xml_data)
            namespaces = {
                'geo': 'http://www.w3.org/2003/01/geo/wgs84_pos#',
                'gdacs': 'http://www.gdacs.org',
                'dc': 'http://purl.org/dc/elements/1.1/'
            }
            for item in root.findall('.//item'):
                title = item.find('title').text if item.find('title') is not None else ""
                link = item.find('link').text if item.find('link') is not None else ""
                description = item.find('description').text if item.find('description') is not None else ""
                pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ""
                
                event_type_el = item.find('gdacs:eventtype', namespaces)
                event_type = event_type_el.text if event_type_el is not None else ""
                
                cat_map = {
                    "EQ": "EARTHQUAKE",
                    "TC": "TYPHOON",
                    "FL": "FLOOD",
                    "VO": "VOLCANO",
                    "DR": "DROUGHT",
                    "WF": "WILDFIRE"
                }
                disaster_cat = cat_map.get(event_type)
                if not disaster_cat:
                    continue
                
                lat, lng = None, None
                lat_el = item.find('geo:Point/geo:lat', namespaces)
                lng_el = item.find('geo:Point/geo:long', namespaces)
                if lat_el is not None and lng_el is not None:
                    try:
                        lat = float(lat_el.text)
                        lng = float(lng_el.text)
                    except ValueError:
                        pass
                
                if lat is not None and lng is not None:
                    region_code = get_region_code(lat, lng)
                else:
                    country_el = item.find('gdacs:country', namespaces)
                    country_name = country_el.text if country_el is not None else ""
                    region_code = get_region_by_country_name(country_name)
                
                event_id_el = item.find('gdacs:eventid', namespaces)
                event_id = event_id_el.text if event_id_el is not None else ""
                if event_id:
                    feed_id = f"gdacs-{event_type}-{event_id}"
                else:
                    feed_id = hashlib.md5((title + link).encode('utf-8')).hexdigest()
                
                events.append({
                    "id": feed_id,
                    "channel": "WEATHER",
                    "title": title,
                    "link": link,
                    "summary": description,
                    "source": "GDACS",
                    "pub_date": parse_pub_date(pub_date),
                    "region_code": region_code,
                    "disaster_category": disaster_cat
                })
    except Exception as e:
        print(f"⚠️ [GDACS ERROR] Failed to fetch or parse GDACS: {e}")
    return events

def fetch_jma_typhoons():
    url = "https://www.jma.go.jp/bosai/information/data/typhoon.json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    events = []
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            typhoons = json.loads(response.read().decode('utf-8'))
            for item in typhoons:
                event_id = item.get("eventId", "")
                fileName = item.get("fileName", "")
                head_title = item.get("headTitle", "")
                report_dt = item.get("reportDatetime", "")
                
                typhoon_num_match = re.search(r'台風第([０-９\d]+)호|台風第([０-９\d]+)号', head_title)
                typhoon_num = "0"
                if typhoon_num_match:
                    typhoon_num = typhoon_num_match.group(1) or typhoon_num_match.group(2) or "0"
                
                fullwidth_to_halfwidth = {
                    '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
                    '５': '5', '６': '6', '７': '7', '８': '8', '９': '9'
                }
                typhoon_num = "".join(fullwidth_to_halfwidth.get(char, char) for char in typhoon_num)
                typhoon_name = f"TYPHOON {typhoon_num}"
                
                detail_url = f"https://www.jma.go.jp/bosai/information/data/{fileName}"
                lat, lng = 25.0, 135.0
                direction = "UNKNOWN"
                speed = "UNKNOWN"
                summary = f"JMA Typhoon report: {head_title}."
                
                try:
                    detail_req = urllib.request.Request(detail_url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(detail_req, timeout=5) as detail_resp:
                        detail_data = json.loads(detail_resp.read().decode('utf-8'))
                        coords = find_key_recursive(detail_data, "Coordinate")
                        if coords:
                            c_str = coords[0]
                            parsed_lat, parsed_lng = parse_iso6709(c_str)
                            if parsed_lat is not None and parsed_lng is not None:
                                lat, lng = parsed_lat, parsed_lng
                        
                        dirs = find_key_recursive(detail_data, "Direction")
                        if dirs:
                            if isinstance(dirs[0], dict):
                                direction = dirs[0].get("value", "UNKNOWN")
                            else:
                                direction = str(dirs[0])
                                
                        speeds = find_key_recursive(detail_data, "Speed")
                        if speeds:
                            if isinstance(speeds[0], dict):
                                speed = speeds[0].get("value", "UNKNOWN")
                            else:
                                speed = str(speeds[0])
                        
                        summary = f"JMA Tropical Cyclone Info: {head_title}. Coordinates: {lat:.2f}, {lng:.2f}. Movement: {direction} at {speed}."
                except Exception as e:
                    summary = f"JMA Tropical Cyclone Info: {head_title}. Detail report not accessible ({e})."
                
                region_code = get_region_code(lat, lng)
                events.append({
                    "id": f"jma-typhoon-{event_id}",
                    "channel": "WEATHER",
                    "title": f"[JMA] {typhoon_name} ({head_title})",
                    "link": "https://www.jma.go.jp/bosai/map.html#contents=typhoon",
                    "summary": summary,
                    "source": "Japan Meteorological Agency",
                    "pub_date": report_dt,
                    "region_code": region_code,
                    "disaster_category": "TYPHOON"
                })
    except Exception as e:
        print(f"⚠️ [JMA ERROR] Failed to fetch or parse JMA typhoons: {e}")
    return events

def fetch_reliefweb_disasters():
    api_url = "https://api.reliefweb.int/v2/disasters?appname=tacticalglobe&limit=20&sort[]=date:desc"
    events = []
    try:
        fields_url = api_url + "&fields[include][]=name&fields[include][]=country&fields[include][]=type&fields[include][]=date"
        fields_req = urllib.request.Request(fields_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(fields_req, timeout=10) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            for item in res_data.get("data", []):
                fields = item.get("fields", {})
                name = fields.get("name", "")
                disaster_id = item.get("id", "")
                country_list = fields.get("country", [])
                countries = [c.get("name") for c in country_list if c.get("name")]
                country_str = ", ".join(countries) if countries else "Global"
                
                types = fields.get("type", [])
                disaster_type = types[0].get("name", "Other") if types else "Other"
                date_created = fields.get("date", {}).get("created", "")
                
                lat, lng = None, None
                for c in country_list:
                    loc = c.get("location", {})
                    if loc and "lat" in loc and "lon" in loc:
                        lat = loc["lat"]
                        lng = loc["lon"]
                        break
                
                if lat is not None and lng is not None:
                    region_code = get_region_code(lat, lng)
                else:
                    region_code = get_region_by_country_name(country_str)
                
                summary = f"ReliefWeb Disaster Alert: {name}. Affected countries: {country_str}. Disaster type: {disaster_type}."
                events.append({
                    "id": f"reliefweb-disaster-{disaster_id}",
                    "channel": "WEATHER",
                    "title": f"[ReliefWeb] {name}",
                    "link": f"https://reliefweb.int/disaster/{disaster_id}",
                    "summary": summary,
                    "source": "ReliefWeb",
                    "pub_date": date_created,
                    "region_code": region_code,
                    "disaster_category": disaster_type.upper()
                })
            return events
    except Exception as api_err:
        print(f"⚠️ [ReliefWeb API Error] {api_err}. Falling back to RSS feed.")
        rss_url = "https://reliefweb.int/disasters/rss.xml"
        rss_req = urllib.request.Request(rss_url, headers={'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(rss_req, timeout=10) as response:
                xml_data = response.read()
                root = ET.fromstring(xml_data)
                for item in root.findall('.//item'):
                    title = item.find('title').text if item.find('title') is not None else ""
                    link = item.find('link').text if item.find('link') is not None else ""
                    description_html = item.find('description').text if item.find('description') is not None else ""
                    pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ""
                    
                    countries_part = "Global"
                    disaster_type = "Other"
                    m = re.match(r'^([^:]+):\s*([^-]+)\s*-\s*(.+)$', title)
                    if m:
                        countries_part = m.group(1).strip()
                        disaster_type = m.group(2).strip()
                    
                    country_match = re.search(r'class="tag country">Affected countries:\s*([^<]+)', description_html)
                    if country_match:
                        countries_part = country_match.group(1).strip()
                        
                    region_code = get_region_by_country_name(countries_part)
                    
                    guid_el = item.find('guid')
                    guid = guid_el.text if guid_el is not None else ""
                    disaster_id = guid.split('/')[-1] if '/' in guid else guid
                    if not disaster_id:
                        disaster_id = hashlib.md5((title + link).encode('utf-8')).hexdigest()
                    
                    clean_desc = re.sub(r'<[^>]+>', '', description_html).strip()
                    clean_desc = re.sub(r'\s+', ' ', clean_desc)
                    if len(clean_desc) > 300:
                        clean_desc = clean_desc[:300] + "..."
                        
                    events.append({
                        "id": f"reliefweb-disaster-{disaster_id}",
                        "channel": "WEATHER",
                        "title": f"[ReliefWeb] {title}",
                        "link": link,
                        "summary": clean_desc,
                        "source": "ReliefWeb",
                        "pub_date": parse_pub_date(pub_date),
                        "region_code": region_code,
                        "disaster_category": disaster_type.upper()
                    })
        except Exception as rss_err:
            print(f"⚠️ [ReliefWeb RSS Error] {rss_err}. Failed completely.")
    return events

def fetch_owm_alerts():
    api_key = os.environ.get("OPENWEATHER_API_KEY")
    if not api_key:
        print("⚠️ [OWM] OPENWEATHER_API_KEY not found in environment. Skipping.")
        return []
    
    cities = [
        ("ASIA_PACIFIC", "Tokyo", 35.68, 139.69),
        ("ASIA_PACIFIC", "Manila", 14.59, 120.98),
        ("ASIA_PACIFIC", "Jakarta", -6.21, 106.84),
        ("EUROPE", "London", 51.50, -0.12),
        ("EUROPE", "Paris", 48.85, 2.35),
        ("AMERICAS", "New York", 40.71, -74.00),
        ("AMERICAS", "Miami", 25.77, -80.19),
        ("AMERICAS", "Mexico City", 19.43, -99.13),
        ("AFRICA_MIDEAST", "Cairo", 30.04, 31.23),
        ("AFRICA_MIDEAST", "Nairobi", -1.28, 36.81),
        ("CENTRAL_ASIA", "Mumbai", 19.07, 72.87),
        ("CENTRAL_ASIA", "Karachi", 24.86, 67.01)
    ]
    
    alerts = []
    for region, city, lat, lon in cities:
        url = f"https://api.openweathermap.org/data/2.5/find?lat={lat}&lon={lon}&cnt=1&appid={api_key}"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                if "list" in data and len(data["list"]) > 0:
                    item = data["list"][0]
                    weather_list = item.get("weather", [])
                    if weather_list:
                        w = weather_list[0]
                        main_weather = w.get("main", "")
                        desc = w.get("description", "")
                        temp_kelvin = item.get("main", {}).get("temp", 273.15)
                        temp_c = temp_kelvin - 273.15
                        wind_speed = item.get("wind", {}).get("speed", 0)
                        
                        title = f"[WEATHER_ALERT] {city} ({item.get('sys', {}).get('country', '')}) - {main_weather}"
                        summary = f"Current weather in {city}: {desc}. Temp: {temp_c:.1f}C, Wind: {wind_speed} m/s."
                        
                        current_hour = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")
                        feed_id = hashlib.md5(f"owm-{city}-{current_hour}".encode('utf-8')).hexdigest()
                        
                        alerts.append({
                            "id": feed_id,
                            "channel": "WEATHER",
                            "title": title,
                            "link": f"https://openweathermap.org/city/{item.get('id', '')}",
                            "summary": summary,
                            "source": "OpenWeatherMap",
                            "pub_date": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                            "region_code": region,
                            "disaster_category": "WEATHER_ALERT"
                        })
        except Exception as e:
            print(f"⚠️ [OWM ERROR] Failed to fetch weather for {city}: {e}")
    return alerts

def poll_weather_sources(force=False):
    global last_gdacs_run, last_jma_run, last_reliefweb_run, last_owm_run
    current_time = time.time()
    all_weather_feeds = []
    
    # 1. GDACS (60 mins)
    if force or (current_time - last_gdacs_run) >= 3600:
        print("📢 [WEATHER] Fetching GDACS disasters...")
        all_weather_feeds.extend(fetch_gdacs_disasters())
        last_gdacs_run = current_time
        time.sleep(2)
        
    # 2. JMA Typhoon (60 mins)
    if force or (current_time - last_jma_run) >= 3600:
        print("📢 [WEATHER] Fetching JMA typhoon details...")
        all_weather_feeds.extend(fetch_jma_typhoons())
        last_jma_run = current_time
        time.sleep(2)
        
    # 3. ReliefWeb (2 hours)
    if force or (current_time - last_reliefweb_run) >= 7200:
        print("📢 [WEATHER] Fetching ReliefWeb disasters...")
        all_weather_feeds.extend(fetch_reliefweb_disasters())
        last_reliefweb_run = current_time
        time.sleep(2)
        
    # 4. OpenWeatherMap (60 mins)
    if force or (current_time - last_owm_run) >= 3600:
        print("📢 [WEATHER] Fetching OpenWeatherMap alerts...")
        all_weather_feeds.extend(fetch_owm_alerts())
        last_owm_run = current_time
        time.sleep(2)
        
    if not all_weather_feeds:
        return 0
        
    inserted = 0
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for feed in all_weather_feeds:
            feed_id = feed["id"]
            if (
                cursor.execute("SELECT id FROM incidents WHERE id=?", (feed_id,)).fetchone() or
                cursor.execute("SELECT id FROM raw_feeds WHERE id=?", (feed_id,)).fetchone()
            ):
                continue
                
            cursor.execute("""
                INSERT INTO raw_feeds (
                    id, channel, title, link, summary, source, pub_date, created_at,
                    region_code, disaster_category
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                feed_id, feed["channel"], feed["title"], feed["link"], feed["summary"],
                feed["source"], feed["pub_date"],
                datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                feed.get("region_code"), feed.get("disaster_category")
            ))
            inserted += 1
        conn.commit()
        
    if inserted > 0:
        print(f"📥 [WEATHER INGEST] {inserted} new weather/disaster articles queued.")
    return inserted

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
            """, (
                a["id"], a["alert_type"], a["title"], a["severity"],
                a["lat"], a["lng"], a["country"], a["region"],
                a["created_at"], a["detail"]
            ))
        conn.commit()

# ─── Watchcon ─────────────────────────────────────────────────────────────────
def read_watchcon_file():
    try:
        if os.path.exists(WATCHCON_PATH):
            with open(WATCHCON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {"stage": 4, "override": False}

# ─── Main ingestor loop ───────────────────────────────────────────────────────
def run_ingestor():
    init_db()
    print("🚀 [INGEST WORKER] Full-Spectrum Asynchronous Pipeline Initiated.")
    print("   Channels: GEOPOLITICS | MILITARY | CYBER | HEALTH | ECONOMY | USGS | NOAA | TELEGRAM | WEATHER | CYBER_AI")

    last_watchcon_mtime = 0
    stage = 4
    scan_interval = 1800
    once_mode = "--once" in sys.argv

    # Per-tier last-run timers (intervals driven by WATCHCON_TIER_OVERRIDES)
    last_public_api_run = 0
    last_telegram_run = 0
    last_cyber_ai_telegram_run = 0
    last_news_rss_run = 0

    while True:
        cycle_start = time.time()

        # ── Watchcon interval check ──────────────────────────────────────────
        try:
            mtime = os.stat(WATCHCON_PATH).st_mtime
            if mtime != last_watchcon_mtime:
                last_watchcon_mtime = mtime
                wc = read_watchcon_file()
                stage = wc.get("stage", 4)
                if stage == 1: scan_interval = 60
                elif stage == 2: scan_interval = 180
                elif stage == 3: scan_interval = 600
                else: scan_interval = 1800
                scan_interval = max(60, scan_interval)
                print(f"📡 [WATCHCON UPDATED] Stage: {stage} -> Scan Interval: {scan_interval}s")
        except Exception:
            pass

        # ── Tier-gated fetch logic ───────────────────────────────────────────
        current_time = time.time()
        tier_intervals = WATCHCON_TIER_OVERRIDES.get(stage, WATCHCON_TIER_OVERRIDES[4])

        # PUBLIC_API tier — USGS, NOAA, GDACS, JMA, ReliefWeb, OWM
        if once_mode or (current_time - last_public_api_run) >= tier_intervals["PUBLIC_API"]:
            print("🌍 [INGEST] Fetching public API sources (USGS, NOAA, Weather)...")
            usgs_alerts = fetch_usgs_earthquakes()
            noaa_alerts = fetch_noaa_alerts()
            sync_natural_alerts(usgs_alerts + noaa_alerts)
            poll_weather_sources(force=False)
            last_public_api_run = current_time
        else:
            usgs_alerts, noaa_alerts = [], []

        # TELEGRAM tier — existing Telegram channels
        if once_mode or (current_time - last_telegram_run) >= tier_intervals["TELEGRAM"]:
            fetch_and_queue_telegram_feeds()
            last_telegram_run = current_time

        # CYBER_AI TELEGRAM tier
        if once_mode or (current_time - last_cyber_ai_telegram_run) >= tier_intervals["CYBER_AI_TELEGRAM"]:
            fetch_and_queue_cyber_ai_telegram()
            last_cyber_ai_telegram_run = current_time

        # NEWS_RSS tier — all RSS sources (GEOPOLITICS, MILITARY, CYBER_AI RSS, ECONOMY, HEALTH)
        if once_mode or (current_time - last_news_rss_run) >= tier_intervals["NEWS_RSS"]:
            print("🔄 [INGEST] Fetching NEWS RSS feeds...")
            geo_feeds      = fetch_rss_sources(GEOPOLITICS_SOURCES)
            mil_feeds      = fetch_rss_sources(MILITARY_SOURCES)
            health_feeds   = fetch_rss_sources(HEALTH_SOURCES)
            eco_feeds      = fetch_rss_sources(ECONOMY_SOURCES)
            cyber_ai_feeds = fetch_rss_sources(CYBER_AI_RSS_SOURCES)

            all_rss_channel_feeds = [
                ("GEOPOLITICS", geo_feeds,      TACTICAL_KEYWORDS,  FILTER_THRESHOLD),
                ("GEOPOLITICS", mil_feeds,      MILITARY_KEYWORDS,  FILTER_THRESHOLD),
                ("GEOPOLITICS", health_feeds,   HEALTH_KEYWORDS,    4),
                ("ECONOMY",     eco_feeds,      ECONOMY_KEYWORDS,   3),
                ("CYBER_AI",    cyber_ai_feeds, CYBER_AI_KEYWORDS,  4),
            ]

            inserted = 0
            with get_db_connection() as conn:
                cursor = conn.cursor()
                for channel, feeds, keywords, threshold in all_rss_channel_feeds:
                    # 리프레시(--once): 각 소스를 최신순으로, 최근 5시간 항목만 강제 수집
                    if once_mode:
                        feeds = [f for f in feeds if within_lookback_hours(f.get("pub_date"), REFRESH_LOOKBACK_HOURS)]
                        feeds = sorted(feeds, key=lambda f: f.get("pub_date") or "", reverse=True)
                    for feed in feeds:
                        # 1. Keyword priority filter
                        if evaluate_tactical_priority(feed, keywords) < threshold:
                            continue
                        # 2. Politics filter
                        content_lower = (feed.get("title", "") + " " + feed.get("summary", "")).lower()
                        if any(kw in content_lower for kw in POLITICS_KEYWORDS):
                            print(f"🚫 [POLITICS FILTER] {channel} 정치 기사 제외: [{feed.get('source')}] {feed.get('title')[:60]}")
                            continue
                        article_hash = hashlib.md5(feed["link"].encode()).hexdigest()
                        # 3. Dedup check (incidents + raw_feeds)
                        if (
                            cursor.execute("SELECT id FROM incidents WHERE id=?", (article_hash,)).fetchone() or
                            cursor.execute("SELECT id FROM raw_feeds WHERE id=?", (article_hash,)).fetchone()
                        ):
                            continue
                        cursor.execute("""
                            INSERT INTO raw_feeds (id, channel, title, link, summary, source, pub_date, created_at, media_url, media_type)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            article_hash, channel,
                            feed["title"], feed["link"], feed["summary"],
                            feed["source"], feed["pub_date"],
                            datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                            feed.get("media_url"), feed.get("media_type")
                        ))
                        inserted += 1
                conn.commit()
            print(f"📥 [NEWS RSS] {inserted} new articles queued")
            last_news_rss_run = current_time

        elapsed_fetch = time.time() - cycle_start
        print(f"📊 [INGEST CYCLE] Elapsed: {elapsed_fetch:.1f}s | "
              f"Stage: {stage} | Tier intervals: PUBLIC_API={tier_intervals['PUBLIC_API']}s "
              f"TELEGRAM={tier_intervals['TELEGRAM']}s NEWS_RSS={tier_intervals['NEWS_RSS']}s")

        if once_mode:
            print("🚀 [INGEST WORKER] Single-pass completed. Exiting.")
            break

        print(f"⏳ Sleeping for {scan_interval}s")

        # ── Interruptible sleep ───────────────────────────────────────────────
        elapsed = 0
        while elapsed < scan_interval:
            time.sleep(1)
            elapsed += 1

            current_time = time.time()
            tier_intervals = WATCHCON_TIER_OVERRIDES.get(stage, WATCHCON_TIER_OVERRIDES[4])

            # Check Telegram polling during sleep
            if (current_time - last_telegram_run) >= tier_intervals["TELEGRAM"]:
                fetch_and_queue_telegram_feeds()
                last_telegram_run = current_time

            # Check CYBER_AI Telegram polling during sleep
            if (current_time - last_cyber_ai_telegram_run) >= tier_intervals["CYBER_AI_TELEGRAM"]:
                fetch_and_queue_cyber_ai_telegram()
                last_cyber_ai_telegram_run = current_time

            # Check PUBLIC_API polling during sleep
            if (current_time - last_public_api_run) >= tier_intervals["PUBLIC_API"]:
                usgs_alerts = fetch_usgs_earthquakes()
                noaa_alerts = fetch_noaa_alerts()
                sync_natural_alerts(usgs_alerts + noaa_alerts)
                poll_weather_sources(force=False)
                last_public_api_run = current_time

            try:
                mtime = os.stat(WATCHCON_PATH).st_mtime
                if mtime != last_watchcon_mtime:
                    print("⚡ [INTERRUPT] Watchcon config changed during sleep. Breaking out.")
                    break
            except Exception:
                pass

if __name__ == "__main__":
    run_ingestor()
