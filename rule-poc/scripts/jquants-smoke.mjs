// scripts/jquants-smoke.mjs
import "dotenv/config";

const EMAIL = process.env.JQUANTS_EMAIL;
const PASSWORD = process.env.JQUANTS_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Missing env: JQUANTS_EMAIL / JQUANTS_PASSWORD");
  process.exit(1);
}

// V1トークン方式（Qiita記事の流れ）
// ※V2がある旨の注意は記事内にあります :contentReference[oaicite:5]{index=5}
const BASE = "https://api.jquants.com/v1";

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await safeText(res);

  if (!res.ok) {
    // エラーを握りつぶさずそのまま見える化
    throw new Error(`HTTP ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await safeText(res);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  console.log("[1] auth_user...");
  const auth = await postJson(`${BASE}/token/auth_user`, {
    mailaddress: EMAIL,
    password: PASSWORD,
  });

  const refreshToken = auth?.refreshToken;
  if (!refreshToken) throw new Error("refreshToken not found: " + JSON.stringify(auth));

  console.log("[2] auth_refresh...");
  const refreshed = await postJson(`${BASE}/token/auth_refresh`, { refreshToken });

  const idToken = refreshed?.idToken;
  if (!idToken) throw new Error("idToken not found: " + JSON.stringify(refreshed));

  console.log("[3] listed/info...");
  const listed = await getJson(`${BASE}/listed/info`, { Authorization: `Bearer ${idToken}` });

  const count = Array.isArray(listed?.info) ? listed.info.length : 0;
  console.log("OK listed.info length =", count);
  console.log("DONE");
}

main().catch((e) => {
  console.error("ERR:", e?.message ?? e);
  process.exit(1);
});