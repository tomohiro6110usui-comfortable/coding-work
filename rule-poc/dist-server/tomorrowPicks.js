function qStr(v) {
    return String(v ?? "").trim();
}
function isRefresh(req) {
    return qStr(req.query.refresh) === "1";
}
function makeKey(date) {
    return `${date}_tomorrow-picks`;
}
function safeArr(x) {
    return Array.isArray(x) ? x : [];
}
function nowIso() {
    return new Date().toISOString();
}
/**
 * 「当日決算 + 反応（ランキング）」を軽く加点して並べる PoCロジック
 * - 監視優先度の最適化が目的
 */
function buildTomorrowPicks(date, wl, rk) {
    const base = safeArr(wl.items).map((x) => ({
        code: String(x.code),
        name: String(x.name ?? ""),
        market: String(x.market ?? ""),
        score: 10,
        reasons: ["決算監視（当日）"],
    }));
    const up = safeArr(rk.up);
    const down = safeArr(rk.down);
    const addScore = (code, delta, reason) => {
        const hit = base.find((b) => b.code === code);
        if (hit) {
            hit.score += delta;
            hit.reasons.push(reason);
        }
    };
    for (const u of up) {
        const code = String(u.code ?? "");
        if (code)
            addScore(code, 5, "上昇ランキング");
    }
    for (const d of down) {
        const code = String(d.code ?? "");
        if (code)
            addScore(code, 2, "下落ランキング（反応あり）");
    }
    base.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
    return base.slice(0, 50);
}
export function handleTomorrowPicks(args) {
    const { provider, dbProvider } = args;
    return async (req, res) => {
        const date = qStr(req.query.date);
        if (!date)
            return res.status(400).json({ error: "date is required. e.g. 2026-02-10" });
        const refresh = isRefresh(req);
        const key = makeKey(date);
        if (!refresh && dbProvider) {
            try {
                const cached = dbProvider.getJson(key);
                if (cached && cached.date === date && Array.isArray(cached.items)) {
                    const out = { ...cached, source: "db" };
                    return res.json(out);
                }
            }
            catch {
                // ignore
            }
        }
        try {
            const wl = await provider.getEarningsWatchlist(date);
            const rk = await provider.getRankings(date);
            const items = buildTomorrowPicks(date, wl, rk);
            const out = { date, key, items, fetchedAt: nowIso(), source: "generated" };
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
/**
 * pullback-chances は別モジュールから universe を作るために公開
 */
export async function getTomorrowPicksUniverse(args) {
    const { date, provider, dbProvider, refresh } = args;
    const universeKey = makeKey(date);
    if (!refresh && dbProvider) {
        const cached = dbProvider.getJson(universeKey);
        if (cached && cached.date === date && Array.isArray(cached.items)) {
            return { universeKey, items: cached.items, source: "db" };
        }
    }
    const wl = await provider.getEarningsWatchlist(date);
    const rk = await provider.getRankings(date);
    const items = buildTomorrowPicks(date, wl, rk);
    const out = { date, key: universeKey, items, fetchedAt: nowIso(), source: "generated" };
    if (dbProvider)
        dbProvider.setJson(universeKey, out);
    return { universeKey, items, source: "generated" };
}
