export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

async function getTacticalDatabase() {
  const dbPath = path.join(process.cwd(), "data", "osint_matrix.db");
  return open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
}

export async function GET(request: NextRequest) {
  const signal = request.signal;
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel") || "GEOPOLITICS";

  let db = await getTacticalDatabase();
  await db.exec("PRAGMA journal_mode = WAL;");
  
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;
  let isClosed = false;

  const cleanup = async () => {
    if (isClosed) return;
    isClosed = true;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    try {
      await db.close();
      console.log("[SSE STREAM] Connection closed and DB connection released.");
    } catch (err) {
      console.error("[SSE STREAM] Error closing DB connection:", err);
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      let lastCheckedId = "";
      
      const pushData = async () => {
        if (isClosed) return;
        try {
          // Extend to 7 days since cached DB rows for GEOPOLITICS might be older
          const timeLimit = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          
          let query = `
            SELECT 
              id, country, region, lng, lat, 
              severity, category, title, source,
              created_at, summary, status, 
              update_count, first_seen,
              region_risk_index, 
              threat_velocity, 
              trajectory,
              channel,
              media_url,
              media_type,
              sns_source,
              verified_sources,
              child_feeds,
              pinned,
              watchcon_trigger
            FROM incidents 
            WHERE channel = ? AND created_at >= ?
            ORDER BY created_at DESC 
            LIMIT 30
          `;
          let params = [channel, timeLimit];

          if (channel === "GEOPOLITICS") {
            query = `
              SELECT 
                id, country, region, lng, lat, 
                severity, category, title, source,
                created_at, summary, status, 
                update_count, first_seen,
                region_risk_index, 
                threat_velocity, 
                trajectory,
                channel,
                media_url,
                media_type,
                sns_source,
                verified_sources,
                child_feeds,
                pinned,
                watchcon_trigger
              FROM incidents 
              WHERE (channel = 'GEOPOLITICS' OR channel = 'TELEGRAM') AND created_at >= ?
              ORDER BY created_at DESC 
              LIMIT 30
            `;
            params = [timeLimit];
          }

          const rows = await db.all(query, params);

          const validRows = rows.filter((row: any) => 
            row.lat && row.lng && !isNaN(row.lat) && !isNaN(row.lng) && row.lat !== 0 && row.lng !== 0
          );

          const formattedEvents = validRows.map((row: any) => {
            let calcLevel = "NOMINAL";
            if (row.severity >= 0.8) calcLevel = "CRITICAL";
            else if (row.severity >= 0.5) calcLevel = "ELEVATED";

            return {
              ...row,
              watchcon_trigger: row.watchcon_trigger === 1,
              level: calcLevel,
              msg: "INCOMING INTEL // COMPRESSED ARTIFACT",
              time: "REALTIME_STREAM"
            };
          });

          const currentTopId = formattedEvents.length > 0 ? formattedEvents[0].id : "";
          if (currentTopId !== lastCheckedId) {
            lastCheckedId = currentTopId;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(formattedEvents)}\n\n`));
          }
        } catch (err) {
          console.error("SSE DB Fetch Error:", err);
          cleanup();
        }
      };

      // Initial push
      await pushData();
      
      // Poll DB every 5 seconds
      interval = setInterval(async () => {
        if (signal.aborted) {
          await cleanup();
          return;
        }
        await pushData();
      }, 5000);

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
