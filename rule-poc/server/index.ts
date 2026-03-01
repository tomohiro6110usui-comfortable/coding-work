// server/index.ts
import express from "express";
import cors from "cors";
import { createRoutes } from "./routes.js";

import { openDb } from "./db/sqlite.js";
import { SqliteProvider } from "./dataProviders/sqliteProvider.js";
import { MockProvider } from "./dataProviders/mockProvider.js";
import { JQuantsProvider } from "./dataProviders/jquantsProvider.js";

const PORT = Number(process.env.PORT ?? 8787);

// 任意: DB保存先（無ければデフォルト）
const DB_PATH = process.env.SQLITE_PATH ?? "data/rule-poc.sqlite";

// 任意: J-Quants API Base URL（無ければデフォルト）
const JQUANTS_API_BASE_URL = process.env.JQUANTS_API_BASE_URL ?? "https://api.jquants.com";

// provider 選択: PROVIDER があればそれを優先。
// なければ、JQUANTS_EMAIL/PASSWORD があれば jquants、それ以外は sqlite。
const providerName = (process.env.PROVIDER ??
  (process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD ? "jquants" : "sqlite")
).toLowerCase();

const app = express();
app.use(cors());
app.use(express.json());

// --- DB provider（sqlite を使えるときだけ有効化）---
let sqliteProvider: SqliteProvider | undefined;
try {
  const db = openDb(DB_PATH);
  sqliteProvider = new SqliteProvider(db); // ★ 必須引数 db を渡す
} catch (e) {
  console.warn("[server] sqlite disabled:", (e as Error)?.message ?? e);
  sqliteProvider = undefined;
}

// --- Data provider 選択 ---
const provider =
  providerName === "jquants"
    ? new JQuantsProvider(JQUANTS_API_BASE_URL) // ★ 必須引数 apiBaseUrl を渡す
    : providerName === "mock"
      ? new MockProvider()
      : sqliteProvider ?? new MockProvider(); // sqlite が死んでたら保険で mock

// --- routes ---
const router = express.Router();
createRoutes({ router, provider, dbProvider: sqliteProvider });
app.use(router);

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] health: http://localhost:${PORT}/api/health`);
  console.log(`[server] provider: ${providerName}`);
});