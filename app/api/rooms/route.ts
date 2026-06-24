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

export async function POST(request: NextRequest) {
  let db;
  try {
    const body = await request.json();
    const { title, userId, username, incidentId, region, country, lat, lng, channel } = body;
    const roomChannel = channel || "GEOPOLITICS";

    if (!title || !userId || !username) {
      return NextResponse.json({ error: "MISSING_REQUIRED_FIELDS" }, { status: 400 });
    }

    db = getDb();

    // 1. Ensure user exists
    const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    const nowIso = new Date().toISOString();
    
    if (!userExists) {
      db.prepare(`
        INSERT INTO users (id, username, trust_level, created_at)
        VALUES (?, ?, 'GUEST', ?)
      `).run(userId, username, nowIso);
    }

    // 2. Fetch coordinates from incident if not provided
    let finalRegion = region || null;
    let finalCountry = country || null;
    let finalLat = lat !== undefined ? lat : null;
    let finalLng = lng !== undefined ? lng : null;

    if (incidentId && (!finalLat || !finalLng)) {
      const incident = db.prepare("SELECT region, country, lat, lng FROM incidents WHERE id = ?").get(incidentId) as
        | { region: string | null; country: string | null; lat: number | null; lng: number | null }
        | undefined;
      if (incident) {
        finalRegion = finalRegion || incident.region;
        finalCountry = finalCountry || incident.country;
        finalLat = finalLat ?? incident.lat;
        finalLng = finalLng ?? incident.lng;
      }
    }

    const roomId = "room_" + crypto.randomUUID().replace(/-/g, "").substring(0, 13);

    // 3. Create room
    db.prepare(`
      INSERT INTO rooms (id, incident_id, title, region, country, lat, lng, status, created_by, created_at, last_activity, channel)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
    `).run(roomId, incidentId || null, title, finalRegion, finalCountry, finalLat, finalLng, userId, nowIso, nowIso, roomChannel);

    const newRoom = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);

    return NextResponse.json({ success: true, room: newRoom });
  } catch (error) {
    console.error("Room creation error:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}

export async function GET(request: NextRequest) {
  let db;
  try {
    db = getDb();
    const channel = request.nextUrl.searchParams.get("channel") || "GEOPOLITICS";
    const rooms = db.prepare("SELECT * FROM rooms WHERE channel = ? ORDER BY last_activity DESC").all(channel);
    return NextResponse.json({ success: true, rooms });
  } catch (error) {
    console.error("Fetch rooms error:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}
