// src/lib/api.ts

export type ApiSource = "db" | "generated" | "unknown";

// --------------------
// Earnings Watchlist
// --------------------
export type WatchlistItem = {
  code: string;
  name: string;
  industry?: string;

  // ✅ 追加（UIで参照している）
  market?: string;
  earningsDate?: string;

  // 既存互換（date を使っている箇所があっても壊れない）
  date?: string;

  memo?: string;
};

export type WatchlistResponse = {
  key: string;
  date: string;
  fetchedAt: string;
  source?: ApiSource;
  items: WatchlistItem[];
};

// 旧名互換（あなたの既存コードが EarningsWatchlistResponse を使っていても壊れないように）
export type EarningsWatchlistResponse = WatchlistResponse;

export async function getEarningsWatchlist(date: string, refresh = false): Promise<WatchlistResponse> {
  const qs = new URLSearchParams({ date });
  if (refresh) qs.set("refresh", "1");
  const res = await fetch(`/api/earnings-watchlist?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// pages 側が fetchEarningsWatchlist をimportしていても動く互換export
export const fetchEarningsWatchlist = getEarningsWatchlist;

// --------------------
// Rankings
// --------------------
export type RankingItem = {
  code: string;
  name: string;
  industry?: string;

  price?: number;
  changePct?: number;

  // ✅ 追加（UIで参照している）
  close?: number;
  reasonLite?: string;

  // 既存互換
  reason?: string;
};

export type RankingsResponse = {
  key: string;
  date: string;
  fetchedAt: string;
  source?: ApiSource;
  up: RankingItem[];
  down: RankingItem[];
};

// 旧名互換
export type RankingsResult = RankingsResponse;

export async function getRankings(date: string, refresh = false): Promise<RankingsResponse> {
  const qs = new URLSearchParams({ date });
  if (refresh) qs.set("refresh", "1");
  const res = await fetch(`/api/rankings?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export const fetchRankings = getRankings;

// --------------------
// Tomorrow Picks
// --------------------
export type TomorrowPickItem = {
  code: string;
  name: string;
  industry?: string;
  score?: number;

  // 既存互換
  reason?: string;

  // ✅ 追加（UIで参照している）
  reasons?: string[];
};

export type TomorrowPicksResponse = {
  key: string;
  date: string;
  fetchedAt: string;
  source?: ApiSource;
  items: TomorrowPickItem[];
};

export async function getTomorrowPicks(date: string, refresh = false): Promise<TomorrowPicksResponse> {
  const qs = new URLSearchParams({ date });
  if (refresh) qs.set("refresh", "1");
  const res = await fetch(`/api/tomorrow-picks?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export const fetchTomorrowPicks = getTomorrowPicks;

// --------------------
// Pullback Chances
// --------------------
export type PullbackTerm = "short" | "mid";

// ✅ term を追加（PullbackChancesPage.tsx の x.term エラー解消）
export type PullbackChanceItem = {
  term: PullbackTerm; // "short" | "mid"
  code: string;
  name: string;
  industry?: string;

  price: number;

  ratioHighLow: number;

  // ✅ 追加（UIで参照している）
  ratioHL?: number;

  ratioNowHigh: number;
  high: number;
  low: number;

  // 既存実装が _bucket も持っている場合に備えて残す（あってもなくてもOK）
  _bucket?: string;
};

export type PullbackChancesResponse = {
  key: string;
  date: string;
  fetchedAt: string;
  source?: ApiSource;

  universeKey?: string;
  shortTerm: PullbackChanceItem[];
  midTerm: PullbackChanceItem[];

  debug?: any;
};

export async function getPullbackChances(
  date: string,
  refresh = false,
  codes?: string[]
): Promise<PullbackChancesResponse> {
  const qs = new URLSearchParams({ date });
  if (refresh) qs.set("refresh", "1");
  if (codes && codes.length) qs.set("codes", codes.join(","));
  const res = await fetch(`/api/pullback-chances?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export const fetchPullbackChances = getPullbackChances;