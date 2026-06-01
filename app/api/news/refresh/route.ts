import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

export async function POST(request: NextRequest) {
  try {
    const projectRoot = process.cwd();
    
    // Commands to run sequential single-pass ingestion and analysis
    const cmd = `set PYTHONIOENCODING=utf-8 && python worker_ingest.py --once && python worker_analyzer.py --once`;

    console.log(`[REFRESH API] Initiating pipeline refresh in: ${projectRoot}`);
    
    // Execute asynchronously to avoid gateway/ngrok timeouts
    exec(cmd, { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        console.error("[REFRESH API] Pipeline execution error:", error);
        console.error("[REFRESH API] stderr:", stderr);
        return;
      }
      console.log("[REFRESH API] Pipeline completed successfully.");
      console.log("[REFRESH API] stdout:", stdout);
    });

    return NextResponse.json({
      success: true,
      message: "REFRESH_TRIGGERED"
    });
  } catch (error: any) {
    console.error("Failed to trigger refresh:", error);
    return NextResponse.json(
      { error: "REFRESH_TRIGGER_FAILED", details: error.message },
      { status: 500 }
    );
  }
}
