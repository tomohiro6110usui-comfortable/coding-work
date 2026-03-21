export type ApiSource = "db" | "generated" | "unknown";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text}`.trim());
  }
  return (await res.json()) as T;
}

export type WatchlistItem = {
  code: string;
  name?: string;
  market?: string;
  earningsDate?: string;
  industry?: string;
  memo?: string;
};

export type WatchlistResponse = {
  key: string;
  date: string;
  fetchedAt: string;
  source?: ApiSource;
  items: WatchlistItem[];
  warning?: string;
};

export type EarningsWatchlistResponse = WatchlistResponse;

export async function getEarningsWatchlist(date: string, refresh = false): Promise<WatchlistResponse> {
  const qs = new URLSearchParams({ date });
  if (refresh) qs.set("refresh", "1");
  return getJson<WatchlistResponse>(`/api/earnings-watchlist?${qs.toString()}`);
}

export const fetchEarningsWatchlist = getEarningsWatchlist;

export type RankingItem = {
  code: string;
  name?: string;
  market?: string;
  value?: number;
  pct?: number;
  reason?: string;
  close?: number;
  changePct?: number;
  reasonLite?: string;
};

export type RankingsResponse = {
  key: string;
  date: string;
  fetchedAt: string;
  source?: ApiSource;
  items: RankingItem[];
  warning?: string;
};

export async function getRankings(date: string, refresh = false): Promise<RankingsResponse> {
  const qs = new URLSearchParams({ date });
  if (refresh) qs.set("refresh", "1");
  return getJson<RankingsResponse>(`/api/rankings?${qs.toString()}`);
}

export const fetchRankings = getRankings;

export type TomorrowPickItem = {
  code: string;
  name?: string;
  market?: string;
  score?: number;
  reasons?: string[];
};

export type TomorrowPicksResponse = {
  key: string;
  date: string;
  fetchedAt: string;
  source?: ApiSource;
  items: TomorrowPickItem[];
  warning?: string;
};

export async function getTomorrowPicks(date: string, refresh = false): Promise<TomorrowPicksResponse> {
  const qs = new URLSearchParams({ date });
  if (refresh) qs.set("refresh", "1");
  return getJson<TomorrowPicksResponse>(`/api/tomorrow-picks?${qs.toString()}`);
}

export const fetchTomorrowPicks = getTomorrowPicks;

export type PullbackTerm = "short" | "mid";

export type PullbackChanceItem = {
  bucket: PullbackTerm;
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

export type PullbackPerCodeDebug = {
  code: string;
  ok: boolean;
  rows?: number;
  attempts?: number;
  error?: string;
  traces?: Array<{ attempt: number; status?: number; waitMs?: number; message?: string }>;
  statusCodes?: number[];
  phase: "initial" | "retry" | "cache-db" | "cache-db-fallback";
};

export type PullbackDebug = {
  requestedCodes: string[];
  from: string;
  to: string;
  perCode: PullbackPerCodeDebug[];
  fetchedRowsCount: number;
  cacheHitCount: number;
  skippedNoRows: number;
  failedCount: number;
  rateLimit429Count: number;
  retriedCount: number;
  recoveredByRetryCount: number;
  failedCodes?: string[];
  selectionSummary?: {
    minScore: number;
    maxPerBucket: number;
    requireRebound: boolean;
    minTurnover: number;
    maxVolatility20: number;
    minPullbackPct: number;
    maxPullbackPct: number;
    shortCandidates: number;
    midCandidates: number;
  };
  topScored?: PullbackChanceItem[];
  nearMissTop?: Array<{
    code: string;
    score: number;
    thresholdGap: number;
    reasons: string[];
    riskFlags: string[];
  }>;
};

export type PullbackChancesResponse = {
  key: string;
  date: string;
  fetchedAt: string;
  source?: ApiSource;
  universeKey?: string;
  shortTerm: PullbackChanceItem[];
  midTerm: PullbackChanceItem[];
  warning?: string;
  debug?: PullbackDebug;
};

export type PullbackSelectionRequest = {
  minScore?: number;
  maxPerBucket?: number;
  requireRebound?: boolean;
  minTurnover?: number;
  maxVolatility20?: number;
  minPullbackPct?: number;
  maxPullbackPct?: number;
};

export async function getPullbackChances(
  date: string,
  refresh = false,
  codes?: string[],
  selection?: PullbackSelectionRequest
): Promise<PullbackChancesResponse> {
  const qs = new URLSearchParams({ date });
  if (refresh) qs.set("refresh", "1");
  if (codes && codes.length > 0) qs.set("codes", codes.join(","));
  if (selection) {
    if (selection.minScore != null) qs.set("minScore", String(selection.minScore));
    if (selection.maxPerBucket != null) qs.set("maxPerBucket", String(selection.maxPerBucket));
    if (selection.requireRebound != null) qs.set("requireRebound", selection.requireRebound ? "1" : "0");
    if (selection.minTurnover != null) qs.set("minTurnover", String(selection.minTurnover));
    if (selection.maxVolatility20 != null) qs.set("maxVolatility20", String(selection.maxVolatility20));
    if (selection.minPullbackPct != null) qs.set("minPullbackPct", String(selection.minPullbackPct));
    if (selection.maxPullbackPct != null) qs.set("maxPullbackPct", String(selection.maxPullbackPct));
  }
  return getJson<PullbackChancesResponse>(`/api/pullback-chances?${qs.toString()}`);
}

export const fetchPullbackChances = getPullbackChances;
