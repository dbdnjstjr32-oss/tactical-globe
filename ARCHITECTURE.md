# Tactical Globe — Architecture & Algorithms

> 전 지구 위기 인텔리전스 대시보드 + 재외국민 대피 지원 플랫폼.
> 이 문서는 현재 구현된 전체 아키텍처와 핵심 알고리즘을 한곳에 정리한다.

---

## 1. 시스템 개요

```
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  수집(SENSE) │ → │  분석(ANALYZE) │ → │  융합(FUSE)   │ → │ 시각화(RENDER)│
│ worker_ingest│   │worker_analyzer│   │ worker_fusion │   │   Next.js    │
│ worker_adsb  │   │ (Ollama LLM)  │   │ (수학 융합)    │   │  + MapLibre  │
└─────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
        │                  │                  │                   │
        └──────────────────┴──────── SQLite (WAL) ────────────────┘
                          data/osint_matrix.db
```

- **언어/런타임**: Python 워커 4개 + Next.js 16(App Router, force-dynamic) + SQLite(better-sqlite3 / python sqlite3)
- **LLM**: 로컬 Ollama `exaone3.5` (RTX 5070, max_workers=1)
- **공유 DB 접속**: 모든 워커가 `db_utils.get_db_connection()` 사용 — WAL + busy_timeout=15000 + synchronous=NORMAL

---

## 2. 데이터 파이프라인

```
외부 소스 ──▶ worker_ingest ──▶ raw_feeds(PENDING)
                                      │
                              worker_analyzer (LLM)
                                      │  → incidents(PROCESSED) + watchcon.json
                                      ▼
   worker_adsb ──▶ incidents(channel=ADSB, kinematic_score)
                                      │
                              worker_fusion (센서×텍스트 교차검증)
                                      │  → status 승격 + WATCHCON 격상
                                      ▼
              Next.js API Routes ──▶ Frontend (SSE 1s / 폴링 5s)
```

---

## 3. 워커별 역할 & 알고리즘

### 3.1 `worker_ingest.py` — 수집
- **소스**: RSS(BBC/AP/Reuters/NYT 등), 군사/경제/건강 RSS, 텔레그램(rsshub), CYBER_AI(보안+AI RSS + t.me/s/ 스크랩), USGS 지진, NOAA, GDACS, JMA, ReliefWeb, OpenWeatherMap
- **티어별 수집 주기** (`WATCHCON_TIER_OVERRIDES`) — WATCHCON 단계가 높을수록 자주, 뉴스 RSS는 IP 차단 방지 위해 보수적:
  | tier | WC1 | WC4 | WC5 |
  |------|-----|-----|-----|
  | PUBLIC_API | 60s | 300s | 600s |
  | TELEGRAM | 60s | 180s | 300s |
  | CYBER_AI_TELEGRAM | 60s | 900s | 900s |
  | NEWS_RSS | 600s | 1800s | 3600s |
- **안전장치**: User-Agent 로테이션, 요청 간 1.5~4.0s 랜덤 슬립, 텔레그램 폴백 도메인, bleepingcomputer 전용 헤더, openai SSL 우회
- **미디어 추출**: `<media:content>`/`<media:thumbnail>`/`<enclosure>` → https + jpg/png/webp/gif만 허용(svg/http 거부)
- **키워드 필터**: 채널별 가중 사전(TACTICAL/MILITARY/CYBER_AI/ECONOMY 등) 점수 ≥ 임계값만 큐 삽입 + 정치 기사 제외 필터

### 3.2 `worker_analyzer.py` — LLM 분석
- `raw_feeds(PENDING)` → Ollama `exaone3.5`로 구조화 추출: region, country, category, severity(0~1), 한국어 요약, (텔레그램/사이버는) pin_worthy·watchcon_trigger
- **채널별 카테고리 체계**: GEOPOLITICS/TELEGRAM, ECONOMY, WEATHER, CYBER_AI 각각 valid set + 폴백 치환
- **천재지변 재분류**: GEOPOLITICS/TELEGRAM의 `DISASTER` 중 자연재해 키워드(지진/태풍/홍수/화산/산불/해일/가뭄 등) 매칭 시 → `WEATHER` 채널로 이동
- **지오코딩**: Nominatim + `geo_cache.json` (스레드 안전 락), 알려진 지점 테이블 폴백
- **중복 병합**: 동일 region/country/channel, 2시간 이내, Jaccard 유사도 ≥ 0.6 → 머지(update_count↑), `ARCHIVE_MERGE_THRESHOLD=3` 이상이면 archived_news로 보관
- **미디어**: X(트위터) API 우선, 없으면 RSS 기사 이미지 폴백
- **WATCHCON/PIN**: severity≥0.85 & watchcon_trigger → 단계 격상 + 로그, severity≥0.75 or pin_worthy → pinned
- **VRAM 관리** (Phase 4.2): 추론 5분(`VRAM_IDLE_TIMEOUT=300`) 무활동 시 Ollama `keep_alive=0` 1회 전송 → GPU 언로드. 추론 성공 시 타이머 리셋. `max_workers=1` 고정

### 3.3 `worker_adsb.py` — 운동학 벡터 엔진 (Phase 1)
- **소스**: OpenSky Network `/states/all` (중동 bbox: lamin24 lomin34 lamax40 lomax60), 10s 폴링, 429/timeout 지수 백오프
- **상태 메모리**: `active_tracks[icao24]` = 직전 상태 벡터 (lat/lng/alt_ft/velocity_kts/heading/timestamp)
- **운동학 미분**:
  - 선회율 `turn_rate = |Δheading 정규화(-180~180)| / Δt` (deg/sec)
  - 강하율 `descent_rate = Δalt / (Δt/60)` (ft/min, None 안전)
- **이상 임계값**: 선회율 > 3°/s **OR** 강하율 < -3000 ft/min
- **정규화 점수**: 임계 초과분을 ceiling(선회 12°/s, 강하 -15000ft/min)까지 0~1 정규화 후 `max(turn, descent)`
- **지리 맥락 보정** (`GEO_CONTEXT_ZONES`): SAFE(공항 TLV/DXB, 30km) → ×0.4 (오탐 억제), CONFLICT(호르무즈/레바논, 100km) → ×1.5(1.0 cap, 증폭)
- 보정 후 score ≥ 0.5 → `incidents(channel=ADSB, kinematic_score, sensor_raw_vector)` 직접 삽입

### 3.4 `worker_fusion.py` — 융합 & 시간감쇠 엔진 (Phase 2)
- **수식**:
  ```
  W_alert = α·s_sensor + β·t_osint·e^(−λ·Δt_min)
  α=0.6, β=0.4, λ=0.02(분), W_critical=0.85
  ```
- **공간·시간 교차검증**: ADSB 이상(`kinematic_score`)을 앵커로, 반경 50km(Haversine) 내 OSINT 인시던트 중 W_alert 최대값 매칭. Δt = 두 사건 created_at 시간차(분) → 가까울수록 감쇠 적음
- **t_osint**: `incidents.severity`(이미 0~1 float) 직접 사용, 비숫자면 status 텍스트 매핑 폴백
- **분기**:
  - W≥0.85 **&** t_osint>0 → **CONFIRMED**: WATCHCON −1 격상 + 매칭 인시던트 `status=CRITICAL`
  - W≥0.85 **&** t_osint=0 (강한 센서 단독) → **SIGINT PRE-ALERT**: `s_sensor` 그대로 W로 사용(0.6 가중 우회), WATCHCON 격상 안 함, `status=HIGH`
- **독립성**: worker_analyzer import 안 함(순환참조 0) — WATCHCON 파일/로그 로직 인라인 재구현, 수동 override 시 자동 격상 스킵
- 5s 폴링, 2시간 윈도우, 발화 시 `⏱ Latency from creation` 로깅

---

## 4. Bayesian 공간-신뢰 모델 (Phase 3, 크라우드 검증)

```
입장 인증(GPS 현장 증명 성공)
  → users.trust_score += 0.05 (MIN 1.0), successful_verifications += 1
제보 작성 시
  → spatial_distance_km = Haversine(제보좌표, 룸 epicenter)
  → is_verified = (distance ≤ 10km AND trust_score > 0.7) ? 1 : 0
지도 표시
  → 검증된 post 있는 incident = Solid Red 핀 + 정적 글로우(threat-verified-glow)
  → 미검증 = Translucent Gray
```
- API: `POST /api/rooms/[id]/verify` (현장 증명 보상), `POST /api/rooms/[id]/posts` (거리·신뢰 게이트), `GET /api/incidents/verified` (검증 incident id 조인 쿼리)
- 프론트 GlobeMap이 5s 폴링으로 verified id Set 갱신 → MapLibre circle 레이어 `case` expression으로 색/투명도 분기

---

## 5. WATCHCON (위협 컨디션 레벨)

| 단계 | 색 | 의미 | 자동 격상 트리거 |
|------|-----|------|------------------|
| 1 | #ef4444 | CRITICAL | 융합 W≥0.85, 위협 카운트 누적, 텔레그램/사이버 watchcon_trigger |
| 2 | #f97316 | HIGH | 〃 |
| 3 | #f59e0b | ELEVATED | 〃 |
| 4 | #3b82f6 | WATCH | 기본 |
| 5 | #22c55e | NORMAL | — |
- 상태 파일 `data/watchcon.json` (stage, override, triggered_by, timestamp)
- **수동 제어는 관리자 페이지 전용** (`/admin`). 유저 페이지 WatchconPanel은 `readOnly` (표시만)
- `adjust_watchcon()`(analyzer): 최근 15분 위협 카운트로 자동 단계 산정 (WAR/explosion/missile/ransomware/critical infrastructure/CYBERATTACK/ZERO_DAY 등 포함)

---

## 6. 데이터베이스 스키마

`data/osint_matrix.db` (WAL). 마이그레이션은 idempotent (`try/except OperationalError`).

| 테이블 | 핵심 컬럼 |
|--------|----------|
| **incidents** | id, country, region, lng, lat, severity, category, title, source, created_at, summary, status, update_count, channel, pinned, watchcon_trigger, verified_sources, child_feeds, media_url/type, sns_source, **kinematic_score, sensor_raw_vector**(migration_kinematic) |
| **raw_feeds** | id, channel, title, link, summary, source, pub_date, status, created_at, region_code, disaster_category, **media_url, media_type**(migration_media) |
| **archived_news** | incidents 머지 백업 |
| **natural_alerts** | USGS/NOAA 지진·기상 경보 |
| **rooms** | id, incident_id, title, region, lat, lng, status, radius_km, channel, created_by, created_at |
| **posts** | id, room_id, user_id, content, media_url, lat, lng, trust_score, created_at, **spatial_distance_km, is_verified**(migration_trust) |
| **users** | id, username, trust_level, created_at, **trust_score, successful_verifications**(migration_trust) |
| **watchcon_log** | id, timestamp, previous_stage, new_stage, trigger_type, triggered_by_incident_id, ... |

**마이그레이션 스크립트**: `migration_kinematic.py`, `migration_trust.py`, `migration_media.py`, `migrate_cyber_channel.py`(GEOPOLITICS→CYBER_AI 1회 이관)

---

## 7. 채널 라우팅 규칙

| 채널 | 색 | 소스 |
|------|-----|------|
| GEOPOLITICS | #22c55e | 세계뉴스 + 군사 + 건강 (man-made disaster 포함) |
| ECONOMY | #3b82f6 | 경제 RSS |
| WEATHER | #0ea5e9 | 기상·자연재해(천재지변 재분류 포함), USGS/NOAA/GDACS/JMA |
| CYBER_AI | #a855f7 | 사이버보안 + AI RSS + 텔레그램, ADS-B 이상도 여기 인접 |

---

## 8. API 라우트

| 라우트 | 역할 |
|--------|------|
| `GET /api/news/stream` | 채널별 인시던트 SSE (1s) |
| `GET /api/incidents` | 인시던트 목록 |
| `GET /api/incidents/verified` | 검증 post 보유 incident id (posts→rooms→incidents 조인) |
| `GET/POST /api/watchcon/toggle` | WATCHCON 조회/수동 설정 |
| `GET /api/telemetry` | 시스템 텔레메트리 |
| `GET /api/pizza` | Pentagon Pizza Index (독립 OSINT 지표, 30s 캐시) |
| `GET /api/media-proxy?url=` | SSRF 차단 이미지 프록시 (https/이미지only/사설IP차단/redirect차단/10MB cap) |
| `/api/rooms`, `/api/rooms/[id]`, `/posts`, `/stream`, `/verify` | 커뮤니티 룸 |
| `/api/admin/*` | 관리자 (auth, rooms, watchcon-log) |

---

## 9. 프론트엔드 구조

- `app/page.tsx` — 메인 오케스트레이터 (채널 탭, 지역 필터 3×2, 좌/우 패널, **포커스 모드**: 패널 슬라이드 아웃 + 중앙 브리핑 팝업 with flip 트랜지션)
- `components/ui/GlobeMap.tsx` — MapLibre 3D 글로브, 위성 타일(ArcGIS), threat-points/heat/verified-glow 레이어, 마커 팝업(미디어 프록시)
- `WatchconPanel`(readOnly 지원), `NewsFeed`, `WeatherPanel`, `RoomPanel`, `PizzaIndex`(5s 폴링)
- 디자인: "OPSEC DARK" — 심해 네이비 배경, 글래스모피즘 패널, WATCHCON 테마 컬러, beacon 애니메이션

---

## 10. 핵심 상수 요약

| 상수 | 값 | 위치 |
|------|-----|------|
| 융합 가중치 α/β/λ | 0.6 / 0.4 / 0.02 | worker_fusion |
| W_critical | 0.85 | worker_fusion |
| 융합 매칭 반경 | 50 km | worker_fusion |
| 선회/강하 임계 | >3°/s, <-3000ft/min | worker_adsb |
| 지오존 보정 | SAFE ×0.4 / CONFLICT ×1.5 | worker_adsb |
| 검증 게이트 | ≤10km & trust>0.7 | posts route |
| trust 보상 | +0.05 (max 1.0) | verify route |
| VRAM idle | 300s | worker_analyzer |
| LLM 동시성 | max_workers=1 | worker_analyzer |
| busy_timeout | 15000ms | db_utils |

---

## 11. 실행

```powershell
# 워커 일괄 기동/재기동 (마이그레이션 포함)
.\run_workers.ps1 -Migrate
.\stop_workers.ps1            # 전부 종료

# Next.js
npx next dev -H 0.0.0.0 --webpack       # 개발(핫리로드)
npx next build --webpack && npx next start -H 0.0.0.0   # 프로덕션(로드 ~2.2s)
```
