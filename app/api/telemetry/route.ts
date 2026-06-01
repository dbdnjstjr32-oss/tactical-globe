export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const telemetryPath = path.join(process.cwd(), "data", "telemetry.json");
  
  const ngrokHeaders = {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "ngrok-skip-browser-warning": "true",
  };

  try {
    const data = await fs.readFile(telemetryPath, "utf-8");
    const telemetry = JSON.parse(data);
    
    return NextResponse.json(telemetry, { headers: ngrokHeaders });
  } catch (error: any) {
    // If telemetry.json does not exist yet or is malformed, return default metrics
    const defaultTelemetry = {
      rss_fetch_latency: 0.0,
      duplicate_rate: 0.0,
      ai_processing_time: 0.0,
      geo_cache_hit_rate: 0.0,
      last_updated: new Date().toISOString(),
      status: "INITIALIZING",
    };
    
    return NextResponse.json(defaultTelemetry, { headers: ngrokHeaders });
  }
}
