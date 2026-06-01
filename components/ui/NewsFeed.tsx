'use client'

import React from 'react'

export interface TacticalEvent {
  id: string
  country: string
  region: string
  title: string
  summary: string
  category: string
  severity: number
  region_risk_index: number
  threat_velocity: number
  trajectory: "ESCALATING" | "SUSTAINED" | "DE-ESCALATING"
  update_count: number
  status: string
  level: "CRITICAL" | "ELEVATED" | "NOMINAL"
  lat: number
  lng: number
  source: string
  created_at: string
  first_seen: string
  related_titles: string[]
  related_articles: any[]
  msg?: string
  time?: string
  channel?: string | null
  media_url?: string | null
  media_type?: string | null
  sns_source?: string | null
  verified_sources?: string | null
  child_feeds?: string | null
  link?: string | null
  pinned: number
  watchcon_trigger?: boolean | string
}

interface NewsFeedProps {
  incidents: TacticalEvent[]
  selectedChannel: string
  themeColor: string
  onIncidentClick: (incident: TacticalEvent) => void
  activeIncidentId?: string | null
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
      <div
        className="w-full h-0.5 relative overflow-hidden"
        style={{ background: 'rgba(180,210,240,0.06)' }}
      >
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

export default function NewsFeed({
  incidents,
  selectedChannel,
  themeColor,
  onIncidentClick,
  activeIncidentId
}: NewsFeedProps) {
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
      <div
        className="flex flex-col items-center justify-center gap-2 py-8 text-center"
        style={{ color: 'rgba(184,207,224,0.3)' }}
      >
        <div className="text-[10px] tracking-[0.2em] font-bold uppercase">No Signal</div>
        <div className="text-[9px]">Awaiting Intelligence Feed</div>
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

        const levelColor =
          news.level === 'CRITICAL' ? '#ef4444' :
          news.level === 'ELEVATED' ? '#f97316' :
          themeColor

        return (
          <button
            key={news.id || idx}
            onClick={() => onIncidentClick(news)}
            className="w-full text-left transition-all duration-200 cursor-pointer group"
            style={{
              background: isCurrent
                ? `rgba(var(--theme-rgb), 0.06)`
                : isPinned
                  ? 'rgba(239,68,68,0.04)'
                  : 'rgba(13,24,40,0.60)',
              border: isCurrent
                ? `1px solid rgba(var(--theme-rgb), 0.45)`
                : isPinned
                  ? '1px solid rgba(239,68,68,0.25)'
                  : '1px solid rgba(180,210,240,0.06)',
              borderLeft: isPinned
                ? '2px solid #ef4444'
                : isCurrent
                  ? `2px solid var(--theme-color)`
                  : `2px solid rgba(180,210,240,0.08)`,
            }}
          >
            {/* Severity accent top line */}
            {severityPct >= 70 && (
              <div
                style={{
                  height: '1px',
                  background: `linear-gradient(90deg, ${levelColor}, transparent)`,
                  opacity: 0.6,
                }}
              />
            )}

            <div className="p-2 flex flex-col gap-1.5">
              {/* Meta row */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="text-[7px] font-bold tabular-nums shrink-0"
                    style={{ color: isCurrent ? 'var(--theme-color)' : 'rgba(184,207,224,0.25)' }}
                  >
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="text-[7px] font-bold tracking-wider truncate"
                    style={{ color: 'rgba(184,207,224,0.35)' }}
                  >
                    {news.source || 'SRC'}
                  </span>
                  {isPinned && (
                    <span
                      className="text-[6px] font-black tracking-wider px-1 py-0.5 shrink-0"
                      style={{ border: '1px solid rgba(239,68,68,0.45)', color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
                    >
                      PIN
                    </span>
                  )}
                  {isTrigger && (
                    <span
                      className="text-[6px] font-black tracking-wider px-1 py-0.5 shrink-0"
                      style={{ border: '1px solid rgba(245,158,11,0.45)', color: '#f59e0b', background: 'rgba(245,158,11,0.08)' }}
                    >
                      WCN
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {news.channel && (
                    <span
                      className="text-[6px] font-black tracking-wider px-1.5 py-0.5"
                      style={{
                        border: `1px solid rgba(var(--theme-rgb), 0.25)`,
                        color: 'var(--theme-color)',
                        background: `rgba(var(--theme-rgb), 0.06)`,
                      }}
                    >
                      {news.channel}
                    </span>
                  )}
                  <span
                    className="text-[6px] font-black tracking-wider px-1.5 py-0.5"
                    style={{
                      border: `1px solid ${levelColor}40`,
                      color: levelColor,
                      background: `${levelColor}10`,
                    }}
                  >
                    {news.level || 'NOMINAL'}
                  </span>
                </div>
              </div>

              {/* Title */}
              <span
                className="text-[11px] font-semibold leading-tight line-clamp-2 text-left"
                style={{
                  color: isTrigger ? '#f59e0b' : isCurrent ? '#e2eaf4' : '#b8cfe0',
                  fontFamily: "'Courier New', monospace",
                }}
              >
                {news.title ?? news.region ?? 'UNKNOWN INCIDENT'}
              </span>

              {/* Severity bar */}
              <SeverityBar severity={news.severity} themeColor={themeColor} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
