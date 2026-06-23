// AIS vessel positions — ported from 미래형 전장 ui server.js.
// GET returns the persisted vessel snapshot; POST stores a fresh snapshot
// (used by an external AIS scraper). Backed by data/vessels.json.
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const VESSELS_PATH = path.join(process.cwd(), "data", "vessels.json");

export async function GET() {
  try {
    const body = await fs.readFile(VESSELS_PATH, "utf8");
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({}, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.text();
    JSON.parse(body); // validate
    await fs.writeFile(VESSELS_PATH, body, "utf8");
    return Response.json({ success: true });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Invalid JSON body", details }, { status: 400 });
  }
}
