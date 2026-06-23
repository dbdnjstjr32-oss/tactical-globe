# tactical-globe

A **real-time global crisis-intelligence dashboard**. Open-source intelligence (OSINT) from news, aircraft, satellites, and ships is ingested, analyzed, and fused, then rendered live on an interactive 3D globe — with a WATCHCON-style threat level that escalates automatically as independent sources corroborate one another.

## What it does

- Aggregates live OSINT feeds (news/RSS, ADS-B aircraft, satellite TLEs, vessels, weather, seismic) into a single situational picture
- Cross-validates **sensor data against text reports** — e.g. an ADS-B kinematic anomaly (sharp turn / rapid descent) fused with a corroborating news incident raises confidence
- Auto-escalates a **WATCHCON** alert level using a time-decayed fusion score
- Renders everything on a **MapLibre GL 3D globe** with threat points, heat, and verified-incident glow

## Frontend highlights

- **Next.js 16 (App Router) + React 19 + TypeScript**
- **MapLibre GL** interactive 3D globe (`GlobeMap`) with custom threat / heat layers
- **Live updates** over Server-Sent Events (~1s) with a polling fallback (~5s)
- Component-driven UI — `WatchconPanel`, `NewsFeed`, `WeatherPanel`, `PizzaIndex`, `RoomPanel` — built with **Tailwind CSS v4 + shadcn/ui (Radix)**
- **satellite.js** SGP4 orbit propagation and **three.js** for 3D
- Local persistence with **better-sqlite3** (WAL mode)

## Architecture

```
sources → ingest → raw feeds → LLM analyzer (geocode · dedup · classify)
                                      │
        ADS-B kinematics ───────────►│ sensor × text fusion ─► WATCHCON escalation
                                      │
                         Next.js API routes ─► frontend (SSE / polling)
```

Background **Python workers** handle ingestion, LLM analysis (local Ollama), ADS-B anomaly scoring, and time-decayed fusion; the Next.js API layer serves the analyzed state to the client. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full design.

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · MapLibre GL · three.js · satellite.js · better-sqlite3 · Python workers · Ollama (local LLM)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Live data layers need their own API keys / tokens (map tiles, weather, etc.). Place them in `.env.local`, which is gitignored and never committed.

---

> Secrets, browser profiles, and large local artifacts are intentionally excluded from this repository.
