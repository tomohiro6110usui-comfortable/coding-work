import type { DataProvider } from "./dataProviders/provider.js";
import type { DbProvider } from "./dataProviders/sqliteProvider.js";
import { getTomorrowPicksUniverse } from "./tomorrowPicks.js";

export type PullbackChanceItem = {
  bucket: "short" | "mid";
  code: string;
  name?: string;
  industry?: string;
  price: number;
  ratioHighLow: number;
  ratioNowHigh: number;
  high: number;
  low: number;
  score?: number;
  grade?: "A" | "B" | "C";
  pullbackPct?: number;
  rebound3Pct?: number;
  rebound5Pct?: number;
  volatility20Pct?: number;
  avgTurnover20?: number | null;
  reasons?: string[];
  riskFlags?: string[];
};

export type PullbackChancesResponse = {
  date: string;
  key: string;
  universeKey: string;
  shortTerm: PullbackChanceItem[];
  midTerm: PullbackChanceItem[];
  fetchedAt: string;
  source: "db" | "generated";
  debug?: unknown;
};

type PullbackSelectionOptions = {
  minScore: number;
  maxPerBucket: number;
  requireRebound: boolean;
  minTurnover: number;
  maxVolatility20: number;
  minPullbackPct: number;
  maxPullbackPct: number;
};

type DailyBar = {
  Date: string;
  Code: string;
  O: number;
  H: number;
  L: number;
  C: number;
  Vo?: number;
  AdjO?: number;
  AdjH?: number;
  AdjL?: number;
  AdjC?: number;
};

type FetchBarsResult = {
  rows: DailyBar[];
  attempts: number;
  traces: AttemptTrace[];
  cacheHit: boolean;
};

type AttemptTrace = {
  attempt: number;
  status?: number;
  waitMs?: number;
  message?: string;
};

type PerCodeDebug = {
  code: string;
  ok: boolean;
  rows?: number;
  attempts?: number;
  error?: string;
  traces?: AttemptTrace[];
  statusCodes?: number[];
  phase: "initial" | "retry" | "cache-db" | "cache-db-fallback";
};

class JQuantsFetchError extends Error {
  constructor(
    message: string,
    public traces: AttemptTrace[]
  ) {
    super(message);
    this.name = "JQuantsFetchError";
  }
}

function keyOf(date: string, universeKey: string) {
  return `${date}_pullback-chances_${universeKey}`;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function avg(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = avg(values);
  const variance = avg(values.map((x) => (x - m) ** 2));
  return Math.sqrt(Math.max(0, variance));
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function resolveSelectionOptions(
  options?: Partial<PullbackSelectionOptions>
): PullbackSelectionOptions {
  const env = process.env;
  const minScore = Number(env.PULLBACK_MIN_SCORE ?? 58);
  const maxPerBucket = Number(env.PULLBACK_MAX_PER_BUCKET ?? 40);
  const minTurnover = Number(env.PULLBACK_MIN_TURNOVER ?? 100_000_000);
  const maxVolatility20 = Number(env.PULLBACK_MAX_VOLATILITY20 ?? 0.06);
  const minPullbackPct = Number(env.PULLBACK_MIN_PULLBACK_PCT ?? 0.06);
  const maxPullbackPct = Number(env.PULLBACK_MAX_PULLBACK_PCT ?? 0.32);
  const requireRebound = env.PULLBACK_REQUIRE_REBOUND !== "0";

  const resolved = {
    minScore: Number.isFinite(options?.minScore as number) ? Number(options?.minScore) : minScore,
    maxPerBucket: Number.isFinite(options?.maxPerBucket as number) ? Math.max(1, Number(options?.maxPerBucket)) : Math.max(1, maxPerBucket),
    requireRebound: options?.requireRebound ?? requireRebound,
    minTurnover: Number.isFinite(options?.minTurnover as number) ? Math.max(0, Number(options?.minTurnover)) : Math.max(0, minTurnover),
    maxVolatility20: Number.isFinite(options?.maxVolatility20 as number)
      ? Math.max(0.005, Number(options?.maxVolatility20))
      : Math.max(0.005, maxVolatility20),
    minPullbackPct: Number.isFinite(options?.minPullbackPct as number)
      ? clamp01(Number(options?.minPullbackPct))
      : clamp01(minPullbackPct),
    maxPullbackPct: Number.isFinite(options?.maxPullbackPct as number)
      ? clamp01(Number(options?.maxPullbackPct))
      : clamp01(maxPullbackPct),
  };

  if (resolved.maxPullbackPct < resolved.minPullbackPct) {
    const t = resolved.maxPullbackPct;
    resolved.maxPullbackPct = resolved.minPullbackPct;
    resolved.minPullbackPct = t;
  }

  return resolved;
}

const BAR_CACHE_TTL_MS = Number(process.env.JQUANTS_BAR_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
const REQUEST_SPACING_MS = Number(process.env.JQUANTS_REQUEST_SPACING_MS ?? 350);
const REQUEST_JITTER_MS = Number(process.env.JQUANTS_REQUEST_JITTER_MS ?? 250);
const RATE_LIMIT_COOLDOWN_MS = Number(process.env.JQUANTS_RATE_LIMIT_COOLDOWN_MS ?? 15_000);

const barsCache = new Map<string, { rows: DailyBar[]; expiresAt: number }>();
const dayBarsCache = new Map<string, { rows: DailyBar[]; expiresAt: number }>();
let nextRequestAt = 0;
let rateLimitedUntil = 0;

function barsDbKey(code: string, from: string, to: string): string {
  return `jquants-bars:v1:${code}:${from}:${to}`;
}

function normalizeApiCode(code: string): string {
  const c = String(code ?? "").trim();
  if (c.length === 5 && c.endsWith("0")) return c.slice(0, 4);
  return c;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(dateText: string, days: number): string {
  const d = new Date(`${dateText}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

function computeDefaultFrom(toDate: string): string {
  return addDays(toDate, -(7 * 12 + 3));
}

async function getCachedRowsWithFallback(args: {
  dbProvider?: DbProvider;
  code: string;
  from: string;
  to: string;
  maxLookbackDays?: number;
  minRows?: number;
}): Promise<{ rows: DailyBar[] | null; usedFrom: string; usedTo: string; phase: "cache-db" | "cache-db-fallback" }> {
  const { dbProvider, code, from, to, maxLookbackDays = 10, minRows = 1 } = args;
  if (!dbProvider) {
    return { rows: null, usedFrom: from, usedTo: to, phase: "cache-db" };
  }

  const direct = await dbProvider.getJson<DailyBar[]>(barsDbKey(code, from, to));
  if (direct && direct.length >= minRows) {
    return { rows: direct, usedFrom: from, usedTo: to, phase: "cache-db" };
  }

  for (let d = 1; d <= maxLookbackDays; d++) {
    const prevTo = addDays(to, -d);
    const prevFrom = computeDefaultFrom(prevTo);
    const prev = await dbProvider.getJson<DailyBar[]>(barsDbKey(code, prevFrom, prevTo));
    if (prev && prev.length >= minRows) {
      return { rows: prev, usedFrom: prevFrom, usedTo: prevTo, phase: "cache-db-fallback" };
    }
  }

  return { rows: null, usedFrom: from, usedTo: to, phase: "cache-db" };
}

async function getCachedRowsBatch(args: {
  dbProvider?: DbProvider;
  keys: string[];
}): Promise<Record<string, DailyBar[]>> {
  const { dbProvider, keys } = args;
  if (!dbProvider || keys.length === 0) return {};
  if (typeof dbProvider.getJsonBatch === "function") {
    return (await dbProvider.getJsonBatch<DailyBar[]>(keys)) ?? {};
  }
  const out: Record<string, DailyBar[]> = {};
  for (const key of keys) {
    const v = await dbProvider.getJson<DailyBar[]>(key);
    if (v) out[key] = v;
  }
  return out;
}

async function setCachedRowsBatch(args: {
  dbProvider?: DbProvider;
  rows: Array<{ key: string; value: DailyBar[] }>;
}): Promise<void> {
  const { dbProvider, rows } = args;
  if (!dbProvider || rows.length === 0) return;
  if (typeof dbProvider.setJsonBatch === "function") {
    await dbProvider.setJsonBatch(rows);
    return;
  }
  for (const row of rows) {
    await dbProvider.setJson(row.key, row.value);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function barsCacheKey(code: string, from: string, to: string): string {
  return `${code}|${from}|${to}`;
}

function getCachedBars(code: string, from: string, to: string): DailyBar[] | null {
  const key = barsCacheKey(code, from, to);
  const entry = barsCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    barsCache.delete(key);
    return null;
  }
  return entry.rows;
}

function setCachedBars(code: string, from: string, to: string, rows: DailyBar[]): void {
  const key = barsCacheKey(code, from, to);
  barsCache.set(key, { rows, expiresAt: Date.now() + BAR_CACHE_TTL_MS });
}

function getCachedDayBars(date: string): DailyBar[] | null {
  const entry = dayBarsCache.get(date);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    dayBarsCache.delete(date);
    return null;
  }
  return entry.rows;
}

function setCachedDayBars(date: string, rows: DailyBar[]): void {
  dayBarsCache.set(date, { rows, expiresAt: Date.now() + 60 * 60 * 1000 });
}

async function applyRequestPacing(): Promise<number> {
  const now = Date.now();
  const minuteSlotMs = (Math.floor(now / 60000) % 4) * 75;
  const jitterMs = Math.floor(Math.random() * (REQUEST_JITTER_MS + 1));
  const earliest = Math.max(now, nextRequestAt, rateLimitedUntil) + minuteSlotMs;
  const waitMs = Math.max(0, earliest - now);
  nextRequestAt = earliest + REQUEST_SPACING_MS + jitterMs;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  return waitMs;
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;

  const secs = Number(headerValue);
  if (Number.isFinite(secs) && secs >= 0) {
    return Math.round(secs * 1000);
  }

  const when = Date.parse(headerValue);
  if (Number.isFinite(when)) {
    return Math.max(0, when - Date.now());
  }

  return null;
}

function noteRateLimited(waitMs: number): void {
  const until = Date.now() + Math.max(RATE_LIMIT_COOLDOWN_MS, waitMs);
  if (until > rateLimitedUntil) {
    rateLimitedUntil = until;
  }
}

async function fetchJQuantsDailyBars(args: {
  code: string;
  from: string;
  to: string;
  maxAttempts?: number;
  useCache?: boolean;
}): Promise<FetchBarsResult> {
  const apiKey = process.env.JQUANTS_API_KEY;
  if (!apiKey) throw new Error("Missing env: JQUANTS_API_KEY");

  const { code, from, to, maxAttempts = 4, useCache = true } = args;
  const altCodes: string[] = [];
  if (/^[0-9]{3}[A-Z]$/.test(code) || /^[0-9]{4}$/.test(code)) {
    altCodes.push(`${code}0`);
  }
  const q = new URLSearchParams({ code, from, to });
  const url = `https://api.jquants.com/v2/equities/bars/daily?${q.toString()}`;

  if (useCache) {
    const cached = getCachedBars(code, from, to);
    if (cached) {
      return {
        rows: cached,
        attempts: 0,
        traces: [{ attempt: 0, message: "cache-hit" }],
        cacheHit: true,
      };
    }
  }

  let lastError = "unknown error";
  const traces: AttemptTrace[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const paceWaitMs = await applyRequestPacing();
      const res = await fetch(url, {
        headers: {
          "x-api-key": apiKey,
          accept: "application/json",
        },
      });

      if (res.ok) {
        const json = await res.json();
        let rows = (json?.data ?? json?.daily_quotes ?? []) as DailyBar[];

        if (rows.length === 0 && altCodes.length > 0) {
          const altCode = altCodes[0];
          const altQ = new URLSearchParams({ code: altCode, from, to });
          const altUrl = `https://api.jquants.com/v2/equities/bars/daily?${altQ.toString()}`;
          const altRes = await fetch(altUrl, {
            headers: {
              "x-api-key": apiKey,
              accept: "application/json",
            },
          });
          if (altRes.ok) {
            const altJson = await altRes.json();
            rows = (altJson?.data ?? altJson?.daily_quotes ?? []) as DailyBar[];
          }
        }

        if (rows.length > 0) {
          setCachedBars(code, from, to, rows.map((r) => ({ ...r, Code: normalizeApiCode(r.Code) })));
        }
        traces.push({ attempt, status: res.status, message: "ok", waitMs: paceWaitMs });
        return { rows, attempts: attempt, traces, cacheHit: false };
      }

      const text = await res.text().catch(() => "");
      const body = text.trim();
      const canRetry = res.status === 429 || res.status >= 500;
      lastError = `JQuants HTTP ${res.status}${body ? ` ${body}` : ""}`;

      if (canRetry && attempt < maxAttempts) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        const fallbackMs = Math.min(60_000, 5_000 * 2 ** (attempt - 1));
        const waitMs = retryAfterMs ?? fallbackMs;
        if (res.status === 429) {
          noteRateLimited(waitMs);
        }
        traces.push({ attempt, status: res.status, message: body || "retry", waitMs: paceWaitMs + waitMs });
        await sleep(waitMs);
        continue;
      }

      traces.push({ attempt, status: res.status, message: body || "failed", waitMs: paceWaitMs });
      throw new JQuantsFetchError(lastError, traces);
    } catch (e) {
      lastError = String((e as Error)?.message ?? e);
      if (e instanceof JQuantsFetchError) {
        throw e;
      }
      if (attempt < maxAttempts) {
        const waitMs = Math.min(12_000, 500 * 2 ** (attempt - 1));
        traces.push({ attempt, message: lastError, waitMs });
        await sleep(waitMs);
        continue;
      }
      traces.push({ attempt, message: lastError });
      throw new JQuantsFetchError(`JQuants fetch failed after ${maxAttempts} attempts: ${lastError}`, traces);
    }
  }

  throw new JQuantsFetchError(`JQuants fetch failed: ${lastError}`, traces);
}

async function fetchJQuantsDailyBarsByDate(args: { date: string; maxAttempts?: number }): Promise<DailyBar[]> {
  const apiKey = process.env.JQUANTS_API_KEY;
  if (!apiKey) throw new Error("Missing env: JQUANTS_API_KEY");

  const { date, maxAttempts = 4 } = args;
  const cached = getCachedDayBars(date);
  if (cached) return cached;

  const baseUrl = `https://api.jquants.com/v2/equities/bars/daily?date=${encodeURIComponent(date)}`;
  let lastError = "unknown error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const paceWaitMs = await applyRequestPacing();
    try {
      const res = await fetch(baseUrl, {
        headers: {
          "x-api-key": apiKey,
          accept: "application/json",
        },
      });

      if (res.ok) {
        const json = await res.json();
        const rows = [...((json?.data ?? []) as DailyBar[])];
        let paginationKey = String(json?.pagination_key ?? "").trim();

        while (paginationKey) {
          const pageUrl = `${baseUrl}&pagination_key=${encodeURIComponent(paginationKey)}`;
          const pageWaitMs = await applyRequestPacing();
          if (pageWaitMs > 0) {
            // Keep request cadence stable when reading paginated pages.
          }
          const pageRes = await fetch(pageUrl, {
            headers: {
              "x-api-key": apiKey,
              accept: "application/json",
            },
          });
          if (!pageRes.ok) {
            const pageText = await pageRes.text().catch(() => "");
            throw new Error(`JQuants daily-by-date page HTTP ${pageRes.status} ${pageText}`.trim());
          }
          const pageJson = await pageRes.json();
          rows.push(...((pageJson?.data ?? []) as DailyBar[]));
          paginationKey = String(pageJson?.pagination_key ?? "").trim();
        }

        setCachedDayBars(date, rows);
        return rows;
      }

      const text = await res.text().catch(() => "");
      const body = text.trim();
      const canRetry = res.status === 429 || res.status >= 500;
      lastError = `JQuants daily-by-date HTTP ${res.status}${body ? ` ${body}` : ""}`;

      if (canRetry && attempt < maxAttempts) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        const fallbackMs = Math.min(60_000, 5_000 * 2 ** (attempt - 1));
        const waitMs = retryAfterMs ?? fallbackMs;
        if (res.status === 429) {
          noteRateLimited(waitMs);
        }
        await sleep(waitMs + paceWaitMs);
        continue;
      }
      throw new Error(lastError);
    } catch (e) {
      lastError = String((e as Error)?.message ?? e);
      if (attempt < maxAttempts) {
        await sleep(Math.min(12_000, 500 * 2 ** (attempt - 1)));
        continue;
      }
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

function calcMetrics(rows: DailyBar[]) {
  if (rows.length === 0) return null;

  const highs = rows.map((r) => (r.AdjH ?? r.H) as number);
  const lows = rows.map((r) => (r.AdjL ?? r.L) as number);
  const closes = rows.map((r) => (r.AdjC ?? r.C) as number);

  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const price = closes[closes.length - 1];

  if (!isFinite(high) || !isFinite(low) || !isFinite(price) || low <= 0 || high <= 0) return null;

  const ratioHighLow = high / low;
  const ratioNowHigh = price / high;

  return { high, low, price, ratioHighLow, ratioNowHigh };
}

function isRateLimitError(errorText: string): boolean {
  return errorText.includes("HTTP 429") || errorText.toLowerCase().includes("rate limit");
}

export async function checkJQuantsDailyBars(args: {
  code: string;
  to: string;
  from?: string;
}): Promise<{
  code: string;
  from: string;
  to: string;
  rows: number;
  attempts: number;
  firstDate: string | null;
  lastDate: string | null;
  lastClose: number | null;
}> {
  const { code, to } = args;
  const from = args.from ?? computeDefaultFrom(to);
  const out = await fetchJQuantsDailyBars({ code, from, to });

  const first = out.rows[0];
  const last = out.rows[out.rows.length - 1];
  const lastClose = last ? ((last.AdjC ?? last.C) as number) : null;

  return {
    code,
    from,
    to,
    rows: out.rows.length,
    attempts: out.attempts,
    firstDate: first?.Date ?? null,
    lastDate: last?.Date ?? null,
    lastClose,
  };
}

type PullbackSignals = {
  price: number;
  dayGain: number;
  rebound3: number;
  rebound5: number;
  sma5: number;
  sma20: number;
  ratioNowHigh20: number;
  ratioNowHigh40: number;
  dropFrom20High: number;
  dropFrom40High: number;
  volatility20: number;
  intradayRange20: number;
  avgTurnover20: number | null;
};

type PullbackEvaluation = {
  score: number;
  grade: "A" | "B" | "C";
  reasons: string[];
  riskFlags: string[];
  signals: PullbackSignals;
  passSelection: boolean;
  hasRebound: boolean;
};

function toClose(r: DailyBar): number {
  return (r.AdjC ?? r.C) as number;
}

function toHigh(r: DailyBar): number {
  return (r.AdjH ?? r.H) as number;
}

function toLow(r: DailyBar): number {
  return (r.AdjL ?? r.L) as number;
}

function computeSignals(rows: DailyBar[]): PullbackSignals | null {
  if (rows.length < 40) return null;

  const closes = rows.map(toClose);
  const highs = rows.map(toHigh);
  const lows = rows.map(toLow);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2] ?? last;
  const close3 = closes[closes.length - 4] ?? closes[0];
  const close5 = closes[closes.length - 6] ?? closes[0];
  if (!Number.isFinite(last) || last <= 0) return null;

  const closes20 = closes.slice(-20);
  const highs20 = highs.slice(-20);
  const lows20 = lows.slice(-20);
  const closes40 = closes.slice(-40);
  const highs40 = highs.slice(-40);

  const high20 = Math.max(...highs20);
  const high40 = Math.max(...highs40);

  const dayGain = prev > 0 ? last / prev - 1 : 0;
  const rebound3 = close3 > 0 ? last / close3 - 1 : 0;
  const rebound5 = close5 > 0 ? last / close5 - 1 : 0;
  const sma5 = avg(closes.slice(-5));
  const sma20 = avg(closes20);
  const ratioNowHigh20 = high20 > 0 ? last / high20 : 1;
  const ratioNowHigh40 = high40 > 0 ? last / high40 : 1;
  const dropFrom20High = high20 > 0 ? 1 - last / high20 : 0;
  const dropFrom40High = high40 > 0 ? 1 - last / high40 : 0;

  const returns20: number[] = [];
  for (let i = closes.length - 20; i < closes.length; i++) {
    if (i <= 0) continue;
    const p0 = closes[i - 1];
    const p1 = closes[i];
    if (p0 > 0 && Number.isFinite(p1)) returns20.push(p1 / p0 - 1);
  }
  const volatility20 = stdev(returns20);

  const intradayRatios = highs20.map((h, i) => {
    const l = lows20[i];
    const c = closes20[i];
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c) || c <= 0) return 0;
    return Math.max(0, (h - l) / c);
  });
  const intradayRange20 = avg(intradayRatios);

  const turnoverValues = rows
    .slice(-20)
    .map((r) => {
      const c = toClose(r);
      const v = Number(r.Vo);
      if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(v) || v <= 0) return NaN;
      return c * v;
    })
    .filter((x) => Number.isFinite(x));
  const avgTurnover20 = turnoverValues.length > 0 ? avg(turnoverValues) : null;

  return {
    price: last,
    dayGain,
    rebound3,
    rebound5,
    sma5,
    sma20,
    ratioNowHigh20,
    ratioNowHigh40,
    dropFrom20High,
    dropFrom40High,
    volatility20,
    intradayRange20,
    avgTurnover20,
  };
}

function evaluatePullback(args: {
  code: string;
  rows: DailyBar[];
  selection: PullbackSelectionOptions;
}): PullbackEvaluation | null {
  const signals = computeSignals(args.rows);
  if (!signals) return null;

  const trendScore = clamp01((1 - signals.ratioNowHigh40) / 0.35);
  const pullbackBandScore = clamp01(1 - Math.abs(signals.dropFrom20High - 0.14) / 0.18);
  const reboundScore =
    0.45 * clamp01((signals.dayGain + 0.01) / 0.03) +
    0.35 * clamp01((signals.rebound3 + 0.005) / 0.05) +
    0.2 * clamp01((signals.rebound5 + 0.01) / 0.08);
  const maScore =
    0.65 * clamp01(((signals.sma5 / Math.max(signals.sma20, 1e-9)) - 0.98) / 0.06) +
    0.35 * (signals.price >= signals.sma5 ? 1 : 0);
  const volatilityScore = clamp01((args.selection.maxVolatility20 + 0.02 - signals.volatility20) / (args.selection.maxVolatility20 + 0.02));
  const liquidityScore =
    signals.avgTurnover20 === null
      ? 0.5
      : clamp01((Math.log10(Math.max(1, signals.avgTurnover20)) - 8) / 2.2);

  const rawScore =
    100 *
    (0.24 * trendScore +
      0.24 * pullbackBandScore +
      0.18 * reboundScore +
      0.14 * maScore +
      0.1 * volatilityScore +
      0.1 * liquidityScore);

  const reasons: string[] = [];
  const riskFlags: string[] = [];
  let penalty = 0;

  reasons.push(`20d pullback ${formatPct(signals.dropFrom20High)}`);
  reasons.push(`3d rebound ${formatPct(signals.rebound3)}`);
  if (signals.price >= signals.sma5) reasons.push("above SMA5");
  if (signals.sma5 >= signals.sma20) reasons.push("SMA5 >= SMA20");

  if (signals.dayGain < -0.02) {
    riskFlags.push("still falling");
    penalty += 12;
  }
  if (signals.volatility20 > args.selection.maxVolatility20) {
    riskFlags.push("high volatility");
    penalty += 8;
  }
  if (signals.intradayRange20 > 0.08) {
    riskFlags.push("wide daily range");
    penalty += 6;
  }
  if (signals.avgTurnover20 !== null && signals.avgTurnover20 < args.selection.minTurnover) {
    riskFlags.push("low liquidity");
    penalty += 8;
  }
  if (signals.dropFrom20High > args.selection.maxPullbackPct) {
    riskFlags.push("too deep pullback");
    penalty += 10;
  }

  const score = Math.max(0, Math.min(100, rawScore - penalty));
  const grade: "A" | "B" | "C" = score >= 80 ? "A" : score >= 68 ? "B" : "C";

  const hasRebound = signals.dayGain >= 0 || signals.rebound3 >= 0.01 || signals.price >= signals.sma5;
  const passSelection =
    signals.dropFrom20High >= args.selection.minPullbackPct &&
    signals.dropFrom20High <= args.selection.maxPullbackPct &&
    signals.volatility20 <= args.selection.maxVolatility20 * 1.35 &&
    (!args.selection.requireRebound || hasRebound);

  return { score, grade, reasons, riskFlags, signals, passSelection, hasRebound };
}

function appendCandidateFromRows(args: {
  code: string;
  rows: DailyBar[];
  shortTerm: PullbackChanceItem[];
  midTerm: PullbackChanceItem[];
  thresholds?: {
    shortMinRatioHighLow: number;
    shortMaxRatioNowHigh: number;
    midMinRatioHighLow: number;
    midMaxRatioNowHigh: number;
  };
  selection: PullbackSelectionOptions;
  nearMisses?: Array<{
    code: string;
    shortRatioHighLow: number;
    shortRatioNowHigh: number;
    midRatioHighLow: number;
    midRatioNowHigh: number;
    score: number;
    reasons: string[];
    riskFlags: string[];
  }>;
}): void {
  const { code, rows, shortTerm, midTerm } = args;
  if (rows.length < 40) return;

  const last10 = rows.slice(-10);
  const last40 = rows.slice(-40);
  const m10 = calcMetrics(last10);
  const m40 = calcMetrics(last40);
  if (!m10 || !m40) return;

  const evaluation = evaluatePullback({ code, rows, selection: args.selection });
  if (!evaluation) return;

  const th = args.thresholds ?? {
    shortMinRatioHighLow: 1.12,
    shortMaxRatioNowHigh: 0.94,
    midMinRatioHighLow: 1.25,
    midMaxRatioNowHigh: 0.9,
  };

  const isShortBase = m10.ratioHighLow >= th.shortMinRatioHighLow && m10.ratioNowHigh <= th.shortMaxRatioNowHigh;
  const isMidBase = m40.ratioHighLow >= th.midMinRatioHighLow && m40.ratioNowHigh <= th.midMaxRatioNowHigh;
  const meetsQuality = evaluation.passSelection && evaluation.score >= args.selection.minScore;
  const isShort = isShortBase && meetsQuality;
  const isMid = isMidBase && meetsQuality;
  const base = {
    code,
    name: "",
    industry: "",
    score: Math.round(evaluation.score * 10) / 10,
    grade: evaluation.grade,
    pullbackPct: Math.round(evaluation.signals.dropFrom20High * 1000) / 10,
    rebound3Pct: Math.round(evaluation.signals.rebound3 * 1000) / 10,
    rebound5Pct: Math.round(evaluation.signals.rebound5 * 1000) / 10,
    volatility20Pct: Math.round(evaluation.signals.volatility20 * 1000) / 10,
    avgTurnover20: evaluation.signals.avgTurnover20,
    reasons: evaluation.reasons,
    riskFlags: evaluation.riskFlags,
  };

  if (isShort) {
    shortTerm.push({
      bucket: "short",
      ...base,
      price: m10.price,
      ratioHighLow: m10.ratioHighLow,
      ratioNowHigh: m10.ratioNowHigh,
      high: m10.high,
      low: m10.low,
    });
  }

  if (isMid) {
    midTerm.push({
      bucket: "mid",
      ...base,
      price: m40.price,
      ratioHighLow: m40.ratioHighLow,
      ratioNowHigh: m40.ratioNowHigh,
      high: m40.high,
      low: m40.low,
    });
  }

  if (!isShort && !isMid && args.nearMisses) {
    args.nearMisses.push({
      code,
      shortRatioHighLow: m10.ratioHighLow,
      shortRatioNowHigh: m10.ratioNowHigh,
      midRatioHighLow: m40.ratioHighLow,
      midRatioNowHigh: m40.ratioNowHigh,
      score: Math.round(evaluation.score * 10) / 10,
      reasons: evaluation.reasons,
      riskFlags: evaluation.riskFlags,
    });
  }
}

export async function warmupJQuantsBarsCache(args: {
  date: string;
  codes: string[];
  dbProvider?: DbProvider;
  maxCodes?: number;
  force?: boolean;
  onProgress?: (state: {
    done: number;
    total: number;
    success: number;
    fail: number;
    skipped: number;
    lastCode?: string;
  }) => void;
}): Promise<{
  date: string;
  from: string;
  to: string;
  total: number;
  success: number;
  fail: number;
  skipped: number;
  failedCodes: string[];
}> {
  const to = args.date;
  const from = computeDefaultFrom(to);
  const limit = Math.max(1, args.maxCodes ?? 3000);
  const force = Boolean(args.force);
  const codes = [...new Set(args.codes.map((x) => x.trim()).filter(Boolean))].slice(0, limit);

  let success = 0;
  let fail = 0;
  let skipped = 0;
  const failedCodes: string[] = [];

  if (codes.length >= 500) {
    const target = new Set(codes);
    const rowsByCode = new Map<string, DailyBar[]>();
    for (const code of codes) rowsByCode.set(code, []);
    const failedDays: string[] = [];

    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const allDates: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const wd = d.getDay();
      if (wd === 0 || wd === 6) continue;
      allDates.push(ymd(d));
    }

    const totalProgress = allDates.length + codes.length;

    for (let i = 0; i < allDates.length; i++) {
      const day = allDates[i];
      try {
        const dayRows = await fetchJQuantsDailyBarsByDate({ date: day, maxAttempts: 3 });
        for (const row of dayRows) {
          const code = normalizeApiCode(row.Code);
          if (!target.has(code)) continue;
          const arr = rowsByCode.get(code);
          if (!arr) continue;
          arr.push({ ...row, Code: code });
        }
      } catch {
        failedDays.push(day);
      } finally {
        args.onProgress?.({
          done: i + 1,
          total: totalProgress,
          success,
          fail,
          skipped,
          lastCode: day,
        });
      }
    }

    if (failedDays.length > 0) {
      await sleep(10_000);
      for (const day of failedDays) {
        try {
          const dayRows = await fetchJQuantsDailyBarsByDate({ date: day, maxAttempts: 4 });
          for (const row of dayRows) {
            const code = normalizeApiCode(row.Code);
            if (!target.has(code)) continue;
            const arr = rowsByCode.get(code);
            if (!arr) continue;
            arr.push({ ...row, Code: code });
          }
        } catch {
          // Keep going; per-code fallback still runs below.
        }
      }
    }

    const existingByKey =
      !force && args.dbProvider
        ? await getCachedRowsBatch({
            dbProvider: args.dbProvider,
            keys: codes.map((code) => barsDbKey(code, from, to)),
          })
        : {};
    const rowsToPersist: Array<{ key: string; value: DailyBar[] }> = [];

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      const rows = rowsByCode.get(code) ?? [];
      if (rows.length === 0) {
        try {
          const fetched = await fetchJQuantsDailyBars({ code, from, to, maxAttempts: 4, useCache: false });
          if (fetched.rows.length > 0) {
            rowsToPersist.push({ key: barsDbKey(code, from, to), value: fetched.rows });
            success++;
          } else {
            fail++;
            failedCodes.push(code);
          }
        } catch {
          fail++;
          failedCodes.push(code);
        }
      } else {
        if (!force) {
          const existing = existingByKey[barsDbKey(code, from, to)];
          if (existing && existing.length > 0) {
            skipped++;
            continue;
          }
        }
        rowsToPersist.push({ key: barsDbKey(code, from, to), value: rows });
        success++;
      }

      args.onProgress?.({
        done: allDates.length + i + 1,
        total: totalProgress,
        success,
        fail,
        skipped,
        lastCode: code,
      });
    }

    await setCachedRowsBatch({ dbProvider: args.dbProvider, rows: rowsToPersist });

    if (failedCodes.length > 0) {
      let pending = [...failedCodes];
      failedCodes.length = 0;
      fail = 0;
      for (let round = 1; round <= 3 && pending.length > 0; round++) {
        await sleep(12_000 * round);
        const next: string[] = [];
        const recoveredRows: Array<{ key: string; value: DailyBar[] }> = [];
        for (const code of pending) {
          try {
            const fetched = await fetchJQuantsDailyBars({ code, from, to, maxAttempts: 3, useCache: false });
            if (fetched.rows.length > 0) {
              recoveredRows.push({ key: barsDbKey(code, from, to), value: fetched.rows });
              success++;
            } else {
              next.push(code);
            }
          } catch {
            next.push(code);
          }
        }
        await setCachedRowsBatch({ dbProvider: args.dbProvider, rows: recoveredRows });
        pending = next;
      }
      failedCodes.push(...pending);
      fail = pending.length;
    }

    return {
      date: args.date,
      from,
      to,
      total: codes.length,
      success,
      fail,
      skipped,
      failedCodes,
    };
  }

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    try {
      if (!force && args.dbProvider) {
        const cachedRows = await args.dbProvider.getJson<DailyBar[]>(barsDbKey(code, from, to));
        if (cachedRows && cachedRows.length > 0) {
          skipped++;
          args.onProgress?.({
            done: i + 1,
            total: codes.length,
            success,
            fail,
            skipped,
            lastCode: code,
          });
          continue;
        }
      }

      const fetched = await fetchJQuantsDailyBars({ code, from, to, maxAttempts: 3, useCache: true });
      if (fetched.rows.length > 0) {
        success++;
        if (args.dbProvider) {
          await args.dbProvider.setJson(barsDbKey(code, from, to), fetched.rows);
        }
      } else {
        fail++;
        failedCodes.push(code);
      }
    } catch {
      fail++;
      failedCodes.push(code);
    } finally {
      args.onProgress?.({
        done: i + 1,
        total: codes.length,
        success,
        fail,
        skipped,
        lastCode: code,
      });
    }
  }

  return {
    date: args.date,
    from,
    to,
    total: codes.length,
    success,
    fail,
    skipped,
    failedCodes,
  };
}

export async function handlePullbackChances(args: {
  provider: DataProvider;
  dbProvider?: DbProvider;
  date: string;
  refresh?: boolean;
  codes?: string[];
  thresholds?: {
    shortMinRatioHighLow: number;
    shortMaxRatioNowHigh: number;
    midMinRatioHighLow: number;
    midMaxRatioNowHigh: number;
  };
  selection?: Partial<PullbackSelectionOptions>;
}): Promise<PullbackChancesResponse> {
  const { provider, dbProvider, date, refresh = false } = args;

  let universeKey = `${date}_tomorrow-picks`;
  let universeCodes: string[] = [];

  if (args.codes && args.codes.length > 0) {
    universeKey = `${date}_codes_${args.codes.join("-")}`;
    universeCodes = args.codes;
  } else {
    const u = await getTomorrowPicksUniverse({ provider, date, limit: 50 });
    universeKey = u.universeKey;
    universeCodes = u.codes;
  }

  const key = keyOf(date, universeKey);

  if (dbProvider && !refresh) {
    const cached = await dbProvider.getJson<PullbackChancesResponse>(key);
    if (cached) return { ...cached, source: "db" };
  }

  const to = date;
  const from = computeDefaultFrom(date);
  const selection = resolveSelectionOptions(args.selection);
  const directCachedByKey = dbProvider
    ? await getCachedRowsBatch({
        dbProvider,
        keys: universeCodes.map((code) => barsDbKey(code, from, to)),
      })
    : {};

  const debug = {
    requestedCodes: universeCodes,
    from,
    to,
    perCode: [] as PerCodeDebug[],
    fetchedRowsCount: 0,
    cacheHitCount: 0,
    skippedNoRows: 0,
    failedCount: 0,
    rateLimit429Count: 0,
    retriedCount: 0,
    recoveredByRetryCount: 0,
  };

  const shortTerm: PullbackChanceItem[] = [];
  const midTerm: PullbackChanceItem[] = [];
  const nearMisses: Array<{
    code: string;
    shortRatioHighLow: number;
    shortRatioNowHigh: number;
    midRatioHighLow: number;
    midRatioNowHigh: number;
    score: number;
    reasons: string[];
    riskFlags: string[];
  }> = [];
  const perCodeMap = new Map<string, PerCodeDebug>();
  const failedOnInitial = new Set<string>();
  const allowNetworkFetch = refresh || universeCodes.length <= 20;

  const processCode = async (code: string, phase: "initial" | "retry", maxAttempts: number): Promise<void> => {
    if (dbProvider) {
      const directRows = directCachedByKey[barsDbKey(code, from, to)];
      if (directRows && directRows.length >= 40) {
        perCodeMap.set(code, {
          code,
          ok: true,
          rows: directRows.length,
          attempts: 0,
          traces: [{ attempt: 0, message: "cache-db" }],
          statusCodes: [],
          phase: "cache-db",
        });
        debug.fetchedRowsCount += directRows.length;
        debug.cacheHitCount++;
        appendCandidateFromRows({
          code,
          rows: directRows,
          shortTerm,
          midTerm,
          thresholds: args.thresholds,
          selection,
          nearMisses,
        });
        return;
      }

      const cached = await getCachedRowsWithFallback({ dbProvider, code, from, to, maxLookbackDays: 10, minRows: 40 });
      const cachedRows = cached.rows;
      if (cachedRows && cachedRows.length > 0) {
        perCodeMap.set(code, {
          code,
          ok: true,
          rows: cachedRows.length,
          attempts: 0,
          traces: [{ attempt: 0, message: "cache-db" }],
          statusCodes: [],
          phase: cached.phase,
        });
        debug.fetchedRowsCount += cachedRows.length;
        debug.cacheHitCount++;
        appendCandidateFromRows({
          code,
          rows: cachedRows,
          shortTerm,
          midTerm,
          thresholds: args.thresholds,
          selection,
          nearMisses,
        });
        return;
      }
    }

    if (!allowNetworkFetch) {
      perCodeMap.set(code, {
        code,
        ok: false,
        error: "cache miss (network fetch disabled; use refresh=1 to fetch)",
        traces: [{ attempt: 0, message: "cache-miss" }],
        statusCodes: [],
        phase,
      });
      if (phase === "initial") failedOnInitial.add(code);
      return;
    }

    try {
      const fetched = await fetchJQuantsDailyBars({ code, from, to, maxAttempts, useCache: true });
      const rows = fetched.rows;

      perCodeMap.set(code, {
        code,
        ok: true,
        rows: rows.length,
        attempts: fetched.attempts,
        traces: fetched.traces,
        statusCodes: fetched.traces.map((t) => t.status).filter((x): x is number => Number.isFinite(x)),
        phase,
      });
      debug.fetchedRowsCount += rows.length;
      if (fetched.cacheHit) debug.cacheHitCount++;
      if (dbProvider && rows.length > 0) {
        await dbProvider.setJson(barsDbKey(code, from, to), rows);
      }

      if (rows.length === 0) {
        debug.skippedNoRows++;
        return;
      }

      appendCandidateFromRows({
        code,
        rows,
        shortTerm,
        midTerm,
        thresholds: args.thresholds,
        selection,
        nearMisses,
      });
    } catch (e) {
      const error = String((e as Error)?.message ?? e);
      const traces = e instanceof JQuantsFetchError ? e.traces : undefined;
      perCodeMap.set(code, {
        code,
        ok: false,
        error,
        traces,
        statusCodes: (traces ?? []).map((t) => t.status).filter((x): x is number => Number.isFinite(x)),
        phase,
      });
      if (phase === "initial") failedOnInitial.add(code);
    }
  };

  for (const code of universeCodes) {
    await processCode(code, "initial", 3);
  }

  if (allowNetworkFetch && failedOnInitial.size > 0) {
    debug.retriedCount = failedOnInitial.size;
    await sleep(1500);
    for (const code of failedOnInitial) {
      await processCode(code, "retry", 2);
    }
  }

  debug.perCode = universeCodes.map((code) => perCodeMap.get(code) ?? { code, ok: false, phase: "initial", error: "missing result" });
  debug.failedCount = debug.perCode.filter((x) => !x.ok).length;
  debug.rateLimit429Count = debug.perCode.filter((x) => !x.ok && isRateLimitError(x.error ?? "")).length;
  debug.recoveredByRetryCount = [...failedOnInitial].filter((code) => perCodeMap.get(code)?.ok).length;
  const failedCodes = debug.perCode.filter((x) => !x.ok).map((x) => x.code);
  (debug as any).failedCodes = failedCodes;
  const scoringThresholds = args.thresholds ?? {
    shortMinRatioHighLow: 1.12,
    shortMaxRatioNowHigh: 0.94,
    midMinRatioHighLow: 1.25,
    midMaxRatioNowHigh: 0.9,
  };

  const rankByScore = (a: PullbackChanceItem, b: PullbackChanceItem) =>
    (b.score ?? 0) - (a.score ?? 0) || a.ratioNowHigh - b.ratioNowHigh || b.ratioHighLow - a.ratioHighLow;
  shortTerm.sort(rankByScore);
  midTerm.sort(rankByScore);

  if (selection.maxPerBucket > 0) {
    shortTerm.splice(selection.maxPerBucket);
    midTerm.splice(selection.maxPerBucket);
  }

  (debug as any).nearMissTop = nearMisses
    .map((x) => {
      const shortGap =
        Math.max(0, scoringThresholds.shortMinRatioHighLow - x.shortRatioHighLow) +
        Math.max(0, x.shortRatioNowHigh - scoringThresholds.shortMaxRatioNowHigh);
      const midGap =
        Math.max(0, scoringThresholds.midMinRatioHighLow - x.midRatioHighLow) +
        Math.max(0, x.midRatioNowHigh - scoringThresholds.midMaxRatioNowHigh);
      return { ...x, thresholdGap: Math.min(shortGap, midGap) };
    })
    .sort((a, b) => b.score - a.score || a.thresholdGap - b.thresholdGap)
    .slice(0, 20);

  (debug as any).selectionSummary = {
    minScore: selection.minScore,
    maxPerBucket: selection.maxPerBucket,
    requireRebound: selection.requireRebound,
    minTurnover: selection.minTurnover,
    maxVolatility20: selection.maxVolatility20,
    minPullbackPct: selection.minPullbackPct,
    maxPullbackPct: selection.maxPullbackPct,
    shortCandidates: shortTerm.length,
    midCandidates: midTerm.length,
  };
  (debug as any).topScored = [...shortTerm, ...midTerm].sort(rankByScore).slice(0, 20);

  if (debug.failedCount > 0) {
    console.warn(
      `[pullback] date=${date} failed=${debug.failedCount} rateLimit429=${debug.rateLimit429Count} retried=${debug.retriedCount} recovered=${debug.recoveredByRetryCount}`
    );
  }

  const out: PullbackChancesResponse = {
    date,
    key,
    universeKey,
    shortTerm,
    midTerm,
    fetchedAt: new Date().toISOString(),
    source: "generated",
    debug,
  };

  if (dbProvider) await dbProvider.setJson(key, out);
  return out;
}
