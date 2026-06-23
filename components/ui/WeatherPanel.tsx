'use client'

import React from 'react'
import { TacticalEvent } from './NewsFeed'

interface WeatherPanelProps {
  incidents: TacticalEvent[]
  themeColor: string
  onIncidentClick: (incident: TacticalEvent) => void
  activeIncidentId?: string | null
}

function getWeatherIcon(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('typhoon') || t.includes('태풍') || t.includes('hurricane')) return '🌀'
  if (t.includes('earthquake') || t.includes('지진') || t.includes('seismic')) return '⚡'
  if (t.includes('flood') || t.includes('홍수')) return '🌊'
  if (t.includes('storm') || t.includes('폭풍') || t.includes('thunder')) return '⛈'
  if (t.includes('snow') || t.includes('눈') || t.includes('blizzard')) return '❄'
  if (t.includes('heat') || t.includes('fire') || t.includes('wildfire')) return '🔥'
  if (t.includes('rain') || t.includes('비')) return '🌧'
  if (t.includes('wind') || t.includes('바람')) return '💨'
  if (t.includes('volcano') || t.includes('화산')) return '🌋'
  return '🌡'
}

function SeverityBar({ severity, themeColor }: { severity: number; themeColor: string }) {
  const pct = Math.min(Math.max(severity * 100, 0), 100)
  const color =
    pct >= 75 ? '#ef4444' :
    pct >= 50 ? '#f97316' :
    pct >= 25 ? '#f59e0b' :
    themeColor

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-full h-0.5 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: pct >= 75 ? `0 0 4px ${color}` : 'none',
          }}
        />
      </div>
      <span
        className="text-[7px] font-mono font-bold shrink-0 tabular-nums"
        style={{ color, minWidth: '24px', textAlign: 'right' }}
      >
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

export default function WeatherPanel({
  incidents,
  themeColor,
  onIncidentClick,
  activeIncidentId
}: WeatherPanelProps) {
  const sortedIncidents = React.useMemo(() => {
    return [...incidents].sort((a, b) => {
      const aPinned = a.pinned === 1 ? 1 : 0
      const bPinned = b.pinned === 1 ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [incidents])

  if (sortedIncidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
        <div className="text-[10px] tracking-[0.2em] font-bold uppercase">No Weather Alerts</div>
        <div className="text-[9px]">Atmosphere Nominal</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {sortedIncidents.map((news, idx) => {
        const isPinned = news.pinned === 1
        const isTrigger = news.watchcon_trigger === true || news.watchcon_trigger === 'true'
        const isCurrent = activeIncidentId === news.id
        const severityPct = Math.round(news.severity * 100)
        const icon = getWeatherIcon(news.title || '')

        const levelColor =
          news.level === 'CRITICAL' ? '#ef4444' :
          news.level === 'ELEVATED' ? '#f97316' :
          themeColor

        // Side borders (not `border` shorthand) so the accent borderLeft
        // doesn't collide with a shorthand on rerender.
        const sideBorder = isCurrent
          ? `1px solid rgba(var(--theme-rgb), 0.45)`
          : isPinned
            ? '1px solid rgba(239,68,68,0.25)'
            : '1px solid rgba(255,255,255,0.06)'

        return (
          <button
            key={news.id || idx}
            onClick={() => onIncidentClick(news)}
            className="w-full text-left transition-all duration-200 cursor-pointer"
            style={{
              background: isCurrent
                ? `rgba(var(--theme-rgb), 0.06)`
                : isPinned
                  ? 'rgba(239,68,68,0.04)'
                  : 'rgba(20,20,20,0.60)',
              borderTop: sideBorder,
              borderRight: sideBorder,
              borderBottom: sideBorder,
              borderLeft: isPinned
                ? '2px solid #ef4444'
                : isCurrent
                  ? `2px solid var(--theme-color)`
                  : `2px solid rgba(255,255,255,0.08)`,
            }}
          >
            {severityPct >= 70 && (
              <div style={{ height: '1px', background: `linear-gradient(90deg, ${levelColor}, transparent)`, opacity: 0.6 }} />
            )}

            <div className="p-2 flex flex-col gap-1.5">
              {/* Meta row */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[7px] font-bold tabular-nums"
                    style={{ color: isCurrent ? 'var(--theme-color)' : 'rgba(255,255,255,0.25)' }}
                  >
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[10px]">{icon}</span>
                  {isPinned && (
                    <span
                      className="text-[6px] font-black tracking-wider px-1 py-0.5"
                      style={{ border: '1px solid rgba(239,68,68,0.45)', color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
                    >
                      PIN
                    </span>
                  )}
                  {isTrigger && (
                    <span
                      className="text-[6px] font-black tracking-wider px-1 py-0.5"
                      style={{ border: '1px solid rgba(245,158,11,0.45)', color: '#f59e0b', background: 'rgba(245,158,11,0.08)' }}
                    >
                      WCN
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className="text-[6px] font-black tracking-wider px-1.5 py-0.5"
                    style={{ border: `1px solid rgba(var(--theme-rgb), 0.25)`, color: 'var(--theme-color)', background: `rgba(var(--theme-rgb), 0.06)` }}
                  >
                    WX
                  </span>
                  <span
                    className="text-[6px] font-black tracking-wider px-1.5 py-0.5"
                    style={{ border: `1px solid ${levelColor}40`, color: levelColor, background: `${levelColor}10` }}
                  >
                    {news.level || 'NOMINAL'}
                  </span>
                </div>
              </div>

              {/* Title */}
              <span
                className="text-[11px] font-semibold leading-tight line-clamp-2 text-left"
                style={{
                  color: isTrigger ? '#f59e0b' : isCurrent ? '#ffffff' : '#e0e0e0',
                  fontFamily: "var(--font-share-tech-mono), monospace",
                }}
              >
                {news.title ?? news.region ?? 'METEOROLOGICAL EVENT'}
              </span>

              {/* Location + severity */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {news.country || news.region || '—'}
                </span>
              </div>
              <SeverityBar severity={news.severity} themeColor={themeColor} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
