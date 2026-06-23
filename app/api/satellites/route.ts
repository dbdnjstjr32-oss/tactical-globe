// Satellite TLE proxy — ported from 미래형 전장 ui server.js.
// CelesTrak gp.php accepts a single CATNR per request, so we query each tracked
// satellite individually and combine. Results cached in-memory for 1 hour.
export const dynamic = "force-dynamic";

// ISS, NOAA-19, Aqua, Terra, Landsat-8/9, Sentinel-1A/2A, KOMPSAT-3/5
const TRACKED_SAT_IDS =
  "25544,33591,27424,25994,39084,49260,39634,40697,39237,40786".split(",");
const CELESTRAK_GP_BASE = "https://celestrak.org/NORAD/elements/gp.php";
const SAT_CACHE_TTL = 3600000; // 1 hour

type Tle = { name: string; tle1: string; tle2: string };
let satCache: Tle[] | null = null;
let satCacheTime = 0;

function parseTLE(body: string): Tle[] {
  const lines = body
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const sats: Tle[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    if (lines[i + 1].startsWith("1 ") && lines[i + 2].startsWith("2 ")) {
      sats.push({ name: lines[i], tle1: lines[i + 1], tle2: lines[i + 2] });
    }
  }
  return sats;
}

export async function GET() {
  const now = Date.now();
  if (satCache && now - satCacheTime < SAT_CACHE_TTL) {
    return Response.json(satCache, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const results = await Promise.all(
      TRACKED_SAT_IDS.map(async (id) => {
        try {
          const r = await fetch(
            `${CELESTRAK_GP_BASE}?CATNR=${id}&FORMAT=TLE`,
            { headers: { "User-Agent": "Mozilla/5.0 (Tactical HUD)" }, cache: "no-store" },
          );
          return parseTLE(await r.text());
        } catch {
          return [] as Tle[];
        }
      }),
    );
    const sats = results.flat();
    if (sats.length > 0) {
      satCache = sats;
      satCacheTime = now;
    }
    return Response.json(satCache ?? sats, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(satCache ?? [], { status: satCache ? 200 : 500 });
  }
}
