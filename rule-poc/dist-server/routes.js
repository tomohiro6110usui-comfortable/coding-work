import { MockProvider } from "./dataProviders/mockProvider.js";
import { handleTomorrowPicks } from "./tomorrowPicks.js";
import { checkJQuantsDailyBars, handlePullbackChances, warmupJQuantsBarsCache } from "./pullbackChances.js";
function defaultAnalysisDate() {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const dd = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${dd}`;
}
function isLegacySchemaError(error) {
    const msg = String(error?.message ?? error);
    return msg.includes("no such column") || msg.includes("no such table");
}
function isDataNotFoundError(error) {
    const msg = String(error?.message ?? error);
    return msg.includes("EARNINGS_NOT_FOUND") || msg.includes("RANKINGS_NOT_FOUND");
}
function shouldFallbackToMock(error) {
    return isLegacySchemaError(error) || isDataNotFoundError(error);
}
function toNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function toBool(v, fallback) {
    if (typeof v === "boolean")
        return v;
    const t = String(v ?? "").trim().toLowerCase();
    if (!t)
        return fallback;
    if (t === "1" || t === "true" || t === "yes" || t === "on")
        return true;
    if (t === "0" || t === "false" || t === "no" || t === "off")
        return false;
    return fallback;
}
export function createRoutes(args) {
    const { router, provider, dbProvider } = args;
    const warmupJobs = new Map();
    router.get("/api/health", (_req, res) => {
        res.json({ ok: true, now: new Date().toISOString() });
    });
    router.get("/api/earnings-watchlist", async (req, res) => {
        const date = String(req.query.date ?? "").trim() || defaultAnalysisDate();
        try {
            const data = await provider.getEarningsWatchlist(date);
            res.json({ date, key: `${date}_earnings-watchlist`, items: data.items, fetchedAt: data.fetchedAt, source: data.source === "db" ? "db" : "generated" });
        }
        catch (e) {
            if (shouldFallbackToMock(e)) {
                const mock = new MockProvider();
                const data = await mock.getEarningsWatchlist(date);
                res.json({
                    date,
                    key: `${date}_earnings-watchlist`,
                    items: data.items,
                    fetchedAt: data.fetchedAt,
                    source: "generated",
                    warning: "fallback=mock",
                });
                return;
            }
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    });
    router.get("/api/rankings", async (req, res) => {
        const date = String(req.query.date ?? "").trim() || defaultAnalysisDate();
        try {
            const data = await provider.getRankings(date);
            res.json({ date, key: `${date}_rankings`, items: data.items, fetchedAt: data.fetchedAt, source: data.source === "db" ? "db" : "generated" });
        }
        catch (e) {
            if (shouldFallbackToMock(e)) {
                const mock = new MockProvider();
                const data = await mock.getRankings(date);
                res.json({
                    date,
                    key: `${date}_rankings`,
                    items: data.items,
                    fetchedAt: data.fetchedAt,
                    source: "generated",
                    warning: "fallback=mock",
                });
                return;
            }
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    });
    router.get("/api/tomorrow-picks", async (req, res) => {
        const date = String(req.query.date ?? "").trim() || defaultAnalysisDate();
        const refresh = String(req.query.refresh ?? "0") === "1";
        try {
            const out = await handleTomorrowPicks({ provider, dbProvider, date, refresh });
            res.json(out);
        }
        catch (e) {
            if (shouldFallbackToMock(e)) {
                const mock = new MockProvider();
                const out = await handleTomorrowPicks({ provider: mock, date, refresh: true });
                res.json({ ...out, source: "generated", warning: "fallback=mock" });
                return;
            }
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    });
    router.get("/api/pullback-chances", async (req, res) => {
        const date = String(req.query.date ?? "").trim() || defaultAnalysisDate();
        const refresh = String(req.query.refresh ?? "0") === "1";
        const codesRaw = String(req.query.codes ?? "").trim();
        const codes = codesRaw ? codesRaw.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
        const thresholds = {
            shortMinRatioHighLow: toNum(req.query.shortMinRatioHighLow, 1.12),
            shortMaxRatioNowHigh: toNum(req.query.shortMaxRatioNowHigh, 0.94),
            midMinRatioHighLow: toNum(req.query.midMinRatioHighLow, 1.25),
            midMaxRatioNowHigh: toNum(req.query.midMaxRatioNowHigh, 0.9),
        };
        const selection = {
            minScore: toNum(req.query.minScore, 58),
            maxPerBucket: toNum(req.query.maxPerBucket, 40),
            requireRebound: toBool(req.query.requireRebound, true),
            minTurnover: toNum(req.query.minTurnover, 100_000_000),
            maxVolatility20: toNum(req.query.maxVolatility20, 0.06),
            minPullbackPct: toNum(req.query.minPullbackPct, 0.06),
            maxPullbackPct: toNum(req.query.maxPullbackPct, 0.32),
        };
        try {
            const out = await handlePullbackChances({ provider, dbProvider, date, refresh, codes, thresholds, selection });
            res.json(out);
        }
        catch (e) {
            if (shouldFallbackToMock(e)) {
                const mock = new MockProvider();
                const out = await handlePullbackChances({ provider: mock, date, refresh: true, codes, thresholds, selection });
                res.json({ ...out, source: "generated", warning: "fallback=mock" });
                return;
            }
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    });
    router.post("/api/pullback-chances", async (req, res) => {
        const date = String(req.body?.date ?? "").trim() || defaultAnalysisDate();
        const refresh = String(req.body?.refresh ?? "0") === "1" || Boolean(req.body?.refresh === true);
        const codesInput = Array.isArray(req.body?.codes) ? req.body.codes : [];
        const codes = codesInput
            .map((x) => String(x).trim())
            .filter((x) => x.length > 0);
        const thresholds = {
            shortMinRatioHighLow: toNum(req.body?.shortMinRatioHighLow, 1.12),
            shortMaxRatioNowHigh: toNum(req.body?.shortMaxRatioNowHigh, 0.94),
            midMinRatioHighLow: toNum(req.body?.midMinRatioHighLow, 1.25),
            midMaxRatioNowHigh: toNum(req.body?.midMaxRatioNowHigh, 0.9),
        };
        const selection = {
            minScore: toNum(req.body?.minScore, 58),
            maxPerBucket: toNum(req.body?.maxPerBucket, 40),
            requireRebound: toBool(req.body?.requireRebound, true),
            minTurnover: toNum(req.body?.minTurnover, 100_000_000),
            maxVolatility20: toNum(req.body?.maxVolatility20, 0.06),
            minPullbackPct: toNum(req.body?.minPullbackPct, 0.06),
            maxPullbackPct: toNum(req.body?.maxPullbackPct, 0.32),
        };
        try {
            const out = await handlePullbackChances({
                provider,
                dbProvider,
                date,
                refresh,
                codes: codes.length > 0 ? codes : undefined,
                thresholds,
                selection,
            });
            res.json(out);
        }
        catch (e) {
            if (shouldFallbackToMock(e)) {
                const mock = new MockProvider();
                const out = await handlePullbackChances({
                    provider: mock,
                    date,
                    refresh: true,
                    codes: codes.length > 0 ? codes : undefined,
                    thresholds,
                    selection,
                });
                res.json({ ...out, source: "generated", warning: "fallback=mock" });
                return;
            }
            res.status(500).json({ error: String(e?.message ?? e) });
        }
    });
    router.post("/api/pullback-cache/warmup", async (req, res) => {
        const date = String(req.body?.date ?? "").trim() || defaultAnalysisDate();
        const maxCodes = Number(req.body?.maxCodes ?? 3000);
        const force = Boolean(req.body?.force);
        const codesInput = Array.isArray(req.body?.codes) ? req.body.codes : [];
        const codes = [
            ...new Set(codesInput
                .map((x) => String(x).trim())
                .filter((x) => x.length > 0)),
        ];
        if (codes.length === 0) {
            res.status(400).json({ error: "missing body.codes (string[])" });
            return;
        }
        if (!dbProvider) {
            res.status(500).json({ error: "dbProvider is required for warmup cache" });
            return;
        }
        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const job = {
            id: jobId,
            status: "running",
            startedAt: new Date().toISOString(),
            progress: { done: 0, total: Math.min(codes.length, Math.max(1, maxCodes)), success: 0, fail: 0, skipped: 0 },
        };
        warmupJobs.set(jobId, job);
        void warmupJQuantsBarsCache({
            date,
            codes,
            maxCodes,
            force,
            dbProvider,
            onProgress: (p) => {
                const cur = warmupJobs.get(jobId);
                if (!cur)
                    return;
                cur.progress = p;
            },
        }).then((result) => {
            const cur = warmupJobs.get(jobId);
            if (!cur)
                return;
            cur.status = "done";
            cur.finishedAt = new Date().toISOString();
            cur.result = result;
        }).catch((e) => {
            const cur = warmupJobs.get(jobId);
            if (!cur)
                return;
            cur.status = "error";
            cur.finishedAt = new Date().toISOString();
            cur.error = String(e?.message ?? e);
        });
        res.status(202).json({
            ok: true,
            jobId,
            statusUrl: `/api/pullback-cache/warmup/${jobId}`,
            date,
            requestedCodes: codes.length,
            maxCodes: Math.max(1, maxCodes),
            force,
        });
    });
    router.get("/api/pullback-cache/warmup/:jobId", (req, res) => {
        const job = warmupJobs.get(String(req.params.jobId ?? ""));
        if (!job) {
            res.status(404).json({ error: "warmup job not found" });
            return;
        }
        res.json(job);
    });
    router.get("/api/jquants-price-check", async (req, res) => {
        const code = String(req.query.code ?? "").trim();
        const to = String(req.query.to ?? "").trim() || defaultAnalysisDate();
        const from = String(req.query.from ?? "").trim() || undefined;
        if (!code) {
            res.status(400).json({ error: "missing query: code" });
            return;
        }
        try {
            const out = await checkJQuantsDailyBars({ code, to, from });
            res.json({ ok: true, ...out });
        }
        catch (e) {
            res.status(502).json({ ok: false, code, to, from, error: String(e?.message ?? e) });
        }
    });
    return router;
}
