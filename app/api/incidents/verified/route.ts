export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "osint_matrix.db");

// Returns incident IDs that have at least one geographically-verified post.
// Bridges posts.is_verified → rooms.incident_id → incidents.id
export async function GET() {
  let db;
  try {
    db = new Database(dbPath);
    db.pragma("busy_timeout = 15000");
    const rows = db.prepare(`
      SELECT DISTINCT r.incident_id AS id
      FROM posts p
      JOIN rooms r ON p.room_id = r.id
      WHERE p.is_verified = 1 AND r.incident_id IS NOT NULL
    `).all() as Array<{ id: string }>;
    return NextResponse.json({ ids: rows.map((r) => r.id) });
  } catch (e) {
    console.error("Verified incidents fetch error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ids: [], error: message }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}
