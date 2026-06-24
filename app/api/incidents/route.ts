export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
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

export async function GET() {
  let db;
  try {
    db = getDb();
    const incidents = db.prepare(`
      SELECT id, title, region, lat, lng 
      FROM incidents 
      WHERE category IN ('MILITARY', 'CONFLICT', 'TERRORISM', 'DISASTER', 'NUCLEAR', 'CHEMICAL', 'CYBER', 'HEALTH', 'EVACUATION', 'EARTHQUAKE', 'TYPHOON', 'FLOOD', 'VOLCANO', 'DROUGHT', 'WILDFIRE', 'WEATHER_ALERT', 'EPIDEMIC')
      ORDER BY created_at DESC 
      LIMIT 50
    `).all();
    return NextResponse.json({ success: true, incidents });
  } catch (error) {
    console.error("Fetch incidents error:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}
