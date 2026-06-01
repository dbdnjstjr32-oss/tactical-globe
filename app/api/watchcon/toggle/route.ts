import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

const WATCHCON_PATH = path.join(process.cwd(), "data", "watchcon.json")

async function getWatchcon() {
  try {
    const data = await fs.readFile(WATCHCON_PATH, "utf-8")
    return JSON.parse(data)
  } catch (error) {
    // Default fallback: stage 4, override false
    const fallback = { stage: 4, override: false, timestamp: new Date().toISOString() }
    try {
      await fs.mkdir(path.dirname(WATCHCON_PATH), { recursive: true })
      await fs.writeFile(WATCHCON_PATH, JSON.stringify(fallback, null, 2), "utf-8")
    } catch (writeError) {
      console.error("Failed to write default watchcon state:", writeError)
    }
    return fallback
  }
}

export async function GET(request: NextRequest) {
  const watchcon = await getWatchcon()
  return NextResponse.json(watchcon, {
    headers: {
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "ngrok-skip-browser-warning": "true",
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { stage, override } = body

    const updated = {
      stage: typeof stage === "number" ? stage : 4,
      override: typeof override === "boolean" ? override : false,
      timestamp: new Date().toISOString(),
    }

    // Ensure data directory exists
    await fs.mkdir(path.dirname(WATCHCON_PATH), { recursive: true })
    await fs.writeFile(WATCHCON_PATH, JSON.stringify(updated, null, 2), "utf-8")

    return NextResponse.json({ success: true, ...updated })
  } catch (error) {
    return NextResponse.json({ error: "FAILED_TO_UPDATE_WATCHCON" }, { status: 500 })
  }
}
