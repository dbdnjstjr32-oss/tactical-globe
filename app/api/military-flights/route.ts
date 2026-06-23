export const dynamic = "force-dynamic";

let cacheData: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 10000; // 10 seconds

export async function GET() {
  const now = Date.now();
  if (cacheData && now - cacheTime < CACHE_TTL) {
    return new Response(cacheData, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const res = await fetch("https://api.adsb.lol/v2/mil", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const body = await res.text();
    
    if (res.ok) {
      cacheData = body;
      cacheTime = Date.now();
    }
    
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "Failed to fetch military flights", details },
      { status: 500 },
    );
  }
}
