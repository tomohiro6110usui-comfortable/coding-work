import { Router } from "express";
import { MockProvider } from "./dataProviders/mockProvider.js";
import { handleTomorrowPicks } from "./tomorrowPicks.js";
import { handlePullbackChances } from "./pullbackChances.js";
function isRefreshOn(req) {
    return String(req.query?.refresh ?? "") === "1";
}
export function makeRoutes(provider, dbProvider) {
    const r = Router();
    r.get("/health", (_req, res) => {
        res.json({ ok: true, ts: new Date().toISOString() });
    });
    // 明日注目：dbProviderも渡す（kvキャッシュを使える）
    r.get("/tomorrow-picks", handleTomorrowPicks({ provider, dbProvider }));
    // 絶好の押し目買いチャンス（最優先）
    r.get("/pullback-chances", handlePullbackChances({ provider, dbProvider }));
    r.get("/earnings-watchlist", async (req, res) => {
        const date = String(req.query.date ?? "");
        if (!date)
            return res.status(400).json({ error: "date is required. e.g. 2026-02-10" });
        const refresh = isRefreshOn(req);
        if (refresh) {
            if (!dbProvider)
                return res.status(400).json({ error: "refresh=1 requires dbProvider (sqlite mode)" });
            try {
                const mock = new MockProvider();
                const generated = await mock.getEarningsWatchlist(date);
                await dbProvider.upsertEarningsWatchlist(generated);
                return res.json({ ...generated, source: "generated" });
            }
            catch (e) {
                return res.status(500).json({ error: String(e?.message ?? e) });
            }
        }
        try {
            const out = await provider.getEarningsWatchlist(date);
            const source = dbProvider && provider === dbProvider ? "db" : "generated";
            return res.json({ ...out, source });
        }
        catch {
            if (!dbProvider)
                return res.status(500).json({ error: "failed to fetch earnings-watchlist" });
            try {
                const mock = new MockProvider();
                const generated = await mock.getEarningsWatchlist(date);
                await dbProvider.upsertEarningsWatchlist(generated);
                return res.json({ ...generated, source: "generated" });
            }
            catch (e2) {
                return res.status(500).json({ error: String(e2?.message ?? e2) });
            }
        }
    });
    r.get("/rankings", async (req, res) => {
        const date = String(req.query.date ?? "");
        if (!date)
            return res.status(400).json({ error: "date is required. e.g. 2026-02-10" });
        const refresh = isRefreshOn(req);
        if (refresh) {
            if (!dbProvider)
                return res.status(400).json({ error: "refresh=1 requires dbProvider (sqlite mode)" });
            try {
                const mock = new MockProvider();
                const generated = await mock.getRankings(date);
                await dbProvider.upsertRankings(generated);
                return res.json({ ...generated, source: "generated" });
            }
            catch (e) {
                return res.status(500).json({ error: String(e?.message ?? e) });
            }
        }
        try {
            const out = await provider.getRankings(date);
            const source = dbProvider && provider === dbProvider ? "db" : "generated";
            return res.json({ ...out, source });
        }
        catch {
            if (!dbProvider)
                return res.status(500).json({ error: "failed to fetch rankings" });
            try {
                const mock = new MockProvider();
                const generated = await mock.getRankings(date);
                await dbProvider.upsertRankings(generated);
                return res.json({ ...generated, source: "generated" });
            }
            catch (e2) {
                return res.status(500).json({ error: String(e2?.message ?? e2) });
            }
        }
    });
    return r;
}
