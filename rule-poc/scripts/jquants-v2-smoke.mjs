// scripts/jquants-v2-smoke.mjs
import "dotenv/config";

const API_KEY = process.env.JQUANTS_API_KEY;

if (!API_KEY) {
  console.error("Missing env: JQUANTS_API_KEY (set in .env or env var)");
  process.exit(1);
}

// V2 base
const BASE = "https://api.jquants.com/v2";

// 疎通対象（株価四本値 /equities/bars/daily）
// code=7203 は例。まずはこれでOK。
// from/to を指定しないと、プランで取得可能な範囲で返る旨の報告あり。 :contentReference[oaicite:2]{index=2}
const TEST_CODE = process.env.JQUANTS_TEST_CODE || "7203";
// まずは最近の範囲に絞って軽く（必要に応じて変えてOK）
const FROM = process.env.JQUANTS_FROM || "2024-12-01";
const TO = process.env.JQUANTS_TO || "2025-12-01";

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function getJson(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      // V2はAPIキー（x-api-key）で認証 :contentReference[oaicite:3]{index=3}
      "x-api-key": API_KEY,
      "accept": "application/json",
    },
  });

  const text = await safeText(res);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  return sp.toString();
}

async function main() {
  console.log("[1] V2 ping: /equities/bars/daily");

  // /equities/bars/daily はV2の株価四本値 :contentReference[oaicite:4]{index=4}
  const url = `${BASE}/equities/bars/daily?${qs({
    code: TEST_CODE,
    from: FROM,
    to: TO,
  })}`;

  console.log("GET", url);

  const json = await getJson(url);

  // 仕様上、data配列が返るケースが多い（例：他エンドポイント） :contentReference[oaicite:5]{index=5}
  const data = Array.isArray(json?.data) ? json.data : null;

  console.log("OK");
  if (!data) {
    console.log("Response keys:", Object.keys(json || {}));
    console.log("Raw:", JSON.stringify(json).slice(0, 500) + "...");
    return;
  }

  console.log("rows:", data.length);

  // 先頭1件だけ表示（長すぎ防止）
  if (data.length > 0) {
    console.log("first:", data[0]);
  }
  console.log("DONE");
}

main().catch((e) => {
  console.error("ERR:", e?.message ?? e);
  process.exit(1);
});