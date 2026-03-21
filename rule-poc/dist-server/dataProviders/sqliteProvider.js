export class SqliteProvider {
    db;
    constructor(db) {
        this.db = db;
    }
    // -----------------------
    // DataProvider・域里蟄倅ｺ呈鋤・・
    // -----------------------
    async getEarningsWatchlist(date) {
        const key = `${date}_earnings-watchlist`;
        const row = this.db
            .prepare("SELECT json, fetchedAt FROM earnings_watchlist WHERE key = ?")
            .get(key);
        if (!row)
            throw new Error(`EARNINGS_NOT_FOUND:${date}`);
        const parsed = JSON.parse(row.json);
        return { ...parsed, fetchedAt: row.fetchedAt, source: "db" };
    }
    async getRankings(date) {
        const key = `${date}_rankings`;
        const row = this.db
            .prepare("SELECT json, fetchedAt FROM rankings WHERE key = ?")
            .get(key);
        if (!row)
            throw new Error(`RANKINGS_NOT_FOUND:${date}`);
        const parsed = JSON.parse(row.json);
        return { ...parsed, fetchedAt: row.fetchedAt, source: "db" };
    }
    // -----------------------
    // DbProvider・・V繧ｭ繝｣繝・す繝･・・
    // -----------------------
    async getJson(key) {
        const row = this.db
            .prepare("SELECT json FROM kv_store WHERE key = ?")
            .get(key);
        if (!row)
            return null;
        return JSON.parse(row.json);
    }
    async setJson(key, value) {
        const fetchedAt = new Date().toISOString();
        const json = JSON.stringify(value);
        this.db
            .prepare("INSERT INTO kv_store(key,json,fetchedAt) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, fetchedAt=excluded.fetchedAt")
            .run(key, json, fetchedAt);
    }
    async getJsonBatch(keys) {
        const out = {};
        if (!keys || keys.length === 0)
            return out;
        const chunkSize = 500;
        for (let i = 0; i < keys.length; i += chunkSize) {
            const chunk = keys.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => "?").join(",");
            const rows = this.db
                .prepare(`SELECT key, json FROM kv_store WHERE key IN (${placeholders})`)
                .all(...chunk);
            for (const row of rows) {
                out[row.key] = JSON.parse(row.json);
            }
        }
        return out;
    }
    async setJsonBatch(items) {
        if (!items || items.length === 0)
            return;
        const fetchedAt = new Date().toISOString();
        const stmt = this.db.prepare("INSERT INTO kv_store(key,json,fetchedAt) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, fetchedAt=excluded.fetchedAt");
        const tx = this.db.transaction((rows) => {
            for (const row of rows) {
                stmt.run(row.key, JSON.stringify(row.value), fetchedAt);
            }
        });
        tx(items);
    }
}
