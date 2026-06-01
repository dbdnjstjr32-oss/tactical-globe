export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "osint_matrix.db");

function getDb() {
  const db = new Database(DB_PATH);
  // Create feedbacks table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rating INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'GENERAL',
      message TEXT NOT NULL,
      tester_id TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    )
  `);
  return db;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rating, category, message, tester_id } = body;

    if (!rating || !message) {
      return NextResponse.json({ error: "rating and message are required" }, { status: 400 });
    }
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating must be 1-5" }, { status: 400 });
    }
    if (typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "message must not be empty" }, { status: 400 });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO feedbacks (rating, category, message, tester_id, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      rating,
      category || "GENERAL",
      message.trim().slice(0, 2000),
      tester_id || null,
      request.headers.get("user-agent") || null,
      new Date().toISOString()
    );
    db.close();

    return NextResponse.json({ success: true, id: result.lastInsertRowid }, { status: 201 });
  } catch (error: any) {
    console.error("[FEEDBACK] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, rating, category, message, tester_id, created_at
      FROM feedbacks
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    const count = (db.prepare("SELECT COUNT(*) as cnt FROM feedbacks").get() as any).cnt;
    const avgRating = (db.prepare("SELECT AVG(rating) as avg FROM feedbacks").get() as any).avg;
    db.close();

    return NextResponse.json({
      feedbacks: rows,
      total: count,
      average_rating: avgRating ? parseFloat(avgRating.toFixed(2)) : 0
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error: any) {
    console.error("[FEEDBACK] GET error:", error);
    return NextResponse.json({ feedbacks: [], total: 0, average_rating: 0 }, { status: 500 });
  }
}
