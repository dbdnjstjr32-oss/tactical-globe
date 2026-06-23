"use client"

import React from "react"
import type { TacticalToggles } from "./TacticalCanvas"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  themeColor: string
  tacticalToggles: TacticalToggles
  onTacticalToggle: (key: keyof TacticalToggles, value: boolean) => void
  isMinimalTactical: boolean
  setIsMinimalTactical: (val: boolean) => void
  focusMode: boolean
  setFocusMode: (val: boolean) => void
  showHeatmap: boolean
  setShowHeatmap: (val: boolean) => void
  isAutoPilot: boolean
  setIsAutoPilot: (val: boolean) => void
}

function Switch({ on, onClick, themeColor }: { on: boolean; onClick: () => void; themeColor: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        position: "relative", width: "36px", height: "18px", flexShrink: 0,
        borderRadius: "9px", cursor: "pointer", transition: ".25s",
        background: on ? `${themeColor}33` : "rgba(255,255,255,0.06)",
        border: on ? `1px solid ${themeColor}` : "1px solid rgba(255,255,255,0.25)",
      }}
    >
      <span
        style={{
          position: "absolute", top: "1px", left: on ? "19px" : "3px",
          width: "14px", height: "14px", borderRadius: "50%", transition: ".25s",
          background: on ? themeColor : "#a0a0a0",
          boxShadow: on ? `0 0 8px ${themeColor}` : "none",
        }}
      />
    </button>
  )
}

function SettingRow({ label, desc, on, onClick, themeColor }: { label: string; desc: string; on: boolean; onClick: () => void; themeColor: string }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex flex-col gap-1 pr-4">
        <span style={{ fontSize: "12px", fontWeight: 600, color: on ? "#ffffff" : "#c0c0c0", letterSpacing: "0.08em", fontFamily: "var(--font-orbitron), sans-serif" }}>
          {label}
        </span>
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-share-tech-mono), monospace" }}>
          {desc}
        </span>
      </div>
      <Switch on={on} onClick={onClick} themeColor={themeColor} />
    </div>
  )
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", color: "#a0a0a0", borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: "6px", marginBottom: "8px", fontFamily: "var(--font-share-tech-mono), monospace" }}>
        {title}
      </div>
      <div className="flex flex-col">
        {children}
      </div>
    </div>
  )
}

export default function SettingsModal({
  isOpen, onClose, themeColor,
  tacticalToggles, onTacticalToggle,
  isMinimalTactical, setIsMinimalTactical,
  focusMode, setFocusMode,
  showHeatmap, setShowHeatmap,
  isAutoPilot, setIsAutoPilot
}: SettingsModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
      {/* Background click to close */}
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />
      
      <div 
        className="relative flex flex-col pointer-events-auto"
        style={{
          width: "100%", maxWidth: "480px", maxHeight: "85vh",
          background: "rgba(12,12,12,0.95)",
          border: `1px solid ${themeColor}66`,
          borderRadius: "6px",
          boxShadow: `0 0 40px rgba(0,0,0,0.8), 0 0 20px ${themeColor}15`,
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-5 py-4"
          style={{ background: "rgba(255,255,255,0.03)", borderBottom: `1px solid ${themeColor}40` }}
        >
          <div className="flex items-center gap-3">
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: themeColor, boxShadow: `0 0 8px ${themeColor}` }} />
            <h2 style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.2em", color: "#ffffff", fontFamily: "var(--font-orbitron), sans-serif", margin: 0 }}>
              SYSTEM CONFIGURATION
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            style={{ fontSize: "20px", lineHeight: 1, padding: "0 4px" }}
          >
            ×
          </button>
        </div>

        {/* Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ background: "rgba(0,0,0,0.2)" }}>
          
          <SettingSection title="[ DISPLAY OPTIONS ]">
            <SettingRow 
              label="MINIMAL TACTICAL MODE" 
              desc="Disables decorative elements, scanlines, and grid animations for performance."
              on={isMinimalTactical} 
              onClick={() => setIsMinimalTactical(!isMinimalTactical)} 
              themeColor={themeColor} 
            />
            <SettingRow 
              label="FOCUS MODE" 
              desc="Hides side panels to focus entirely on the tactical map."
              on={focusMode} 
              onClick={() => setFocusMode(!focusMode)} 
              themeColor={themeColor} 
            />
            <SettingRow 
              label="RADAR SCAN OVERLAY" 
              desc="Displays sweeping radar scanline on the map surface."
              on={tacticalToggles.isScanline} 
              onClick={() => onTacticalToggle("isScanline", !tacticalToggles.isScanline)} 
              themeColor={themeColor} 
            />
          </SettingSection>

          <SettingSection title="[ TACTICAL DATA LAYERS ]">
            <SettingRow 
              label="AIRCRAFT & DRONES" 
              desc="Render real-time ADS-B and flight tracking data."
              on={tacticalToggles.showAircraft} 
              onClick={() => onTacticalToggle("showAircraft", !tacticalToggles.showAircraft)} 
              themeColor={themeColor} 
            />
            <SettingRow 
              label="NAVAL VESSELS" 
              desc="Render real-time AIS marine traffic and vessel positions."
              on={tacticalToggles.showVessels} 
              onClick={() => onTacticalToggle("showVessels", !tacticalToggles.showVessels)} 
              themeColor={themeColor} 
            />
            <SettingRow 
              label="DATA CENTER NET" 
              desc="Show strategic data center nodes and sub-oceanic connections."
              on={tacticalToggles.showDataCenters} 
              onClick={() => onTacticalToggle("showDataCenters", !tacticalToggles.showDataCenters)} 
              themeColor={themeColor} 
            />
            <SettingRow 
              label="SATELLITE ORBITS" 
              desc="Overlay low-earth orbit (LEO) satellite tracking paths."
              on={tacticalToggles.showSatTracks} 
              onClick={() => onTacticalToggle("showSatTracks", !tacticalToggles.showSatTracks)} 
              themeColor={themeColor} 
            />
            <SettingRow 
              label="THREAT HEATMAP" 
              desc="Visualize regional incident density with heatmap overlay."
              on={showHeatmap} 
              onClick={() => setShowHeatmap(!showHeatmap)} 
              themeColor={themeColor} 
            />
          </SettingSection>

          <SettingSection title="[ AUTOMATION ]">
            <SettingRow 
              label="AUTO-PILOT SURVEILLANCE" 
              desc="Automatically cycle through and focus on new high-priority targets."
              on={isAutoPilot} 
              onClick={() => setIsAutoPilot(!isAutoPilot)} 
              themeColor={themeColor} 
            />
          </SettingSection>

        </div>
        
        {/* Footer */}
        <div className="px-5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", textAlign: "center", fontFamily: "var(--font-share-tech-mono), monospace", letterSpacing: "0.1em" }}>
            CHANGES ARE APPLIED IN REAL-TIME
          </div>
        </div>

      </div>
    </div>
  )
}
