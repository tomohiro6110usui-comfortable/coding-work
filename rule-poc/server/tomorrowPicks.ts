// server/tomorrowPicks.ts
import type { DataProvider } from "./dataProviders/provider.js";
import type { DbProvider } from "./dataProviders/sqliteProvider.js";

export type TomorrowPickItem = {
  code: string;
  name?: string;
  market?: string;
  score: number;
  reasons: string[];
};

export type TomorrowPicksResponse = {
  date: string;
  key: string;
  items: TomorrowPickItem[];
  fetchedAt: string;
  source: "db" | "generated";
};

function keyOf(date: string) {
  return `${date}_tomorrow-picks`;
}

function uniqByCode<T extends { code: string }>(items: T[]): T[] {
  const m = new Map<string, T>();
  for (const it of items) m.set(it.code, it);
  return [...m.values()];
}

export async function getTomorrowPicksUniverse(args: {
  provider: DataProvider;
  date: string;
  limit?: number;
}): Promise<{ universeKey: string; codes: string[] }> {
  const { provider, date, limit = 50 } = args;
  const [watch, ranks] = await Promise.all([
    provider.getEarningsWatchlist(date),
    provider.getRankings(date),
  ]);

  const watchCodes = watch.items.map((x) => x.code);
  const rankCodes = ranks.items.map((x) => x.code);

  const codes = uniqByCode(
    [...watchCodes, ...rankCodes].map((code) => ({ code })),
  )
    .map((x) => x.code)
    .slice(0, limit);

  return { universeKey: `${date}_tomorrow-picks`, codes };
}

export async function handleTomorrowPicks(args: {
  provider: DataProvider;
  dbProvider?: DbProvider;
  date: string;
  refresh?: boolean;
}): Promise<TomorrowPicksResponse> {
  const { provider, dbProvider, date, refresh = false } = args;
  const key = keyOf(date);

  if (dbProvider && !refresh) {
    const cached = await dbProvider.getJson<TomorrowPicksResponse>(key);
    if (cached) return { ...cached, source: "db" };
  }

  const [watch, ranks] = await Promise.all([
    provider.getEarningsWatchlist(date),
    provider.getRankings(date),
  ]);

  // スコアはPoC的。重要なのは「監視優先度の並び替え」
  const scoreMap = new Map<string, { code: string; name?: string; market?: string; score: number; reasons: string[] }>();

  for (const w of watch.items) {
    const cur = scoreMap.get(w.code) ?? { code: w.code, name: w.name, market: w.market, score: 0, reasons: [] };
    cur.score += 5;
    cur.reasons.push("watchlist");
    scoreMap.set(w.code, cur);
  }

  for (const r of ranks.items) {
    const cur = scoreMap.get(r.code) ?? { code: r.code, name: r.name, market: r.market, score: 0, reasons: [] };
    cur.score += 3;
    cur.reasons.push("rankings");
    scoreMap.set(r.code, cur);
  }

  const items: TomorrowPickItem[] = [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((x) => ({ code: x.code, name: x.name, market: x.market, score: x.score, reasons: x.reasons }));

  const out: TomorrowPicksResponse = {
    date,
    key,
    items,
    fetchedAt: new Date().toISOString(),
    source: "generated",
  };

  if (dbProvider) await dbProvider.setJson(key, out);
  return out;
}