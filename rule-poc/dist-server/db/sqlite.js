import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function ensureDir(p) {
    if (!fs.existsSync(p))
        fs.mkdirSync(p, { recursive: true });
}
export function openDb() {
    const dbDir = path.resolve(__dirname, "../../data");
    ensureDir(dbDir);
    const dbPath = path.join(dbDir, "rule-poc.sqlite");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
    return db;
}
function migrate(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS earnings_watchlist (
      date TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      items_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rankings (
      date TEXT PRIMARY KEY,
      up_json TEXT NOT NULL,
      down_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    -- 汎用JSONキャッシュ（tomorrow-picks / pullback-chances 等）
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
