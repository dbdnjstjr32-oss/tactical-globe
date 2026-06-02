"use client"

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { TacticalOverlay } from "@/components/ui/tactical-overlay"
import { RoomPanel } from "@/components/ui/RoomPanel"
import PizzaIndex from "@/components/ui/PizzaIndex"
import WatchconPanel, { getWatchconColor, getWatchconRgb, WATCHCON_STAGES } from "@/components/ui/WatchconPanel"
import NewsFeed, { TacticalEvent } from "@/components/ui/NewsFeed"
import WeatherPanel from "@/components/ui/WeatherPanel"
import GlobeMap from "@/components/ui/GlobeMap"

// ── CONSENT ──────────────────────────────────────────────────
const CONSENT_KEY = "tactical_globe_beta_consent_v1"

function ConsentModal({ onAccept }: { onAccept: () => void }) {
  const [checked1, setChecked1] = useState(false)
  const [checked2, setChecked2] = useState(false)

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/97 backdrop-blur-xl p-4">
      <div
        style={{
          maxWidth: "440px",
          width: "100%",
          background: "rgba(0,0,0,0.85)",
          border: "1px solid rgba(var(--theme-rgb, 34,197,94), 0.20)",
          borderRadius: "4px",
          boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 30px rgba(var(--theme-rgb, 34,197,94), 0.06)",
        }}
      >
        {/* Top accent */}
        <div style={{ height: "2px", background: "linear-gradient(90deg, transparent, #22c55e, transparent)", opacity: 0.8 }} />

        <div style={{ padding: "24px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid rgba(180,210,240,0.07)" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e", animation: "beacon 2.4s ease-out infinite", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.20em", color: "#4d7898", marginBottom: "2px", fontFamily: "monospace" }}>AUTHORIZATION PROTOCOL</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#d4e2f0", letterSpacing: "0.08em", fontFamily: "monospace" }}>TACTICAL GLOBE — BETA ACCESS</div>
            </div>
          </div>

          {/* Policy text */}
          <div
            style={{
              background: "rgba(180,210,240,0.02)",
              border: "1px solid rgba(180,210,240,0.06)",
              borderLeft: "2px solid rgba(34,197,94,0.4)",
              padding: "12px 14px",
              marginBottom: "20px",
              fontSize: "10px",
              lineHeight: 1.7,
              color: "rgba(184,207,224,0.60)",
              fontFamily: "monospace",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <p style={{ color: "#b8cfe0", fontWeight: 600, letterSpacing: "0.06em" }}>[ OPERATIONAL POLICY & DISCLAIMER ]</p>
            <p>1. 본 시스템은 오픈 소스 정보를 수집·가공하는 시뮬레이션 환경으로, 실제 작전 판단의 유일한 근거로 사용될 수 없습니다.</p>
            <p>2. 제공 정보의 정확성·실시간성을 보장하지 않으며, 시스템 오류로 인한 결과에 책임을 지지 않습니다.</p>
            <p>3. 위치 정보는 보안 구역(Room) 인증 목적으로만 일시적으로 사용되며 서버에 저장되지 않습니다.</p>
          </div>

          {/* Checkboxes */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
            {[
              { id: "c1", val: checked1, setter: setChecked1, text: "시스템의 실험적 성격과 정보 비보장성에 동의합니다. (필수)" },
              { id: "c2", val: checked2, setter: setChecked2, text: "위치 정보 기반 보안 구역 인증 프로세스 사용에 동의합니다. (필수)" }
            ].map(({ id, val, setter, text }) => (
              <label key={id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={val}
                  onChange={e => setter(e.target.checked)}
                  style={{ marginTop: "2px", accentColor: "#22c55e" }}
                />
                <span style={{ fontSize: "10px", color: val ? "#b8cfe0" : "rgba(184,207,224,0.45)", lineHeight: 1.5, transition: "color 0.15s", fontFamily: "monospace" }}>
                  {text}
                </span>
              </label>
            ))}
          </div>

          {/* CTA */}
          <button
            disabled={!checked1 || !checked2}
            onClick={onAccept}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.22em",
              fontFamily: "monospace",
              cursor: checked1 && checked2 ? "pointer" : "not-allowed",
              border: checked1 && checked2 ? "1px solid rgba(34,197,94,0.6)" : "1px solid rgba(180,210,240,0.08)",
              background: checked1 && checked2 ? "rgba(34,197,94,0.08)" : "transparent",
              color: checked1 && checked2 ? "#22c55e" : "rgba(184,207,224,0.20)",
              boxShadow: checked1 && checked2 ? "0 0 20px rgba(34,197,94,0.15)" : "none",
              transition: "all 0.2s",
            }}
          >
            AUTHORIZE ACCESS
          </button>
        </div>
      </div>
    </div>
  )
}

const FALLBACK_NEWS_FEED: TacticalEvent[] = [
  {
    id: "fb-1", country: "GLOBAL", region: "NETWORK CORE",
    title: "INITIATING GLOBAL SPECTRAL SCAN...",
    summary: "시스템 초기화 및 위성 데이터 수신 대기 중...",
    category: "SYSTEM", severity: 0.1, level: "NOMINAL",
    lat: 37.5665, lng: 126.9780, source: "CORE",
    created_at: new Date().toISOString(), first_seen: new Date().toISOString(),
    update_count: 0, status: "ACTIVE", related_titles: [], related_articles: [],
    media_url: null, media_type: "image", trajectory: "SUSTAINED",
    threat_velocity: 0, region_risk_index: 0, child_feeds: null, verified_sources: null, pinned: 0
  }
]

function formatKstDate(dateInput: any): string {
  if (!dateInput) return "REALTIME"
  try {
    return new Date(dateInput).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    })
  } catch { return "REALTIME" }
}

const REGION_COUNTRY_MAPPING: Record<string, string[]> = {
  ASIA_PACIFIC: ["JAPAN","SOUTH KOREA","KOREA","CHINA","PHILIPPINES","INDONESIA","THAILAND","MALAYSIA","VIETNAM","AUSTRALIA","NEW ZEALAND","일본","한국","중국","필리핀","인도네시아","태국","말레이시아","베트남","호주","뉴질랜드"],
  EUROPE: ["UNITED KINGDOM","UK","GREAT BRITAIN","FRANCE","GERMANY","ITALY","SPAIN","UKRAINE","RUSSIA","영국","프랑스","독일","이탈리아","스페인","우크라이나","러시아"],
  AMERICAS: ["UNITED STATES","USA","CANADA","MEXICO","BRAZIL","COLOMBIA","CHILE","PERU","미국","캐나다","멕시코","브라질","콜롬비아","칠레","페루"],
  AFRICA_MIDEAST: ["EGYPT","KENYA","NIGERIA","SOUTH AFRICA","ISRAEL","TURKEY","SAUDI ARABIA","IRAN","이집트","케냐","나이지리아","남아프리카","남아공","이스라엘","터키","사우디","사우디아라비아","이란"],
  CENTRAL_ASIA: ["INDIA","PAKISTAN","BANGLADESH","AFGHANISTAN","KAZAKHSTAN","인도","파키스탄","방글라데시","아프가니스탄","카자흐스탄"]
}

const REGION_COORDS: Record<string, { center: [number, number]; zoom: number }> = {
  GLOBAL: { center: [0, 20], zoom: 1.5 },
  ASIA_PACIFIC: { center: [120, 25], zoom: 3 },
  EUROPE: { center: [15, 52], zoom: 3 },
  AMERICAS: { center: [-80, 15], zoom: 2.5 },
  AFRICA_MIDEAST: { center: [30, 15], zoom: 2.5 },
  CENTRAL_ASIA: { center: [65, 45], zoom: 3 },
}

type TelemetryData = {
  rss_fetch_latency: number
  duplicate_rate: number
  ai_processing_time: number
  geo_cache_hit_rate: number
  last_updated: string
  status?: string
}

// ── SHARED STYLES ─────────────────────────────────────────────
const PANEL_STYLE: React.CSSProperties = {
  background: "rgba(0, 0, 0, 0.85)",
  border: "1px solid rgba(180,210,240,0.07)",
  backdropFilter: "blur(14px)",
  borderRadius: "4px",
}

const PANEL_HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  borderBottom: "1px solid rgba(180,210,240,0.06)",
  background: "rgba(180,210,240,0.015)",
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "#5a8aab",
  fontFamily: "system-ui, sans-serif",
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return <span style={LABEL_STYLE}>{children}</span>
}

function LiveDot({ color }: { color?: string }) {
  return (
    <div
      style={{
        width: "5px", height: "5px", borderRadius: "50%",
        background: color || "var(--theme-color)",
        animation: "beacon 2.4s ease-out infinite",
        boxShadow: `0 0 4px ${color || "var(--theme-color)"}`,
        flexShrink: 0,
      }}
    />
  )
}

function MetricBar({ label, value, maxValue, unit, themeColor, themeRgb }: {
  label: string; value: number; maxValue: number; unit: string; themeColor: string; themeRgb: string
}) {
  const pct = Math.min((value / maxValue) * 100, 100)
  const dangerColor = pct > 80 ? "#ef4444" : pct > 60 ? "#f97316" : themeColor
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "10px", fontWeight: 600, color: "#5a8aab", letterSpacing: "0.08em", fontFamily: "system-ui, sans-serif" }}>{label}</span>
        <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#b8cfe0", fontWeight: 600 }}>
          {value.toFixed(2)}{unit}
        </span>
      </div>
      <div style={{ width: "100%", height: "2px", background: "rgba(180,210,240,0.06)", position: "relative", overflow: "hidden" }}>
        <div
          style={{
            height: "100%", width: `${pct}%`,
            background: dangerColor,
            transition: "width 0.5s ease, background 0.3s ease",
            boxShadow: pct > 80 ? `0 0 6px ${dangerColor}` : "none",
          }}
        />
      </div>
    </div>
  )
}

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem(CONSENT_KEY)
    setConsentGiven(saved === "true")
  }, [])

  useEffect(() => {
    if (consentGiven === true) localStorage.setItem(CONSENT_KEY, "true")
  }, [consentGiven])

  const mapRef = useRef<any>(null)
  const [isCameraMoving, setIsCameraMoving] = useState(false)
  const [time, setTime] = useState<Date | null>(null)
  const [fps, setFps] = useState(60)
  const [allIncidents, setAllIncidents] = useState<TacticalEvent[]>(FALLBACK_NEWS_FEED)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAutoPilot, setIsAutoPilot] = useState(true)
  const isAutoPilotRef = useRef(isAutoPilot)
  useEffect(() => { isAutoPilotRef.current = isAutoPilot }, [isAutoPilot])
  const [isLoading, setIsLoading] = useState(true)
  const [currentTarget, setCurrentTarget] = useState<TacticalEvent | null>(null)
  const [watchconStage, setWatchconStage] = useState<number>(4)
  const watchconStageRef = useRef<number>(4)
  useEffect(() => { watchconStageRef.current = watchconStage }, [watchconStage])
  const [watchconOverride, setWatchconOverride] = useState<boolean>(false)
  const [activeRoom, setActiveRoom] = useState<{ incidentId: string; incidentTitle: string; region: string } | null>(null)
  const [activeRooms, setActiveRooms] = useState<any[]>([])
  const [authUI, setAuthUI] = useState<{ active: boolean; status: "locating"|"verifying"|"success"|"denied"|"error"; logs: string[] }>({ active: false, status: "locating", logs: [] })
  const [activeChildFeedTab, setActiveChildFeedTab] = useState<number>(0)
  const [isMinimalTactical, setIsMinimalTactical] = useState<boolean>(false)
  const [isInterceptsCollapsed, setIsInterceptsCollapsed] = useState<boolean>(false)
  const [focusMode, setFocusMode] = useState<boolean>(false)
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [selectedChannel, setSelectedChannel] = useState<"GEOPOLITICS"|"ECONOMY"|"WEATHER"|"CYBER_AI">("GEOPOLITICS")
  const [selectedRegion, setSelectedRegion] = useState<keyof typeof REGION_COORDS>("GLOBAL")

  const handleRegionClick = (regionId: keyof typeof REGION_COORDS) => {
    setSelectedRegion(regionId)
    const coords = REGION_COORDS[regionId]
    if (coords && mapRef.current) {
      const map = mapRef.current.getMap?.() || mapRef.current
      if (map && typeof map.flyTo === "function") {
        map.flyTo({ center: coords.center, zoom: coords.zoom, duration: 2000, essential: true })
      }
    }
  }

  const [isTransitioning, setIsTransitioning] = useState(false)
  const [opsMode, setOpsMode] = useState<"ACTIVE"|"IDLE">("ACTIVE")
  const resumeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [streamLogs, setStreamLogs] = useState<string[]>([
    "INITIALIZING RECEIVER INTERFACE...",
    "PORT FORWARDING ENGAGED: FETCH TARGET -> /api/news"
  ])
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    rss_fetch_latency: 0.0, duplicate_rate: 0.0,
    ai_processing_time: 0.0, geo_cache_hit_rate: 0.0, last_updated: ""
  })

  const currentWatchconInfo = WATCHCON_STAGES[watchconStage] || {
    color: getWatchconColor(watchconStage), rgb: getWatchconRgb(watchconStage), glitch: 0.2, name: `WATCHCON ${watchconStage}`
  }
  const themeColor = currentWatchconInfo.color
  const themeRgb = currentWatchconInfo.rgb
  const glitchDuration = isMinimalTactical ? 0 : currentWatchconInfo.glitch

  const displayIncidents = useMemo(() => {
    let filtered = allIncidents.filter((ev) => ev.channel === selectedChannel)
    if (selectedRegion !== "GLOBAL") {
      const allowedCountries = REGION_COUNTRY_MAPPING[selectedRegion] || []
      filtered = filtered.filter((ev) => {
        const countryUpper = (ev.country || "").toUpperCase().trim()
        return allowedCountries.some((c) => countryUpper.includes(c))
      })
    }
    if (watchconStage <= 2) {
      const threatKeywords = ["explosion", "airstrike", "missile", "war"]
      filtered = filtered.filter((ev) => {
        const content = `${ev.title} ${ev.summary || ""}`.toLowerCase()
        return threatKeywords.some((kw) => content.includes(kw))
      })
    }
    return [...filtered].sort((a, b) => {
      const aPinned = a.pinned === 1 ? 1 : 0
      const bPinned = b.pinned === 1 ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [allIncidents, watchconStage, selectedChannel, selectedRegion])

  const handleChannelChange = (channel: "GEOPOLITICS"|"ECONOMY"|"WEATHER"|"CYBER_AI") => {
    if (channel === selectedChannel) return
    setIsTransitioning(true)
    setTimeout(() => { setSelectedChannel(channel); setCurrentIndex(0); setIsTransitioning(false) }, 300)
  }

  useEffect(() => {
    setTime(new Date())
    const clock = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(clock)
  }, [])

  useEffect(() => {
    let frame = 0, last = performance.now(), animId: number
    const loop = (now: number) => {
      frame++
      if (now >= last + 1000) { setFps(frame); frame = 0; last = now }
      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [])

  useEffect(() => {
    if (displayIncidents.length === 0) { setCurrentIndex(0); setCurrentTarget(null) }
    else if (currentIndex >= displayIncidents.length) setCurrentIndex(0)
  }, [displayIncidents, currentIndex])

  const prevFirstIncidentIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function syncWatchcon() {
      try {
        const response = await fetch("/api/watchcon/toggle", { headers: { "ngrok-skip-browser-warning": "true" } })
        if (response.ok) {
          const data = await response.json()
          setWatchconStage(data.stage)
          setWatchconOverride(data.override)
        }
      } catch (e) { console.error("Failed to sync watchcon:", e) }
    }
    syncWatchcon()
    const watchconPoller = setInterval(syncWatchcon, 5000)
    return () => clearInterval(watchconPoller)
  }, [])

  const handleWatchconToggle = async (stageNum: number) => {
    try {
      const response = await fetch("/api/watchcon/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ stage: stageNum, override: true })
      })
      if (response.ok) {
        const data = await response.json()
        setWatchconStage(data.stage)
        setWatchconOverride(data.override)
        setStreamLogs(prev => [`[OVERRIDE] COMMANDER SET WATCHCON ${stageNum}`, ...prev.slice(0, 7)])
      }
    } catch (e) { console.error("Failed to toggle watchcon:", e) }
  }

  const handleWatchconAuto = async () => {
    try {
      const response = await fetch("/api/watchcon/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ stage: watchconStage, override: false })
      })
      if (response.ok) {
        const data = await response.json()
        setWatchconStage(data.stage)
        setWatchconOverride(data.override)
        setStreamLogs(prev => [`[SYSTEM] REVERTED TO AUTO ESCALATION MODE`, ...prev.slice(0, 7)])
      }
    } catch (e) { console.error("Failed to set watchcon auto mode:", e) }
  }

  useEffect(() => {
    setIsLoading(true)
    setStreamLogs(prev => [`[SCAN] CONNECTING ${selectedChannel} SSE STREAM...`, ...prev.slice(0, 7)])
    let retryCount = 0
    const MAX_RETRIES = 5
    let retryTimer: NodeJS.Timeout | null = null
    let es: EventSource | null = null
    const connect = () => {
      es = new EventSource(`/api/news/stream?channel=${selectedChannel}&_ngrok_skip=1`)
      es.onmessage = (event) => {
        retryCount = 0
        try {
          const data = JSON.parse(event.data)
          if (data && data.length > 0) {
            setAllIncidents(data)
            setStreamLogs(prev => [`[ACQ] ${data.length} INTERCEPTS // ${selectedChannel}`, ...prev.slice(0, 7)])
            const newFirstId = data[0].id
            if (prevFirstIncidentIdRef.current && prevFirstIncidentIdRef.current !== newFirstId) {
              if (watchconStageRef.current <= 2) {
                setStreamLogs(prev => [`[PRIORITY] NEW INTEL AT ${data[0].region}`, ...prev.slice(0, 7)])
                setCurrentIndex(0)
                setCurrentTarget(data[0])
                const map = mapRef.current?.getMap?.() || mapRef.current
                if (map && typeof map.flyTo === "function") {
                  map.stop()
                  map.flyTo({ center: [data[0].lng, data[0].lat], zoom: 5.5, pitch: 20, bearing: 20, speed: 0.95, essential: true })
                }
              }
            }
            prevFirstIncidentIdRef.current = newFirstId
          } else {
            setAllIncidents([])
            setStreamLogs(prev => [`[INFO] NO EVENTS IN ${selectedChannel}`, ...prev.slice(0, 7)])
          }
        } catch (err) { console.error("SSE parse error", err) }
        finally { setIsLoading(false) }
      }
      es.onerror = () => {
        es?.close()
        setIsLoading(false)
        if (retryCount < MAX_RETRIES) {
          retryCount++
          const delay = Math.min(3000 * retryCount, 15000)
          setStreamLogs(prev => [`[RETRY ${retryCount}/${MAX_RETRIES}] RECONNECT IN ${delay / 1000}s`, ...prev.slice(0, 7)])
          retryTimer = setTimeout(connect, delay)
        } else {
          setAllIncidents(FALLBACK_NEWS_FEED)
          setStreamLogs(prev => [`[WARN] ${selectedChannel} STREAM DISRUPTED // FALLBACK`, ...prev.slice(0, 7)])
        }
      }
    }
    connect()
    return () => { es?.close(); if (retryTimer) clearTimeout(retryTimer) }
  }, [selectedChannel])

  useEffect(() => {
    async function fetchTelemetry() {
      try {
        const response = await fetch("/api/telemetry", { headers: { "ngrok-skip-browser-warning": "true" } })
        if (!response.ok) throw new Error("TELEMETRY_FETCH_ERROR")
        setTelemetry(await response.json())
      } catch (err) { console.error("Telemetry fetch failed:", err) }
    }
    fetchTelemetry()
    const telemetryInterval = setInterval(fetchTelemetry, 5000)
    return () => clearInterval(telemetryInterval)
  }, [])

  useEffect(() => {
    if (!isAutoPilot || displayIncidents.length === 0) return
    const map = mapRef.current?.getMap?.() || mapRef.current
    let timer: NodeJS.Timeout
    if (opsMode === "ACTIVE") {
      const currentNews = displayIncidents[currentIndex]
      if (currentNews) {
        setCurrentTarget(currentNews)
        if (map && typeof map.flyTo === "function") {
          map.flyTo({ center: [currentNews.lng, currentNews.lat], zoom: 4.8, pitch: 20, bearing: -10, speed: 0.6, essential: true })
        }
        setStreamLogs(prev => [`[LOCK] [${currentNews.level}] ${currentNews.region} — ${currentNews.country} [${currentIndex + 1}/${displayIncidents.length}]`, ...prev.slice(0, 7)])
      }
      timer = setTimeout(() => {
        if (currentIndex < displayIncidents.length - 1) setCurrentIndex(prev => prev + 1)
        else { setStreamLogs(prev => ["[CYCLE] FULL SCAN COMPLETE // ENTERING IDLE", ...prev.slice(0, 7)]); setOpsMode("IDLE") }
      }, 10000)
    } else {
      const currentNews = displayIncidents[currentIndex]
      const targetLng = currentNews?.lng ?? 126.9780
      const targetLat = currentNews?.lat ?? 37.5665
      if (map && typeof map.flyTo === "function") {
        map.flyTo({ center: [targetLng, targetLat], zoom: 2.2, pitch: 0, bearing: 0, speed: 0.45, essential: true })
      }
      setStreamLogs(prev => [`[IDLE] ORBITAL SURVEY MODE // 30S PATROL`, ...prev.slice(0, 7)])
      timer = setTimeout(() => {
        setCurrentIndex(0)
        setStreamLogs(prev => ["[RESET] NEW INGESTION CYCLE INITIATED", ...prev.slice(0, 7)])
        setOpsMode("ACTIVE")
      }, 30000)
    }
    return () => clearTimeout(timer)
  }, [currentIndex, opsMode, isAutoPilot, displayIncidents])

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch(`/api/rooms?channel=${selectedChannel}`)
        const data = await res.json()
        if (data.rooms) setActiveRooms(data.rooms)
      } catch (err) { console.error("Failed to fetch rooms", err) }
    }
    fetchRooms()
  }, [selectedChannel])

  const executeManualTargetCommand = (index: number) => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    setIsAutoPilot(false)
    setCurrentIndex(index)
    setOpsMode("ACTIVE")
    const target = displayIncidents[index]
    if (!target) return
    const map = mapRef.current?.getMap?.() || mapRef.current
    if (map && typeof map.flyTo === "function") {
      map.stop()
      map.flyTo({ center: [target.lng, target.lat], zoom: 4.8, speed: 0.85, essential: true })
      setCurrentTarget(target)
      setStreamLogs(prev => [`[MANUAL] LOCKED ONTO [${target.source || "RAW"}] ${target.region}`, ...prev.slice(0, 7)])
    }
    resumeTimerRef.current = setTimeout(() => {
      setStreamLogs(prev => ["[SYSTEM] INACTIVITY — RESUMING AUTOPILOT", ...prev.slice(0, 7)])
      setIsAutoPilot(true)
    }, 10000)
  }

  const handleGeoFencedRoomEntry = async (incidentId: string, title: string, region: string, incidentLat?: number | null, incidentLng?: number | null) => {
    if (!navigator.geolocation) {
      setAuthUI({ active: true, status: "error", logs: ["[ERROR] GPS 모듈을 지원하지 않는 단말입니다."] })
      setTimeout(() => setAuthUI(prev => ({ ...prev, active: false })), 3000)
      return
    }
    setAuthUI({ active: true, status: "locating", logs: ["[SYSTEM] 보안 구역 접근 절차 개시...", "[SYSTEM] 원격 보안 시스템 상태 조회 중..."] })
    let targetRoom: any = null
    try {
      const resRooms = await fetch(`/api/rooms?channel=${selectedChannel}`)
      const dataRooms = await resRooms.json()
      const rooms = dataRooms.rooms || []
      let foundRoom = rooms.find((r: any) => r.incident_id === incidentId)
      if (!foundRoom && incidentLat != null && incidentLng != null) {
        const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const R = 6371
          const dLat = (lat2 - lat1) * (Math.PI / 180)
          const dLon = (lon2 - lon1) * (Math.PI / 180)
          const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        }
        let closestRoom = null, minDistance = Infinity
        for (const r of rooms) {
          if (r.lat != null && r.lng != null && r.status === "ACTIVE") {
            const dist = getDistance(incidentLat, incidentLng, r.lat, r.lng)
            if (dist < minDistance) { minDistance = dist; closestRoom = r }
          }
        }
        if (closestRoom && minDistance <= 5.0) foundRoom = closestRoom
      }
      if (!foundRoom || foundRoom.status !== "ACTIVE") {
        setAuthUI({ active: true, status: "denied", logs: ["[SYSTEM] 해당 구역은 현재 비활성 상태입니다."] })
        setTimeout(() => setAuthUI(prev => ({ ...prev, active: false })), 3000)
        return
      }
      targetRoom = foundRoom
    } catch (err) {
      setAuthUI({ active: true, status: "error", logs: ["[ERROR] 보안 상태 조회 실패."] })
      setTimeout(() => setAuthUI(prev => ({ ...prev, active: false })), 3000)
      return
    }
    setAuthUI(prev => ({ ...prev, logs: ["[SYSTEM] 보안 구역 접근 절차 개시...", "[GPS] 위성 업링크 요청 중..."] }))
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords
        setAuthUI(prev => ({ ...prev, status: "verifying", logs: [...prev.logs, `[GPS] 좌표 획득: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, "[SERVER] 작전 반경 검증 중..."] }))
        try {
          const userId = (typeof window !== "undefined" && localStorage.getItem("user_id")) || undefined
          const res = await fetch(`/api/rooms/${targetRoom.id}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng, userId })
          })
          const data = await res.json()
          if (data.allowed) {
            setAuthUI(prev => ({ ...prev, status: "success", logs: [...prev.logs, `[AUTH] 인증 성공. 반경 ${data.limit}km 내 진입. (거리: ${data.distance.toFixed(2)}km)`, "[SYSTEM] 암호화 채널 개방..."] }))
            setTimeout(() => { setAuthUI(prev => ({ ...prev, active: false })); setActiveRoom({ incidentId: targetRoom.id, incidentTitle: title, region }) }, 1500)
          } else {
            setAuthUI(prev => ({ ...prev, status: "denied", logs: [...prev.logs, `[DENY] 통제 구역 이탈. (거리: ${data.distance?.toFixed(2)}km)`, "[SYSTEM] 연결 강제 종료."] }))
            setTimeout(() => setAuthUI(prev => ({ ...prev, active: false })), 4000)
          }
        } catch (err) {
          setAuthUI(prev => ({ ...prev, status: "error", logs: [...prev.logs, "[ERROR] 서버 통신 실패."] }))
          setTimeout(() => setAuthUI(prev => ({ ...prev, active: false })), 3000)
        }
      },
      () => {
        setAuthUI(prev => ({ ...prev, status: "denied", logs: [...prev.logs, "[ERROR] 위치 정보 접근 거부됨."] }))
        setTimeout(() => setAuthUI(prev => ({ ...prev, active: false })), 3000)
      },
      { timeout: 5000, maximumAge: 0 }
    )
  }

  const [showFeedback, setShowFeedback] = useState(false)
  const [fbRating, setFbRating] = useState(0)
  const [fbCategory, setFbCategory] = useState("GENERAL")
  const [fbMessage, setFbMessage] = useState("")
  const [fbSubmitting, setFbSubmitting] = useState(false)
  const [fbDone, setFbDone] = useState(false)

  const handleFeedbackSubmit = async () => {
    if (fbRating === 0 || fbMessage.trim().length < 5) return
    setFbSubmitting(true)
    try {
      await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: fbRating, category: fbCategory, message: fbMessage.trim() }) })
      setFbDone(true)
      setTimeout(() => { setShowFeedback(false); setFbDone(false); setFbRating(0); setFbCategory("GENERAL"); setFbMessage("") }, 2000)
    } catch { /* silent */ }
    finally { setFbSubmitting(false) }
  }

  const handleManualRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setStreamLogs(prev => [`[TRIGGER] MANUAL REFRESH INITIATED`, ...prev.slice(0, 7)])
    try {
      const response = await fetch("/api/news/refresh", { method: "POST" })
      const data = await response.json()
      if (data.success) setStreamLogs(prev => [`[OK] PIPELINE TRIGGERED: ${data.message}`, ...prev.slice(0, 7)])
      else setStreamLogs(prev => [`[ERR] REFRESH FAILED: ${data.details || "UNKNOWN"}`, ...prev.slice(0, 7)])
    } catch (err: any) { setStreamLogs(prev => [`[ERR] ${err.message}`, ...prev.slice(0, 7)]) }
    finally { setTimeout(() => setIsRefreshing(false), 3500) }
  }

  // ── Derived briefing data ─────────────────────────────────
  const verifiedSources: string[] = (() => {
    try { if (currentTarget?.verified_sources) return typeof currentTarget.verified_sources === "string" ? JSON.parse(currentTarget.verified_sources) : currentTarget.verified_sources }
    catch {}
    return currentTarget?.source ? [currentTarget.source] : []
  })()

  const childFeeds: any[] = (() => {
    try { if (currentTarget?.child_feeds) return typeof currentTarget.child_feeds === "string" ? JSON.parse(currentTarget.child_feeds) : currentTarget.child_feeds }
    catch {}
    return []
  })()

  const displaySource = childFeeds[activeChildFeedTab]?.source ?? currentTarget?.source ?? "UNKNOWN"
  const displayTitle = childFeeds[activeChildFeedTab]?.title ?? currentTarget?.title ?? "AWAITING BROADCAST..."
  const displaySummary = childFeeds[activeChildFeedTab]?.summary ?? currentTarget?.summary ?? "실시간 데이터 수신 대기 중..."
  const displayLink = childFeeds[activeChildFeedTab]?.link ?? currentTarget?.link

  if (!mounted) return null

  // ── Channel config ────────────────────────────────────────
  const CHANNEL_CONFIG = {
    GEOPOLITICS: { label: "🌐 GEOPOLITICS", short: "GEOPOL", color: "#22c55e" },
    ECONOMY:     { label: "📈 ECONOMY",     short: "ECON",   color: "#3b82f6" },
    WEATHER:     { label: "🌪 WEATHER",     short: "METEO",  color: "#0ea5e9" },
    CYBER_AI:    { label: "🛡 CYBER / AI",  short: "CYBER",  color: "#a855f7" },
  }

  const REGION_BUTTONS = [
    { id: "GLOBAL",        label: "GLOBAL" },
    { id: "ASIA_PACIFIC",  label: "ASIA-PAC" },
    { id: "EUROPE",        label: "EUROPE" },
    { id: "AMERICAS",      label: "AMERICAS" },
    { id: "AFRICA_MIDEAST",label: "AFR/MDE" },
    { id: "CENTRAL_ASIA",  label: "C.ASIA" },
  ]

  return (
    <>
    <main
      className="relative w-screen h-screen overflow-hidden font-mono select-none"
      style={{ background: "#030609", "--theme-color": themeColor, "--theme-rgb": themeRgb } as React.CSSProperties}
    >
      {/* Ambient vignette tied to WATCHCON */}
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{ background: `radial-gradient(ellipse at 50% 0%, rgba(${themeRgb}, 0.07) 0%, transparent 60%)`, transition: "background 1s ease" }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 z-[6] pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(${themeRgb}, 0.012) 3px, rgba(${themeRgb}, 0.012) 4px)`,
          opacity: isMinimalTactical ? 0 : 1,
        }}
      />

      {/* Globe */}
      <GlobeMap
        incidents={displayIncidents}
        watchconStage={watchconStage}
        themeColor={themeColor}
        themeRgb={themeRgb}
        onMarkerClick={(incident) => {
          const idx = displayIncidents.findIndex(ev => ev.id === incident.id)
          if (idx !== -1) executeManualTargetCommand(idx)
        }}
        onRoomEntry={(incident) => {
          handleGeoFencedRoomEntry(incident.id, incident.title, incident.region, incident.lat, incident.lng)
        }}
        mapRef={mapRef}
        opsMode={opsMode}
        isAutoPilot={isAutoPilot}
        selectedChannel={selectedChannel}
        showHeatmap={showHeatmap}
        isMinimalTactical={isMinimalTactical}
        currentTarget={currentTarget}
      />

      {/* Crosshair */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10] transition-all duration-300"
        style={{ opacity: isCameraMoving ? 0 : 1 }}
      >
        <div className="relative flex items-center justify-center">
          <div
            className="w-1.5 h-1.5 rounded-full z-10"
            style={{ background: themeColor, boxShadow: `0 0 8px ${themeColor}` }}
          />
          {!isMinimalTactical && (
            <div
              className="absolute w-8 h-8 rounded-full"
              style={{ border: `1px solid rgba(${themeRgb}, 0.5)`, animation: "pulse 2s infinite" }}
            />
          )}
          {watchconStage <= 3 && !isMinimalTactical && (
            <div
              className="absolute w-12 h-12 rounded-full border-dashed"
              style={{ border: `1px dashed rgba(${themeRgb}, 0.25)`, animation: "spin 8s linear infinite" }}
            />
          )}
          <div className="absolute w-8 h-px" style={{ background: `rgba(${themeRgb}, 0.25)` }} />
          <div className="absolute h-8 w-px" style={{ background: `rgba(${themeRgb}, 0.25)` }} />
          {watchconStage <= 3 && (
            <div
              className="absolute top-7 text-[8px] font-bold tracking-widest text-center whitespace-nowrap font-mono"
              style={{ color: themeColor, textShadow: `0 0 8px ${themeColor}` }}
            >
              {watchconStage === 1 ? "WATCHCON 1 — CRITICAL" : watchconStage === 2 ? "WATCHCON 2 — HIGH ALERT" : "WATCHCON 3 — ELEVATED"}
            </div>
          )}
        </div>
      </div>

      {/* ── TOP HEADER ─────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-30">
        <div
          className="h-[58px] flex items-center px-5 gap-4"
          style={{ background: "rgba(3,6,9,0.96)", backdropFilter: "blur(20px)" }}
        >
          {/* Left: system title */}
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: themeColor, boxShadow: `0 0 6px ${themeColor}`, animation: "beacon 2.4s ease-out infinite", flexShrink: 0 }} />
              <h1
                className="font-bold tracking-[0.16em] truncate"
                style={{ fontSize: "13px", color: "#d4e2f0", fontFamily: "system-ui, -apple-system, sans-serif" }}
              >
                GLOBAL CRISIS INTELLIGENCE MAP WATCH
              </h1>
            </div>
            <p className="truncate mt-0.5 ml-4" style={{ fontSize: "9px", letterSpacing: "0.18em", color: "#3a5a78", fontFamily: "system-ui, -apple-system, sans-serif" }}>
              VERIFIED BROADCAST SOURCE INGESTION CORE // FULL SPECTRUM PROTOCOL
            </p>
          </div>

          {/* Center: channel tabs */}
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5"
            style={{ background: "rgba(180,210,240,0.03)", border: "1px solid rgba(180,210,240,0.08)", padding: "3px", borderRadius: "4px" }}
          >
            {(Object.entries(CHANNEL_CONFIG) as [keyof typeof CHANNEL_CONFIG, typeof CHANNEL_CONFIG[keyof typeof CHANNEL_CONFIG]][]).map(([ch, cfg]) => {
              const isActive = selectedChannel === ch
              return (
                <button
                  key={ch}
                  onClick={() => handleChannelChange(ch)}
                  className="cursor-pointer transition-all duration-200"
                  style={{
                    padding: "6px 16px",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    borderRadius: "3px",
                    border: isActive ? `1px solid ${cfg.color}60` : "1px solid transparent",
                    background: isActive ? `rgba(${themeRgb}, 0.10)` : "transparent",
                    color: isActive ? cfg.color : "rgba(180,210,240,0.35)",
                    boxShadow: isActive ? `0 0 10px rgba(${themeRgb}, 0.15)` : "none",
                    transition: "all 0.2s",
                  }}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>

          {/* Right: controls + stats */}
          <div className="flex items-center gap-4 shrink-0 ml-auto">
            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              className="cursor-pointer transition-all duration-200"
              style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.10em",
                padding: "5px 11px",
                borderRadius: "3px",
                border: showHeatmap
                  ? `1px solid rgba(${themeRgb}, 0.40)`
                  : "1px solid rgba(180,210,240,0.09)",
                background: showHeatmap ? `rgba(${themeRgb}, 0.08)` : "transparent",
                color: showHeatmap ? themeColor : "rgba(180,210,240,0.30)",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              HEATMAP {showHeatmap ? "ON" : "OFF"}
            </button>

            <div className="flex flex-col" style={{ minWidth: "64px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", color: "#4d7898", fontFamily: "system-ui, -apple-system, sans-serif", textTransform: "uppercase" }}>UTC TIME</div>
              <div style={{ fontSize: "13px", fontFamily: "monospace", color: "#b8cfe0", fontWeight: 600 }}>{mounted && time ? time.toISOString().slice(11, 19) : "00:00:00"}</div>
            </div>

            <div className="flex flex-col items-center" style={{ minWidth: "42px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", color: "#4d7898", fontFamily: "system-ui, -apple-system, sans-serif", textTransform: "uppercase" }}>RENDER</div>
              <div style={{ fontSize: "13px", fontFamily: "monospace", color: "#b8cfe0", fontWeight: 600 }}>{fps}<span style={{ fontSize: "9px", color: "#4d7898" }}> fps</span></div>
            </div>

            <button
              onClick={() => setFocusMode(f => !f)}
              title="Toggle focus / briefing popup mode"
              className="flex items-center gap-1.5 cursor-pointer transition-all duration-200"
              style={{
                padding: "5px 11px",
                borderRadius: "3px",
                border: focusMode ? `1px solid ${themeColor}` : `1px solid rgba(${themeRgb}, 0.20)`,
                background: focusMode ? `rgba(${themeRgb}, 0.16)` : `rgba(${themeRgb}, 0.05)`,
                boxShadow: focusMode ? `0 0 10px rgba(${themeRgb}, 0.25)` : "none",
              }}
            >
              <div
                style={{
                  width: "5px", height: "5px", borderRadius: "50%",
                  background: isLoading ? "#f59e0b" : themeColor,
                  animation: "beacon 2.4s ease-out infinite",
                }}
              />
              <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.10em", color: isLoading ? "#f59e0b" : themeColor, fontFamily: "system-ui, -apple-system, sans-serif" }}>
                {focusMode ? "FOCUS" : isLoading ? "SYNC" : isAutoPilot ? "AUTO" : "MANUAL"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── LEFT COLUMN ───────────────────────────────────── */}
      <div
        className="absolute left-5 top-20 bottom-12 w-[282px] z-30 flex flex-col gap-2.5 pointer-events-none"
        style={{
          transition: "transform 0.5s ease, opacity 0.5s ease",
          transform: focusMode ? "translateX(-130%)" : "translateX(0)",
          opacity: focusMode ? 0 : 1,
        }}
      >

        {/* INTEL INTERCEPTS */}
        <div
          className={`pointer-events-auto flex flex-col overflow-hidden transition-all duration-400 ${isInterceptsCollapsed ? "flex-none" : "flex-1"}`}
          style={{ ...PANEL_STYLE, borderLeft: `2px solid rgba(${themeRgb}, 0.35)` }}
        >
          {/* Header */}
          <div style={PANEL_HEADER_STYLE}>
            <div className="flex items-center gap-2">
              <LiveDot />
              <PanelLabel>INTELLIGENCE INTERCEPTS</PanelLabel>
              <span
                className="text-[7px] font-bold px-1.5 py-0.5"
                style={{ background: `rgba(${themeRgb}, 0.08)`, border: `1px solid rgba(${themeRgb}, 0.20)`, color: themeColor }}
              >
                {displayIncidents.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="cursor-pointer transition-colors duration-150"
                style={{
                  fontSize: "8px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: isRefreshing ? "rgba(180,210,240,0.20)" : themeColor,
                  fontFamily: "monospace",
                  border: "none",
                  background: "none",
                  cursor: isRefreshing ? "not-allowed" : "pointer",
                }}
              >
                {isRefreshing ? "···" : "REFRESH"}
              </button>
              <button
                onClick={() => setIsInterceptsCollapsed(!isInterceptsCollapsed)}
                style={{ fontSize: "10px", color: "rgba(180,210,240,0.35)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
              >
                {isInterceptsCollapsed ? "▽" : "△"}
              </button>
            </div>
          </div>

          {!isInterceptsCollapsed && (
            <>
              {/* Region filter — 3 columns × 2 rows */}
              <div
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid rgba(180,210,240,0.05)",
                  background: "rgba(180,210,240,0.01)",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "4px",
                }}
              >
                {REGION_BUTTONS.map((r) => {
                  const isSelected = selectedRegion === r.id
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleRegionClick(r.id as any)}
                      className="cursor-pointer transition-all duration-200"
                      style={{
                        fontSize: "8px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        padding: "4px 4px",
                        border: isSelected ? `1px solid rgba(${themeRgb}, 0.50)` : "1px solid rgba(180,210,240,0.08)",
                        background: isSelected ? `rgba(${themeRgb}, 0.10)` : "transparent",
                        color: isSelected ? themeColor : "rgba(180,210,240,0.35)",
                        fontFamily: "monospace",
                        boxShadow: isSelected ? `0 0 6px rgba(${themeRgb}, 0.15)` : "none",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.label}
                    </button>
                  )
                })}
              </div>

              {/* Feed */}
              <div className="flex-1 overflow-y-auto p-2 scrollbar-none">
                <div style={{ transition: "opacity 0.3s, transform 0.3s", opacity: isTransitioning ? 0 : 1, transform: isTransitioning ? "translateX(-8px)" : "translateX(0)" }}>
                  {selectedChannel === "WEATHER" ? (
                    <WeatherPanel
                      incidents={displayIncidents}
                      themeColor={themeColor}
                      onIncidentClick={(incident) => { const idx = displayIncidents.findIndex(ev => ev.id === incident.id); if (idx !== -1) executeManualTargetCommand(idx) }}
                      activeIncidentId={currentTarget?.id}
                    />
                  ) : (
                    <NewsFeed
                      incidents={displayIncidents}
                      selectedChannel={selectedChannel}
                      themeColor={themeColor}
                      onIncidentClick={(incident) => { const idx = displayIncidents.findIndex(ev => ev.id === incident.id); if (idx !== -1) executeManualTargetCommand(idx) }}
                      activeIncidentId={currentTarget?.id}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* TARGET ACQUISITION */}
        <div className="pointer-events-auto shrink-0" style={{ ...PANEL_STYLE, borderLeft: `2px solid rgba(${themeRgb}, 0.20)` }}>
          <div style={PANEL_HEADER_STYLE}>
            <div className="flex items-center gap-2">
              <div style={{ width: "4px", height: "4px", background: themeColor, clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)", flexShrink: 0 }} />
              <PanelLabel>TARGET ACQUISITION</PanelLabel>
            </div>
            <div
              className="flex items-center gap-1"
              style={{ fontSize: "7px", fontWeight: 700, letterSpacing: "0.1em", fontFamily: "monospace" }}
            >
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#22c55e", animation: "beacon 2.4s ease-out infinite" }} />
              <span style={{ color: "#22c55e" }}>TRACKING</span>
            </div>
          </div>
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <div className="ia-label mb-1">LATITUDE</div>
                <div className="ia-data text-[11px]">{currentTarget?.lat?.toFixed(5) ?? "—"}</div>
              </div>
              <div>
                <div className="ia-label mb-1">LONGITUDE</div>
                <div className="ia-data text-[11px]">{currentTarget?.lng?.toFixed(5) ?? "—"}</div>
              </div>
            </div>
            <div>
              <div className="ia-label mb-1.5">THREAT SEVERITY</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ flex: 1, height: "3px", background: "rgba(180,210,240,0.06)", position: "relative", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(currentTarget?.severity || 0) * 100}%`,
                      background: themeColor,
                      boxShadow: `0 0 6px ${themeColor}`,
                      transition: "width 1s ease",
                    }}
                  />
                </div>
                <span className="ia-data text-[10px]">{((currentTarget?.severity || 0) * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* PIZZA INDEX */}
        <div className="pointer-events-auto h-24 shrink-0">
          <PizzaIndex />
        </div>
      </div>

      {/* ── RIGHT COLUMN ──────────────────────────────────── */}
      <div
        className="absolute right-5 top-20 bottom-12 w-[306px] z-30 flex flex-col gap-2.5 pointer-events-none"
        style={{
          transition: "transform 0.5s ease, opacity 0.5s ease",
          transform: focusMode ? "translateX(130%)" : "translateX(0)",
          opacity: focusMode ? 0 : 1,
        }}
      >

        {/* WATCHCON */}
        <div className="pointer-events-auto shrink-0">
          <WatchconPanel
            watchconData={{ stage: watchconStage, override: watchconOverride }}
            watchconStage={watchconStage}
            onStageChange={handleWatchconToggle}
            onAutoMode={handleWatchconAuto}
            themeColor={themeColor}
            isMinimalTactical={isMinimalTactical}
            onToggleMinimalTactical={() => setIsMinimalTactical(!isMinimalTactical)}
            readOnly={true}
          />
        </div>

        {/* SECURE CHANNELS */}
        <div className="pointer-events-auto shrink-0" style={{ ...PANEL_STYLE, borderLeft: "2px solid rgba(239,68,68,0.35)" }}>
          <div style={PANEL_HEADER_STYLE}>
            <div className="flex items-center gap-2">
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#ef4444", animation: "beacon 2.4s ease-out infinite", boxShadow: "0 0 4px #ef4444" }} />
              <PanelLabel>SECURE CHANNELS</PanelLabel>
            </div>
            <span
              className="text-[7px] font-bold px-1.5 py-0.5"
              style={{ border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444", background: "rgba(239,68,68,0.08)" }}
            >
              ACTIVE: {activeRooms.length}
            </span>
          </div>
          <div className="max-h-[110px] overflow-y-auto scrollbar-none" style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {activeRooms.length === 0 ? (
              <div
                style={{ textAlign: "center", padding: "12px", fontSize: "9px", color: "rgba(180,210,240,0.25)", letterSpacing: "0.12em", border: "1px dashed rgba(180,210,240,0.08)", fontFamily: "monospace" }}
              >
                NO ACTIVE CHANNELS
              </div>
            ) : (
              activeRooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => handleGeoFencedRoomEntry(room.incident_id || room.id, room.title, room.region, room.lat, room.lng)}
                  className="cursor-pointer group transition-all duration-200"
                  style={{
                    background: "rgba(239,68,68,0.03)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    padding: "8px 10px",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.07)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.03)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.18)" }}
                >
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#d4e2f0", marginBottom: "2px", fontFamily: "system-ui, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {room.title}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(180,210,240,0.45)", fontFamily: "system-ui, sans-serif", marginBottom: "4px" }}>
                    {room.region} · {room.country}
                  </div>
                  <div style={{ fontSize: "9px", color: "rgba(239,68,68,0.7)", letterSpacing: "0.12em", fontWeight: 700, fontFamily: "monospace" }}>
                    ▶ CONNECT TO ROOM
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* INTELLIGENCE BRIEFING */}
        <div className="pointer-events-auto shrink-0" style={{ ...PANEL_STYLE, borderLeft: `2px solid rgba(${themeRgb}, 0.25)` }}>
          <div style={PANEL_HEADER_STYLE}>
            <PanelLabel>INTELLIGENCE BRIEFING</PanelLabel>
            {displaySource && (
              <span style={{ fontSize: "7px", color: "rgba(180,210,240,0.30)", fontFamily: "monospace", letterSpacing: "0.08em" }}>
                SRC: {displaySource}
              </span>
            )}
          </div>
          <div
            style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", transition: "opacity 0.3s", opacity: isTransitioning ? 0 : 1 }}
          >
            {/* Child feed tabs */}
            {childFeeds.length > 1 && (
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", paddingBottom: "6px", borderBottom: "1px solid rgba(180,210,240,0.05)" }}>
                {childFeeds.map((feed: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setActiveChildFeedTab(idx)}
                    style={{
                      fontSize: "7px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      cursor: "pointer",
                      fontFamily: "monospace",
                      border: idx === activeChildFeedTab ? `1px solid rgba(${themeRgb}, 0.45)` : "1px solid rgba(180,210,240,0.08)",
                      background: idx === activeChildFeedTab ? `rgba(${themeRgb}, 0.10)` : "transparent",
                      color: idx === activeChildFeedTab ? themeColor : "rgba(180,210,240,0.30)",
                    }}
                  >
                    {feed.source || "RPT"} #{idx + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Source + link */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "rgba(180,210,240,0.02)", border: "1px solid rgba(180,210,240,0.05)" }}>
              <span style={{ fontSize: "8px", color: "rgba(180,210,240,0.35)", fontFamily: "monospace" }}>
                SOURCE: <span style={{ color: themeColor, fontWeight: 700 }}>{displaySource}</span>
              </span>
              {displayLink ? (
                <a href={displayLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: "7px", color: themeColor, fontFamily: "monospace", textDecoration: "underline", letterSpacing: "0.06em" }}>
                  LINK ↗
                </a>
              ) : (
                <span style={{ fontSize: "7px", color: "rgba(180,210,240,0.20)", fontFamily: "monospace" }}>NO LINK</span>
              )}
            </div>

            {/* Title */}
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#d4e2f0", fontFamily: "system-ui, sans-serif", lineHeight: 1.4, letterSpacing: "0.01em" }}>
              {displayTitle}
            </div>

            {/* Media preview (image via safe proxy, video direct from SNS) */}
            {currentTarget?.media_url && (
              <div style={{ position: "relative", width: "100%", height: "120px", background: "#000", border: "1px solid rgba(180,210,240,0.08)", overflow: "hidden" }}>
                {currentTarget.media_type === "video" ? (
                  <video
                    src={currentTarget.media_url}
                    muted loop playsInline autoPlay
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <img
                    src={`/api/media-proxy?url=${encodeURIComponent(currentTarget.media_url)}`}
                    alt="source media"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => { const el = e.currentTarget.parentElement as HTMLElement | null; if (el) el.style.display = "none" }}
                  />
                )}
                <span style={{ position: "absolute", bottom: "3px", right: "4px", fontSize: "7px", padding: "1px 4px", background: "rgba(0,0,0,0.7)", color: "rgba(180,210,240,0.6)", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {currentTarget.sns_source || "MEDIA"}
                </span>
              </div>
            )}

            {/* Summary */}
            <div
              style={{
                fontSize: "12px",
                color: "#9bbdd4",
                lineHeight: 1.65,
                paddingTop: "8px",
                borderTop: `1px solid rgba(${themeRgb}, 0.10)`,
                fontFamily: "system-ui, sans-serif",
              }}
            >
              {displaySummary}
            </div>

            {/* Consensus sources */}
            {verifiedSources.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                <span style={{ fontSize: "7px", color: "rgba(180,210,240,0.25)", fontFamily: "monospace" }}>CONSENSUS:</span>
                {verifiedSources.map((src, i) => (
                  <span key={i} style={{ fontSize: "7px", padding: "1px 5px", border: "1px solid rgba(34,197,94,0.25)", background: "rgba(34,197,94,0.06)", color: "#22c55e", fontFamily: "monospace", fontWeight: 700 }}>
                    {src}
                  </span>
                ))}
              </div>
            )}

            {/* Data grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
              {[
                { label: "CATEGORY",   value: currentTarget?.category || "—" },
                { label: "TRAJECTORY", value: currentTarget?.trajectory || "—", alert: currentTarget?.trajectory === "ESCALATING" },
                { label: "VELOCITY",   value: currentTarget?.threat_velocity != null ? (currentTarget.threat_velocity > 0 ? `+${currentTarget.threat_velocity}` : String(currentTarget.threat_velocity)) : "0" },
                { label: "RISK INDEX", value: String(currentTarget?.region_risk_index || 0) },
              ].map(({ label, value, alert }) => (
                <div key={label} style={{ background: "rgba(180,210,240,0.02)", border: "1px solid rgba(180,210,240,0.05)", padding: "6px 8px" }}>
                  <div className="ia-label mb-0.5">{label}</div>
                  <div
                    className="ia-data text-[10px]"
                    style={{ color: alert ? "#ef4444" : "#b8cfe0" }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div
              suppressHydrationWarning
              style={{
                fontSize: "8px",
                color: "rgba(180,210,240,0.30)",
                fontFamily: "monospace",
                padding: "4px 8px",
                borderLeft: `2px solid rgba(${themeRgb}, 0.30)`,
                background: "rgba(180,210,240,0.01)",
                letterSpacing: "0.08em",
              }}
            >
              TIMELINE: {mounted ? formatKstDate(currentTarget?.created_at) : "REALTIME"}
            </div>
          </div>
        </div>

        {/* SYSTEM TELEMETRY */}
        <div className="pointer-events-auto shrink-0" style={{ ...PANEL_STYLE, borderLeft: `2px solid rgba(${themeRgb}, 0.15)` }}>
          <div style={PANEL_HEADER_STYLE}>
            <PanelLabel>SYSTEM TELEMETRY</PanelLabel>
            <div className="flex items-center gap-1.5">
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#22c55e", animation: "beacon 2.4s ease-out infinite" }} />
              <span style={{ fontSize: "7px", color: "#22c55e", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.1em" }}>LIVE</span>
            </div>
          </div>
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <MetricBar label="AI ANALYTICS LATENCY"     value={telemetry.ai_processing_time}  maxValue={10} unit="s" themeColor={themeColor} themeRgb={themeRgb} />
            <MetricBar label="GEO CACHE HIT RATE"       value={telemetry.geo_cache_hit_rate}   maxValue={100} unit="%" themeColor={themeColor} themeRgb={themeRgb} />
            <MetricBar label="DUPLICATE FILTER RATE"    value={telemetry.duplicate_rate}       maxValue={100} unit="%" themeColor={themeColor} themeRgb={themeRgb} />
            <MetricBar label="RSS INGEST LATENCY"       value={telemetry.rss_fetch_latency}    maxValue={5} unit="s" themeColor={themeColor} themeRgb={themeRgb} />
            <div style={{ textAlign: "right", fontSize: "7px", color: "rgba(180,210,240,0.20)", fontFamily: "monospace", marginTop: "2px" }}>
              UPDATED: {telemetry.last_updated ? new Date(telemetry.last_updated).toLocaleTimeString() : "PENDING"}
            </div>
          </div>
        </div>

        {/* STREAM ACTIVITY LOG */}
        <div className="pointer-events-auto flex-1 flex flex-col min-h-0 overflow-hidden" style={{ ...PANEL_STYLE, borderLeft: `2px solid rgba(${themeRgb}, 0.10)` }}>
          <div style={PANEL_HEADER_STYLE}>
            <PanelLabel>STREAM ACTIVITY LOG</PanelLabel>
            <div className="flex items-center gap-1">
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: themeColor, animation: "data-tick 1.8s step-end infinite" }} />
              <span style={{ fontSize: "7px", color: themeColor, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.1em" }}>LIVE</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-none" style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {streamLogs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: "10px",
                  fontFamily: "monospace",
                  padding: "3px 6px",
                  borderLeft: idx === 0 ? `2px solid ${themeColor}` : "2px solid rgba(180,210,240,0.06)",
                  background: idx === 0 ? `rgba(${themeRgb}, 0.06)` : "transparent",
                  color: idx === 0 ? themeColor : "rgba(180,210,240,0.35)",
                  letterSpacing: "0.03em",
                  lineHeight: 1.5,
                  transition: "all 0.3s",
                }}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM STATUS BAR ─────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-10 z-30 flex items-center justify-between px-5"
        style={{
          background: "rgba(3,6,9,0.97)",
          borderTop: "1px solid rgba(180,210,240,0.06)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex items-center gap-3">
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: themeColor, animation: "beacon 2.4s ease-out infinite", boxShadow: `0 0 6px ${themeColor}` }} />
          <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", color: themeColor, fontFamily: "monospace" }}>
            SYS_ONLINE // V13.0_TACTICAL
          </span>
          <span style={{ fontSize: "8px", color: "rgba(180,210,240,0.20)", fontFamily: "monospace", letterSpacing: "0.1em" }}>
            ·
          </span>
          <span style={{ fontSize: "8px", color: "rgba(180,210,240,0.28)", fontFamily: "monospace", letterSpacing: "0.1em" }}>
            SCAN: 15s // GEO: LOCK-ON ACTIVE
          </span>
        </div>
        <button
          onClick={() => setShowFeedback(prev => !prev)}
          className="cursor-pointer transition-all duration-200"
          style={{
            padding: "4px 12px",
            fontSize: "8px",
            fontWeight: 700,
            letterSpacing: "0.14em",
            fontFamily: "monospace",
            border: showFeedback
              ? "1px solid rgba(34,197,94,0.55)"
              : `1px solid rgba(${themeRgb}, 0.22)`,
            background: showFeedback
              ? "rgba(34,197,94,0.08)"
              : `rgba(${themeRgb}, 0.04)`,
            color: showFeedback ? "#22c55e" : themeColor,
          }}
        >
          {showFeedback ? "CLOSE FEEDBACK" : "BETA FEEDBACK"}
        </button>
      </div>

      {/* ── FOCUS MODE: INTELLIGENCE BRIEFING POPUP ───────── */}
      {focusMode && (
        <div
          className="absolute left-1/2 top-1/2 z-40 pointer-events-auto"
          style={{
            transform: "translate(-50%, calc(-100% - 44px))",
            width: "min(400px, 84vw)",
            background: "rgba(4,8,16,0.96)",
            border: `1px solid rgba(${themeRgb}, 0.30)`,
            borderRadius: "14px",
            boxShadow: `0 0 50px rgba(0,0,0,0.7), 0 0 24px rgba(${themeRgb}, 0.10)`,
            backdropFilter: "blur(16px)",
          }}
        >
          <div
            key={currentTarget?.id || "none"}
            className="briefing-flip"
            style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: themeColor, boxShadow: `0 0 6px ${themeColor}`, animation: "beacon 2.4s ease-out infinite" }} />
                <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.16em", color: "#4d7898", textTransform: "uppercase", fontFamily: "system-ui, sans-serif" }}>
                  Intelligence Briefing
                </span>
              </div>
              <button
                onClick={() => setFocusMode(false)}
                style={{ fontSize: "15px", color: "rgba(180,210,240,0.40)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#d4e2f0")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(180,210,240,0.40)")}
              >
                ✕
              </button>
            </div>

            {/* Timeline */}
            <div
              suppressHydrationWarning
              style={{ fontSize: "9px", color: `rgba(${themeRgb}, 0.7)`, fontFamily: "monospace", letterSpacing: "0.08em", borderLeft: `2px solid rgba(${themeRgb}, 0.35)`, paddingLeft: "8px" }}
            >
              TIMELINE // {mounted ? formatKstDate(currentTarget?.created_at) : "REALTIME"}
            </div>

            {/* Title */}
            <div style={{ fontSize: "17px", fontWeight: 700, color: "#e2eaf4", fontFamily: "system-ui, sans-serif", lineHeight: 1.4 }}>
              {displayTitle}
            </div>

            {/* Source */}
            <div style={{ fontSize: "10px", color: "rgba(180,210,240,0.45)", fontFamily: "monospace", letterSpacing: "0.06em" }}>
              SOURCE: <span style={{ color: themeColor, fontWeight: 700 }}>{displaySource}</span>
            </div>

            {/* Korean briefing */}
            <div style={{ fontSize: "14px", color: "#9bbdd4", lineHeight: 1.75, fontFamily: "system-ui, sans-serif", paddingTop: "12px", borderTop: `1px solid rgba(${themeRgb}, 0.12)` }}>
              {displaySummary}
            </div>
          </div>
        </div>
      )}
    </main>

    {/* ── CONSENT MODAL ─────────────────────────────────── */}
    {consentGiven !== true && <ConsentModal onAccept={() => setConsentGiven(true)} />}

    {/* ── FEEDBACK MODAL ────────────────────────────────── */}
    {showFeedback && (
      <div
        onClick={(e) => { if (e.target === e.currentTarget) setShowFeedback(false) }}
        style={{ position: "fixed", inset: 0, zIndex: 99998, background: "rgba(0,0,0,0.80)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "460px",
            margin: "0 16px",
            background: "#040810",
            border: "1px solid rgba(34,197,94,0.22)",
            borderRadius: "4px",
            boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 30px rgba(34,197,94,0.06)",
            fontFamily: "monospace",
          }}
        >
          {/* Accent */}
          <div style={{ height: "2px", background: "linear-gradient(90deg, transparent, #22c55e, transparent)", opacity: 0.8 }} />
          {/* Header */}
          <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid rgba(180,210,240,0.06)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "8px", color: "#4d7898", letterSpacing: "0.20em", fontWeight: 700, marginBottom: "6px" }}>BETA TESTER DEBRIEF</div>
              <div style={{ fontSize: "15px", fontWeight: 900, color: "#22c55e", letterSpacing: "0.08em" }}>MISSION FEEDBACK</div>
            </div>
            <button onClick={() => setShowFeedback(false)} style={{ fontSize: "16px", color: "rgba(180,210,240,0.30)", cursor: "pointer", background: "none", border: "none", transition: "color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.color = "#b8cfe0")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(180,210,240,0.30)")}>✕</button>
          </div>

          {fbDone ? (
            <div style={{ padding: "48px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "36px", color: "#22c55e" }}>✓</div>
              <div style={{ fontSize: "12px", color: "#22c55e", fontWeight: 700, letterSpacing: "0.16em" }}>TRANSMITTED</div>
              <div style={{ fontSize: "10px", color: "rgba(180,210,240,0.35)", letterSpacing: "0.08em" }}>데이터가 수신되었습니다.</div>
            </div>
          ) : (
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Rating */}
              <div>
                <div style={{ fontSize: "8px", color: "#4d7898", letterSpacing: "0.18em", fontWeight: 700, marginBottom: "10px" }}>SYSTEM RATING</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setFbRating(s)} style={{ fontSize: "22px", cursor: "pointer", background: "none", border: "none", padding: 0, color: s <= fbRating ? "#22c55e" : "rgba(180,210,240,0.12)", textShadow: s <= fbRating ? "0 0 8px #22c55e" : "none", transition: "all 0.15s" }}>★</button>
                  ))}
                  <span style={{ fontSize: "9px", color: "rgba(180,210,240,0.30)", marginLeft: "4px" }}>{fbRating === 0 ? "선택" : ["매우 불만","불만","보통","만족","매우 만족"][fbRating-1]}</span>
                </div>
              </div>
              {/* Category */}
              <div>
                <div style={{ fontSize: "8px", color: "#4d7898", letterSpacing: "0.18em", fontWeight: 700, marginBottom: "10px" }}>REPORT CATEGORY</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {["GENERAL","UI/UX","DATA","BUG","PERFORMANCE"].map(cat => (
                    <button key={cat} onClick={() => setFbCategory(cat)} style={{ padding: "4px 10px", fontSize: "8px", fontWeight: 700, cursor: "pointer", border: fbCategory === cat ? "1px solid rgba(34,197,94,0.50)" : "1px solid rgba(180,210,240,0.09)", background: fbCategory === cat ? "rgba(34,197,94,0.08)" : "transparent", color: fbCategory === cat ? "#22c55e" : "rgba(180,210,240,0.30)", letterSpacing: "0.10em", fontFamily: "monospace", transition: "all 0.15s" }}>{cat}</button>
                  ))}
                </div>
              </div>
              {/* Message */}
              <div>
                <div style={{ fontSize: "8px", color: "#4d7898", letterSpacing: "0.18em", fontWeight: 700, marginBottom: "10px" }}>INTEL REPORT <span style={{ color: "rgba(180,210,240,0.20)", fontWeight: 400 }}>(최소 5자)</span></div>
                <textarea
                  rows={4}
                  maxLength={500}
                  value={fbMessage}
                  onChange={e => setFbMessage(e.target.value)}
                  placeholder="사용 소감, 버그, 개선 제안을 자유롭게..."
                  style={{ width: "100%", background: "rgba(180,210,240,0.02)", resize: "none", border: "1px solid rgba(180,210,240,0.10)", color: "#b8cfe0", fontSize: "12px", padding: "10px 12px", outline: "none", fontFamily: "monospace", lineHeight: 1.6, boxSizing: "border-box", transition: "border-color 0.15s" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(34,197,94,0.40)" }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(180,210,240,0.10)" }}
                />
                <div style={{ textAlign: "right", fontSize: "8px", color: "rgba(180,210,240,0.18)", marginTop: "4px" }}>{fbMessage.length}/500</div>
              </div>
              <button
                onClick={handleFeedbackSubmit}
                disabled={fbRating === 0 || fbMessage.trim().length < 5 || fbSubmitting}
                style={{
                  padding: "12px",
                  fontSize: "11px",
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  fontFamily: "monospace",
                  border: fbRating > 0 && fbMessage.trim().length >= 5 && !fbSubmitting ? "1px solid rgba(34,197,94,0.50)" : "1px solid rgba(180,210,240,0.08)",
                  background: fbRating > 0 && fbMessage.trim().length >= 5 && !fbSubmitting ? "rgba(34,197,94,0.08)" : "transparent",
                  color: fbRating > 0 && fbMessage.trim().length >= 5 && !fbSubmitting ? "#22c55e" : "rgba(180,210,240,0.20)",
                  cursor: fbRating > 0 && fbMessage.trim().length >= 5 && !fbSubmitting ? "pointer" : "not-allowed",
                  boxShadow: fbRating > 0 && fbMessage.trim().length >= 5 && !fbSubmitting ? "0 0 16px rgba(34,197,94,0.12)" : "none",
                  transition: "all 0.2s",
                }}
              >
                {fbSubmitting ? "TRANSMITTING..." : "SUBMIT DEBRIEF"}
              </button>
            </div>
          )}
        </div>
      </div>
    )}

    {/* ── ROOM PANEL ────────────────────────────────────── */}
    {activeRoom && (
      <RoomPanel
        incidentId={activeRoom.incidentId}
        incidentTitle={activeRoom.incidentTitle}
        region={activeRoom.region}
        channel={selectedChannel}
        onClose={() => setActiveRoom(null)}
      />
    )}

    {/* ── AUTH UI OVERLAY ───────────────────────────────── */}
    {authUI.active && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
        <div
          style={{
            width: "420px",
            background: "rgba(0,0,0,0.85)",
            borderRadius: "4px",
            border: `1px solid rgba(${
              authUI.status === "success" ? "34,197,94" :
              authUI.status === "denied" || authUI.status === "error" ? "239,68,68" :
              "59,130,246"
            }, 0.35)`,
            boxShadow: "0 0 40px rgba(0,0,0,0.8)",
            fontFamily: "monospace",
          }}
        >
          {/* Accent line */}
          <div style={{
            height: "2px",
            background: `linear-gradient(90deg, transparent, ${
              authUI.status === "success" ? "#22c55e" :
              authUI.status === "denied" || authUI.status === "error" ? "#ef4444" :
              "#3b82f6"
            }, transparent)`,
            opacity: 0.8,
          }} />
          <div style={{ padding: "16px 20px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", paddingBottom: "12px", borderBottom: "1px solid rgba(180,210,240,0.07)" }}>
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: authUI.status === "locating" ? "#f59e0b" : authUI.status === "verifying" ? "#3b82f6" : authUI.status === "success" ? "#22c55e" : "#ef4444",
                animation: "beacon 2.4s ease-out infinite",
                boxShadow: `0 0 6px ${authUI.status === "success" ? "#22c55e" : authUI.status === "denied" ? "#ef4444" : "#3b82f6"}`,
              }} />
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: "#d4e2f0" }}>TACTICAL AUTHENTICATION</span>
            </div>
            {/* Logs */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minHeight: "100px", marginBottom: "12px" }}>
              {authUI.logs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "10px",
                    lineHeight: 1.5,
                    color: authUI.status === "denied" || authUI.status === "error" ? "#ef4444" :
                           authUI.status === "success" ? "#22c55e" : "#6ba3d0",
                    paddingLeft: "8px",
                    borderLeft: `2px solid ${
                      authUI.status === "denied" || authUI.status === "error" ? "rgba(239,68,68,0.40)" :
                      authUI.status === "success" ? "rgba(34,197,94,0.40)" : "rgba(59,130,246,0.40)"
                    }`,
                  }}
                >
                  {log}
                </div>
              ))}
            </div>
            {/* Progress bar */}
            {(authUI.status === "locating" || authUI.status === "verifying") && (
              <div style={{ width: "100%", height: "2px", background: "rgba(180,210,240,0.06)", position: "relative", overflow: "hidden" }}>
                <div
                  style={{
                    position: "absolute", top: 0, height: "100%", width: "33%",
                    background: authUI.status === "locating" ? "#f59e0b" : "#3b82f6",
                    animation: "slide-bar 1.5s infinite linear",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
