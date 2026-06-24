export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import dns from "dns/promises";
import net from "net";

const MAX_BYTES = 10 * 1024 * 1024;      // 10 MB cap
const FETCH_TIMEOUT_MS = 8000;
const ALLOWED_CT = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Reject private / loopback / link-local / metadata addresses (SSRF guard)
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;                       // loopback
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;          // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === "::1") return true;                   // loopback
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // ULA
    if (low.startsWith("fe80")) return true;          // link-local
    if (low.startsWith("::ffff:")) return isPrivateIp(low.split(":").pop() || "");
    return false;
  }
  return true; // unknown format → treat as unsafe
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "MISSING_URL" }, { status: 400 });
  }

  // 1. Scheme + parse
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return NextResponse.json({ error: "BAD_URL" }, { status: 400 });
  }
  if (u.protocol !== "https:") {
    return NextResponse.json({ error: "HTTPS_ONLY" }, { status: 400 });
  }
  if (/\.svg(\?|$)/i.test(u.pathname)) {
    return NextResponse.json({ error: "SVG_BLOCKED" }, { status: 400 });
  }

  // 2. SSRF: resolve host, reject private/internal targets
  const host = u.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return NextResponse.json({ error: "BLOCKED_HOST" }, { status: 400 });
  }
  try {
    if (net.isIP(host)) {
      if (isPrivateIp(host)) return NextResponse.json({ error: "BLOCKED_IP" }, { status: 400 });
    } else {
      const records = await dns.lookup(host, { all: true });
      if (records.length === 0 || records.some(r => isPrivateIp(r.address))) {
        return NextResponse.json({ error: "BLOCKED_RESOLVED_IP" }, { status: 400 });
      }
    }
  } catch {
    return NextResponse.json({ error: "DNS_FAIL" }, { status: 400 });
  }

  // 3. Fetch (no redirect following → prevents bounce to internal)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(u.toString(), {
      signal: controller.signal,
      redirect: "manual",
      headers: { "User-Agent": "TacticalGlobeMediaProxy/1.0", "Accept": "image/*" },
    });

    if (upstream.status !== 200) {
      return NextResponse.json({ error: "UPSTREAM_STATUS", status: upstream.status }, { status: 502 });
    }

    const ct = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_CT.includes(ct)) {
      return NextResponse.json({ error: "BAD_CONTENT_TYPE", ct }, { status: 415 });
    }

    const lenHeader = parseInt(upstream.headers.get("content-length") || "0", 10);
    if (lenHeader && lenHeader > MAX_BYTES) {
      return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src data:",
      },
    });
  } catch (e) {
    const reason = e instanceof Error && e.name === "AbortError" ? "TIMEOUT" : "FETCH_FAIL";
    return NextResponse.json({ error: reason }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
