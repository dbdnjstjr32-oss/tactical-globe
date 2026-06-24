"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/admin");
      } else {
        setError("인증 실패: 패스워드가 올바르지 않습니다.");
      }
    } catch {
      setError("서버 통신 실패: 연결 상태를 확인하십시오.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-mono relative overflow-hidden">
      {/* Background Cyberpunk scanline and glow effects */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.08)_0%,transparent_60%)] z-0" />
      <div 
        className="absolute inset-0 pointer-events-none z-0 opacity-15"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 50%, transparent 50%)",
          backgroundSize: "100% 4px"
        }}
      />

      <div className="relative z-10 w-full max-w-sm border border-white/30 bg-neutral-950/90 p-8 shadow-[0_0_40px_rgba(255,255,255,0.06)] rounded-sm">
        {/* Neon top bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent" />

        <div className="mb-6 text-center">
          <div className="text-[9px] text-white/50 tracking-[0.25em] font-bold uppercase mb-1">
            SECURE LINK PORTAL
          </div>
          <h2 className="text-xl font-black text-white tracking-wider">
            ADMINISTRATIVE CONSOLE
          </h2>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-1.5 font-bold">
              Access Credentials
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter secure passcode..."
              disabled={loading}
              className="w-full bg-black border border-white/20 text-white placeholder-white/30 text-xs px-4 py-2.5 outline-none focus:border-white/60 focus:shadow-[0_0_10px_rgba(255,255,255,0.1)] transition-all duration-300 rounded-sm"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-red-400 text-[10px] bg-red-950/20 border border-red-500/20 px-3 py-2 rounded-sm text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!password.trim() || loading}
            className="w-full bg-white/10 border border-white text-white text-xs font-bold py-3 uppercase tracking-widest cursor-pointer hover:bg-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 rounded-sm"
          >
            {loading ? "AUTHENTICATING..." : "▶ DECRYPT & JOIN"}
          </button>
        </form>
      </div>
    </div>
  );
}
