import { getTomorrowPicksUniverse } from "./tomorrowPicks.js";
const FALLBACK_UNIVERSE_CODES = [
    "1306", // TOPIX連動ETF
    "1321", // 日経225連動ETF
    "1570", // 日経レバ
    "2914", // JT
    "4502", // 武田
    "5401", // 日本製鉄
    "6501", // 日立
    "6758", // ソニーG
    "6861", // キーエンス
    "7203", // トヨタ
    "7974", // 任天堂
    "8035", // 東エレ
    "8058", // 三菱商事
    "8306", // 三菱UFJ
    "8316", // 三井住友FG
    "9432", // NTT
    "9433", // KDDI
    "9983", // ファストリ
    "9984", // SBG
];
function keyOf(date, universeKey) {
    return `${date}_pullback-chances_${universeKey}`;
}
function ymdUtc(d) {
    const y = d.getUTCFullYear();
    const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
    const dd = `${d.getUTCDate()}`.padStart(2, "0");
    return `${y}-${m}-${dd}`;
}
function computeFrom(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m)
        return date;
    const y = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const baseUtc = new Date(Date.UTC(y, mm - 1, dd));
    const fromUtc = new Date(baseUtc.getTime() - 90 * 24 * 60 * 60 * 1000);
    const from = ymdUtc(fromUtc);
    // Guard against locale/date parsing anomalies seen on some Windows environments.
    return from <= date ? from : date;
}
async function fetchJQuantsDailyBars(args) {
    const apiKey = process.env.JQUANTS_API_KEY;
    if (!apiKey)
        throw new Error("Missing env: JQUANTS_API_KEY");
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
    const rows = (json?.data ?? json?.daily_quotes ?? []);
    return rows;
}
function calcMetrics(rows) {
    if (rows.length === 0)
        return null;
    const highs = rows.map((r) => (r.AdjH ?? r.H));
    const lows = rows.map((r) => (r.AdjL ?? r.L));
    const closes = rows.map((r) => (r.AdjC ?? r.C));
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const price = closes[closes.length - 1];
    if (!isFinite(high) || !isFinite(low) || !isFinite(price) || low <= 0 || high <= 0)
        return null;
    const ratioHighLow = high / low;
    const ratioNowHigh = price / high;
    return { high, low, price, ratioHighLow, ratioNowHigh };
}
function sanitizeCodes(codes) {
    const uniq = new Set();
    for (const c of codes) {
        const code = c.trim();
        if (!/^\d{4}$/.test(code))
            continue;
        uniq.add(code);
    }
    return [...uniq];
}
async function resolveUniverse(args) {
    const { provider, date } = args;
    if (args.codes && args.codes.length > 0) {
        const codes = sanitizeCodes(args.codes);
        if (codes.length > 0) {
            return {
                universeKey: `${date}_codes_${codes.join("-")}`,
                universeCodes: codes,
                universeSource: "query",
            };
        }
    }
    try {
        const u = await getTomorrowPicksUniverse({ provider, date, limit: 50 });
        const codes = sanitizeCodes(u.codes);
        if (codes.length > 0) {
            return {
                universeKey: u.universeKey,
                universeCodes: codes,
                universeSource: "tomorrow-picks",
            };
        }
    }
    catch (error) {
        return {
            universeKey: `${date}_fallback-universe`,
            universeCodes: FALLBACK_UNIVERSE_CODES,
            universeSource: "fallback",
            universeError: String(error?.message ?? error),
        };
    }
    return {
        universeKey: `${date}_fallback-universe`,
        universeCodes: FALLBACK_UNIVERSE_CODES,
        universeSource: "fallback",
        universeError: "universe is empty",
    };
}
export async function handlePullbackChances(args) {
    const { provider, dbProvider, date, refresh = false } = args;
    const universe = await resolveUniverse({ provider, date, codes: args.codes });
    const universeKey = universe.universeKey;
    const universeCodes = universe.universeCodes;
    const key = keyOf(date, universeKey);
    if (dbProvider && !refresh) {
        const cached = await dbProvider.getJson(key);
        if (cached)
            return { ...cached, source: "db" };
    }
    const to = date;
    const from = computeFrom(date);
    const debug = {
        requestedCodes: universeCodes,
        universeSource: universe.universeSource,
        universeError: universe.universeError,
        from,
        to,
        perCode: [],
        fetchedRowsCount: 0,
        skippedNoRows: 0,
        skippedTooShort: 0,
    };
    const shortTerm = [];
    const midTerm = [];
    for (const code of universeCodes) {
        try {
            const rows = await fetchJQuantsDailyBars({ code, from, to });
            debug.perCode.push({ code, ok: true, rows: rows.length });
            debug.fetchedRowsCount += rows.length;
            if (!rows || rows.length === 0) {
                debug.skippedNoRows++;
                continue;
            }
            const last10 = rows.slice(-10);
            const last40 = rows.slice(-40);
            if (last10.length < 10 || last40.length < 40) {
                debug.skippedTooShort++;
            }
            const m10 = calcMetrics(last10);
            const m40 = calcMetrics(last40);
            if (!m10 || !m40)
                continue;
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
        }
        catch (e) {
            debug.perCode.push({ code, ok: false, error: String(e?.message ?? e) });
        }
    }
    const out = {
        date,
        key,
        universeKey,
        shortTerm,
        midTerm,
        fetchedAt: new Date().toISOString(),
        source: "generated",
        debug,
    };
    if (dbProvider)
        await dbProvider.setJson(key, out);
    return out;
}
