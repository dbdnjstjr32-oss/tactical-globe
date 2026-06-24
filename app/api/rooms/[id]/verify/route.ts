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

// Haversine formula (km)
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let db;
  try {
    const { id: roomId } = await params;
    const body = await request.json();
    const { lat: userLat, lng: userLng, userId } = body;

    if (userLat === undefined || userLng === undefined) {
      return NextResponse.json({ error: "GPS_REQUIRED" }, { status: 400 });
    }

    db = getDb();
    const room = db.prepare("SELECT lat, lng, radius_km, status FROM rooms WHERE id = ?").get(roomId) as
      | { lat: number | null; lng: number | null; radius_km: number | null; status: string }
      | undefined;

    if (!room || room.status !== 'ACTIVE') {
      return NextResponse.json({ allowed: false, reason: 'ROOM_NOT_ACTIVE' }, { status: 403 });
    }

    if (room.lat === null || room.lng === null || room.lat === undefined || room.lng === undefined) {
      // Room does not have strict coordinates set; allow entry
      return NextResponse.json({ allowed: true, distance: 0, limit: room.radius_km || 50.0 });
    }

    // Distance calculation
    const distance = getDistanceFromLatLonInKm(userLat, userLng, room.lat, room.lng);
    const ALLOWED_RADIUS_KM = room.radius_km || 50.0; 

    if (distance <= ALLOWED_RADIUS_KM) {
      // Reward verified on-site presence (Bayesian trust accrual)
      if (userId) {
        db.prepare(`
          UPDATE users
          SET successful_verifications = COALESCE(successful_verifications, 0) + 1,
              trust_score = MIN(1.0, COALESCE(trust_score, 0.5) + 0.05)
          WHERE id = ?
        `).run(userId);
      }
      return NextResponse.json({ allowed: true, distance, limit: ALLOWED_RADIUS_KM });
    } else {
      return NextResponse.json({ allowed: false, distance, limit: ALLOWED_RADIUS_KM, error: "OUT_OF_RANGE" }, { status: 403 });
    }
  } catch (error) {
    console.error("Geofence verify error:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "SERVER_ERROR", details }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}
