'use client'

import React, { useEffect, useState, useRef, useCallback } from "react"
import { Map, MapMarker, MarkerContent, MarkerPopup } from "@/components/ui/map"
import { TacticalEvent } from "./NewsFeed"

// 🛰️ 고해상도 실제 위성 지구본 스타일 사양 (ESRI World Imagery + Boundaries & Places)
const satelliteStyle: any = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
    },
    boundaries: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Tiles &copy; Esri"
    }
  },
  layers: [
    {
      id: "satellite-layer",
      type: "raster",
      source: "satellite",
      minzoom: 0,
      maxzoom: 20
    },
    {
      id: "boundaries-layer",
      type: "raster",
      source: "boundaries",
      minzoom: 0,
      maxzoom: 20
    }
  ]
}

// 🛰️ 2D Canvas 드로잉을 위한 MapLibre 투영 행렬 캡처용 Custom Layer 정의
class MatrixCapturerLayer {
  id = "threejs-orbit-layer";
  type = "custom" as const;
  renderingMode = "3d" as const;
  map: any = null;
  onDrawCanvas: ((matrix: number[]) => void) | null = null;

  onAdd(map: any, gl: WebGLRenderingContext) {
    this.map = map;
  }

  render(gl: WebGLRenderingContext, matrix: number[]) {
    if (this.onDrawCanvas && this.map) {
      this.onDrawCanvas(matrix);
    }
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  onRemove() {
    this.map = null;
    this.onDrawCanvas = null;
  }
}

let threeOrbitLayer: MatrixCapturerLayer | null = null;
if (typeof window !== "undefined") {
  threeOrbitLayer = new MatrixCapturerLayer();
}

// 3차원 Cartesian 좌표계 상의 원형 궤도 상의 점 계산 (경사각 포함)
function getOrbitCartesianPoint(theta: number, radiusScale: number, incX: number, incY: number) {
  const Re = 1.0 / (2.0 * Math.PI); // 지구 반지름 R ≒ 0.15915
  const Ro = Re * radiusScale;
  
  const x0 = Ro * Math.cos(theta);
  const y0 = Ro * Math.sin(theta);
  const z0 = 0;
  
  // X축 회전 (경사각 incX)
  const radX = incX * Math.PI / 180;
  const x1 = x0;
  const y1 = y0 * Math.cos(radX) - z0 * Math.sin(radX);
  const z1 = y0 * Math.sin(radX) + z0 * Math.cos(radX);
  
  // Y축 회전 (경사각 incY)
  const radY = incY * Math.PI / 180;
  const x2 = x1 * Math.cos(radY) + z1 * Math.sin(radY);
  const y2 = y1;
  const z2 = -x1 * Math.sin(radY) + z1 * Math.cos(radY);
  
  // 지구 중심 (0.5, 0.5, 0)을 기준으로 한 Cartesian 좌표 반환
  return [x2 + 0.5, y2 + 0.5, z2];
}

// 3D Cartesian 좌표를 3D Mercator 좌표로 역변환
function cartesianToMercator(X: number, Y: number, Z: number, radiusScale: number) {
  const length = Math.sqrt(X * X + Y * Y + Z * Z);
  const nx = X / length;
  const ny = Y / length;
  const nz = Z / length;

  const lat = Math.asin(ny);
  const lng = Math.atan2(nx, nz);

  const x = lng / (2.0 * Math.PI) + 0.5;
  
  // 북극/남극 무한대 널러 가드
  const latClamp = Math.max(-0.999 * Math.PI / 2, Math.min(0.999 * Math.PI / 2, lat));
  const y = 0.5 - Math.log(Math.tan(Math.PI / 4 + latClamp / 2)) / (2.0 * Math.PI);

  const Re = 1.0 / (2.0 * Math.PI);
  const z = Re * (radiusScale - 1.0);

  return [x, y, z];
}

// 3D Mercator 좌표를 Cartesian 좌표로 변환 (카메라 위치 역산용)
function mercatorToCartesian(x: number, y: number, z: number) {
  const PI = Math.PI;
  const lng = (x - 0.5) * 2.0 * PI;
  const lat = 2.0 * Math.atan(Math.exp((0.5 - y) * 2.0 * PI)) - PI / 2.0;
  
  const Re = 1.0 / (2.0 * Math.PI);
  const R = 1.0 + z / Re; // 지구 구체 중심에서의 비율적 거리

  const X = R * Math.cos(lat) * Math.sin(lng);
  const Y = R * Math.sin(lat);
  const Z = R * Math.cos(lat) * Math.cos(lng);

  return [X, Y, Z];
}

// MapLibre GL 투영 행렬을 활용한 3D -> 2D 화면 좌표 투영
function projectPoint(mercatorPt: number[], matrix: number[], width: number, height: number) {
  const x = mercatorPt[0];
  const y = mercatorPt[1];
  const z = mercatorPt[2];
  const w = 1.0;

  const m0 = matrix[0], m1 = matrix[1], m2 = matrix[2], m3 = matrix[3];
  const m4 = matrix[4], m5 = matrix[5], m6 = matrix[6], m7 = matrix[7];
  const m8 = matrix[8], m9 = matrix[9], m10 = matrix[10], m11 = matrix[11];
  const m12 = matrix[12], m13 = matrix[13], m14 = matrix[14], m15 = matrix[15];

  const rx = m0 * x + m4 * y + m8 * z + m12 * w;
  const ry = m1 * x + m5 * y + m9 * z + m13 * w;
  const rz = m2 * x + m6 * y + m10 * z + m14 * w;
  const rw = m3 * x + m7 * y + m11 * z + m15 * w;

  const ndcX = rx / rw;
  const ndcY = ry / rw;

  const screenX = (ndcX + 1.0) / 2.0 * width;
  const screenY = (1.0 - ndcY) / 2.0 * height;

  return [screenX, screenY];
}

interface GlobeMapProps {
  incidents: TacticalEvent[]
  watchconStage: number
  themeColor: string
  themeRgb: string
  onMarkerClick: (incident: TacticalEvent) => void
  onRoomEntry: (incident: TacticalEvent) => void
  mapRef: React.MutableRefObject<any>
  opsMode: "ACTIVE" | "IDLE"
  isAutoPilot: boolean
  selectedChannel: string
  showHeatmap: boolean
  isMinimalTactical: boolean
  currentTarget: TacticalEvent | null
}

export default function GlobeMap({
  incidents,
  watchconStage,
  themeColor,
  themeRgb,
  onMarkerClick,
  onRoomEntry,
  mapRef,
  opsMode,
  isAutoPilot,
  selectedChannel,
  showHeatmap,
  isMinimalTactical,
  currentTarget
}: GlobeMapProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Bayesian spatial-trust: incident IDs with at least one verified post
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    let active = true
    const fetchVerified = async () => {
      try {
        const res = await fetch("/api/incidents/verified")
        const data = await res.json()
        if (active && Array.isArray(data.ids)) setVerifiedIds(new Set(data.ids))
      } catch {}
    }
    fetchVerified()
    const t = setInterval(fetchVerified, 5000)
    return () => { active = false; clearInterval(t) }
  }, [])

  const [renderedPopupIncident, setRenderedPopupIncident] = useState<TacticalEvent | null>(null)
  const [isPopupExiting, setIsPopupExiting] = useState(false)
  const [isStyleLoading, setIsStyleLoading] = useState(false)
  const [showBlurOverlay, setShowBlurOverlay] = useState(false)
  const [fadeBlurOverlay, setFadeBlurOverlay] = useState(false)
  
  const isMapBusyRef = useRef(false)
  const isAutoPilotRef = useRef(isAutoPilot)
  useEffect(() => {
    isAutoPilotRef.current = isAutoPilot
  }, [isAutoPilot])

  const safeBlurTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const blurReleasedRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef<number[]>([0.0, 0.25, 0.5, 0.75])

  const glitchDuration = isMinimalTactical ? 0 : 0.2 // Default glitch duration from page.tsx

  const cleanupAndHideBlur = useCallback(() => {
    if (blurReleasedRef.current) return
    blurReleasedRef.current = true

    if (safeBlurTimeoutRef.current) {
      clearTimeout(safeBlurTimeoutRef.current)
      safeBlurTimeoutRef.current = null
    }

    isMapBusyRef.current = false
    setFadeBlurOverlay(false)
    setTimeout(() => {
      setShowBlurOverlay(false)
      setIsStyleLoading(false)
    }, 520)
  }, [])

  const triggerBlurWithRacingGuard = useCallback(() => {
    if (safeBlurTimeoutRef.current) {
      clearTimeout(safeBlurTimeoutRef.current)
      safeBlurTimeoutRef.current = null
    }
    blurReleasedRef.current = false
    isMapBusyRef.current = true
    setShowBlurOverlay(true)
    setFadeBlurOverlay(true)

    safeBlurTimeoutRef.current = setTimeout(() => {
      cleanupAndHideBlur()
    }, 2500)
  }, [cleanupAndHideBlur])

  useEffect(() => {
    setIsStyleLoading(true)
    triggerBlurWithRacingGuard()
  }, [opsMode, triggerBlurWithRacingGuard])

  useEffect(() => {
    if (!currentTarget) return;
    triggerBlurWithRacingGuard()
  }, [currentTarget, triggerBlurWithRacingGuard]);

  // 📸 공간 바인딩 팝업 마운트/언마운트 트랜지션 제어기
  useEffect(() => {
    const isStage1 = watchconStage === 1
    const shouldShow = currentTarget && (isStage1 || (!isMapBusyRef.current && currentTarget.media_url))

    if (!shouldShow) {
      if (renderedPopupIncident) {
        setIsPopupExiting(true)
        const exitTimer = setTimeout(() => {
          setRenderedPopupIncident(null)
          setIsPopupExiting(false)
        }, glitchDuration * 1000)
        return () => clearTimeout(exitTimer)
      }
    } else {
      if (renderedPopupIncident?.id !== currentTarget?.id) {
        if (renderedPopupIncident) {
          setIsPopupExiting(true)
          const switchTimer = setTimeout(() => {
            setRenderedPopupIncident(currentTarget)
            setIsPopupExiting(false)
          }, glitchDuration * 1000)
          return () => clearTimeout(switchTimer)
        } else {
          setRenderedPopupIncident(currentTarget)
          setIsPopupExiting(false)
        }
      }
    }
  }, [currentTarget, renderedPopupIncident, watchconStage, glitchDuration])

  const setupMapLayers = useCallback((map: any) => {
    if (!map) return

    if (!map.getSource("threat-zones")) {
      map.addSource("threat-zones", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: incidents.map(ev => ({
            type: "Feature",
            properties: {
              id: ev.id,
              intensity: ev.level === "CRITICAL" ? 1 : ev.level === "ELEVATED" ? 0.6 : 0.3,
              verified: verifiedIds.has(ev.id) ? 1 : 0
            },
            geometry: {
              type: "Point",
              coordinates: [ev.lng, ev.lat]
            }
          }))
        }
      })
    } else {
      const source = map.getSource("threat-zones")
      if (source && typeof (source as any).setData === "function") {
        (source as any).setData({
          type: "FeatureCollection",
          features: incidents.map(ev => ({
            type: "Feature",
            properties: {
              id: ev.id,
              intensity: ev.level === "CRITICAL" ? 1 : ev.level === "ELEVATED" ? 0.6 : 0.3,
              verified: verifiedIds.has(ev.id) ? 1 : 0
            },
            geometry: {
              type: "Point",
              coordinates: [ev.lng, ev.lat]
            }
          }))
        })
      }
    }

    if (!map.getLayer("threat-heat")) {
      map.addLayer({
        id: "threat-heat",
        type: "heatmap",
        source: "threat-zones",
        layout: {
          visibility: showHeatmap ? "visible" : "none"
        },
        paint: {
          "heatmap-radius": 45,
          "heatmap-opacity": 0.6,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, themeColor,
            0.5, "#ffaa00",
            1, "#ff3333"
          ]
        }
      })
    } else {
      map.setLayoutProperty("threat-heat", "visibility", showHeatmap ? "visible" : "none")
      map.setPaintProperty("threat-heat", "heatmap-color", [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(0,0,0,0)",
        0.2, themeColor,
        0.5, "#ffaa00",
        1, "#ff3333"
      ])
    }

    // Static red glow halo under verified points (no rAF — cheap, pan-safe)
    if (!map.getLayer("threat-verified-glow")) {
      map.addLayer({
        id: "threat-verified-glow",
        type: "circle",
        source: "threat-zones",
        filter: ["==", ["get", "verified"], 1],
        paint: {
          "circle-radius": 14,
          "circle-color": "#ef4444",
          "circle-opacity": 0.35,
          "circle-blur": 0.8
        }
      })
    }

    if (!map.getLayer("threat-points")) {
      map.addLayer({
        id: "threat-points",
        type: "circle",
        source: "threat-zones",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            1, 4,
            6, 8,
            12, 12
          ],
          "circle-color": ["case", ["==", ["get", "verified"], 1], "#ef4444", "rgba(180,180,180,0.3)"],
          "circle-stroke-color": ["case", ["==", ["get", "verified"], 1], "#ef4444", "#888888"],
          "circle-stroke-width": ["case", ["==", ["get", "verified"], 1], 2, 1],
          "circle-opacity": ["case", ["==", ["get", "verified"], 1], 0.95, 0.35],
          "circle-stroke-opacity": ["case", ["==", ["get", "verified"], 1], 1.0, 0.4]
        }
      })
    } else {
      map.setPaintProperty("threat-points", "circle-color",
        ["case", ["==", ["get", "verified"], 1], "#ef4444", "rgba(180,180,180,0.3)"])
      map.setPaintProperty("threat-points", "circle-stroke-color",
        ["case", ["==", ["get", "verified"], 1], "#ef4444", "#888888"])
      map.setPaintProperty("threat-points", "circle-opacity",
        ["case", ["==", ["get", "verified"], 1], 0.95, 0.35])
    }

    if (opsMode === "IDLE") {
      if (threeOrbitLayer && !map.getLayer("threejs-orbit-layer")) {
        map.addLayer(threeOrbitLayer)
      }
    } else {
      if (map.getLayer("threejs-orbit-layer")) {
        map.removeLayer("threejs-orbit-layer")
      }
    }
  }, [incidents, themeColor, opsMode, showHeatmap, verifiedIds])

  useEffect(() => {
    const map = mapRef.current?.getMap?.() || mapRef.current
    if (!map) return

    const syncMapState = () => {
      if (map && typeof map.setFog === "function") {
        map.setFog({
          color: opsMode === "ACTIVE" ? "#000a15" : "#000000",
          "high-color": "#000000",
          "space-color": "#000000",
          horizonBlend: 0.08,
          "star-intensity": 0.5
        })
      }
      setupMapLayers(map)
      setIsStyleLoading(false)
    }

    if (map.isStyleLoaded?.() || (map.getMap && map.getMap().isStyleLoaded?.())) {
      syncMapState()
    } else {
      setIsStyleLoading(true)
    }

    map.on("style.load", syncMapState)
    return () => {
      if (map) map.off("style.load", syncMapState)
    }
  }, [incidents, themeColor, opsMode, showHeatmap, mapRef, setupMapLayers])

  const drawOrbitsAndSatellites = useCallback((matrix: number[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const map = mapRef.current?.getMap?.() || mapRef.current
    if (!map) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
    }

    ctx.clearRect(0, 0, width, height)

    const freeCamera = map.getFreeCameraOptions?.()
    if (!freeCamera || !freeCamera.position) return
    const camPos = freeCamera.position
    const camCart = mercatorToCartesian(camPos.x, camPos.y, camPos.z || 0)

    const currentThemeColor = selectedChannel === "GEOPOLITICS" ? "#00ff88" : selectedChannel === "ECONOMY" ? "#00bfff" : "#00ccff"

    const satellitesData = [
      { speed: 0.0015, progress: progressRef.current[0], color: currentThemeColor, inclinationX: 35, inclinationY: 15, radiusScale: 1.25 },
      { speed: 0.0010, progress: progressRef.current[1], color: currentThemeColor, inclinationX: -45, inclinationY: 25, radiusScale: 1.35 },
      { speed: 0.0008, progress: progressRef.current[2], color: currentThemeColor, inclinationX: 20, inclinationY: -35, radiusScale: 1.45 },
      { speed: 0.0005, progress: progressRef.current[3], color: currentThemeColor, inclinationX: 65, inclinationY: 45, radiusScale: 1.55 }
    ]

    satellitesData.forEach((data, index) => {
      progressRef.current[index] = (progressRef.current[index] + data.speed) % 1.0
    })

    satellitesData.forEach((data) => {
      const segments = 120
      const orbitPoints: { screenX: number, screenY: number, occluded: boolean }[] = []
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2
        const cart = getOrbitCartesianPoint(theta, data.radiusScale, data.inclinationX, data.inclinationY)
        const vx = cart[0] - camCart[0]
        const vy = cart[1] - camCart[1]
        const vz = cart[2] - camCart[2]
        const dot = cart[0] * vx + cart[1] * vy + cart[2] * vz
        const occluded = dot > 0
        const merc = cartesianToMercator(cart[0], cart[1], cart[2], data.radiusScale)
        const proj = projectPoint(merc, matrix, width, height)
        orbitPoints.push({ screenX: proj[0], screenY: proj[1], occluded })
      }

      ctx.lineWidth = 1.2
      for (let i = 0; i < segments; i++) {
        const p1 = orbitPoints[i]
        const p2 = orbitPoints[i + 1]
        ctx.beginPath()
        ctx.moveTo(p1.screenX, p1.screenY)
        ctx.lineTo(p2.screenX, p2.screenY)
        if (p1.occluded || p2.occluded) {
          ctx.strokeStyle = data.color
          ctx.globalAlpha = 0.12
          ctx.setLineDash([2, 4])
          ctx.stroke()
        } else {
          ctx.strokeStyle = data.color
          ctx.globalAlpha = 0.45
          ctx.setLineDash([])
          ctx.stroke()
        }
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1.0

      const satAngle = data.progress * Math.PI * 2
      const satCart = getOrbitCartesianPoint(satAngle, data.radiusScale, data.inclinationX, data.inclinationY)
      const svx = satCart[0] - camCart[0]
      const svy = satCart[1] - camCart[1]
      const svz = satCart[2] - camCart[2]
      const sdot = satCart[0] * svx + satCart[1] * svy + satCart[2] * svz
      if (sdot <= 0) {
        const satMerc = cartesianToMercator(satCart[0], satCart[1], satCart[2], data.radiusScale)
        const satProj = projectPoint(satMerc, matrix, width, height)
        ctx.save()
        ctx.translate(satProj[0], satProj[1])
        ctx.rotate(satAngle + Math.PI / 2)
        ctx.fillStyle = selectedChannel === "GEOPOLITICS" ? "#005533" : "#003355"
        ctx.fillRect(-8, -1.5, 4, 3)
        ctx.fillRect(4, -1.5, 4, 3)
        ctx.fillStyle = data.color
        ctx.beginPath()
        ctx.arc(0, 0, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = data.color
        ctx.lineWidth = 1.0
        ctx.beginPath()
        ctx.arc(0, 0, 5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    })
  }, [selectedChannel, mapRef])

  useEffect(() => {
    if (threeOrbitLayer) {
      threeOrbitLayer.onDrawCanvas = drawOrbitsAndSatellites
    }
    return () => {
      if (threeOrbitLayer) {
        threeOrbitLayer.onDrawCanvas = null
      }
    }
  }, [drawOrbitsAndSatellites])

  if (!mounted) return null

  return (
    <div className="absolute inset-0 z-0">
      <Map
        ref={mapRef}
        reuseMaps
        styles={{
          dark: opsMode === "ACTIVE" ? satelliteStyle : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
          light: opsMode === "ACTIVE" ? satelliteStyle : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        }}
        {...({
          id: "global-ops-core-map",
          theme: "dark",
          initialViewState: { longitude: 126.9780, latitude: 37.5665, zoom: 2.5, pitch: 20 },
          projection: { type: "globe" },
          interactive: true,
          maxTileCacheSize: 512,
          maxReferencedTiles: 256,
          transformRequest: (url: string, resourceType: string) => {
            if (resourceType === "Tile") {
              return { url: `cached-tiles://${url}` };
            }
            return { url };
          }
        } as any)}
        onLoad={(evt: any) => {
          const map = evt.target
          
          if (map && typeof map.setFog === "function") {
            map.setFog({
              color: opsMode === "ACTIVE" ? "#000a15" : "#000000",
              "high-color": "#000000",
              "space-color": "#000000",
              horizonBlend: 0.08,
              "star-intensity": 0.5
            })
          }

          setupMapLayers(map)

          map.on('click', 'threat-points', (e: any) => {
            if (!e.features || e.features.length === 0) return;
            const feature = e.features[0];
            const props = feature.properties;
            if (!props) return;
            
            const target = incidents.find((news) => news.id === props.id);
            if (target) {
              onMarkerClick(target);
            }
          });

          map.on('mouseenter', 'threat-points', () => {
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', 'threat-points', () => {
            map.getCanvas().style.cursor = '';
          });

          map.on("movestart", (e: any) => {
            if (!isAutoPilotRef.current || (e && e.originalEvent)) {
              return
            }
            triggerBlurWithRacingGuard()
          })

          map.on("idle", () => {
            cleanupAndHideBlur()
          })
        }}
      >
        {renderedPopupIncident && (
          <MapMarker
            longitude={renderedPopupIncident.lng}
            latitude={renderedPopupIncident.lat}
            onClick={() => onRoomEntry(renderedPopupIncident)}
          >
            <MarkerPopup closeButton={watchconStage !== 1} anchor="bottom" offset={25}>
              <div 
                className={`${isMinimalTactical ? "" : "glitch-popup"} border border-theme-color bg-black/95 p-2.5 text-white font-mono text-[9px] w-64 select-none relative ${
                  isMinimalTactical ? "" : (isPopupExiting ? "glitch-popup-exit" : "glitch-popup-enter")
                }`}
                style={{ 
                  clipPath: "polygon(0 0, 100% 0, 100% 90%, 90% 100%, 0 100%)",
                  animationDuration: `${glitchDuration}s`,
                  boxShadow: `0 0 15px rgba(${themeRgb}, 0.3)`
                }}
              >
                <div className={`absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-theme-color`} />
                <div className={`absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-theme-color`} />
                <div className={`absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-theme-color`} />
                
                <div className={`flex justify-between items-center border-b border-theme-color-30 pb-1 mb-1.5`}>
                  <span className="font-bold text-[8px] tracking-wider text-theme-color-muted">TACTICAL RECON SYSTEM</span>
                  <span className={`text-[8px] text-theme-color animate-pulse`}>● LIVE</span>
                </div>

                <div className="relative w-full h-28 bg-black border border-white/10 mb-1.5 overflow-hidden flex items-center justify-center">
                  {renderedPopupIncident.media_url ? (
                    renderedPopupIncident.media_type === "video" ? (
                      <video
                        src={renderedPopupIncident.media_url}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="w-full h-full object-cover"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <img
                        src={`/api/media-proxy?url=${encodeURIComponent(renderedPopupIncident.media_url)}`}
                        alt="Tactical Recon"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                      />
                    )
                  ) : (
                    <div className="text-[8px] text-theme-color-muted tracking-widest text-center uppercase p-4 animate-pulse">
                      Awaiting Spectral Media Ingestion...
                    </div>
                  )}
                  
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(transparent_50%,rgba(0,0,0,0.6)_100%)] opacity-40" />
                  {renderedPopupIncident.media_url && (
                    <div className="absolute bottom-1 right-1 px-1 bg-black/80 border border-white/20 text-[7px] text-white/50 tracking-widest uppercase">
                      {renderedPopupIncident.media_type} // 60FPS
                    </div>
                  )}
                </div>

                <div className="text-[10px] font-bold text-white tracking-wide truncate mb-0.5">
                  {renderedPopupIncident.region} DIRECT SCAN
                </div>
                <div className="text-white/60 leading-normal text-[8px] line-clamp-2">
                  {renderedPopupIncident.title}
                </div>
              </div>
            </MarkerPopup>
          </MapMarker>
        )}
      </Map>

      {opsMode === "IDLE" && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 pointer-events-none w-full h-full"
        />
      )}

      {showBlurOverlay && (
        <div
          className={`absolute inset-0 pointer-events-none bg-black/40 backdrop-blur-[4px] transition-opacity duration-500 z-20 flex items-center justify-center ${
            fadeBlurOverlay ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <div className={`text-[10px] font-bold text-theme-color tracking-[0.25em] animate-pulse`}>
              RETRIEVING SPECTRAL SATELLITE DATA...
            </div>
            <div className={`w-32 h-[1px] bg-theme-color-muted relative overflow-hidden`}>
              <div className={`absolute top-0 bottom-0 left-0 w-8 bg-theme-color animate-pulse`} style={{ animationDuration: '0.8s' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
