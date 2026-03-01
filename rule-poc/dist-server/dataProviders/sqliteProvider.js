function isNoSuchError(error) {
    return String(error?.message ?? error).includes("no such");
}
export class SqliteProvider {
    db;
    tableColumnsCache = new Map();
    constructor(db) {
        this.db = db;
    }
    getColumns(table) {
        const cached = this.tableColumnsCache.get(table);
        if (cached)
            return cached;
        try {
            const rows = this.db.prepare(`PRAGMA table_info(${table})`).all();
            const cols = new Set(rows.map((r) => r.name));
            this.tableColumnsCache.set(table, cols);
            return cols;
        }
        catch {
            const empty = new Set();
            this.tableColumnsCache.set(table, empty);
            return empty;
        }
    }
    hasColumn(table, column) {
        return this.getColumns(table).has(column);
    }
    clearTableColumnsCache(table) {
        this.tableColumnsCache.delete(table);
    }
    ensureKvStoreTable() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        fetchedAt TEXT NOT NULL
      );
    `);
        this.clearTableColumnsCache("kv_store");
    }
    // -----------------------
    // DataProvider（旧/新スキーマ互換）
    // -----------------------
    async getEarningsWatchlist(date) {
        // 新スキーマ: key/date/json/fetchedAt
        if (this.hasColumn("earnings_watchlist", "json")) {
            try {
                const key = `${date}_earnings-watchlist`;
                const row = this.db
                    .prepare("SELECT json, fetchedAt FROM earnings_watchlist WHERE key = ?")
                    .get(key);
                if (!row)
                    throw new Error(`EARNINGS_NOT_FOUND:${date}`);
                const parsed = JSON.parse(row.json);
                return { ...parsed, fetchedAt: row.fetchedAt, source: "db" };
            }
            catch (error) {
                if (!isNoSuchError(error))
                    throw error;
                this.clearTableColumnsCache("earnings_watchlist");
            }
        }
        // 旧スキーマ: date/key/items_json/fetched_at
        if (!this.hasColumn("earnings_watchlist", "items_json")) {
            throw new Error(`EARNINGS_NOT_FOUND:${date}`);
        }
        const legacy = this.db
            .prepare("SELECT key, items_json, fetched_at FROM earnings_watchlist WHERE date = ?")
            .get(date);
        if (!legacy)
            throw new Error(`EARNINGS_NOT_FOUND:${date}`);
        let items = [];
        try {
            const parsed = JSON.parse(legacy.items_json);
            items = Array.isArray(parsed) ? parsed : [];
        }
        catch {
            items = [];
        }
        return {
            date,
            items,
            fetchedAt: legacy.fetched_at,
            source: "db",
        };
    }
    async getRankings(date) {
        // 新スキーマ: key/date/json/fetchedAt
        if (this.hasColumn("rankings", "json")) {
            try {
                const key = `${date}_rankings`;
                const row = this.db
                    .prepare("SELECT json, fetchedAt FROM rankings WHERE key = ?")
                    .get(key);
                if (!row)
                    throw new Error(`RANKINGS_NOT_FOUND:${date}`);
                const parsed = JSON.parse(row.json);
                return { ...parsed, fetchedAt: row.fetchedAt, source: "db" };
            }
            catch (error) {
                if (!isNoSuchError(error))
                    throw error;
                this.clearTableColumnsCache("rankings");
            }
        }
        // 旧スキーマ: date/up_json/down_json/fetched_at
        if (!this.hasColumn("rankings", "up_json") || !this.hasColumn("rankings", "down_json")) {
            throw new Error(`RANKINGS_NOT_FOUND:${date}`);
        }
        const legacy = this.db
            .prepare("SELECT up_json, down_json, fetched_at FROM rankings WHERE date = ?")
            .get(date);
        if (!legacy)
            throw new Error(`RANKINGS_NOT_FOUND:${date}`);
        let up = [];
        let down = [];
        try {
            const parsedUp = JSON.parse(legacy.up_json);
            up = Array.isArray(parsedUp) ? parsedUp : [];
        }
        catch {
            up = [];
        }
        try {
            const parsedDown = JSON.parse(legacy.down_json);
            down = Array.isArray(parsedDown) ? parsedDown : [];
        }
        catch {
            down = [];
        }
        return {
            date,
            items: [...up, ...down],
            fetchedAt: legacy.fetched_at,
            source: "db",
        };
    }
    // -----------------------
    // DbProvider（KVキャッシュ）
    // -----------------------
    async getJson(key) {
        try {
            const hasJson = this.hasColumn("kv_store", "json");
            const hasValue = this.hasColumn("kv_store", "value");
            if (!hasJson && !hasValue)
                return null;
            const column = hasJson ? "json" : "value";
            const row = this.db
                .prepare(`SELECT ${column} as json FROM kv_store WHERE key = ?`)
                .get(key);
            if (!row)
                return null;
            return JSON.parse(row.json);
        }
        catch (error) {
            if (!isNoSuchError(error))
                throw error;
            return null;
        }
    }
    async setJson(key, value) {
        const fetchedAt = new Date().toISOString();
        const json = JSON.stringify(value);
        try {
            const hasJson = this.hasColumn("kv_store", "json");
            const hasFetchedAt = this.hasColumn("kv_store", "fetchedAt");
            const hasValue = this.hasColumn("kv_store", "value");
            const hasFetchedAtLegacy = this.hasColumn("kv_store", "fetched_at");
            if (hasJson && hasFetchedAt) {
                this.db
                    .prepare("INSERT INTO kv_store(key,json,fetchedAt) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, fetchedAt=excluded.fetchedAt")
                    .run(key, json, fetchedAt);
                return;
            }
            if (hasValue && hasFetchedAtLegacy) {
                this.db
                    .prepare("INSERT INTO kv_store(key,value,fetched_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, fetched_at=excluded.fetched_at")
                    .run(key, json, fetchedAt);
                return;
            }
            this.ensureKvStoreTable();
            this.db
                .prepare("INSERT INTO kv_store(key,json,fetchedAt) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, fetchedAt=excluded.fetchedAt")
                .run(key, json, fetchedAt);
        }
        catch (error) {
            if (!isNoSuchError(error))
                throw error;
            this.ensureKvStoreTable();
            this.db
                .prepare("INSERT INTO kv_store(key,json,fetchedAt) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, fetchedAt=excluded.fetchedAt")
                .run(key, json, fetchedAt);
        }
    }
}
