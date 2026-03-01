import { getTomorrowPicksUniverse } from "./tomorrowPicks.js";
function qStr(v) {
    return String(v ?? "").trim();
}
function isRefresh(req) {
    return qStr(req.query.refresh) === "1";
}
function nowIso() {
    return new Date().toISOString();
}
function makePullbackKey(date) {
    return `${date}_pullback-chances`;
}
function toNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : NaN;
}
function parseStooqCsv(csv) {
    const lines = csv.trim().split("\n");
    if (lines.length <= 1)
        return [];
    const out = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 6)
            continue;
        const date = cols[0];
        const open = toNum(cols[1]);
        const high = toNum(cols[2]);
        const low = toNum(cols[3]);
        const close = toNum(cols[4]);
        const volume = toNum(cols[5]);
        if (!date || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close))
            continue;
        out.push({ date, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
    }
    return out;
}
function yyyymmdd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
}
function parseDate(dateStr) {
    // dateStr: YYYY-MM-DD
    const [y, m, d] = dateStr.split("-").map((x) => Number(x));
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}
async function fetchStooqDailyRange(code, from, to) {
    const sym = `${code}.jp`;
    const url = `https://stooq.com/q/d/?s=${encodeURIComponent(sym)}&d1=${encodeURIComponent(from)}&d2=${encodeURIComponent(to)}&i=d`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`stooq fetch failed: ${res.status}`);
    const text = await res.text();
    return parseStooqCsv(text);
}
async function mapLimit(arr, limit, fn) {
    const ret = new Array(arr.length);
    let i = 0;
    const workers = new Array(Math.min(limit, arr.length)).fill(0).map(async () => {
        while (true) {
            const idx = i++;
            if (idx >= arr.length)
                break;
            ret[idx] = await fn(arr[idx], idx);
        }
    });
    await Promise.all(workers);
    return ret;
}
function windowStats(rows, n) {
    const slice = rows.slice(Math.max(0, rows.length - n));
    if (slice.length < Math.min(5, n))
        return null;
    let high = -Infinity;
    let low = Infinity;
    for (const r of slice) {
        if (r.high > high)
            high = r.high;
        if (r.low < low)
            low = r.low;
    }
    const current = slice[slice.length - 1].close;
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(current) || low <= 0 || high <= 0)
        return null;
    return { high, low, current };
}
function ratio(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0)
        return NaN;
    return a / b;
}
async function buildPullbackChances(date, universe) {
    // 期間は “2か月 + バッファ” をカバー（90日）
    const end = parseDate(date);
    const start = new Date(end.getTime());
    start.setDate(start.getDate() - 90);
    const d1 = yyyymmdd(start);
    const d2 = yyyymmdd(end);
    const infoByCode = new Map();
    for (const u of universe)
        infoByCode.set(u.code, u);
    const codes = universe.map((x) => x.code).filter(Boolean);
    const rowsList = await mapLimit(codes, 5, async (code) => {
        try {
            const rows = await fetchStooqDailyRange(code, d1, d2);
            return { code, rows };
        }
        catch {
            return { code, rows: [] };
        }
    });
    const shortTerm = [];
    const midTerm = [];
    for (const x of rowsList) {
        const base = infoByCode.get(x.code);
        if (!base)
            continue;
        const rows = x.rows;
        if (!rows || rows.length < 20)
            continue;
        // short: 10営業日（≒2週間）
        const s = windowStats(rows, 10);
        if (s) {
            const hl = ratio(s.high, s.low);
            const ch = ratio(s.current, s.high);
            if (hl >= 1.5 && ch <= 0.8) {
                shortTerm.push({
                    code: base.code,
                    name: base.name,
                    market: base.market,
                    industry: "不明",
                    price: s.current,
                    high: s.high,
                    low: s.low,
                    ratioHL: hl,
                    ratioNowHigh: ch,
                    term: "short",
                });
            }
        }
        // mid: 40営業日（≒2か月）
        const m = windowStats(rows, 40);
        if (m) {
            const hl = ratio(m.high, m.low);
            const ch = ratio(m.current, m.high);
            if (hl >= 2.0 && ch <= 0.8) {
                midTerm.push({
                    code: base.code,
                    name: base.name,
                    market: base.market,
                    industry: "不明",
                    price: m.current,
                    high: m.high,
                    low: m.low,
                    ratioHL: hl,
                    ratioNowHigh: ch,
                    term: "mid",
                });
            }
        }
    }
    const sorter = (a, b) => a.ratioNowHigh - b.ratioNowHigh || b.ratioHL - a.ratioHL || a.code.localeCompare(b.code);
    shortTerm.sort(sorter);
    midTerm.sort(sorter);
    return { shortTerm, midTerm };
}
export function handlePullbackChances(args) {
    const { provider, dbProvider } = args;
    return async (req, res) => {
        const date = qStr(req.query.date);
        if (!date)
            return res.status(400).json({ error: "date is required. e.g. 2026-02-10" });
        const refresh = isRefresh(req);
        const key = makePullbackKey(date);
        if (!refresh && dbProvider) {
            try {
                const cached = dbProvider.getJson(key);
                if (cached && cached.date === date && Array.isArray(cached.shortTerm) && Array.isArray(cached.midTerm)) {
                    const out = { ...cached, source: "db" };
                    return res.json(out);
                }
            }
            catch {
                // ignore
            }
        }
        try {
            const uni = await getTomorrowPicksUniverse({ date, provider, dbProvider, refresh });
            const { shortTerm, midTerm } = await buildPullbackChances(date, uni.items);
            const out = {
                date,
                key,
                universeKey: uni.universeKey,
                shortTerm,
                midTerm,
                fetchedAt: nowIso(),
                source: "generated",
            };
            if (dbProvider) {
                try {
                    dbProvider.setJson(key, out);
                }
                catch {
                    // ignore
                }
            }
            return res.json(out);
        }
        catch (e) {
            return res.status(500).json({ error: String(e?.message ?? e) });
        }
    };
}
