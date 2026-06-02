'use client'

import React, { useState, useEffect } from 'react'

export type PizzaData = {
  doughconLevel: number | null
  doughconDesc: string
  alertText: string | null
  locationsMonitored: number
  reportsCount: number | null
  alertsCount: number | null
  accountsMonitored: number | null
  status: string
  color: string
  lastUpdated: string
  error?: string
}

export default function PizzaIndex() {
  const [pizzaData, setPizzaData] = useState<PizzaData | null>(null)
  const [pizzaLoading, setPizzaLoading] = useState(true)
  const [pizzaLastRefresh, setPizzaLastRefresh] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function fetchPizzaIndex() {
      setPizzaLoading(true)
      try {
        const res = await fetch("/api/pizza", { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setPizzaData(data)
        setPizzaLastRefresh(new Date())
      } catch (err) {
        console.error("[PIZZA INDEX] Fetch failed:", err)
        setPizzaLastRefresh(new Date())
      } finally {
        setPizzaLoading(false)
      }
    }

    fetchPizzaIndex()
    const pizzaInterval = setInterval(fetchPizzaIndex, 5000)  // align with 5s fast loop
    return () => clearInterval(pizzaInterval)
  }, [])

  return (
    <div>
      <div
        className="text-[10px] font-bold pb-1 mb-2 flex justify-between items-center"
        style={{ borderBottom: `1px solid rgba(255,200,0,0.3)` }}
      >
        <span style={{ color: "#ffcc00" }}>🍕 PENTAGON PIZZA INDEX</span>
        <div className="flex items-center gap-1.5">
          {pizzaLoading && (
            <span className="text-[8px] animate-pulse" style={{ color: "#ffcc00", opacity: 0.6 }}>SCANNING...</span>
          )}
          {pizzaLastRefresh && mounted && (
            <span className="text-[8px] font-mono" style={{ color: "rgba(255,200,0,0.4)" }}>
              {pizzaLastRefresh.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      <div
        className="relative overflow-hidden"
        style={{
          border: `1px solid ${pizzaData?.color ?? "rgba(255,200,0,0.25)"}40`,
          background: `linear-gradient(135deg, rgba(0,0,0,0.9) 0%, ${(pizzaData?.color ?? "#ffcc00")}08 100%)`,
          boxShadow: pizzaData?.doughconLevel && pizzaData.doughconLevel <= 2
            ? `0 0 20px ${pizzaData.color}30, inset 0 0 20px ${pizzaData.color}08`
            : `0 0 8px rgba(255,200,0,0.08)`,
          transition: "all 0.5s ease",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,200,0,0.02) 3px, rgba(255,200,0,0.02) 4px)`,
            zIndex: 1
          }}
        />

        <div className="relative p-2.5" style={{ zIndex: 2 }}>
          {pizzaData === null ? (
            <div className="flex flex-col gap-1.5 animate-pulse">
              <div className="h-7 w-32 rounded" style={{ background: "rgba(255,200,0,0.1)" }} />
              <div className="h-3 w-full rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-3 w-3/4 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex flex-col">
                  <div
                    className="font-bold leading-none tracking-widest"
                    style={{
                      fontSize: "22px",
                      color: pizzaData.color,
                      textShadow: `0 0 12px ${pizzaData.color}80`,
                      fontFamily: "'Courier New', monospace",
                      letterSpacing: "0.12em"
                    }}
                  >
                    {pizzaData.doughconLevel !== null
                      ? `DOUGHCON ${pizzaData.doughconLevel}`
                      : "NO SIGNAL"}
                  </div>
                  <div
                    className="text-[8px] tracking-[0.2em] mt-0.5 font-bold"
                    style={{ color: `${pizzaData.color}bb` }}
                  >
                    {pizzaData.doughconDesc.toUpperCase()}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded-sm ${
                      pizzaData.status === "OPERATIONAL" ? "animate-pulse" : ""
                    }`}
                    style={{
                      color: pizzaData.status === "OPERATIONAL" ? "#00ff88" : "#ff6644",
                      background: pizzaData.status === "OPERATIONAL" ? "rgba(0,255,136,0.1)" : "rgba(255,100,68,0.1)",
                      border: `1px solid ${pizzaData.status === "OPERATIONAL" ? "rgba(0,255,136,0.3)" : "rgba(255,100,68,0.3)"}`
                    }}
                  >
                    ● {pizzaData.status}
                  </span>
                  <span
                    className="text-[8px] font-mono"
                    style={{ color: "rgba(255,200,0,0.4)" }}
                  >
                    🍕 {pizzaData.locationsMonitored} LOC
                  </span>
                </div>
              </div>

              <div style={{ height: "1px", background: `linear-gradient(90deg, transparent, ${pizzaData.color}40, transparent)`, marginBottom: "6px" }} />

              <div className="grid grid-cols-3 gap-1.5 text-[9px]">
                <div
                  className="flex flex-col items-center py-1.5"
                  style={{ border: `1px solid rgba(255,200,0,0.15)`, background: "rgba(0,0,0,0.4)" }}
                >
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "7px", letterSpacing: "0.1em" }}>REPORTS</span>
                  <span className="font-bold mt-0.5" style={{ color: pizzaData.color }}>
                    {pizzaData.reportsCount ?? "—"}
                  </span>
                </div>
                <div
                  className="flex flex-col items-center py-1.5"
                  style={{ border: `1px solid rgba(255,80,80,0.2)`, background: "rgba(0,0,0,0.4)" }}
                >
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "7px", letterSpacing: "0.1em" }}>ALERTS</span>
                  <span
                    className={`font-bold mt-0.5 ${
                      pizzaData.alertsCount && pizzaData.alertsCount > 5 ? "animate-pulse" : ""
                    }`}
                    style={{
                      color: pizzaData.alertsCount && pizzaData.alertsCount > 5 ? "#ff4444" : pizzaData.color
                    }}
                  >
                    {pizzaData.alertsCount ?? "—"}
                  </span>
                </div>
                <div
                  className="flex flex-col items-center py-1.5"
                  style={{ border: `1px solid rgba(255,200,0,0.15)`, background: "rgba(0,0,0,0.4)" }}
                >
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "7px", letterSpacing: "0.1em" }}>ACCTS</span>
                  <span className="font-bold mt-0.5" style={{ color: pizzaData.color }}>
                    {pizzaData.accountsMonitored ?? "—"}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <a
                  href="https://www.pizzint.watch/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[8px] font-mono tracking-wider transition-opacity hover:opacity-100"
                  style={{ color: `${pizzaData.color}80`, textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  pizzint.watch ↗
                </a>
                <span className="text-[7px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
                  AUTO-REFRESH 5S · INDEPENDENT
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
