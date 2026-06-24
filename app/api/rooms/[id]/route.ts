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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let db;
  try {
    const { id } = await params;
    db = getDb();

    // 1. Fetch room details
    const room = db.prepare(`
      SELECT r.*, u.username as creator_name 
      FROM rooms r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.id = ?
    `).get(id) as Record<string, unknown> | undefined;

    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    // 2. Fetch last 50 posts in the room
    const posts = db.prepare(`
      SELECT p.*, u.username, u.trust_level
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.room_id = ?
      ORDER BY p.created_at DESC
      LIMIT 50
    `).all(id);

    // Return in chronological order
    const orderedPosts = posts.reverse();

    return NextResponse.json({
      success: true,
      room,
      posts: orderedPosts
    });
  } catch (error) {
    console.error("Get room info error:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}
