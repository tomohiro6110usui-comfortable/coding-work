import type {
  DataProvider,
  DbProvider,
  EarningsWatchlistResult,
  RankingsResult,
} from "./provider.js";
import type { SqliteDb } from "../db/sqlite.js";

export class SqliteProvider implements DataProvider, DbProvider {
  constructor(private db: SqliteDb) {}

  // -----------------------
  // DataProvider・域里蟄倅ｺ呈鋤・・
  // -----------------------
  async getEarningsWatchlist(date: string): Promise<EarningsWatchlistResult> {
    const key = `${date}_earnings-watchlist`;
    const row = this.db
      .prepare("SELECT json, fetchedAt FROM earnings_watchlist WHERE key = ?")
      .get(key) as { json: string; fetchedAt: string } | undefined;

    if (!row) throw new Error(`EARNINGS_NOT_FOUND:${date}`);
    const parsed = JSON.parse(row.json) as EarningsWatchlistResult;
    return { ...parsed, fetchedAt: row.fetchedAt, source: "db" };
  }

  async getRankings(date: string): Promise<RankingsResult> {
    const key = `${date}_rankings`;
    const row = this.db
      .prepare("SELECT json, fetchedAt FROM rankings WHERE key = ?")
      .get(key) as { json: string; fetchedAt: string } | undefined;

    if (!row) throw new Error(`RANKINGS_NOT_FOUND:${date}`);
    const parsed = JSON.parse(row.json) as RankingsResult;
    return { ...parsed, fetchedAt: row.fetchedAt, source: "db" };
  }

  // -----------------------
  // DbProvider・・V繧ｭ繝｣繝・す繝･・・
  // -----------------------
  async getJson<T>(key: string): Promise<T | null> {
    const row = this.db
      .prepare("SELECT json FROM kv_store WHERE key = ?")
      .get(key) as { json: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.json) as T;
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    const fetchedAt = new Date().toISOString();
    const json = JSON.stringify(value);

    this.db
      .prepare(
        "INSERT INTO kv_store(key,json,fetchedAt) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, fetchedAt=excluded.fetchedAt"
      )
      .run(key, json, fetchedAt);
  }
}

// 縲茎qliteProvider.ts 縺九ｉ export 縺吶ｋ縲崎ｦ∽ｻｶ蟇ｾ蠢懶ｼ・ype縺ｮ蜀阪お繧ｯ繧ｹ繝昴・繝茨ｼ・
export type { DbProvider } from "./provider.js";


