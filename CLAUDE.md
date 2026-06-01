# Tactical Globe — Claude Code Context

## Project
Real-time global crisis intelligence dashboard + overseas Korean evacuation platform.
Path: C:\Users\dbdnj\Desktop\tactical-globe

## Stack
- Frontend: Next.js 16 App Router, React, Tailwind CSS, MapLibre GL JS
- Backend: Next.js API Routes (force-dynamic), better-sqlite3
- Database: SQLite (WAL mode, busy_timeout=15000)
- Workers: worker_ingest.py, worker_analyzer.py (Ollama exaone3.5)
- Hardware: RTX 5070 8GB, Core Ultra 9 285HX

## Run Commands
- Next.js: npx next dev -H 0.0.0.0 --webpack
- Ingest: python worker_ingest.py
- Analyzer: python worker_analyzer.py

## Critical Rules — NEVER VIOLATE
1. NEVER rewrite entire files. Surgical patches only.
2. NEVER touch next.config.ts watchOptions
3. NEVER put db.close() inside SSE handlers
4. NEVER expose TELEGRAM_BOT_TOKEN in any output
5. NEVER change layout structure when fixing logic bugs
6. worker_analyzer.py max_workers=1 — do not increase

## Architecture
Sources → worker_ingest.py → raw_feeds(PENDING)
→ worker_analyzer.py(LLM) → incidents + watchcon.json
→ Next.js API Routes → Frontend

## Component Structure
app/page.tsx (~800 lines) — main orchestrator
components/ui/GlobeMap.tsx — MapLibre 3D globe
components/ui/WatchconPanel.tsx — WATCHCON controls
components/ui/NewsFeed.tsx — incident feed list
components/ui/WeatherPanel.tsx — weather section
components/ui/PizzaIndex.tsx — Pentagon Pizza Index
components/ui/RoomPanel.tsx — community chat

## Database Tables
incidents: id, title, region, country, lat, lng, severity,
  category, channel, pinned, watchcon_trigger, created_at
rooms: id, incident_id, title, region, lat, lng, status,
  radius_km, channel, created_by, created_at
posts: id, room_id, user_id, content, lat, lng, created_at
users: id, username, trust_level, created_at
watchcon_log: id, timestamp, previous_stage, new_stage,
  trigger_type, incident_title, incident_severity

## WATCHCON Colors
1→#ff0000, 2→#ff4400, 3→#ffaa00, 4→#4488ff, 5→#00ff88
CSS vars: --theme-color, --theme-rgb

## Channel Colors
GEOPOLITICS → #00ff88
ECONOMY → #ffdd00
WEATHER → #00ccff

## Known Issues
### PRIORITY 1: UI Layout broken in app/page.tsx
Left panel should have (top→bottom):
  INTELLIGENCE INTERCEPTS → MATRIX GEOLOCATION → PIZZA INDEX
Right panel should have (top→bottom):
  WATCHCON → SECURE CHANNELS → LIVE BRIEFING → TELEMETRY → STREAM LOG

## env.local Keys Required
ADMIN_PASSWORD, TELEGRAM_BOT_TOKEN, OPENWEATHER_API_KEY
