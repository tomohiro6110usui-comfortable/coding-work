// server/pullbackChances.ts
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
};

export type PullbackChancesResponse = {
  date: string;
  key: string;
  universeKey: string;
  shortTerm: PullbackChanceItem[];
  midTerm: PullbackChanceItem[];
  fetchedAt: string;
  source: "db" | "generated";
  debug?: any;
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

function keyOf(date: string, universeKey: string) {
  return `${date}_pullback-chances_${universeKey}`;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * 要件：「現在の（本当の）日付を取得」→ 12週間と3日を引く
 * ここではサーバー実行時の現在日付を基準に from を決める（本番前提）
 */
function computeDefaultFrom(): string {
  const now = new Date();
  const days = 7 * 12 + 3; // 12 weeks + 3 days
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return ymd(from);
}

async function fetchJQuantsDailyBars(args: {
  code: string;
  from: string;
  to: string;
}): Promise<DailyBar[]> {
  const apiKey = process.env.JQUANTS_API_KEY;
  if (!apiKey) throw new Error("Missing env: JQUANTS_API_KEY");

  const { code, from, to } = args;
  const q = new URLSearchParams({ code, from, to });
  const url = `https://api.jquants.com/v2/equities/bars/daily?${q.toString()}`;

  const res = await fetch(url, {
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`JQuants HTTP ${res.status} ${text}`.trim());
  }

  const json = await res.json();
  // 仕様上 data 配列が返る（あなたの疎通結果も rows=243 で取得できている）
  const rows = (json?.data ?? json?.daily_quotes ?? []) as DailyBar[];
  return rows;
}

function calcMetrics(rows: DailyBar[]) {
  if (rows.length === 0) return null;
  // Adj がある場合は Adj を優先（分割補正）
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

export async function handlePullbackChances(args: {
  provider: DataProvider;
  dbProvider?: DbProvider;
  date: string;
  refresh?: boolean;
  codes?: string[];
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
  const from = computeDefaultFrom();

  const debug: any = {
    requestedCodes: universeCodes,
    from,
    to,
    perCode: [] as any[],
    fetchedRowsCount: 0,
    skippedNoRows: 0,
    skippedTooShort: 0,
  };

  const shortTerm: PullbackChanceItem[] = [];
  const midTerm: PullbackChanceItem[] = [];

  for (const code of universeCodes) {
    try {
      const rows = await fetchJQuantsDailyBars({ code, from, to });
      debug.perCode.push({ code, ok: true, rows: rows.length });
      debug.fetchedRowsCount += rows.length;

      if (!rows || rows.length === 0) {
        debug.skippedNoRows++;
        continue;
      }

      // 期間別に切り出し（営業日換算の厳密化は後で。まずは動く実装を優先）
      const last10 = rows.slice(-10); // ≒2週間（営業日10日）
      const last40 = rows.slice(-40); // ≒2ヶ月（営業日40日）

      const m10 = calcMetrics(last10);
      const m40 = calcMetrics(last40);
      if (!m10 || !m40) continue;

      // 要件
      const isShort = m10.ratioHighLow >= 1.5 && m10.ratioNowHigh <= 0.8;
      const isMid = m40.ratioHighLow >= 2.0 && m40.ratioNowHigh <= 0.8;

      const base = {
        code,
        name: "",
        industry: "",
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
    } catch (e: any) {
      debug.perCode.push({ code, ok: false, error: String(e?.message ?? e) });
    }
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