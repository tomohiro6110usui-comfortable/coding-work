// server/dataProviders/provider.ts
export type WatchItem = {
  code: string;
  name?: string;
  market?: string;
  date?: string;
  time?: string;
  summary?: string;
};

export type EarningsWatchlistResult = {
  date: string;
  items: WatchItem[];
  fetchedAt: string;
  source: "api" | "mock" | "db";
};

export type RankingItem = {
  code: string;
  name?: string;
  market?: string;
  value?: number;
  pct?: number;
  reason?: string;
};

export type RankingsResult = {
  date: string;
  items: RankingItem[];
  fetchedAt: string;
  source: "api" | "mock" | "db";
};

/**
 * DBのKVキャッシュ用途（SQLite/他ストレージ共通インタフェース）
 * - J-Quants等で取得した結果を key -> json として保存/復元する
 */
export type DbProvider = {
  getJson: <T>(key: string) => Promise<T | null>;
  setJson: <T>(key: string, value: T) => Promise<void>;
};

export type DataProvider = {
  getEarningsWatchlist: (date: string) => Promise<EarningsWatchlistResult>;
  getRankings: (date: string) => Promise<RankingsResult>;
};