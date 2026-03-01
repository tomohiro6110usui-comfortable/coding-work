function keyOf(date) {
    return `${date}_tomorrow-picks`;
}
function uniqByCode(items) {
    const m = new Map();
    for (const it of items)
        m.set(it.code, it);
    return [...m.values()];
}
export async function getTomorrowPicksUniverse(args) {
    const { provider, date, limit = 50 } = args;
    const [watch, ranks] = await Promise.all([
        provider.getEarningsWatchlist(date),
        provider.getRankings(date),
    ]);
    const watchCodes = watch.items.map((x) => x.code);
    const rankCodes = ranks.items.map((x) => x.code);
    const codes = uniqByCode([...watchCodes, ...rankCodes].map((code) => ({ code })))
        .map((x) => x.code)
        .slice(0, limit);
    return { universeKey: `${date}_tomorrow-picks`, codes };
}
export async function handleTomorrowPicks(args) {
    const { provider, dbProvider, date, refresh = false } = args;
    const key = keyOf(date);
    if (dbProvider && !refresh) {
        const cached = await dbProvider.getJson(key);
        if (cached)
            return { ...cached, source: "db" };
    }
    const [watch, ranks] = await Promise.all([
        provider.getEarningsWatchlist(date),
        provider.getRankings(date),
    ]);
    // スコアはPoC的。重要なのは「監視優先度の並び替え」
    const scoreMap = new Map();
    for (const w of watch.items) {
        const cur = scoreMap.get(w.code) ?? { code: w.code, name: w.name, market: w.market, score: 0, reasons: [] };
        cur.score += 5;
        cur.reasons.push("watchlist");
        scoreMap.set(w.code, cur);
    }
    for (const r of ranks.items) {
        const cur = scoreMap.get(r.code) ?? { code: r.code, name: r.name, market: r.market, score: 0, reasons: [] };
        cur.score += 3;
        cur.reasons.push("rankings");
        scoreMap.set(r.code, cur);
    }
    const items = [...scoreMap.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
        .map((x) => ({ code: x.code, name: x.name, market: x.market, score: x.score, reasons: x.reasons }));
    const out = {
        date,
        key,
        items,
        fetchedAt: new Date().toISOString(),
        source: "generated",
    };
    if (dbProvider)
        await dbProvider.setJson(key, out);
    return out;
}
