"use client";

import React, { useEffect, useState, useRef } from "react";

interface RoomPanelProps {
  incidentId: string;
  incidentTitle: string;
  region: string;
  channel: string;
  onClose: () => void;
}

interface Post {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  trust_level: string;
  content: string;
  media_url?: string;
  lat?: number;
  lng?: number;
  trust_score: number;
  created_at: string;
}

interface Room {
  id: string;
  incident_id?: string;
  title: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  status: string;
  created_by: string;
  created_at: string;
  last_activity: string;
}

export function RoomPanel({ incidentId, incidentTitle, region, channel, onClose }: RoomPanelProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [inputText, setInputText] = useState("");
  const [attachLocation, setAttachLocation] = useState(false);
  const [sending, setSending] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let storedId = localStorage.getItem("user_id");
    let storedName = localStorage.getItem("username");
    if (!storedId) {
      storedId = "user_" + crypto.randomUUID().replace(/-/g, "").substring(0, 13);
      localStorage.setItem("user_id", storedId);
    }
    if (!storedName) {
      storedName = "ANON_" + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem("username", storedName);
    }
    setUserId(storedId);
    setUsername(storedName);
  }, []);

  useEffect(() => {
    if (!userId || !username || !incidentId) return;
    let active = true;
    setLoading(true);
    setError(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    const initRoom = async () => {
      try {
        const listRes = await fetch(`/api/rooms?channel=${encodeURIComponent(channel)}`);
        if (!listRes.ok) throw new Error("Failed to load rooms list");
        const listData = await listRes.json();
        let targetRoom = listData.rooms?.find((r: Room) => r.incident_id === incidentId || r.id === incidentId);
        if (!targetRoom) {
          const createRes = await fetch("/api/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: `${incidentTitle} 커뮤니티`, userId, username, incidentId, region, channel })
          });
          if (!createRes.ok) throw new Error("Failed to create room");
          const createData = await createRes.json();
          targetRoom = createData.room;
        }
        if (!active) return;
        setRoom(targetRoom);
        const detailsRes = await fetch(`/api/rooms/${targetRoom.id}`);
        if (!detailsRes.ok) throw new Error("Failed to load room posts");
        const detailsData = await detailsRes.json();
        if (!active) return;
        setPosts(detailsData.posts || []);
        setLoading(false);
        const lastTime = detailsData.posts?.length > 0
          ? detailsData.posts[detailsData.posts.length - 1].created_at
          : new Date().toISOString();
        const es = new EventSource(`/api/rooms/${targetRoom.id}/stream?last_event_id=${encodeURIComponent(lastTime)}`);
        eventSourceRef.current = es;
        es.onmessage = (event) => {
          try {
            const newPosts = JSON.parse(event.data) as Post[];
            if (newPosts?.length > 0) {
              setPosts((prev) => {
                const existingIds = new Set(prev.map((p) => p.id));
                return [...prev, ...newPosts.filter((p) => !existingIds.has(p.id))];
              });
            }
          } catch (e) { console.error("SSE parse error", e); }
        };
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to initialize room");
          setLoading(false);
        }
      }
    };
    initRoom();
    return () => {
      active = false;
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    };
  }, [incidentId, incidentTitle, region, channel, userId, username]);

  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [posts]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !room || sending) return;
    setSending(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (attachLocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, maximumAge: 0 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch { /* silent */ }
      }
      const res = await fetch(`/api/rooms/${room.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: inputText, userId, username, lat, lng })
      });
      if (!res.ok) throw new Error("Failed to send");
      const data = await res.json();
      setPosts((prev) => prev.some((p) => p.id === data.post.id) ? prev : [...prev, data.post]);
      setInputText("");
    } catch (err) { console.error("Send error:", err); }
    finally { setSending(false); }
  };

  const channelLabel =
    channel === 'GEOPOLITICS' ? 'GEOPOL' :
    channel === 'ECONOMY' ? 'ECON' :
    channel === 'WEATHER' ? 'METEO' : channel;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "380px",
        height: "100vh",
        background: "rgba(8, 8, 8, 0.97)",
        borderLeft: "1px solid rgba(var(--theme-rgb), 0.20)",
        boxShadow: "-16px 0 48px rgba(0,0,0,0.6), inset 1px 0 0 rgba(var(--theme-rgb), 0.05)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        fontFamily: "var(--font-share-tech-mono), monospace",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Classification stripe */}
      <div style={{ height: "2px", background: `linear-gradient(90deg, transparent, var(--theme-color), transparent)`, opacity: 0.7 }} />

      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <div
              style={{
                width: "5px", height: "5px", borderRadius: "50%",
                background: "var(--theme-color)",
                boxShadow: "0 0 6px var(--theme-color)",
                animation: "beacon 2.4s ease-out infinite",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.18em", color: "#909090", textTransform: "uppercase" }}>
              SECURE COMMS // {channelLabel} CHANNEL
            </span>
          </div>
          <h3 style={{ fontSize: "13px", fontWeight: 700, margin: 0, color: "#ffffff", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {incidentTitle}
          </h3>
          <div style={{ fontSize: "10px", color: "rgba(var(--theme-rgb), 0.6)", marginTop: "4px", letterSpacing: "0.08em" }}>
            {region || "Unknown Region"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.50)",
            fontSize: "14px",
            cursor: "pointer",
            padding: "6px 10px",
            lineHeight: 1,
            transition: "all 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.50)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
        >
          ✕
        </button>
      </div>

      {/* Posts Feed */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          scrollbarWidth: "none",
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.35)", fontSize: "11px", letterSpacing: "0.15em" }}>
            ESTABLISHING SECURE LINK...
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#ef4444", fontSize: "11px" }}>
            ERROR: {error}
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.25)", fontSize: "10px", letterSpacing: "0.15em" }}>
            NO TRANSMISSIONS RECEIVED
          </div>
        ) : (
          posts.map((post) => {
            const isOsint = post.user_id === "osint_worker" || post.trust_level === "OSINT";
            const timeStr = new Date(post.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
            const accentColor = isOsint ? "#f59e0b" : "var(--theme-color)";

            return (
              <div
                key={post.id}
                style={{
                  background: isOsint ? "rgba(245,158,11,0.04)" : "rgba(255,255,255,0.02)",
                  borderTop: isOsint ? "1px solid rgba(245,158,11,0.20)" : "1px solid rgba(255,255,255,0.07)",
                  borderRight: isOsint ? "1px solid rgba(245,158,11,0.20)" : "1px solid rgba(255,255,255,0.07)",
                  borderBottom: isOsint ? "1px solid rgba(245,158,11,0.20)" : "1px solid rgba(255,255,255,0.07)",
                  borderLeft: `2px solid ${accentColor}`,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {/* Message header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: accentColor as string, letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {post.username}
                    </span>
                    <span
                      style={{
                        fontSize: "7px",
                        padding: "1px 5px",
                        border: `1px solid ${accentColor}50`,
                        color: accentColor as string,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        flexShrink: 0,
                      }}
                    >
                      {isOsint ? "OSINT" : post.trust_level || "GUEST"}
                    </span>
                  </div>
                  <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", flexShrink: 0, fontFamily: "var(--font-share-tech-mono), monospace" }}>
                    {timeStr}
                  </span>
                </div>

                {/* Content */}
                <div style={{ fontSize: "12px", color: "#dcdcdc", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {post.content}
                </div>

                {/* Coordinates */}
                {post.lat != null && post.lng != null && (
                  <div style={{ fontSize: "9px", color: `rgba(var(--theme-rgb), 0.45)`, letterSpacing: "0.08em", fontFamily: "var(--font-share-tech-mono), monospace" }}>
                    COORDS: {post.lat.toFixed(4)}°, {post.lng.toFixed(4)}°
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={feedEndRef} />
      </div>

      {/* Input Panel */}
      <form
        onSubmit={handleSend}
        style={{
          padding: "12px 14px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(8,8,8,0.98)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {/* User info bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "9px", color: "rgba(255,255,255,0.40)", cursor: "pointer", letterSpacing: "0.08em" }}>
            <input
              type="checkbox"
              checked={attachLocation}
              onChange={(e) => setAttachLocation(e.target.checked)}
              style={{ accentColor: "var(--theme-color)", width: "10px", height: "10px" }}
            />
            ATTACH COORDINATES
          </label>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontFamily: "var(--font-share-tech-mono), monospace", letterSpacing: "0.08em" }}>
            ID: {username}
          </span>
        </div>

        {/* Input row */}
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Transmit intel..."
            disabled={loading || sending}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "8px 12px",
              fontSize: "12px",
              color: "#e0e0e0",
              outline: "none",
              fontFamily: "var(--font-share-tech-mono), monospace",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(var(--theme-rgb), 0.45)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || loading || sending}
            style={{
              background: !inputText.trim() || loading || sending ? "transparent" : "rgba(var(--theme-rgb), 0.10)",
              border: !inputText.trim() || loading || sending ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(var(--theme-rgb), 0.45)",
              color: !inputText.trim() || loading || sending ? "rgba(255,255,255,0.25)" : "var(--theme-color)",
              fontSize: "11px",
              padding: "0 14px",
              cursor: !inputText.trim() || loading || sending ? "not-allowed" : "pointer",
              fontWeight: 700,
              letterSpacing: "0.12em",
              fontFamily: "var(--font-share-tech-mono), monospace",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {sending ? "···" : "SEND"}
          </button>
        </div>
      </form>
    </div>
  );
}
