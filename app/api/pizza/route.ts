import { NextResponse } from "next/server"

// 🍕 Pentagon Pizza Index Proxy API
// pizzint.watch는 Next.js SSR 기반 — 서버에서 HTML 긁어 파싱

let cachedData: any = null;
let cacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분

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

  // DOUGHCON 색상 매핑 (pizzint 원본 사이트 색상 참조)
  const levelColorMap: Record<number, string> = {
    1: "#ff0055",  // RED ALERT
    2: "#ff6600",  // ORANGE
    3: "#ffdd00",  // YELLOW
    4: "#00d2ff",  // BLUE (현재)
    5: "#00ff88",  // GREEN
  }

  // DOUGHCON 레벨별 설명 폴백
  const levelDescMap: Record<number, string> = {
    1: "MAXIMUM ALERT — CRISIS IMMINENT",
    2: "ELEVATED — SIGNIFICANT ACTIVITY",
    3: "HEIGHTENED — UNUSUAL PATTERNS",
    4: "DOUBLE TAKE · INTELLIGENCE WATCH",
    5: "NORMAL — ROUTINE ACTIVITY",
  }

  return {
    doughconLevel,
    doughconDesc: doughconDesc || (doughconLevel ? levelDescMap[doughconLevel] : "MONITORING"),
    alertText,
    locationsMonitored,
    reportsCount,
    alertsCount,
    accountsMonitored,
    status,
    color: doughconLevel ? (levelColorMap[doughconLevel] ?? "#00d2ff") : "#00d2ff",
    lastUpdated: new Date().toISOString(),
  }
}

export async function GET() {
  const now = Date.now();

  // 1. Check if cache is still valid
  if (cachedData && now - cacheTime < CACHE_TTL) {
    return NextResponse.json({ ...cachedData, cached: true }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      }
    });
  }

  try {
    const html = await fetchPizzaIndex();
    const parsed = parsePizzaHtml(html);
    
    // Update cache
    cachedData = parsed;
    cacheTime = now;
    
    return NextResponse.json({ ...parsed, cached: false }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      }
    });
  } catch (err: any) {
    console.error("Pizza fetch failed, checking fallback cache:", err);
    
    // 2. Stale cache fallback if fetch fails
    if (cachedData) {
      return NextResponse.json({ ...cachedData, cached: true }, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        }
      });
    }
    
    // 3. Complete fallback if no cache exists
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
      error: err?.message || "FETCH_FAILED",
      cached: false,
    }, { status: 200 }); // Keep 200 so front-end does not crash
  }
}
