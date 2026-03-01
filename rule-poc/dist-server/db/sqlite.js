import Database from "better-sqlite3";
export function openDb(filePath) {
    const db = new Database(filePath);
    db.pragma("journal_mode = WAL");
    // 既存テーブル（PoC）
    db.exec(`
    CREATE TABLE IF NOT EXISTS stock_master (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      market TEXT NOT NULL,
      industry TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS earnings_watchlist (
      key TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      json TEXT NOT NULL,
      fetchedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rankings (
      key TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      json TEXT NOT NULL,
      fetchedAt TEXT NOT NULL
    );

    -- ✅ 追加: 汎用KV（pullback/tomorrow等のキャッシュ）
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      fetchedAt TEXT NOT NULL
    );
  `);
    return db;
}
