export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

// 🍕 Pentagon Pizza Index Proxy API
// pizzint.watch는 Next.js SSR 기반 — 서버에서 HTML 긁어 파싱
// 의도적으로 우리 WATCHCON과 독립된 OSINT 교차참조 지표 (블렌딩 안 함)

let cachedData: ReturnType<typeof parsePizzaHtml> | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 30 * 1000; // 30초 — 외부 pizzint 갱신을 빠르게 반영

const LEVEL_COLOR: Record<number, string> = {
  1: "#ff0055", 2: "#ff6600", 3: "#ffdd00", 4: "#00d2ff", 5: "#00ff88",
}
const LEVEL_DESC: Record<number, string> = {
  1: "MAXIMUM ALERT — CRISIS IMMINENT",
  2: "ELEVATED — SIGNIFICANT ACTIVITY",
  3: "HEIGHTENED — UNUSUAL PATTERNS",
  4: "DOUBLE TAKE · INTELLIGENCE WATCH",
  5: "NORMAL — ROUTINE ACTIVITY",
}

async function fetchPizzaIndex() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch("https://www.pizzint.watch/", {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    return html
  } finally {
    clearTimeout(timeout)
  }
}

function parsePizzaHtml(html: string) {
  // DOUGHCON 레벨 파싱 (예: "DOUGHCON 4", "DOUGHCON 3" ...)
  const doughconMatch = html.match(/DOUGHCON\s+(\d+)/i)
  const doughconLevel = doughconMatch ? parseInt(doughconMatch[1]) : null

  // DOUGHCON 설명 — 실제 HTML에서 "DOUBLE TAKE", "INCREASED INTELLIGENCE WATCH" 등 바로 나타남
  const descCandidates = html.match(/DOUBLE TAKE|INCREASED INTELLIGENCE WATCH|MAXIMUM ALERT — CRISIS IMMINENT|ELEVATED — SIGNIFICANT|HEIGHTENED — UNUSUAL|NORMAL PIZZA FLOW/ig)
  const doughconDesc = descCandidates?.[0]?.trim() ?? null

  // 두 번째 설명 줄
  const alertTextMatch = html.match(/INCREASED INTELLIGENCE WATCH|MAXIMUM ALERT|ELEVATED ALERT/i)
  const alertText = alertTextMatch ? alertTextMatch[0].trim() : null

  // 모니터링 위치 수 — "8 LOC" or "8 LOCATIONS MONITORED"
  const locationsMatch = html.match(/(\d+)\s+LOC(?:ATIONS MONITORED)?/i)
  const locationsMonitored = locationsMatch ? parseInt(locationsMatch[1]) : 8

  // REPORTS & ALERTS 수 — SSR HTML에 존재하는 경우만
  const reportsMatch = html.match(/(\d+)\s*(?:<!--[^>]*-->)*\s*REPORTS?/i)
  const alertsMatch = html.match(/(\d+)\s*(?:<!--[^>]*-->)*\s*ALERTS?/i)
  const reportsCount = reportsMatch ? parseInt(reportsMatch[1]) : null
  const alertsCount = alertsMatch ? parseInt(alertsMatch[1]) : null

  // 모니터링 계정 수 — HTML 주석 포함 패턴: "MONITORING <!-- -->7<!-- --> ACCOUNTS"
  const accountsMatch = html.match(/MONITORING\s*(?:<!--[^>]*-->)*\s*(\d+)\s*(?:<!--[^>]*-->)*\s*ACCOUNT/i)
  const accountsMonitored = accountsMatch ? parseInt(accountsMatch[1]) : null

  // STATUS 상태
  const statusMatch = html.match(/\bOPERATIONAL\b|\bDEGRADED\b|\bOFFLINE\b/i)
  const status = statusMatch ? statusMatch[0].toUpperCase() : "OPERATIONAL"

  return {
    doughconLevel,
    doughconDesc: doughconDesc || (doughconLevel ? LEVEL_DESC[doughconLevel] : "MONITORING"),
    alertText,
    locationsMonitored,
    reportsCount,
    alertsCount,
    accountsMonitored,
    status,
    color: doughconLevel ? (LEVEL_COLOR[doughconLevel] ?? "#00d2ff") : "#00d2ff",
    lastUpdated: new Date().toISOString(),
  }
}

export async function GET() {
  const now = Date.now();
  const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

  // 1. Serve fresh-enough cache (30s TTL)
  if (cachedData && now - cacheTime < CACHE_TTL) {
    return NextResponse.json({ ...cachedData, cached: true }, { headers: NO_STORE });
  }

  // 2. Re-scrape pizzint (independent OSINT indicator — no WATCHCON blending)
  try {
    const parsed = parsePizzaHtml(await fetchPizzaIndex());
    cachedData = parsed;
    cacheTime = now;
    return NextResponse.json({ ...parsed, cached: false }, { headers: NO_STORE });
  } catch (err) {
    console.error("Pizza fetch failed, checking fallback cache:", err);

    // 3. Stale cache fallback
    if (cachedData) {
      return NextResponse.json({ ...cachedData, cached: true }, { headers: NO_STORE });
    }

    // 4. Hard fallback
    return NextResponse.json({
      doughconLevel: null,
      doughconDesc: "SIGNAL LOST",
      alertText: null,
      locationsMonitored: 8,
      reportsCount: null,
      alertsCount: null,
      accountsMonitored: null,
      status: "OFFLINE",
      color: "#666666",
      lastUpdated: new Date().toISOString(),
      error: (err instanceof Error ? err.message : null) || "FETCH_FAILED",
      cached: false,
    }, { status: 200, headers: NO_STORE });
  }
}
