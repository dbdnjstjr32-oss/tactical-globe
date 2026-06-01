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

export async function GET(request: NextRequest) {
  let db;
  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

    db = getDb();
    let rooms;
    if (statusFilter) {
      rooms = db.prepare("SELECT * FROM rooms WHERE status = ? ORDER BY last_activity DESC").all(statusFilter);
    } else {
      rooms = db.prepare("SELECT * FROM rooms ORDER BY last_activity DESC").all();
    }

    return NextResponse.json({ success: true, rooms });
  } catch (error: any) {
    console.error("Admin rooms fetch error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details: error.message }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}

export async function POST(request: NextRequest) {
  let db;
  try {
    const body = await request.json();
    const { incidentId, title, region, country, lat, lng, radiusKm, channel } = body;

    if (!title) {
      return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 });
    }

    db = getDb();

    const roomId = "room_" + crypto.randomUUID().replace(/-/g, "").substring(0, 13);
    const nowIso = new Date().toISOString();

    // Ensure the admin user exists in the users table to prevent Foreign Key constraint failure
    const adminUserExists = db.prepare("SELECT id FROM users WHERE id = 'admin'").get();
    if (!adminUserExists) {
      db.prepare(`
        INSERT INTO users (id, username, trust_level, created_at)
        VALUES ('admin', 'System Admin', 'ADMIN', ?)
      `).run(nowIso);
    }

    const finalIncidentId = incidentId || null;
    const finalRegion = region || "Unknown";
    const finalCountry = country || "KR";
    const finalLat = lat !== undefined ? Number(lat) : null;
    const finalLng = lng !== undefined ? Number(lng) : null;
    const finalRadius = radiusKm !== undefined ? Number(radiusKm) : 50.0;
    const finalChannel = channel || "GEOPOLITICS";

    db.prepare(`
      INSERT INTO rooms (id, incident_id, title, region, country, lat, lng, radius_km, status, created_by, created_at, last_activity, channel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'STAGED', 'admin', ?, ?, ?)
    `).run(roomId, finalIncidentId, title, finalRegion, finalCountry, finalLat, finalLng, finalRadius, nowIso, nowIso, finalChannel);

    const createdRoom = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);

    return NextResponse.json({ success: true, room: createdRoom });
  } catch (error: any) {
    console.error("Admin room create error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details: error.message }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}

export async function PATCH(request: NextRequest) {
  let db: any;
  try {
    const body = await request.json();
    const { id, status, radius_km } = body;

    if (!id) {
      return NextResponse.json({ error: "ROOM_ID_REQUIRED" }, { status: 400 });
    }

    db = getDb();

    // Verify room exists
    const room = db.prepare("SELECT id FROM rooms WHERE id = ?").get(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    
    // Dynamically build update query
    const updates = [];
    const params = [];
    
    if (status !== undefined) {
      if (!["STAGED", "ACTIVE", "RESOLVED"].includes(status)) {
        return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
      }
      updates.push("status = ?");
      params.push(status);
    }
    
    if (radius_km !== undefined) {
      const radiusNum = Number(radius_km);
      if (isNaN(radiusNum) || radiusNum <= 0) {
        return NextResponse.json({ error: "INVALID_RADIUS" }, { status: 400 });
      }
      updates.push("radius_km = ?");
      params.push(radiusNum);
    }
    
    if (updates.length > 0) {
      updates.push("last_activity = ?");
      params.push(nowIso);
      
      params.push(id);
      
      db.prepare(`
        UPDATE rooms 
        SET ${updates.join(", ")}
        WHERE id = ?
      `).run(...params);
    }

    const updatedRoom = db.prepare("SELECT * FROM rooms WHERE id = ?").get(id);

    return NextResponse.json({ success: true, room: updatedRoom });
  } catch (error: any) {
    console.error("Admin room update error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details: error.message }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}

export async function DELETE(request: NextRequest) {
  let db: any;
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "ROOM_ID_REQUIRED" }, { status: 400 });
    }

    db = getDb();

    // Verify room exists
    const room = db.prepare("SELECT id FROM rooms WHERE id = ?").get(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    // Begin transaction for safety since we're deleting both posts and rooms
    const deleteTx = db.transaction(() => {
      // 1. Delete associated posts
      db.prepare("DELETE FROM posts WHERE room_id = ?").run(id);
      // 2. Delete room
      db.prepare("DELETE FROM rooms WHERE id = ?").run(id);
    });

    deleteTx();

    return NextResponse.json({ success: true, message: "Room and associated posts deleted successfully" });
  } catch (error: any) {
    console.error("Admin room delete error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details: error.message }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}
