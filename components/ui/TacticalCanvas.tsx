"use client"

// Tactical live-tracking canvas overlay — ported from 미래형 전장 ui app.js.
// Draws aircraft (Flightradar24), vessels (AIS), real satellites (SGP4 via
// satellite.js), the global data-center mesh, military bases, a radar scan
// sweep, and a HUD lock on the selected target — all projected with
// map.project() so it rides on top of the (flat, grayscale) MapLibre map.

import { useEffect, useRef } from "react"
import * as satellite from "satellite.js"

export interface TacticalToggles {
  showAircraft: boolean
  showVessels: boolean
  showDataCenters: boolean
  showSatTracks: boolean
  isScanline: boolean
}

interface TacticalCanvasProps extends TacticalToggles {
  mapRef: React.MutableRefObject<any>
}

// ── Static data ──────────────────────────────────────────────────────────────
type LngLat = [number, number]

const dataCenters: { id: string; coords: LngLat; tier: number }[] = [
  { id: "ASH", coords: [-77.488, 38.97], tier: 1 }, { id: "SJC", coords: [-121.886, 37.338], tier: 1 },
  { id: "DFW", coords: [-96.872, 32.777], tier: 1 }, { id: "ORD", coords: [-87.63, 41.878], tier: 1 },
  { id: "JFK", coords: [-74.006, 40.713], tier: 1 }, { id: "SEA", coords: [-122.332, 47.606], tier: 1 },
  { id: "LAX", coords: [-118.244, 34.052], tier: 1 }, { id: "MIA", coords: [-80.192, 25.762], tier: 2 },
  { id: "ATL", coords: [-84.388, 33.749], tier: 2 }, { id: "PHX", coords: [-112.074, 33.448], tier: 2 },
  { id: "YYZ", coords: [-79.383, 43.653], tier: 2 }, { id: "YVR", coords: [-123.121, 49.283], tier: 2 },
  { id: "DEN", coords: [-104.99, 39.739], tier: 2 }, { id: "YUL", coords: [-73.567, 45.502], tier: 2 },
  { id: "AMS", coords: [4.904, 52.368], tier: 1 }, { id: "FRA", coords: [8.682, 50.111], tier: 1 },
  { id: "LHR", coords: [-0.128, 51.507], tier: 1 }, { id: "CDG", coords: [2.352, 48.857], tier: 1 },
  { id: "ARN", coords: [18.069, 59.329], tier: 2 }, { id: "ZRH", coords: [8.542, 47.377], tier: 2 },
  { id: "DUB", coords: [-6.26, 53.35], tier: 2 }, { id: "MAD", coords: [-3.704, 40.417], tier: 2 },
  { id: "MXP", coords: [9.19, 45.465], tier: 2 }, { id: "WAW", coords: [21.012, 52.23], tier: 2 },
  { id: "HEL", coords: [24.941, 60.17], tier: 2 }, { id: "OSL", coords: [10.753, 59.913], tier: 2 },
  { id: "NRT", coords: [139.692, 35.69], tier: 1 }, { id: "SIN", coords: [103.82, 1.352], tier: 1 },
  { id: "HKG", coords: [114.169, 22.319], tier: 1 }, { id: "SYD", coords: [151.209, -33.869], tier: 1 },
  { id: "ICN", coords: [126.978, 37.567], tier: 1 }, { id: "BOM", coords: [72.878, 19.076], tier: 1 },
  { id: "KIX", coords: [135.502, 34.694], tier: 2 }, { id: "TPE", coords: [121.565, 25.033], tier: 2 },
  { id: "PVG", coords: [121.474, 31.23], tier: 1 }, { id: "PEK", coords: [116.407, 39.904], tier: 2 },
  { id: "CGK", coords: [106.846, -6.209], tier: 2 }, { id: "MEL", coords: [144.963, -37.814], tier: 2 },
  { id: "DEL", coords: [77.103, 28.704], tier: 2 }, { id: "KUL", coords: [101.687, 3.139], tier: 2 },
  { id: "MNL", coords: [120.984, 14.599], tier: 2 }, { id: "BKK", coords: [100.523, 13.736], tier: 2 },
  { id: "DXB", coords: [55.271, 25.205], tier: 1 }, { id: "BAH", coords: [50.586, 26.067], tier: 2 },
  { id: "TLV", coords: [34.782, 32.085], tier: 2 },
  { id: "GRU", coords: [-46.633, -23.551], tier: 1 }, { id: "BOG", coords: [-74.072, 4.711], tier: 2 },
  { id: "SCL", coords: [-70.669, -33.449], tier: 2 }, { id: "LIM", coords: [-77.043, -12.046], tier: 2 },
  { id: "JNB", coords: [28.047, -26.204], tier: 1 }, { id: "CPT", coords: [18.424, -33.925], tier: 2 },
  { id: "NBO", coords: [36.822, -1.292], tier: 2 }, { id: "LOS", coords: [3.379, 6.524], tier: 2 },
]

const militaryBases: { name: string; coords: LngLat }[] = [
  { name: "SEOUL HQ", coords: [127.05, 37.45] },
  { name: "GYERYONGDAE", coords: [127.24, 36.29] },
  { name: "BUSAN NAVAL BASE", coords: [129.09, 35.1] },
  { name: "JEJU AIRFIELD", coords: [126.46, 33.24] },
]

const mockFlights = [
  { id: "KAL082", currentCoords: [127.12, 37.4] as LngLat, speedKnots: 430, heading: 45, altitude: 32000, acType: "B789", registration: "HL8084", origin: "LIS", dest: "ICN" },
  { id: "AAR361", currentCoords: [128.4, 36.2] as LngLat, speedKnots: 410, heading: 180, altitude: 28000, acType: "A359", registration: "HL8361", origin: "LHR", dest: "ICN" },
  { id: "JJA512", currentCoords: [126.8, 35.1] as LngLat, speedKnots: 370, heading: 270, altitude: 24000, acType: "B738", registration: "HL8051", origin: "CJU", dest: "GMP" },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Track = any

// ── Geometry helpers ─────────────────────────────────────────────────────────
function dcHaversine(c1: LngLat, c2: LngLat) {
  const R = 6371, toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(c2[1] - c1[1]), dLon = toR(c2[0] - c1[0])
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(c1[1])) * Math.cos(toR(c2[1])) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function gcPoints(c1: LngLat, c2: LngLat, n = 28): LngLat[] {
  const toR = (d: number) => (d * Math.PI) / 180, toD = (r: number) => (r * 180) / Math.PI
  const [φ1, λ1] = [toR(c1[1]), toR(c1[0])], [φ2, λ2] = [toR(c2[1]), toR(c2[0])]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2))
  if (d < 1e-6) return [c1, c2]
  const pts: LngLat[] = []
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2)
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2)
    const z = A * Math.sin(φ1) + B * Math.sin(φ2)
    pts.push([toD(Math.atan2(y, x)), toD(Math.atan2(z, Math.sqrt(x * x + y * y)))])
  }
  return pts
}

function getSatPos(satrec: satellite.SatRec, date: Date) {
  try {
    const pv = satellite.propagate(satrec, date)
    if (!pv || !pv.position || typeof pv.position === "boolean") return null
    const gmst = satellite.gstime(date)
    const geo = satellite.eciToGeodetic(pv.position, gmst)
    return { lon: satellite.degreesLong(geo.longitude), lat: satellite.degreesLat(geo.latitude), alt: geo.height }
  } catch {
    return null
  }
}

export default function TacticalCanvas({
  mapRef,
  showAircraft,
  showVessels,
  showDataCenters,
  showSatTracks,
  isScanline,
}: TacticalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Live state kept in refs so the rAF loop reads the latest without re-binding
  const togglesRef = useRef({ showAircraft, showVessels, showDataCenters, showSatTracks, isScanline })
  togglesRef.current = { showAircraft, showVessels, showDataCenters, showSatTracks, isScanline }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dronesRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vesselsRef = useRef<any[]>([])
  const satObjectsRef = useRef<{ name: string; satrec: satellite.SatRec; pastTrack: Track[]; futureTrack: Track[] }[]>([])
  const dcConnectionsRef = useRef<{ a: { coords: LngLat }; b: { coords: LngLat }; pts: LngLat[] }[] | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedRef = useRef<any>(null)
  const satTrackLastUpdateRef = useRef(0)
  const scanProgressRef = useRef(0)
  const fonts = useRef({ mono: '"Share Tech Mono", monospace', orbitron: '"Orbitron", sans-serif' })

  useEffect(() => {
    if (typeof window === "undefined") return
    const cs = getComputedStyle(document.documentElement)
    const mono = cs.getPropertyValue("--font-share-tech-mono").trim()
    const orb = cs.getPropertyValue("--font-orbitron").trim()
    fonts.current = {
      mono: mono ? `${mono}, monospace` : '"Share Tech Mono", monospace',
      orbitron: orb ? `${orb}, sans-serif` : '"Orbitron", sans-serif',
    }
  }, [])

  // ── Data fetching ────────────────────────────────────────────────────────
  useEffect(() => {
    // mock seed so something shows before the first live fetch resolves
    dronesRef.current = mockFlights.map((f) => ({
      ...f, currentCoords: [...f.currentCoords] as LngLat,
      velocity: f.speedKnots * 0.514444, path: [] as LngLat[], isMock: true, isGrounded: false,
    }))

    const fetchFlights = async () => {
      try {
        const [civRes, milRes] = await Promise.allSettled([
          fetch("/api/flights"),
          fetch("/api/military-flights")
        ])
        
        let newDrones: any[] = []
        const prevPaths: Record<string, LngLat[]> = {}
        dronesRef.current.forEach((d) => { prevPaths[d.id] = d.path })

        if (civRes.status === "fulfilled" && civRes.value.ok) {
          const data = await civRes.value.json()
          if (data) {
            const keys = Object.keys(data).filter((k) => k !== "version" && k !== "full_count" && k !== "stats")
            const civDrones = keys.map((key) => {
              const f = data[key]
              const callsign = (f[13] || f[16] || key).trim()
              const lon = f[2], lat = f[1], altFeet = f[4] || 0, speedKnots = f[5] || 0
              const isGrounded = altFeet < 200 && speedKnots < 30
              const path = prevPaths[callsign] || []
              if (!isGrounded) { path.push([lon, lat]); if (path.length > 20) path.shift() }
              return {
                id: callsign, currentCoords: [lon, lat] as LngLat, velocity: isGrounded ? 0 : speedKnots * 0.514444,
                speedKnots, heading: Math.round(f[3] || 0), altitude: altFeet, acType: f[8] || "N/A",
                registration: f[9] || "N/A", origin: f[11] || "N/A", dest: f[12] || "N/A", path, isMock: false, isGrounded, isMilitary: false
              }
            })
            newDrones = [...newDrones, ...civDrones]
          }
        }

        if (milRes.status === "fulfilled" && milRes.value.ok) {
          const milData = await milRes.value.json()
          if (milData && milData.ac) {
            const milDrones = milData.ac.map((f: any) => {
              const callsign = (f.flight || f.r || f.hex || "").trim()
              const lon = f.lon, lat = f.lat
              const altFeet = f.alt_baro === "ground" ? 0 : (f.alt_baro || 0)
              const speedKnots = f.gs || 0
              const isGrounded = altFeet < 200 && speedKnots < 30
              const path = prevPaths[callsign] || []
              if (!isGrounded) { path.push([lon, lat]); if (path.length > 20) path.shift() }

              const t = (f.t || "").toUpperCase();
              let role = "OTHER";
              if (/F16|F15|F35|F22|EUFI|HAWK|T38|A10|F18|SU27|MIG|JAS|RAF/.test(t)) role = "FIGHTER";
              else if (/H64|H60|H47|V22|LYNX|UH|AH|CH|SH|AW|EC/.test(t)) role = "ROTORCRAFT";
              else if (/C17|C130|C30J|A400|C5|KC|A332|DC3|IL76|AN/.test(t)) role = "CARGO";
              else if (/P8|R135|E3|E8|U2|RQ4|MQ9|RC135|EP3/.test(t)) role = "RECON";

              let milColors = { baseStroke: "rgba(217, 70, 239, 0.9)", baseFill: "rgba(217, 70, 239, 0.3)", textFill: "rgba(217, 70, 239, 0.9)", lineStroke: "rgba(217, 70, 239, 0.7)" };
              if (role === "FIGHTER") milColors = { baseStroke: "rgba(239, 68, 68, 0.9)", baseFill: "rgba(239, 68, 68, 0.3)", textFill: "rgba(239, 68, 68, 0.9)", lineStroke: "rgba(239, 68, 68, 0.7)" };
              else if (role === "ROTORCRAFT") milColors = { baseStroke: "rgba(245, 158, 11, 0.9)", baseFill: "rgba(245, 158, 11, 0.3)", textFill: "rgba(245, 158, 11, 0.9)", lineStroke: "rgba(245, 158, 11, 0.7)" };
              else if (role === "CARGO") milColors = { baseStroke: "rgba(59, 130, 246, 0.9)", baseFill: "rgba(59, 130, 246, 0.3)", textFill: "rgba(59, 130, 246, 0.9)", lineStroke: "rgba(59, 130, 246, 0.7)" };
              else if (role === "RECON") milColors = { baseStroke: "rgba(16, 185, 129, 0.9)", baseFill: "rgba(16, 185, 129, 0.3)", textFill: "rgba(16, 185, 129, 0.9)", lineStroke: "rgba(16, 185, 129, 0.7)" };

              return {
                id: callsign, currentCoords: [lon, lat] as LngLat, velocity: isGrounded ? 0 : speedKnots * 0.514444,
                speedKnots, heading: Math.round(f.track || 0), altitude: altFeet, acType: f.t || "MIL",
                registration: f.r || "N/A", origin: "MIL", dest: "MIL", path, isMock: false, isGrounded, isMilitary: true,
                milRole: role, milColors
              }
            }).filter((d: any) => d.id && d.currentCoords[0] && d.currentCoords[1])
            newDrones = [...newDrones, ...milDrones]
          }
        }

        if (newDrones.length > 0) {
          dronesRef.current = newDrones
          if (selectedRef.current && !selectedRef.current.isVessel) {
            const upd = dronesRef.current.find((d) => d.id === selectedRef.current.id)
            if (upd) selectedRef.current = upd
          }
        }
      } catch { /* keep simulation */ }
    }

    const fetchVessels = async () => {
      try {
        const res = await fetch("/api/vessels")
        if (!res.ok) throw new Error("vessels")
        const data = await res.json()
        if (!data?.data?.rows) return
        const prevPaths: Record<string, LngLat[]> = {}
        vesselsRef.current.forEach((v) => { prevPaths[v.id] = v.path })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = data.data.rows.filter((r: any) => {
          const name = (r.SHIPNAME || "").trim()
          if (!name || name === "[SAT-AIS]") return false
          const type = (r.TYPE_NAME || "").toLowerCase(), shipType = r.SHIPTYPE || ""
          const length = parseInt(r.LENGTH || 0), dwt = parseInt(r.DWT || 0)
          const isCargo = shipType === "7" || type.includes("cargo")
          const isTanker = shipType === "8" || type.includes("tanker")
          const isPassenger = shipType === "6" || type.includes("passenger")
          const isSpecial = shipType === "4" || shipType === "3" || type.includes("military") || type.includes("rescue") || type.includes("special")
          return (isCargo || isTanker || isPassenger || isSpecial) && (length >= 100 || dwt >= 10000 || isCargo || isTanker)
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vesselsRef.current = rows.map((r: any) => {
          const name = r.SHIPNAME.trim(), lat = parseFloat(r.LAT), lon = parseFloat(r.LON)
          const speedKnots = parseFloat(r.SPEED || 0) / 10
          const statusName = (r.STATUS_NAME || "").toLowerCase()
          const isDocked = speedKnots < 0.5 || statusName === "moored" || statusName === "at anchor"
          let type = r.TYPE_NAME
          if (!type) type = r.SHIPTYPE === "7" ? "Cargo Vessel" : r.SHIPTYPE === "8" ? "Tanker" : r.SHIPTYPE === "6" ? "Passenger Vessel" : r.SHIPTYPE === "3" ? "Special Craft" : r.SHIPTYPE === "4" ? "High Speed Craft" : "Vessel"
          const path = prevPaths[name] || []
          if (!isDocked) { path.push([lon, lat]); if (path.length > 20) path.shift() }
          return {
            id: name, currentCoords: [lon, lat] as LngLat, velocity: isDocked ? 0 : speedKnots * 0.514444,
            heading: parseInt(r.HEADING || r.COURSE || 0), altitude: 0, acType: type,
            registration: `${r.FLAG || "N/A"} | L:${r.LENGTH || "N/A"}m W:${r.WIDTH || "N/A"}m`,
            origin: "AIS", dest: r.DESTINATION || "N/A", dwt: r.DWT || "N/A", path, isVessel: true, isDocked,
          }
        })
        if (selectedRef.current?.isVessel) {
          const upd = vesselsRef.current.find((v) => v.id === selectedRef.current.id)
          if (upd) selectedRef.current = upd
        }
      } catch { /* ignore */ }
    }

    const fetchSats = async () => {
      try {
        const res = await fetch("/api/satellites")
        if (!res.ok) throw new Error("sats")
        const data = await res.json()
        if (!Array.isArray(data) || data.length === 0) return
        satObjectsRef.current = data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((s: any) => {
            try {
              return { name: s.name.trim(), satrec: satellite.twoline2satrec(s.tle1, s.tle2), pastTrack: [], futureTrack: [] }
            } catch { return null }
          })
          .filter(Boolean) as typeof satObjectsRef.current
        satTrackLastUpdateRef.current = 0
      } catch { /* ignore */ }
    }

    fetchFlights(); fetchVessels(); fetchSats()
    const fInt = setInterval(fetchFlights, 20000)
    const vInt = setInterval(fetchVessels, 30000)
    const sInt = setInterval(fetchSats, 3600000)
    return () => { clearInterval(fInt); clearInterval(vInt); clearInterval(sInt) }
  }, [])

  // ── Click selection (hit-test via map.project) ─────────────────────────────
  useEffect(() => {
    let map: any = null
    let attached = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onClick = (e: any) => {
      const m = mapRef.current
      if (!m) return
      const zoom = m.getZoom()
      const px = e.point.x, py = e.point.y
      const altPxPerKm = (3.0 * Math.pow(2, zoom)) / 126.59
      let hit: any = null
      if (togglesRef.current.showAircraft) {
        for (const d of dronesRef.current) {
          const sp = m.project(d.currentCoords)
          const altPx = d.isGrounded ? 0 : (d.altitude || 0) * 0.0003048 * altPxPerKm
          if (Math.hypot(px - sp.x, py - (sp.y - altPx)) < 15) { hit = d; break }
        }
      }
      if (!hit && togglesRef.current.showVessels) {
        for (const v of vesselsRef.current) {
          const sp = m.project(v.currentCoords)
          if (Math.hypot(px - sp.x, py - sp.y) < 15) { hit = v; break }
        }
      }
      if (hit) selectedRef.current = hit
      else selectedRef.current = null
    }
    const tryAttach = () => {
      map = mapRef.current
      if (map && typeof map.on === "function" && !attached) {
        map.on("click", onClick)
        attached = true
        return true
      }
      return false
    }
    let poll: ReturnType<typeof setInterval> | null = null
    if (!tryAttach()) poll = setInterval(() => { if (tryAttach() && poll) { clearInterval(poll); poll = null } }, 300)
    return () => {
      if (poll) clearInterval(poll)
      if (map && attached && typeof map.off === "function") map.off("click", onClick)
    }
  }, [mapRef])

  // ── Render loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    let lastTime = 0
    const SAT_INTERVAL = 30000

    const draw = (time: number) => {
      const canvas = canvasRef.current
      const map = mapRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const width = canvas.clientWidth, height = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (width > 0 && (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr))) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      let mapReady = false
      try {
        if (map && typeof map.project === "function") {
          const p = map.project([0, 0])
          mapReady = Number.isFinite(p.x) && Number.isFinite(p.y)
        }
      } catch { /* transform not ready yet */ }
      if (!mapReady) return

      const t = togglesRef.current
      const dt = lastTime ? (time - lastTime) / 1000 : 0
      lastTime = time
      const zoom = map.getZoom()
      const altPxPerKm = (3.0 * Math.pow(2, zoom)) / 126.59
      const bearing = map.getBearing()

      // Position extrapolation
      for (const d of dronesRef.current) {
        const hr = d.heading * (Math.PI / 180)
        const latSpeed = (d.velocity / 111000) * dt
        const lonSpeed = (d.velocity / (111000 * Math.cos(d.currentCoords[1] * Math.PI / 180))) * dt
        d.currentCoords[0] += Math.sin(hr) * lonSpeed
        d.currentCoords[1] += Math.cos(hr) * latSpeed
        if (d.isMock && (d.currentCoords[0] < 124 || d.currentCoords[0] > 131 || d.currentCoords[1] < 33 || d.currentCoords[1] > 39)) {
          const mk = mockFlights[Math.floor(Math.random() * mockFlights.length)]
          d.currentCoords = [...mk.currentCoords]; d.heading = mk.heading; d.path = []
        }
      }
      for (const v of vesselsRef.current) {
        const hr = v.heading * (Math.PI / 180)
        const latSpeed = (v.velocity / 111000) * dt
        const lonSpeed = (v.velocity / (111000 * Math.cos(v.currentCoords[1] * Math.PI / 180))) * dt
        v.currentCoords[0] += Math.sin(hr) * lonSpeed
        v.currentCoords[1] += Math.cos(hr) * latSpeed
      }

      if (t.isScanline) scanProgressRef.current = (time * 0.0006) % 1.0

      if (t.showDataCenters) drawDataCenters(ctx, map, width, height, time, dcConnectionsRef, fonts.current.mono)
      drawSatellites(ctx, map, width, height, time, satObjectsRef, satTrackLastUpdateRef, SAT_INTERVAL, t.showSatTracks, fonts.current.mono)
      drawBases(ctx, map, width, height, fonts.current.orbitron)
      if (t.showAircraft) drawDrones(ctx, map, width, height, dronesRef.current, selectedRef.current, altPxPerKm, bearing, fonts.current.mono)
      if (t.showVessels) drawVessels(ctx, map, width, height, vesselsRef.current, selectedRef.current, fonts.current.mono)
      if (selectedRef.current) drawTargetDetails(ctx, map, width, height, selectedRef.current, altPxPerKm, fonts.current.mono)
      if (t.isScanline) drawScanSweep(ctx, width, height, scanProgressRef.current)
    }
    // rAF gives a smooth, map-synced redraw when the tab is visible.
    const tick = (time: number) => { draw(time); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    // Fallback keeps the overlay live when rAF is paused (hidden/backgrounded
    // tab — browsers suspend requestAnimationFrame there). Throttled to ~2fps
    // by the browser in that state; redundant but harmless while visible.
    const fallback = setInterval(() => draw(performance.now()), 500)
    return () => { cancelAnimationFrame(raf); clearInterval(fallback) }
  }, [mapRef])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 4 }} />
}

// ── Draw routines (ported from app.js, CSS-pixel space) ───────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawDataCenters(ctx: CanvasRenderingContext2D, map: any, w: number, h: number, time: number, connRef: React.MutableRefObject<any>, monoFont: string) {
  if (!connRef.current) {
    const K = 4, pairs = new Set<string>()
    dataCenters.forEach((a, i) => {
      dataCenters.map((b, j) => ({ j, d: dcHaversine(a.coords, b.coords) }))
        .filter((n) => n.j !== i).sort((x, y) => x.d - y.d).slice(0, K)
        .forEach((n) => pairs.add(i < n.j ? `${i}-${n.j}` : `${n.j}-${i}`))
    })
    connRef.current = [...pairs].map((key) => {
      const [i, j] = key.split("-").map(Number)
      return { a: dataCenters[i], b: dataCenters[j], pts: gcPoints(dataCenters[i].coords, dataCenters[j].coords) }
    })
  }
  const conns = connRef.current as { a: { coords: LngLat }; b: { coords: LngLat }; pts: LngLat[] }[]
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(time * 0.0007))
  ctx.save()
  ctx.shadowColor = "rgba(255,255,255,0.9)"; ctx.shadowBlur = 6; ctx.lineCap = "round"
  conns.forEach((conn) => {
    const spA = map.project(conn.a.coords), spB = map.project(conn.b.coords)
    const margin = 150
    if (Math.max(spA.x, spB.x) < -margin || Math.min(spA.x, spB.x) > w + margin || Math.max(spA.y, spB.y) < -margin || Math.min(spA.y, spB.y) > h + margin) return
    const isTrans = Math.abs(conn.a.coords[0] - conn.b.coords[0]) > 60
    ctx.lineWidth = isTrans ? 1.4 : 1.0
    ctx.strokeStyle = `rgba(255,255,255,${((isTrans ? 0.85 : 0.55) * pulse).toFixed(3)})`
    ctx.beginPath()
    let first = true, prevLon: number | null = null
    const step = 2
    for (let i = 0; i < conn.pts.length; i += step) {
      const pt = conn.pts[i]
      if (prevLon !== null && Math.abs(pt[0] - prevLon) > 180) { ctx.stroke(); ctx.beginPath(); first = true }
      const sp = map.project(pt)
      if (first) { ctx.moveTo(sp.x, sp.y); first = false } else ctx.lineTo(sp.x, sp.y)
      prevLon = pt[0]
    }
    ctx.stroke()
  })
  ctx.restore()
  dataCenters.forEach((dc) => {
    const sp = map.project(dc.coords)
    if (sp.x < -30 || sp.x > w + 30 || sp.y < -30 || sp.y > h + 30) return
    const isSeoul = dc.id === "ICN", s = dc.tier === 1 ? 5 : 3
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(Math.PI / 4)
    ctx.strokeStyle = isSeoul ? "rgba(255,255,255,1.0)" : dc.tier === 1 ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.38)"
    ctx.lineWidth = isSeoul ? 1.8 : dc.tier === 1 ? 1.1 : 0.7
    ctx.strokeRect(-s, -s, s * 2, s * 2); ctx.restore()
    if (dc.tier === 1) { ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.5, 0, Math.PI * 2); ctx.fill() }
    ctx.font = `${dc.tier === 1 ? 8 : 7}px ${monoFont}`
    ctx.fillStyle = dc.tier === 1 ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.35)"
    ctx.fillText(dc.id, sp.x + s + 5, sp.y + 3)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawSatTrack(ctx: CanvasRenderingContext2D, map: any, track: { lon: number; lat: number }[]) {
  if (track.length < 2) return
  ctx.beginPath()
  let first = true, prevLon: number | null = null
  const step = 2
  for (let i = 0; i < track.length; i += step) {
    const pt = track[i]
    if (prevLon !== null && Math.abs(pt.lon - prevLon) > 180) { ctx.stroke(); ctx.beginPath(); first = true }
    const sp = map.project([pt.lon, pt.lat])
    if (first) { ctx.moveTo(sp.x, sp.y); first = false } else ctx.lineTo(sp.x, sp.y)
    prevLon = pt.lon
  }
  ctx.stroke()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawSatellites(ctx: CanvasRenderingContext2D, map: any, w: number, h: number, time: number, satsRef: React.MutableRefObject<any[]>, lastUpdRef: React.MutableRefObject<number>, interval: number, showTracks: boolean, monoFont: string) {
  const sats = satsRef.current
  if (sats.length === 0) return
  if (time - lastUpdRef.current > interval) {
    const now = new Date()
    sats.forEach((sat) => {
      const past: { lon: number; lat: number; alt: number }[] = [], future: { lon: number; lat: number; alt: number }[] = []
      for (let m = -24; m <= 0; m += 2) { const p = getSatPos(sat.satrec, new Date(now.getTime() + m * 60000)); if (p) past.push(p) }
      for (let m = 0; m <= 80; m += 2) { const p = getSatPos(sat.satrec, new Date(now.getTime() + m * 60000)); if (p) future.push(p) }
      sat.pastTrack = past; sat.futureTrack = future
    })
    lastUpdRef.current = time
  }
  const now = new Date()
  sats.forEach((sat) => {
    const cur = getSatPos(sat.satrec, now)
    if (!cur) return
    const sp = map.project([cur.lon, cur.lat])
    if (sp.x < -1500 || sp.x > w + 1500 || sp.y < -1500 || sp.y > h + 1500) return
    if (showTracks) {
      ctx.save(); ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.setLineDash([]); drawSatTrack(ctx, map, sat.pastTrack); ctx.restore()
      ctx.save(); ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(255,255,255,0.32)"; ctx.setLineDash([5, 7]); drawSatTrack(ctx, map, sat.futureTrack); ctx.setLineDash([]); ctx.restore()
    }
    if (sp.x < -60 || sp.x > w + 60 || sp.y < -60 || sp.y > h + 60) return
    ctx.save(); ctx.translate(sp.x, sp.y)
    ctx.strokeStyle = "rgba(255,255,255,0.92)"; ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1.0
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-7, 0); ctx.moveTo(4, 0); ctx.lineTo(7, 0); ctx.stroke()
    ctx.beginPath(); ctx.rect(-15, -3.5, 8, 7); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.rect(7, -3.5, 8, 7); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.rect(-4, -4, 8, 8); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -8); ctx.stroke()
    ctx.beginPath(); ctx.arc(0, -9, 1.6, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
    ctx.save(); ctx.font = `8px ${monoFont}`
    ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.fillText(sat.name, sp.x + 14, sp.y - 2)
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillText(`${Math.round(cur.alt)} km`, sp.x + 14, sp.y + 9); ctx.restore()
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawBases(ctx: CanvasRenderingContext2D, map: any, w: number, h: number, orbFont: string) {
  ctx.font = `9px ${orbFont}`; ctx.fillStyle = "#ffffff"
  militaryBases.forEach((base) => {
    const sp = map.project(base.coords)
    if (sp.x < 0 || sp.x > w || sp.y < 0 || sp.y > h) return
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2)
    ctx.moveTo(sp.x - 7, sp.y); ctx.lineTo(sp.x + 7, sp.y); ctx.moveTo(sp.x, sp.y - 7); ctx.lineTo(sp.x, sp.y + 7); ctx.stroke()
    ctx.fillText(base.name, sp.x + 10, sp.y + 3)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawDrones(ctx: CanvasRenderingContext2D, map: any, w: number, h: number, drones: any[], selected: any, altPxPerKm: number, bearing: number, monoFont: string) {
  const bounds = map.getBounds()
  const wLon = bounds.getWest() - 2, eLon = bounds.getEast() + 2
  const sLat = bounds.getSouth() - 2, nLat = bounds.getNorth() + 2
  
  drones.forEach((d) => {
    if (selected && selected.id !== d.id) return
    const [lon, lat] = d.currentCoords
    if (!(selected && selected.id === d.id)) {
      let isOut = false
      if (wLon <= eLon) { if (lon < wLon || lon > eLon) isOut = true }
      else { if (lon > eLon && lon < wLon) isOut = true } // crosses antimeridian
      if (lat < sLat || lat > nLat) isOut = true
      
      if (isOut) return
      if (d.isGrounded && map.getZoom() < 10) return
    }
    const sp = map.project(d.currentCoords)
    if (sp.x < 0 || sp.x > w || sp.y < 0 || sp.y > h) return
    const isSelected = selected && selected.id === d.id
    if (d.isGrounded) {
      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(170,170,170,0.4)"; ctx.lineWidth = isSelected ? 1.5 : 0.8
      const gs = 4
      ctx.beginPath(); ctx.moveTo(sp.x - gs, sp.y - gs); ctx.lineTo(sp.x + gs, sp.y + gs); ctx.moveTo(sp.x + gs, sp.y - gs); ctx.lineTo(sp.x - gs, sp.y + gs); ctx.stroke()
      ctx.font = `7px ${monoFont}`; ctx.fillStyle = isSelected ? "rgba(255,255,255,0.9)" : "rgba(160,160,160,0.5)"; ctx.fillText(`[G] ${d.id}`, sp.x + 8, sp.y + 3)
    } else {
      const altPx = (d.altitude || 0) * 0.0003048 * altPxPerKm
      const liftX = sp.x, liftY = sp.y - altPx
      if (altPx > 3) {
        ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 0.6; ctx.setLineDash([2, 5])
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(liftX, liftY); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = "rgba(255,255,255,0.20)"; ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      }
      if (d.path.length > 1) {
        ctx.beginPath(); ctx.lineWidth = 0.7; ctx.strokeStyle = "rgba(255,255,255,0.10)"
        const st = map.project(d.path[0]); ctx.moveTo(st.x, st.y)
        for (let i = 1; i < d.path.length; i += 2) { const p = map.project(d.path[i]); ctx.lineTo(p.x, p.y) }
        ctx.stroke()
      }
      const hr = (d.heading - bearing) * (Math.PI / 180)
      ctx.save(); ctx.translate(liftX, liftY); ctx.rotate(hr)
      
      let baseStroke = "rgba(255,255,255,0.65)"
      let baseFill = "rgba(255,255,255,0.08)"
      let textFill = "rgba(255,255,255,0.8)"
      let lineStroke = "rgba(255,255,255,0.6)"

      if (d.isMilitary && d.milColors) {
        baseStroke = d.milColors.baseStroke;
        baseFill = d.milColors.baseFill;
        textFill = d.milColors.textFill;
        lineStroke = d.milColors.lineStroke;
      }

      ctx.strokeStyle = isSelected ? "#ffffff" : baseStroke; ctx.fillStyle = isSelected ? "rgba(255,255,255,0.25)" : baseFill; ctx.lineWidth = 1.0
      ctx.beginPath()
      ctx.moveTo(0, -7); ctx.lineTo(-1, -4); ctx.lineTo(-1, 0); ctx.lineTo(-8, 2); ctx.lineTo(-8, 3.5); ctx.lineTo(-1, 2); ctx.lineTo(-1, 5)
      ctx.lineTo(-3.5, 6.5); ctx.lineTo(-3.5, 7.5); ctx.lineTo(0, 6.5); ctx.lineTo(3.5, 7.5); ctx.lineTo(3.5, 6.5); ctx.lineTo(1, 5)
      ctx.lineTo(1, 2); ctx.lineTo(8, 3.5); ctx.lineTo(8, 2); ctx.lineTo(1, 0); ctx.lineTo(1, -4); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = isSelected ? "#ffffff" : lineStroke; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, -17); ctx.stroke(); ctx.restore()
      if (isSelected) { ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(liftX, liftY, 11, 0, Math.PI * 2); ctx.stroke(); ctx.restore() }
      ctx.font = `9px ${monoFont}`; ctx.fillStyle = textFill; ctx.fillText(d.id, liftX + 12, liftY - 3)
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawVessels(ctx: CanvasRenderingContext2D, map: any, w: number, h: number, vessels: any[], selected: any, monoFont: string) {
  const zoom = map.getZoom()
  const bounds = map.getBounds()
  const wLon = bounds.getWest() - 2, eLon = bounds.getEast() + 2
  const sLat = bounds.getSouth() - 2, nLat = bounds.getNorth() + 2
  
  vessels.forEach((v) => {
    if (selected && selected.id !== v.id) return
    const [lon, lat] = v.currentCoords
    if (!(selected && selected.id === v.id)) {
      let isOut = false
      if (wLon <= eLon) { if (lon < wLon || lon > eLon) isOut = true }
      else { if (lon > eLon && lon < wLon) isOut = true }
      if (lat < sLat || lat > nLat) isOut = true
      
      if (isOut) return
      if (v.isDocked && zoom < 10) return
      const dwtVal = parseInt(v.dwt) || 0
      let hash = 0
      for (let i = 0; i < v.id.length; i++) hash = (hash * 31 + v.id.charCodeAt(i)) % 100
      if (!v.isDocked) {
        if (zoom >= 9) { /* all */ }
        else if (zoom >= 8) { if (!(hash < 70 || dwtVal >= 30000)) return }
        else if (zoom >= 7) { if (!(hash < 40 || dwtVal >= 50000)) return }
        else if (zoom >= 6) { if (!(hash < 20 || dwtVal >= 80000)) return }
        else { if (!(hash < 8 || dwtVal >= 120000)) return }
      }
    }
    const sp = map.project(v.currentCoords)
    if (sp.x < 0 || sp.x > w || sp.y < 0 || sp.y > h) return
    if (v.path.length > 1) {
      ctx.beginPath(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.1)"
      const st = map.project(v.path[0]); ctx.moveTo(st.x, st.y)
      for (let i = 1; i < v.path.length; i += 2) { const p = map.project(v.path[i]); ctx.lineTo(p.x, p.y) }
      ctx.stroke()
    }
    const isSelected = selected && selected.id === v.id
    if (v.isDocked) {
      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(180,180,180,0.4)"; ctx.lineWidth = isSelected ? 1.5 : 0.8
      const ds = 4; ctx.strokeRect(sp.x - ds, sp.y - ds, ds * 2, ds * 2)
      ctx.fillStyle = isSelected ? "#ffffff" : "rgba(180,180,180,0.5)"; ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.font = `7px ${monoFont}`; ctx.fillStyle = isSelected ? "rgba(255,255,255,0.9)" : "rgba(160,160,160,0.6)"; ctx.fillText(`[P] ${v.id}`, sp.x + 8, sp.y + 3)
    } else {
      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255,255,255,0.5)"; ctx.lineWidth = isSelected ? 1.5 : 1
      const size = 6
      ctx.beginPath(); ctx.moveTo(sp.x, sp.y - size); ctx.lineTo(sp.x + size, sp.y); ctx.lineTo(sp.x, sp.y + size); ctx.lineTo(sp.x - size, sp.y); ctx.closePath(); ctx.stroke()
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2); ctx.fill()
      ctx.font = `8px ${monoFont}`; ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillText(v.id, sp.x + 10, sp.y + 3)
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawTargetDetails(ctx: CanvasRenderingContext2D, map: any, w: number, h: number, d: any, altPxPerKm: number, monoFont: string) {
  const sp = map.project(d.currentCoords)
  const altPx = (d.isVessel || d.isGrounded) ? 0 : (d.altitude || 0) * 0.0003048 * altPxPerKm
  const tx = sp.x, ty = sp.y - altPx
  if (tx < 0 || tx > w || ty < -200 || ty > h + 200) return
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5
  const size = 20
  ctx.beginPath()
  ctx.moveTo(tx - size, ty - size + 6); ctx.lineTo(tx - size, ty - size); ctx.lineTo(tx - size + 6, ty - size)
  ctx.moveTo(tx + size, ty - size + 6); ctx.lineTo(tx + size, ty - size); ctx.lineTo(tx + size - 6, ty - size)
  ctx.moveTo(tx - size, ty + size - 6); ctx.lineTo(tx - size, ty + size); ctx.lineTo(tx - size + 6, ty + size)
  ctx.moveTo(tx + size, ty + size - 6); ctx.lineTo(tx + size, ty + size); ctx.lineTo(tx + size - 6, ty + size); ctx.stroke()
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(tx + size, ty); ctx.lineTo(tx + size + 35, ty - 35); ctx.lineTo(tx + size + 130, ty - 35); ctx.stroke()
  ctx.font = `9px ${monoFont}`; ctx.fillStyle = "#ffffff"
  const X = tx + size + 40
  if (d.isVessel) {
    ctx.fillText(`LOCK: ACTIVE [NAVAL]`, X, ty - 40); ctx.fillText(`VESSEL: ${d.id}`, X, ty - 30)
    ctx.fillText(`TYPE: ${d.acType || "N/A"}`, X, ty - 20); ctx.fillText(`DIM: ${d.registration || "N/A"}`, X, ty - 10)
    ctx.fillText(`DWT: ${d.dwt ? parseInt(d.dwt).toLocaleString() + " tons" : "N/A"}`, X, ty)
    ctx.fillText(`SPEED: ${(d.velocity / 0.514444).toFixed(1)} kt`, X, ty + 10)
    ctx.fillText(`LAT: ${d.currentCoords[1].toFixed(4)}°N`, X, ty + 20); ctx.fillText(`LON: ${d.currentCoords[0].toFixed(4)}°E`, X, ty + 30)
  } else {
    ctx.fillText(`LOCK: ACTIVE [AIR]`, X, ty - 40); ctx.fillText(`FLIGHT: ${d.id}`, X, ty - 30)
    ctx.fillText(`TYPE: ${d.acType || "N/A"} [${d.registration || "N/A"}]`, X, ty - 20)
    ctx.fillText(`ROUTE: ${d.origin || "N/A"} > ${d.dest || "N/A"}`, X, ty - 10)
    ctx.fillText(`ALTITUDE: ${d.isGrounded ? "ON GROUND" : (d.altitude || 0).toLocaleString() + " ft"}`, X, ty)
    const kt = d.speedKnots !== undefined ? Math.round(d.speedKnots) : Math.round(d.velocity / 0.514444)
    ctx.fillText(`SPEED: ${kt} kt / ${Math.round(kt * 1.15078)} mph`, X, ty + 10)
    ctx.fillText(`LAT: ${d.currentCoords[1].toFixed(4)}°N`, X, ty + 20); ctx.fillText(`LON: ${d.currentCoords[0].toFixed(4)}°E`, X, ty + 30)
  }
}

function drawScanSweep(ctx: CanvasRenderingContext2D, w: number, h: number, progress: number) {
  const y = h * progress
  const grad = ctx.createLinearGradient(0, y - 100, 0, y + 5)
  grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(0.95, "rgba(255,255,255,0.05)"); grad.addColorStop(1, "rgba(255,255,255,0.4)")
  ctx.fillStyle = grad; ctx.fillRect(0, y - 100, w, 105)
  ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
}
