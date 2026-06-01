export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "osint_matrix.db");

function getDb() {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 15000");
  db.pragma("foreign_keys = ON");
  return db;
}

// Haversine distance (km)
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let db;
  try {
    const { id: roomId } = await params;
    const body = await request.json();
    const { content, userId, username, mediaUrl, lat, lng, userLat, userLng } = body;
    const reportLat = userLat !== undefined ? userLat : lat;
    const reportLng = userLng !== undefined ? userLng : lng;

    if (!content || !userId || !username) {
      return NextResponse.json({ error: "MISSING_REQUIRED_FIELDS" }, { status: 400 });
    }

    db = getDb();

    // 1. Verify room exists
    const roomExists = db.prepare("SELECT id FROM rooms WHERE id = ?").get(roomId);
    if (!roomExists) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    // 2. Ensure user exists
    const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    const nowIso = new Date().toISOString();
    
    if (!userExists) {
      db.prepare(`
        INSERT INTO users (id, username, trust_level, created_at)
        VALUES (?, ?, 'GUEST', ?)
      `).run(userId, username, nowIso);
    }

    const postId = "post_" + crypto.randomUUID().replace(/-/g, "").substring(0, 13);
    const finalLat = reportLat !== undefined ? reportLat : null;
    const finalLng = reportLng !== undefined ? reportLng : null;

    // ── Bayesian spatial-trust: distance to room epicenter + trust gate ──
    let spatialDistanceKm: number | null = null;
    let isVerified = 0;
    const roomGeo = db.prepare("SELECT lat, lng FROM rooms WHERE id = ?").get(roomId) as any;
    const userRow = db.prepare("SELECT trust_score FROM users WHERE id = ?").get(userId) as any;
    const trustScore = userRow?.trust_score ?? 0.5;
    if (roomGeo?.lat != null && roomGeo?.lng != null && finalLat != null && finalLng != null) {
      spatialDistanceKm = haversineKm(finalLat, finalLng, roomGeo.lat, roomGeo.lng);
      isVerified = (spatialDistanceKm <= 10 && trustScore > 0.7) ? 1 : 0;
    }

    // 3. Insert post
    db.prepare(`
      INSERT INTO posts (id, room_id, user_id, content, media_url, lat, lng, trust_score, created_at, spatial_distance_km, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0.5, ?, ?, ?)
    `).run(postId, roomId, userId, content, mediaUrl || null, finalLat, finalLng, nowIso, spatialDistanceKm, isVerified);

    // 4. Update last activity of the room
    db.prepare(`
      UPDATE rooms SET last_activity = ? WHERE id = ?
    `).run(nowIso, roomId);

    const newPost = db.prepare(`
      SELECT p.*, u.username, u.trust_level
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(postId);

    return NextResponse.json({ success: true, post: newPost });
  } catch (error: any) {
    console.error("Post creation error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details: error.message }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}
