import { handleTomorrowPicks } from "./tomorrowPicks.js";
import { handlePullbackChances } from "./pullbackChances.js";
function defaultAnalysisDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const dd = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${dd}`;
}
export function createRoutes(args) {
    const { router, provider, dbProvider } = args;
    router.get("/api/health", (_req, res) => {
        res.json({ ok: true, now: new Date().toISOString() });
    });
    router.get("/api/earnings-watchlist", async (req, res) => {
        try {
            const date = String(req.query.date ?? "").trim() || defaultAnalysisDate();
            const data = await provider.getEarningsWatchlist(date);
            res.json({
                date,
                key: `${date}_earnings-watchlist`,
                items: data.items,
                fetchedAt: data.fetchedAt,
                source: data.source === "db" ? "db" : "generated",
            });
        }
        catch (e) {
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    });
    router.get("/api/rankings", async (req, res) => {
        try {
            const date = String(req.query.date ?? "").trim() || defaultAnalysisDate();
            const data = await provider.getRankings(date);
            res.json({
                date,
                key: `${date}_rankings`,
                items: data.items,
                fetchedAt: data.fetchedAt,
                source: data.source === "db" ? "db" : "generated",
            });
        }
        catch (e) {
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    });
    router.get("/api/tomorrow-picks", async (req, res) => {
        try {
            const date = String(req.query.date ?? "").trim() || defaultAnalysisDate();
            const refresh = String(req.query.refresh ?? "0") === "1";
            const out = await handleTomorrowPicks({ provider, dbProvider, date, refresh });
            res.json(out);
        }
        catch (e) {
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    });
    router.get("/api/pullback-chances", async (req, res) => {
        try {
            const date = String(req.query.date ?? "").trim() || defaultAnalysisDate();
            const refresh = String(req.query.refresh ?? "0") === "1";
            const codesRaw = String(req.query.codes ?? "").trim();
            const codes = codesRaw ? codesRaw.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
            const out = await handlePullbackChances({ provider, dbProvider, date, refresh, codes });
            res.json(out);
        }
        catch (e) {
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    });
    return router;
}
