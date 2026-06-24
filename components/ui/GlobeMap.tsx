'use client'

import React, { useEffect, useState, useRef, useCallback } from "react"
import { Map, MapMarker, MarkerPopup } from "@/components/ui/map"
import type { Map as MaplibreMap, GeoJSONSource, MapLibreEvent } from "maplibre-gl"
import { TacticalEvent } from "./NewsFeed"

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
  const [, setIsStyleLoading] = useState(false)
  const [showBlurOverlay, setShowBlurOverlay] = useState(false)
  const [fadeBlurOverlay, setFadeBlurOverlay] = useState(false)
  
  const isMapBusyRef = useRef(false)
  const isAutoPilotRef = useRef(isAutoPilot)
  useEffect(() => {
    isAutoPilotRef.current = isAutoPilot
  }, [isAutoPilot])

  const safeBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurReleasedRef = useRef(false)

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

  const setupMapLayers = useCallback((map: MaplibreMap) => {
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
      if (source && typeof (source as GeoJSONSource).setData === "function") {
        (source as GeoJSONSource).setData({
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
  }, [incidents, themeColor, opsMode, showHeatmap, verifiedIds])

  useEffect(() => {
    const map = mapRef.current?.getMap?.() || mapRef.current
    if (!map) return

    const syncMapState = () => {
      if (map && typeof map.setFog === "function" && map.getProjection?.()?.type === "globe") {
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

  if (!mounted) return null

  return (
    <div className="absolute inset-0 z-0">
      <Map
        ref={mapRef}
        reuseMaps
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
        onLoad={(evt: MapLibreEvent) => {
          const map = evt.target
          // setFog is only present on globe-capable builds — call it structurally.
          const fogMap = map as { setFog?: (opts: Record<string, unknown>) => void }
          if (map && typeof fogMap.setFog === "function" && map.getProjection?.()?.type === "globe") {
            fogMap.setFog({
              color: opsMode === "ACTIVE" ? "#000a15" : "#000000",
              "high-color": "#000000",
              "space-color": "#000000",
              horizonBlend: 0.08,
              "star-intensity": 0.5
            })
          }

          setupMapLayers(map)

          map.on('click', 'threat-points', (e) => {
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

          map.on("movestart", (e) => {
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
        {renderedPopupIncident && Number.isFinite(renderedPopupIncident.lng) && Number.isFinite(renderedPopupIncident.lat) && (
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
