'use client'

import React from 'react'

export const getWatchconColor = (stage: number | null): string => {
  if (!stage) return '#3b82f6'
  const map: Record<number, string> = {
    1: '#ef4444',
    2: '#f97316',
    3: '#f59e0b',
    4: '#3b82f6',
    5: '#22c55e'
  }
  return map[stage] ?? '#3b82f6'
}

export const getWatchconRgb = (stage: number | null): string => {
  if (!stage) return '59, 130, 246'
  const map: Record<number, string> = {
    1: '239, 68, 68',
    2: '249, 115, 22',
    3: '245, 158, 11',
    4: '59, 130, 246',
    5: '34, 197, 94'
  }
  return map[stage] ?? '59, 130, 246'
}

export const WATCHCON_STAGES: Record<number, { color: string; rgb: string; glitch: number; name: string; label: string }> = {
  5: { color: getWatchconColor(5), rgb: getWatchconRgb(5), glitch: 0.1, name: "WATCHCON 5", label: "NORMAL" },
  4: { color: getWatchconColor(4), rgb: getWatchconRgb(4), glitch: 0.2, name: "WATCHCON 4", label: "WATCH" },
  3: { color: getWatchconColor(3), rgb: getWatchconRgb(3), glitch: 0.3, name: "WATCHCON 3", label: "ELEVATED" },
  2: { color: getWatchconColor(2), rgb: getWatchconRgb(2), glitch: 0.4, name: "WATCHCON 2", label: "HIGH" },
  1: { color: getWatchconColor(1), rgb: getWatchconRgb(1), glitch: 0.6, name: "WATCHCON 1", label: "CRITICAL" }
}

interface WatchconPanelProps {
  watchconData: { stage: number; override: boolean } | null
  watchconStage: number
  onStageChange: (stage: number) => void
  onAutoMode: () => void
  themeColor: string
  isMinimalTactical: boolean
  onToggleMinimalTactical: () => void
  readOnly?: boolean
}

export default function WatchconPanel({
  watchconData,
  watchconStage,
  onStageChange,
  onAutoMode,
  themeColor,
  isMinimalTactical,
  onToggleMinimalTactical,
  readOnly = false
}: WatchconPanelProps) {
  const info = WATCHCON_STAGES[watchconStage] || WATCHCON_STAGES[4]
  const fillPct = ((6 - watchconStage) / 5) * 100

  const stageConfig: Record<number, { color: string; rgb: string; label: string }> = {
    5: { color: '#22c55e', rgb: '34,197,94',   label: 'NORMAL'   },
    4: { color: '#3b82f6', rgb: '59,130,246',  label: 'WATCH'    },
    3: { color: '#f59e0b', rgb: '245,158,11',  label: 'ELEVATED' },
    2: { color: '#f97316', rgb: '249,115,22',  label: 'HIGH'     },
    1: { color: '#ef4444', rgb: '239,68,68',   label: 'CRITICAL' },
  }

  return (
    <div
      className="relative overflow-hidden shrink-0"
      style={{
        background: 'rgba(10, 10, 10, 0.92)',
        border: `1px solid rgba(${info.rgb}, 0.25)`,
        borderRadius: '4px',
        boxShadow: `0 0 20px rgba(${info.rgb}, 0.06), inset 0 1px 0 rgba(${info.rgb}, 0.08)`,
      }}
    >

      {/* Subtle grid watermark */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(${info.rgb}, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(${info.rgb}, 0.03) 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
        }}
      />

      <div className="relative z-10 p-3 flex flex-col gap-2.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: info.color, animation: 'beacon 2.4s ease-out infinite', boxShadow: `0 0 4px ${info.color}` }}
            />
            <span className="text-[9px] font-bold tracking-[0.18em] uppercase" style={{ color: '#a0a0a0' }}>
              THREAT CONDITION LEVEL
            </span>
          </div>
          <span
            className="text-[8px] font-bold tracking-wider px-2 py-0.5"
            style={{
              border: watchconData?.override
                ? '1px solid rgba(239,68,68,0.5)'
                : `1px solid rgba(${info.rgb}, 0.2)`,
              color: watchconData?.override ? '#ef4444' : `rgba(${info.rgb}, 0.7)`,
              background: watchconData?.override ? 'rgba(239,68,68,0.08)' : `rgba(${info.rgb}, 0.06)`,
              animation: 'none',
            }}
          >
            {watchconData?.override ? 'CMD OVERRIDE' : 'AUTO MODE'}
          </span>
        </div>

        {/* Current level display */}
        <div className="flex items-center gap-3">
          <div
            className="text-4xl font-black tabular-nums"
            style={{ color: info.color, textShadow: `0 0 20px rgba(${info.rgb}, 0.4)`, fontFamily: 'var(--font-share-tech-mono), monospace', lineHeight: 1 }}
          >
            {watchconStage}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold tracking-[0.1em]" style={{ color: info.color }}>{info.name}</span>
            <span className="text-[9px] tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.4)' }}>{info.label}</span>
          </div>
          <div className="flex-1 flex flex-col gap-1">
            {/* Level bars */}
            <div className="flex gap-0.5">
              {[5, 4, 3, 2, 1].map((lvl) => (
                <div
                  key={lvl}
                  className="flex-1 h-1.5"
                  style={{
                    background: lvl >= watchconStage
                      ? stageConfig[lvl].color
                      : 'rgba(255,255,255,0.06)',
                    opacity: lvl === watchconStage ? 1 : lvl > watchconStage ? 0.35 : 0.6,
                    boxShadow: lvl === watchconStage ? `0 0 6px ${stageConfig[lvl].color}` : 'none',
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[7px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              <span>NORMAL</span>
              <span>CRITICAL</span>
            </div>
          </div>
        </div>

        {/* Control buttons — admin only */}
        {!readOnly && (
          <div className="grid grid-cols-6 gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAutoMode(); }}
              className="py-1.5 text-[8px] font-bold tracking-wider transition-all duration-200 cursor-pointer"
              style={{
                border: !watchconData?.override
                  ? '1px solid rgba(14,165,233,0.7)'
                  : '1px solid rgba(255,255,255,0.10)',
                color: !watchconData?.override ? '#0ea5e9' : 'rgba(255,255,255,0.35)',
                background: !watchconData?.override ? 'rgba(14,165,233,0.10)' : 'transparent',
                boxShadow: !watchconData?.override ? '0 0 8px rgba(14,165,233,0.2)' : 'none',
              }}
            >
              AUTO
            </button>

            {[5, 4, 3, 2, 1].map((stageNum) => {
              const cfg = stageConfig[stageNum]
              const isActive = watchconData?.override && watchconStage === stageNum
              return (
                <button
                  key={stageNum}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onStageChange(stageNum); }}
                  className="py-1.5 text-[8px] font-black tracking-wider transition-all duration-200 cursor-pointer"
                  style={{
                    border: isActive ? `1px solid ${cfg.color}` : '1px solid rgba(255,255,255,0.09)',
                    color: isActive ? cfg.color : 'rgba(255,255,255,0.40)',
                    background: isActive ? `rgba(${cfg.rgb}, 0.12)` : 'transparent',
                    boxShadow: isActive ? `0 0 8px rgba(${cfg.rgb}, 0.25)` : 'none',
                  }}
                >
                  {stageNum}
                </button>
              )
            })}
          </div>
        )}

        {/* Meta row */}
        <div
          className="flex justify-between items-center pt-1.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="ia-label">POLL INTERVAL</span>
            <span className="ia-data text-[10px]">
              {watchconStage === 5 ? '60 MIN' : watchconStage === 4 ? '30 MIN' : watchconStage === 3 ? '10 MIN' : watchconStage === 2 ? '3 MIN' : '1 MIN'}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 items-center">
            <span className="ia-label">SCAN MODE</span>
            <span className="ia-data text-[10px]">{isMinimalTactical ? 'LOW LOAD' : 'FULL SPECTRUM'}</span>
          </div>
          {!readOnly && <button
            type="button"
            onClick={onToggleMinimalTactical}
            className="text-[8px] font-bold tracking-wider px-2 py-1 transition-all duration-200 cursor-pointer"
            style={{
              border: isMinimalTactical
                ? '1px solid rgba(14,165,233,0.5)'
                : '1px solid rgba(255,255,255,0.09)',
              color: isMinimalTactical ? '#0ea5e9' : 'rgba(255,255,255,0.35)',
              background: isMinimalTactical ? 'rgba(14,165,233,0.08)' : 'transparent',
            }}
          >
            {isMinimalTactical ? 'MINIMAL ON' : 'MINIMAL OFF'}
          </button>}
        </div>
      </div>
    </div>
  )
}
