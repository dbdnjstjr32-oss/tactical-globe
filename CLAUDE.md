# Tactical Globe — Claude Code Context

> 전체 아키텍처·알고리즘 상세는 **ARCHITECTURE.md** 참조. 이 문서는 작업 규칙 + 빠른 인덱스.

## Project
Real-time global crisis intelligence dashboard + overseas Korean evacuation platform.
Path: C:\Users\dbdnj\Desktop\tactical-globe

## Stack
- Frontend: Next.js 16 App Router, React, Tailwind CSS, MapLibre GL JS
- Backend: Next.js API Routes (force-dynamic), better-sqlite3
- Database: SQLite (WAL mode, busy_timeout=15000) — shared via db_utils.get_db_connection()
- Workers: worker_ingest.py, worker_analyzer.py (Ollama exaone3.5), worker_adsb.py, worker_fusion.py
- Hardware: RTX 5070 8GB, Core Ultra 9 285HX

## Run Commands
- Next.js dev: npx next dev -H 0.0.0.0 --webpack
- Next.js prod: npx next build --webpack && npx next start -H 0.0.0.0
- Workers (all): .\run_workers.ps1 -Migrate   /  stop: .\stop_workers.ps1
- Individual: python -u worker_ingest.py | worker_analyzer.py | worker_adsb.py | worker_fusion.py

## Critical Rules — NEVER VIOLATE
1. NEVER rewrite entire files. Surgical patches only.
2. NEVER touch next.config.ts watchOptions
3. NEVER put db.close() inside SSE handlers
4. NEVER expose TELEGRAM_BOT_TOKEN in any output
5. NEVER change layout structure when fixing logic bugs
6. worker_analyzer.py max_workers=1 — do not increase
7. NEVER change DB schema without an idempotent migration script
8. New workers must import db_utils.get_db_connection() (no duplicate conn logic)

## Architecture (요약 — 상세는 ARCHITECTURE.md)
Sources → worker_ingest → raw_feeds(PENDING)
→ worker_analyzer(LLM) → incidents(PROCESSED) + watchcon.json
worker_adsb → incidents(channel=ADSB, kinematic_score)
→ worker_fusion(센서×텍스트 융합, 시간감쇠) → status 승격 + WATCHCON 격상
→ Next.js API Routes → Frontend (SSE 1s / 폴링 5s)

## Workers
- worker_ingest.py — RSS/텔레그램/CYBER_AI/USGS/NOAA/기상 수집, WATCHCON 티어별 주기, 미디어 추출
- worker_analyzer.py — Ollama 분석, 지오코딩, Jaccard 병합, 천재지변→WEATHER 재분류, VRAM idle 언로드(300s)
- worker_adsb.py — OpenSky 운동학 이상탐지(선회/강하), 지오존 보정(SAFE×0.4/CONFLICT×1.5)
- worker_fusion.py — W=α·s+β·t·e^(−λΔt) (0.6/0.4/0.02), W≥0.85 CONFIRMED 격상 / PRE-ALERT

## Component Structure
app/page.tsx — main orchestrator (채널탭, 지역3×2, 포커스모드 브리핑 팝업)
components/ui/GlobeMap.tsx — MapLibre 3D globe, threat-points/heat/verified-glow
components/ui/WatchconPanel.tsx — WATCHCON (readOnly prop; 유저 표시전용, 수동제어는 admin만)
components/ui/NewsFeed.tsx — incident feed
components/ui/WeatherPanel.tsx — weather section
components/ui/PizzaIndex.tsx — Pentagon Pizza Index (독립 OSINT, 5s 폴링)
components/ui/RoomPanel.tsx — community chat
db_utils.py — 공유 SQLite 커넥션

## Database Tables (마이그레이션 컬럼 포함)
incidents: + kinematic_score, sensor_raw_vector (migration_kinematic)
raw_feeds: + media_url, media_type (migration_media)
posts: + spatial_distance_km, is_verified (migration_trust)
users: + trust_score, successful_verifications (migration_trust)
migrations: migration_kinematic / migration_trust / migration_media / migrate_cyber_channel
(전체 스키마는 ARCHITECTURE.md §6)

## WATCHCON Colors (현행)
1→#ef4444, 2→#f97316, 3→#f59e0b, 4→#3b82f6, 5→#22c55e
CSS vars: --theme-color, --theme-rgb / 수동 제어는 /admin 전용

## Channel Colors (현행)
GEOPOLITICS → #22c55e | ECONOMY → #3b82f6 | WEATHER → #0ea5e9 | CYBER_AI → #a855f7
- 사이버 기사는 CYBER_AI 채널 (GEOPOLITICS 아님)
- 천재지변(자연재해)은 WEATHER 채널로 자동 재분류

## Key Constants
fusion α/β/λ=0.6/0.4/0.02, W_crit=0.85, match 50km
adsb turn>3°/s, descent<-3000ft/min, SAFE×0.4 / CONFLICT×1.5
verify gate ≤10km & trust>0.7, trust reward +0.05
VRAM idle 300s, busy_timeout 15000

## env.local Keys
ADMIN_PASSWORD, TELEGRAM_BOT_TOKEN, OPENWEATHER_API_KEY, X_BEARER_TOKEN(optional), GODMODE_SECRET(optional)
