import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { makeRoutes } from "./routes.js";
import { MockProvider } from "./dataProviders/mockProvider.js";
import { JQuantsProvider } from "./dataProviders/jquantsProvider.js";
import { openDb } from "./db/sqlite.js";
import { SqliteProvider } from "./dataProviders/sqliteProvider.js";
const PORT = Number(process.env.PORT ?? 8787);
/**
 * provider切替（基本は sqlite 優先）
 * - sqlite: DBから返す。未登録なら routes 側が Mock生成してDB保存する
 * - mock: 常に生成
 * - jquants: 将来用
 */
function makeProvider() {
    const mode = String(process.env.DATA_PROVIDER ?? "sqlite").toLowerCase();
    if (mode === "jquants") {
        const apiBaseUrl = String(process.env.JQUANTS_BASE_URL ?? "https://example.invalid");
        return { type: "jquants", provider: new JQuantsProvider(apiBaseUrl) };
    }
    if (mode === "mock") {
        return { type: "mock", provider: new MockProvider() };
    }
    // default: sqlite
    const db = openDb();
    const sqliteProvider = new SqliteProvider(db);
    return { type: "sqlite", provider: sqliteProvider, dbProvider: sqliteProvider };
}
const { provider, dbProvider } = makeProvider();
const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use("/api", makeRoutes(provider, dbProvider));
// ===== dist配信（distが無くても落ちない） =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distClient = path.resolve(__dirname, "../dist");
const indexHtml = path.join(distClient, "index.html");
app.use(express.static(distClient));
app.get(/.*/, (_req, res) => {
    if (!fs.existsSync(indexHtml)) {
        return res.status(404).send([
            "[server] dist/index.html not found.",
            "You are probably running in dev mode (Vite serves the frontend).",
            "If you want production integration:",
            "  1) npm run build:all",
            "  2) npm run start",
        ].join("\n"));
    }
    return res.sendFile(indexHtml);
});
app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] health: http://localhost:${PORT}/api/health`);
});
