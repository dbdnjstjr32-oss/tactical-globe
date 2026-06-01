"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Room {
  id: string;
  incident_id?: string;
  title: string;
  region: string;
  country: string;
  lat?: number;
  lng?: number;
  radius_km: number;
  status: "STAGED" | "ACTIVE" | "RESOLVED";
  created_by: string;
  created_at: string;
  last_activity: string;
  channel: "GEOPOLITICS" | "ECONOMY" | "WEATHER";
}

interface WatchconLog {
  id: string;
  timestamp: string;
  previous_stage: number;
  new_stage: number;
  trigger_type: string;
  triggered_by_incident_id?: string;
  incident_title?: string;
  incident_severity?: number;
  region?: string;
  country?: string;
}

export default function AdminPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  
  const [watchconLogs, setWatchconLogs] = useState<WatchconLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // WATCHCON manual control
  const [watchconStage, setWatchconStage] = useState<number>(4);
  const [watchconOverride, setWatchconOverride] = useState<boolean>(false);
  const [watchconUpdating, setWatchconUpdating] = useState(false);

  const router = useRouter();

  // Form State
  const [title, setTitle] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("KR");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radiusKm, setRadiusKm] = useState("50.0");
  const [roomChannel, setRoomChannel] = useState<"GEOPOLITICS" | "ECONOMY" | "WEATHER">("GEOPOLITICS");
  const [incidentId, setIncidentId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [incidentSearch, setIncidentSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editingRadius, setEditingRadius] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const res = await fetch("/api/incidents");
        const data = await res.json();
        if (data.incidents) {
          setIncidents(data.incidents);
        }
      } catch (err) {
        console.error("Failed to load incidents", err);
      }
    };
    fetchIncidents();
  }, []);

  const fetchRooms = async (statusFilter = "") => {
    setLoading(true);
    try {
      const url = statusFilter ? `/api/admin/rooms?status=${statusFilter}` : "/api/admin/rooms";
      const res = await fetch(url);
      const data = await res.json();
      if (data.rooms) {
        setRooms(data.rooms);
      }
    } catch (err) {
      console.error("Failed to load rooms", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWatchconLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/admin/watchcon-log");
      const data = await res.json();
      if (data.logs) {
        setWatchconLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to load watchcon logs", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchRooms(filterStatus);
  }, [filterStatus]);

  useEffect(() => {
    fetchWatchconLogs();
  }, []);

  // Sync current WATCHCON state on mount
  useEffect(() => {
    const sync = async () => {
      try {
        const res = await fetch("/api/watchcon/toggle");
        if (res.ok) {
          const data = await res.json();
          setWatchconStage(data.stage);
          setWatchconOverride(data.override);
        }
      } catch {}
    };
    sync();
  }, []);

  const handleWatchconSet = async (stage: number) => {
    setWatchconUpdating(true);
    try {
      const res = await fetch("/api/watchcon/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, override: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setWatchconStage(data.stage);
        setWatchconOverride(data.override);
        fetchWatchconLogs();
      }
    } catch {} finally { setWatchconUpdating(false); }
  };

  const handleWatchconAuto = async () => {
    setWatchconUpdating(true);
    try {
      const res = await fetch("/api/watchcon/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: watchconStage, override: false }),
      });
      if (res.ok) {
        const data = await res.json();
        setWatchconStage(data.stage);
        setWatchconOverride(data.override);
        fetchWatchconLogs();
      }
    } catch {} finally { setWatchconUpdating(false); }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        title,
        region: region || undefined,
        country: country || undefined,
        lat: lat ? parseFloat(lat) : undefined,
        lng: lng ? parseFloat(lng) : undefined,
        radiusKm: radiusKm ? parseFloat(radiusKm) : undefined,
        incidentId: incidentId || undefined,
        channel: roomChannel,
      };

      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setTitle("");
        setRegion("");
        setCountry("KR");
        setLat("");
        setLng("");
        setRadiusKm("50.0");
        setRoomChannel("GEOPOLITICS");
        setIncidentId("");
        setIncidentSearch("");
        fetchRooms(filterStatus);
      } else {
        const errData = await res.json();
        setFormError(errData.error || "방 생성 실패");
      }
    } catch (err) {
      setFormError("통신 오류 발생");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: "ACTIVE" | "RESOLVED") => {
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (res.ok) {
        fetchRooms(filterStatus);
      } else {
        alert("상태 수정 오류");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!window.confirm("정말로 이 채널과 모든 대화 내용을 삭제하시겠습니까? (복구 불가능)")) return;

    try {
      const res = await fetch("/api/admin/rooms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        fetchRooms(filterStatus);
      } else {
        const data = await res.json();
        alert(data.error || "삭제 오류 발생");
      }
    } catch (err) {
      console.error(err);
      alert("통신 오류 발생");
    }
  };

  const handleUpdateRadius = async (id: string) => {
    const radiusVal = editingRadius[id];
    // If not modified, fallback to updating current value or just keep it
    if (radiusVal === undefined) return;

    const radiusNum = parseFloat(radiusVal);
    if (isNaN(radiusNum) || radiusNum <= 0) {
      alert("올바른 반경(숫자 > 0)을 입력하세요.");
      return;
    }

    try {
      const res = await fetch("/api/admin/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, radius_km: radiusNum }),
      });

      if (res.ok) {
        alert("작전 반경이 성공적으로 업데이트되었습니다.");
        setEditingRadius(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        fetchRooms(filterStatus);
      } else {
        const err = await res.json();
        alert(err.error || "반경 업데이트 실패");
      }
    } catch (err) {
      console.error(err);
      alert("통신 오류 발생");
    }
  };

  const handleLogout = async () => {
    // Note: To clear the httpOnly cookie, we can trigger auth logouts or simple reload if the server validates it.
    // Let's clear the cookie by setting it to expired in client, but since it is httpOnly we should create a logout endpoint if needed, or simply delete the token via server side if the user wants. Since there is no logout request, we can just push user away or clear credentials.
    document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen bg-black text-emerald-400 font-mono p-6 sm:p-8">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-emerald-500/30 pb-4 mb-6">
        <div>
          <span className="text-[9px] text-emerald-500/50 tracking-[0.3em] font-black uppercase">
            OPERATIONAL COMMAND CENTER
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-emerald-400 tracking-wider uppercase mt-1">
            Secure Channel Configurer
          </h1>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-1.5 border border-red-500/30 hover:border-red-500 hover:bg-red-950/20 text-red-400 text-xs font-bold transition-all duration-300 rounded-sm cursor-pointer"
        >
          [ DISCONNECT ]
        </button>
      </header>

      {/* Main Grid: Form on Top */}
      <div className="flex flex-col gap-6">
        {/* Form Container */}
        <div className="border border-emerald-500/20 bg-neutral-950/60 p-5 rounded-sm relative">
          <h2 className="text-xs font-bold tracking-widest text-emerald-300 border-b border-emerald-500/20 pb-2 mb-4 uppercase">
            ◈ DEPLOY SECURE ROOM TELEMETRY
          </h2>
          
          <form onSubmit={handleCreateRoom} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-[9px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">Room Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="[TEST] Sector 36 Command Post"
                className="w-full bg-black border border-emerald-500/20 text-emerald-400 placeholder-emerald-500/20 text-xs px-3 py-2 outline-none focus:border-emerald-500/60 rounded-sm"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-[9px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">Channel Category</label>
              <select
                value={roomChannel}
                onChange={(e) => setRoomChannel(e.target.value as any)}
                className="w-full bg-black border border-emerald-500/20 text-emerald-400 text-xs px-3 py-2 outline-none focus:border-emerald-500/60 rounded-sm"
              >
                <option value="GEOPOLITICS">🛰️ GEOPOLITICS (지정학적 위협)</option>
                <option value="ECONOMY">📊 ECONOMY (경제 위기)</option>
                <option value="WEATHER">🌪️ WEATHER (기상/자연재해)</option>
              </select>
            </div>

            <div className="relative md:col-span-1">
              <label className="block text-[9px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">Incident Association (Searchable)</label>
              <input
                type="text"
                value={incidentSearch}
                onFocus={() => setIsDropdownOpen(true)}
                onBlur={() => {
                  // A small delay to let onMouseDown selection process first
                  setTimeout(() => setIsDropdownOpen(false), 200);
                }}
                onChange={(e) => {
                  setIncidentSearch(e.target.value);
                }}
                placeholder="Type to filter incidents..."
                className="w-full bg-black border border-emerald-500/20 text-emerald-400 placeholder-emerald-500/20 text-xs px-3 py-2 outline-none focus:border-emerald-500/60 rounded-sm"
              />
              {isDropdownOpen && (
                <div className="absolute left-0 right-0 z-50 bg-black border border-emerald-500/30 max-h-60 overflow-y-auto mt-1 rounded-sm shadow-[0_4px_12px_rgba(0,0,0,0.8)] scrollbar-none">
                  {/* 독립 룸 Option */}
                  <div
                    onMouseDown={() => {
                      setIncidentId("");
                      setIncidentSearch("");
                      setIsDropdownOpen(false);
                    }}
                    className="px-3 py-2 text-xs text-emerald-500/60 hover:bg-emerald-500/10 cursor-pointer border-b border-emerald-500/10 font-bold"
                  >
                    -- 독립 룸 (인시던트 미연결) --
                  </div>
                  {(() => {
                    const filtered = incidents.filter(incident => {
                      const term = incidentSearch.toLowerCase();
                      return (
                        (incident.title && incident.title.toLowerCase().includes(term)) ||
                        (incident.region && incident.region.toLowerCase().includes(term))
                      );
                    });
                    if (filtered.length === 0) {
                      return <div className="px-3 py-2 text-xs text-neutral-500 italic">No incidents found</div>;
                    }
                    return filtered.map((incident) => (
                      <div
                        key={incident.id}
                        onMouseDown={() => {
                          setIncidentId(incident.id);
                          setIncidentSearch(incident.title);
                          
                          // Auto-fill form fields
                          setTitle(`[ACTIVE] ${incident.title}`);
                          setRegion(incident.region || "");
                          if (incident.lat) setLat(String(incident.lat));
                          if (incident.lng) setLng(String(incident.lng));
                          
                          setIsDropdownOpen(false);
                        }}
                        className={`px-3 py-2 text-xs hover:bg-emerald-500/10 cursor-pointer text-emerald-400 border-b border-emerald-500/5 ${incidentId === incident.id ? 'bg-emerald-500/5 text-white font-bold' : ''}`}
                      >
                        <div className="font-bold">{incident.title}</div>
                        <div className="text-[9px] text-neutral-500 font-mono">Region: {incident.region || "N/A"} | ID: {incident.id}</div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[9px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">Region (City/Area)</label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Cheongju"
                className="w-full bg-black border border-emerald-500/20 text-emerald-400 placeholder-emerald-500/20 text-xs px-3 py-2 outline-none focus:border-emerald-500/60 rounded-sm"
              />
            </div>

            <div>
              <label className="block text-[9px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">Country Code</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="KR"
                className="w-full bg-black border border-emerald-500/20 text-emerald-400 placeholder-emerald-500/20 text-xs px-3 py-2 outline-none focus:border-emerald-500/60 rounded-sm"
              />
            </div>

            <div>
              <label className="block text-[9px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">Tactical Radius (KM)</label>
              <input
                type="number"
                step="0.1"
                required
                value={radiusKm}
                onChange={(e) => setRadiusKm(e.target.value)}
                placeholder="50.0"
                className="w-full bg-black border border-emerald-500/20 text-emerald-400 placeholder-emerald-500/20 text-xs px-3 py-2 outline-none focus:border-emerald-500/60 rounded-sm"
              />
            </div>

            <div>
              <label className="block text-[9px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">Latitude Coordinates</label>
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="36.6536"
                className="w-full bg-black border border-emerald-500/20 text-emerald-400 placeholder-emerald-500/20 text-xs px-3 py-2 outline-none focus:border-emerald-500/60 rounded-sm"
              />
            </div>

            <div>
              <label className="block text-[9px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">Longitude Coordinates</label>
              <input
                type="number"
                step="0.0001"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="127.4891"
                className="w-full bg-black border border-emerald-500/20 text-emerald-400 placeholder-emerald-500/20 text-xs px-3 py-2 outline-none focus:border-emerald-500/60 rounded-sm"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-emerald-500/10 border border-emerald-400 text-emerald-400 text-xs font-bold py-2.5 uppercase tracking-widest cursor-pointer hover:bg-emerald-500/20 transition-all duration-300 rounded-sm"
              >
                {submitting ? "DEPLOYNIG..." : "▶ DEPLOY CHANNEL"}
              </button>
            </div>
          </form>

          {formError && (
            <div className="text-red-400 text-xs bg-red-950/20 border border-red-500/20 px-3 py-2 mt-4 rounded-sm">
              ⚠️ {formError}
            </div>
          )}
        </div>

        {/* Cyberpunk Divider */}
        <div className="relative my-2 flex items-center justify-center">
          <div className="w-full h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
          <span className="absolute bg-black px-4 text-[9px] text-emerald-500/40 tracking-[0.4em] uppercase font-bold">
            SECURE LINK SCANNER
          </span>
        </div>

        {/* WATCHCON Manual Control */}
        <div className="border border-emerald-500/20 bg-neutral-950/60 p-5 rounded-sm">
          <h2 className="text-xs font-bold tracking-widest text-emerald-300 border-b border-emerald-500/20 pb-2 mb-4 uppercase">
            ◈ WATCHCON MANUAL OVERRIDE
          </h2>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Current status */}
            <div className="flex items-center gap-3 mr-4">
              <div className="text-4xl font-black font-mono" style={{
                color: watchconStage === 1 ? '#ef4444' : watchconStage === 2 ? '#f97316' : watchconStage === 3 ? '#f59e0b' : watchconStage === 4 ? '#3b82f6' : '#22c55e',
              }}>
                {watchconStage}
              </div>
              <div>
                <div className="text-[9px] text-emerald-500/50 tracking-widest font-bold uppercase">
                  {['','CRITICAL','HIGH','ELEVATED','WATCH','NORMAL'][watchconStage]}
                </div>
                <div className={`text-[8px] font-bold tracking-wider mt-0.5 ${watchconOverride ? 'text-red-400' : 'text-emerald-500/40'}`}>
                  {watchconOverride ? '⚡ CMD OVERRIDE' : '● AUTO MODE'}
                </div>
              </div>
            </div>
            {/* AUTO button */}
            <button
              disabled={watchconUpdating}
              onClick={handleWatchconAuto}
              className={`px-3 py-1.5 text-[10px] font-bold tracking-wider border transition-all cursor-pointer rounded-sm ${
                !watchconOverride
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400'
                  : 'border-emerald-500/20 text-emerald-500/40 hover:border-emerald-500/40 hover:text-emerald-400'
              }`}
            >
              AUTO
            </button>
            {/* Stage buttons */}
            {[5, 4, 3, 2, 1].map((s) => {
              const colors: Record<number, string> = { 5:'#22c55e', 4:'#3b82f6', 3:'#f59e0b', 2:'#f97316', 1:'#ef4444' };
              const isActive = watchconOverride && watchconStage === s;
              return (
                <button
                  key={s}
                  disabled={watchconUpdating}
                  onClick={() => handleWatchconSet(s)}
                  className="px-3 py-1.5 text-[10px] font-black tracking-wider border transition-all cursor-pointer rounded-sm"
                  style={{
                    borderColor: isActive ? colors[s] : 'rgba(255,255,255,0.08)',
                    color: isActive ? colors[s] : 'rgba(255,255,255,0.35)',
                    background: isActive ? `${colors[s]}18` : 'transparent',
                    boxShadow: isActive ? `0 0 10px ${colors[s]}40` : 'none',
                  }}
                >
                  CON {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Room Table Grid */}
        <div className="border border-emerald-500/20 bg-neutral-950/60 p-5 rounded-sm">
          {/* Table Header Filter */}
          <div className="flex justify-between items-center border-b border-emerald-500/20 pb-3 mb-4">
            <h2 className="text-xs font-bold tracking-widest text-emerald-300 uppercase">
              ◈ LIVE SECURE COMMUNICATION CHANNELS
            </h2>

            <div className="flex items-center gap-2">
              <span className="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">Filter Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-black border border-emerald-500/20 text-emerald-400 text-xs px-3 py-1 outline-none focus:border-emerald-500/60 rounded-sm"
              >
                <option value="">ALL CHANNELS</option>
                <option value="STAGED">STAGED</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center text-xs py-8 text-emerald-500/50 animate-pulse">
                SCANNING SIGNAL METRICS...
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center text-xs py-8 text-neutral-500">
                NO ACTIVE CHANNELS IN SECTOR
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-emerald-500/20 text-neutral-400 text-[10px] uppercase tracking-widest">
                    <th className="py-2.5 px-3">Room Title</th>
                    <th className="py-2.5 px-3">Channel</th>
                    <th className="py-2.5 px-3">Sector Location</th>
                    <th className="py-2.5 px-3">GPS Coordinates</th>
                    <th className="py-2.5 px-3">Bound Radius</th>
                    <th className="py-2.5 px-3 text-center">Operational Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr
                      key={room.id}
                      className="border-b border-emerald-500/10 hover:bg-emerald-500/5 transition-all duration-150"
                    >
                      <td className="py-3 px-3 font-bold text-white max-w-xs truncate">{room.title}</td>
                      <td className="py-3 px-3">
                        <span 
                          className="text-[9px] font-black px-1.5 py-0.5 rounded-sm border uppercase"
                          style={{
                            color: room.channel === "GEOPOLITICS" ? "#00ff88" : room.channel === "ECONOMY" ? "#ffdd00" : "#00ccff",
                            borderColor: `${room.channel === "GEOPOLITICS" ? "#00ff88" : room.channel === "ECONOMY" ? "#ffdd00" : "#00ccff"}40`,
                            backgroundColor: `${room.channel === "GEOPOLITICS" ? "#00ff88" : room.channel === "ECONOMY" ? "#ffdd00" : "#00ccff"}10`
                          }}
                        >
                          {room.channel || "GEOPOLITICS"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-neutral-300">
                        {room.region}, {room.country}
                      </td>
                      <td className="py-3 px-3 text-neutral-400 font-mono">
                        {room.lat && room.lng ? `${room.lat.toFixed(4)}, ${room.lng.toFixed(4)}` : "FALLBACK"}
                      </td>
                      <td className="py-3 px-3 text-neutral-400">
                        {room.status === "RESOLVED" ? (
                          <span>{room.radius_km.toFixed(1)} KM</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.1"
                              value={editingRadius[room.id] ?? String(room.radius_km)}
                              onChange={(e) => setEditingRadius(prev => ({ ...prev, [room.id]: e.target.value }))}
                              className="w-16 bg-black border border-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 outline-none focus:border-emerald-500/60 rounded-sm font-mono text-right"
                            />
                            <span className="text-[10px] text-neutral-500 font-bold font-mono">KM</span>
                            <button
                              onClick={() => handleUpdateRadius(room.id)}
                              className="bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-sm cursor-pointer transition-all duration-200 font-mono"
                            >
                              SET
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-sm border ${
                            room.status === "ACTIVE"
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                              : room.status === "STAGED"
                              ? "border-yellow-500 bg-yellow-500/10 text-yellow-400"
                              : "border-neutral-600 bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          {room.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex justify-end gap-2 items-center">
                          {room.status === "STAGED" && (
                            <button
                              onClick={() => handleUpdateStatus(room.id, "ACTIVE")}
                              className="bg-emerald-500/10 border border-emerald-500 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-3 py-1 rounded-sm cursor-pointer transition-all duration-200"
                            >
                              ACTIVATE
                            </button>
                          )}
                          {room.status === "ACTIVE" && (
                            <button
                              onClick={() => handleUpdateStatus(room.id, "RESOLVED")}
                              className="bg-red-500/10 border border-red-500 hover:bg-red-500/20 text-red-400 text-[10px] font-bold px-3 py-1 rounded-sm cursor-pointer transition-all duration-200"
                            >
                              CLOSE
                            </button>
                          )}
                          {room.status === "RESOLVED" && (
                            <span className="text-[10px] text-neutral-600 italic mr-2">RESOLVED</span>
                          )}
                          
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            className="bg-red-950/20 border border-red-500/40 hover:border-red-500 hover:bg-red-500/20 text-red-400 text-[10px] font-bold px-3 py-1 rounded-sm cursor-pointer transition-all duration-200"
                          >
                            DELETE
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* WATCHCON Log Table */}
        <div className="border border-emerald-500/20 bg-neutral-950/60 p-5 rounded-sm">
          <div className="flex justify-between items-center border-b border-emerald-500/20 pb-3 mb-4">
            <h2 className="text-xs font-bold tracking-widest text-emerald-300 uppercase">
              ◈ ⚡ WATCHCON AUTO-TRIGGER LOG
            </h2>
            <button 
              onClick={fetchWatchconLogs}
              className="text-[9px] text-emerald-500 hover:text-emerald-400 font-bold border border-emerald-500/30 px-2 py-0.5 rounded-sm transition-all cursor-pointer"
            >
              [ REFRESH LOG ]
            </button>
          </div>

          <div className="overflow-x-auto">
            {loadingLogs ? (
              <div className="text-center text-xs py-8 text-emerald-500/50 animate-pulse">
                RETRIEVING ENCRYPTED LOG DATA...
              </div>
            ) : watchconLogs.length === 0 ? (
              <div className="text-center text-xs py-8 text-neutral-500">
                NO RECENT AUTO-TRIGGER EVENTS
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-emerald-500/20 text-neutral-400 text-[10px] uppercase tracking-widest">
                    <th className="py-2.5 px-3">Timestamp (KST)</th>
                    <th className="py-2.5 px-3">Stage Change</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Incident Title</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3">Region / Country</th>
                  </tr>
                </thead>
                <tbody>
                  {watchconLogs.map((log) => {
                    const stageColors: Record<number, string> = {
                      1: "#ff0000",
                      2: "#ff4400",
                      3: "#ffaa00",
                      4: "#4488ff",
                      5: "#00ff88"
                    };
                    
                    const getSevColor = (sev?: number) => {
                      if (!sev) return "text-neutral-600";
                      if (sev >= 0.85) return "text-red-500 font-bold";
                      if (sev >= 0.7) return "text-orange-500";
                      return "text-emerald-500";
                    };

                    const formatKst = (iso: string) => {
                      const d = new Date(iso);
                      return d.toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false
                      });
                    };

                    return (
                      <tr key={log.id} className="border-b border-emerald-500/10 hover:bg-emerald-500/5 transition-all">
                        <td className="py-3 px-3 text-neutral-400 font-mono whitespace-nowrap">
                          {formatKst(log.timestamp)}
                        </td>
                        <td className="py-3 px-3 font-mono">
                          <span style={{ color: stageColors[log.previous_stage] || "#fff" }}>{log.previous_stage}</span>
                          <span className="mx-2 text-neutral-600">→</span>
                          <span style={{ color: stageColors[log.new_stage] || "#fff" }} className="font-bold underline underline-offset-4 decoration-2">
                            {log.new_stage}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-sm">
                            {log.trigger_type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-neutral-200 max-w-[250px] truncate" title={log.incident_title}>
                          {log.incident_title || "SYSTEM_EVENT"}
                        </td>
                        <td className={`py-3 px-3 font-mono ${getSevColor(log.incident_severity)}`}>
                          {log.incident_severity ? log.incident_severity.toFixed(2) : "N/A"}
                        </td>
                        <td className="py-3 px-3 text-neutral-400 uppercase tracking-tighter">
                          {log.region ? `${log.region} / ${log.country}` : "GLOBAL"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
