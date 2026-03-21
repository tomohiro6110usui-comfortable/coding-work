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

  async getJsonBatch<T>(keys: string[]): Promise<Record<string, T>> {
    const out: Record<string, T> = {};
    if (!keys || keys.length === 0) return out;

    const chunkSize = 500;
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = this.db
        .prepare(`SELECT key, json FROM kv_store WHERE key IN (${placeholders})`)
        .all(...chunk) as Array<{ key: string; json: string }>;

      for (const row of rows) {
        out[row.key] = JSON.parse(row.json) as T;
      }
    }

    return out;
  }

  async setJsonBatch<T>(items: Array<{ key: string; value: T }>): Promise<void> {
    if (!items || items.length === 0) return;
    const fetchedAt = new Date().toISOString();
    const stmt = this.db.prepare(
      "INSERT INTO kv_store(key,json,fetchedAt) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, fetchedAt=excluded.fetchedAt"
    );
    const tx = this.db.transaction((rows: Array<{ key: string; value: T }>) => {
      for (const row of rows) {
        stmt.run(row.key, JSON.stringify(row.value), fetchedAt);
      }
    });
    tx(items);
  }
}

// 縲茎qliteProvider.ts 縺九ｉ export 縺吶ｋ縲崎ｦ∽ｻｶ蟇ｾ蠢懶ｼ・ype縺ｮ蜀阪お繧ｯ繧ｹ繝昴・繝茨ｼ・
export type { DbProvider } from "./provider.js";



