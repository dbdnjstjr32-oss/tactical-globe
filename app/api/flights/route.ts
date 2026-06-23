// Live flight feed proxy — ported from 미래형 전장 ui server.js.
// Proxies Flightradar24 feed for the Korea bounding box.
export const dynamic = "force-dynamic";

const FR24_URL =
  "https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=39,33,124,131&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=1&estimated=1&maxage=14400&gliders=1&stats=1";

export async function GET() {
  try {
    const res = await fetch(FR24_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://www.flightradar24.com/",
      },
      cache: "no-store",
    });
    const body = await res.text();
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
      { error: "Failed to fetch flight data", details },
      { status: 500 },
    );
  }
}
