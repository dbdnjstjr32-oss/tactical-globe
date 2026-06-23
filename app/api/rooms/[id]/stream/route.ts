export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
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
  const { id: roomId } = await params;
  const signal = request.signal;

  // Retrieve last event timestamp from headers or query param (default to now)
  const headerLastId = request.headers.get("Last-Event-ID");
  const queryLastId = new URL(request.url).searchParams.get("last_event_id");
  let lastEventTime = headerLastId || queryLastId || new Date().toISOString();

  const db = getDb();
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;

  const cleanup = () => {
    if (isClosed) return;
    isClosed = true;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    console.log(`[ROOM STREAM] SSE closed for room: ${roomId}`);
  };

  const stream = new ReadableStream({
    async start(controller) {
      const pushNewPosts = () => {
        if (isClosed) return;
        try {
          // Query for posts created since lastEventTime
          const newPosts = db.prepare(`
            SELECT p.*, u.username, u.trust_level
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.room_id = ? AND p.created_at > ?
            ORDER BY p.created_at ASC
          `).all(roomId, lastEventTime) as any[];

          if (newPosts.length > 0) {
            // Update lastEventTime to the most recent post timestamp
            lastEventTime = newPosts[newPosts.length - 1].created_at;

            // Push posts wrapped in event-stream format
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(newPosts)}\n\n`));
          }
        } catch (err) {
          console.error("SSE Room fetch error:", err);
          cleanup();
        }
      };

      // Poll database every 2 seconds
      interval = setInterval(() => {
        if (signal.aborted) {
          cleanup();
          return;
        }
        pushNewPosts();
      }, 2000);

      signal.addEventListener("abort", () => {
        cleanup();
      });
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "ngrok-skip-browser-warning": "true",
      "X-Accel-Buffering": "no",
    },
  });
}
