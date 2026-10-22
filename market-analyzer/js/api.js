// api.js — the only file that talks to the OSRS Wiki Real-time Prices API.
// Docs: https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices
//
// The wiki moved to /api/v2. Field names below are read defensively (v2 names
// first, v1 names as fallback) because not every v2 field name is documented.
// If a number shows up blank, open Settings → Data check to see the raw keys
// the API returned, and fix the matching pick() list here.
//
// Browsers can't set a custom User-Agent, so requests go out with your
// browser's own. Keep calls light: one /latest for all items, never a loop over ids.

export const API_BASE = "https://prices.runescape.wiki/api/v2/osrs";

const HOUR = 3600;
const memo = new Map(); // url → { at, data }

async function get(path, { maxAgeMs = 60_000 } = {}) {
  const url = API_BASE + path;
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.data;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price API returned ${res.status} for ${path}`);
  const data = await res.json();
  memo.set(url, { at: Date.now(), data });
  return data;
}

/** First defined value among several possible field names. */
function pick(obj, names) {
  for (const n of names) if (obj && obj[n] != null) return obj[n];
  return null;
}

const unwrap = j => (j && typeof j === "object" && "data" in j ? j.data : j);

// ---------- Item list ----------
const MAP_KEY = "osrs-ma-mapping";
export async function mapping() {
  try {
    const cached = JSON.parse(localStorage.getItem(MAP_KEY) || "null");
    if (cached && Date.now() - cached.at < 86_400_000) return cached.items;
  } catch {}
  const raw = unwrap(await get("/mapping", { maxAgeMs: 86_400_000 }));
  const items = (Array.isArray(raw) ? raw : Object.values(raw)).map(m => ({
    id: m.id, name: m.name, limit: m.limit ?? null, members: m.members, highalch: m.highalch ?? null, icon: m.icon,
  }));
  try { localStorage.setItem(MAP_KEY, JSON.stringify({ at: Date.now(), items })); } catch {}
  return items;
}

// ---------- Latest instant-buy / instant-sell ----------
/** Map id → { high, low, highTime, lowTime } */
export async function latest() {
  const raw = unwrap(await get("/latest", { maxAgeMs: 60_000 }));
  const out = new Map();
  for (const [id, p] of Object.entries(raw || {})) {
    out.set(Number(id), {
      high: pick(p, ["high"]), low: pick(p, ["low"]),
      highTime: pick(p, ["highTime"]), lowTime: pick(p, ["lowTime"]),
    });
  }
  return out;
}

// ---------- Hourly averages for all items ----------
function normHourPoint(p) {
  return {
    avgHigh: pick(p, ["avgHighPrice", "avgHigh", "high"]),
    avgLow: pick(p, ["avgLowPrice", "avgLow", "low"]),
    volHigh: pick(p, ["highPriceVolume", "highVolume", "volumeHigh"]) ?? 0,
    volLow: pick(p, ["lowPriceVolume", "lowVolume", "volumeLow"]) ?? 0,
  };
}

/** One hour of averages for every item. `ts` is snapped to the start of the hour. */
export async function hour(ts) {
  const t = Math.floor(ts / HOUR) * HOUR;
  const raw = unwrap(await get(`/1h?timestamp=${t}`, { maxAgeMs: 86_400_000 }));
  const out = new Map();
  for (const [id, p] of Object.entries(raw || {})) out.set(Number(id), normHourPoint(p));
  return out;
}

/**
 * Baseline for every item on a given day: averages several hourly samples.
 * Returns Map id → { price, hourlyVolume }. Cached forever per date — the past doesn't change.
 */
export async function baselineForDay(dateStr, hoursUtc = [0, 4, 8, 12, 16, 20]) {
  const key = `osrs-ma-base-${dateStr}-${hoursUtc.join(".")}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached) return new Map(cached);
  } catch {}
  const day = Date.parse(dateStr + "T00:00:00Z") / 1000;
  const samples = await Promise.all(hoursUtc.map(h => hour(day + h * HOUR)));
  const out = averageSamples(samples);
  try { localStorage.setItem(key, JSON.stringify([...out])); } catch {}
  return out;
}

/** Recent baseline: the last `n` completed hours, for "volume now vs normal". */
export async function recentHours(n = 4) {
  const now = Math.floor(Date.now() / 1000 / HOUR) * HOUR;
  const samples = await Promise.all(Array.from({ length: n }, (_, i) => hour(now - (i + 1) * HOUR)));
  return averageSamples(samples);
}

/** Average price and hourly volume per item across hourly samples. Exported for tests. */
export function averageSamples(samples) {
  const acc = new Map();
  for (const s of samples) {
    for (const [id, p] of s) {
      const mid = p.avgHigh > 0 && p.avgLow > 0 ? (p.avgHigh + p.avgLow) / 2 : (p.avgHigh || p.avgLow || 0);
      const a = acc.get(id) || { sum: 0, n: 0, vol: 0 };
      if (mid > 0) { a.sum += mid; a.n++; }
      a.vol += (p.volHigh || 0) + (p.volLow || 0);
      acc.set(id, a);
    }
  }
  const out = new Map();
  for (const [id, a] of acc) {
    out.set(id, { price: a.n ? a.sum / a.n : null, hourlyVolume: a.vol / samples.length });
  }
  return out;
}

// ---------- One item's history ----------
/** lookback: "6h" | "24h" | "7d" | "30d" | "6m" | "1y". Returns [{ t, high, low, p, vol }]. */
export async function timeseries(id, lookback = "30d") {
  const raw = await get(`/timeseries?id=${id}&lookback=${lookback}`, { maxAgeMs: 300_000 });
  const list = Array.isArray(raw) ? raw : pick(raw, ["data", "timeseries", "points", "prices"]) || [];
  return list.map(x => {
    const high = pick(x, ["avgHighPrice", "high", "avgHigh"]);
    const low = pick(x, ["avgLowPrice", "low", "avgLow"]);
    return {
      t: pick(x, ["timestamp", "time", "t"]),
      high, low,
      p: high > 0 && low > 0 ? (high + low) / 2 : (high || low || null),
      vol: (pick(x, ["highPriceVolume", "highVolume"]) || 0) + (pick(x, ["lowPriceVolume", "lowVolume"]) || 0),
    };
  }).filter(x => x.t != null);
}

/** For Settings → Data check: the top-level shape of each endpoint's response. */
export async function dataCheck(sampleId = 4151) {
  const describe = v => Array.isArray(v) ? `array(${v.length}) of ${v[0] ? Object.keys(v[0]).join(", ") : "?"}`
    : v && typeof v === "object" ? `object: ${Object.keys(v).slice(0, 12).join(", ")}` : String(v);
  const out = {};
  for (const [name, path] of [
    ["mapping", "/mapping"],
    ["latest", `/latest?id=${sampleId}`],
    ["1h", `/1h?timestamp=${Math.floor(Date.now() / 1000 / HOUR) * HOUR - HOUR}`],
    ["timeseries", `/timeseries?id=${sampleId}&lookback=24h`],
  ]) {
    try {
      const raw = await get(path, { maxAgeMs: 0 });
      const inner = unwrap(raw);
      const firstVal = inner && !Array.isArray(inner) && typeof inner === "object" ? Object.values(inner)[0] : null;
      out[name] = { ok: true, top: describe(raw), firstEntry: firstVal && typeof firstVal === "object" ? describe(firstVal) : undefined };
    } catch (e) {
      out[name] = { ok: false, error: String(e.message || e) };
    }
  }
  return out;
}
