export class SqliteProvider {
    db;
    constructor(db) {
        this.db = db;
    }
    /** ---- kv (JSON cache) ---- */
    getJson(key) {
        const row = this.db
            .prepare("SELECT value_json FROM kv WHERE key = ?")
            .get(key);
        if (!row)
            return null;
        try {
            return JSON.parse(row.value_json);
        }
        catch {
            return null;
        }
    }
    setJson(key, value) {
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO kv(key, value_json, updated_at)
         VALUES(@key, @value_json, @updated_at)
         ON CONFLICT(key) DO UPDATE SET
           value_json=excluded.value_json,
           updated_at=excluded.updated_at`)
            .run({
            key,
            value_json: JSON.stringify(value),
            updated_at: now,
        });
    }
    /** ---- earnings_watchlist ---- */
    async getEarningsWatchlist(date) {
        const row = this.db
            .prepare("SELECT date, key, items_json, fetched_at FROM earnings_watchlist WHERE date = ?")
            .get(date);
        if (!row)
            throw new Error(`EARNINGS_NOT_FOUND:${date}`);
        return { date: row.date, key: row.key, items: JSON.parse(row.items_json), fetchedAt: row.fetched_at };
    }
    upsertEarningsWatchlist(res) {
        this.db
            .prepare(`INSERT INTO earnings_watchlist(date, key, items_json, fetched_at)
         VALUES(@date, @key, @items_json, @fetched_at)
         ON CONFLICT(date) DO UPDATE SET
           key=excluded.key,
           items_json=excluded.items_json,
           fetched_at=excluded.fetched_at`)
            .run({
            date: res.date,
            key: res.key,
            items_json: JSON.stringify(res.items),
            fetched_at: res.fetchedAt,
        });
    }
    /** ---- rankings ---- */
    async getRankings(date) {
        const row = this.db
            .prepare("SELECT date, up_json, down_json, fetched_at FROM rankings WHERE date = ?")
            .get(date);
        if (!row)
            throw new Error(`RANKINGS_NOT_FOUND:${date}`);
        return { date: row.date, up: JSON.parse(row.up_json), down: JSON.parse(row.down_json), fetchedAt: row.fetched_at };
    }
    upsertRankings(res) {
        this.db
            .prepare(`INSERT INTO rankings(date, up_json, down_json, fetched_at)
         VALUES(@date, @up_json, @down_json, @fetched_at)
         ON CONFLICT(date) DO UPDATE SET
           up_json=excluded.up_json,
           down_json=excluded.down_json,
           fetched_at=excluded.fetched_at`)
            .run({
            date: res.date,
            up_json: JSON.stringify(res.up),
            down_json: JSON.stringify(res.down),
            fetched_at: res.fetchedAt,
        });
    }
}
