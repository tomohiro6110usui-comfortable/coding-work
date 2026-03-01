import { useMemo, useState } from "react";

type TopMover = {
  code: string;
  name: string;
  market: string;
  close: number;
  changePct: number;
  reasonLite?: string;
};

type RankingsResponse = {
  date: string;
  up: TopMover[];
  down?: TopMover[]; // ある実装/無い実装があり得るので optional
  fetchedAt?: string;
  source?: "db" | "generated";
};

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}

function fmtPct(n: number) {
  if (Number.isNaN(n)) return "";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export default function RankingsPanel(props: {
  defaultDate: string;
}) {
  const [date, setDate] = useState(props.defaultDate);
  const [data, setData] = useState<RankingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"up" | "down">("up");

  const countUp = data?.up?.length ?? 0;
  const countDown = data?.down?.length ?? 0;

  const currentItems = useMemo(() => {
    if (!data) return [];
    return activeTab === "up" ? (data.up ?? []) : (data.down ?? []);
  }, [data, activeTab]);

  async function fetchRankings(refresh: boolean) {
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({ date });
      if (refresh) q.set("refresh", "1");
      const out = await apiGet<RankingsResponse>(`/api/rankings?${q.toString()}`);
      setData(out);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function copyJson() {
    if (!data) return;
    const s = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(s).catch(() => {});
  }

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          ランキング（Top Movers）
        </div>

        <div style={{ opacity: 0.8, fontSize: 13 }}>
          source: <b>{data?.source ?? "-"}</b>
        </div>

        <div style={{ opacity: 0.8, fontSize: 13 }}>
          上昇: <b>{countUp}</b> / 下落: <b>{countDown}</b>
        </div>

        <div style={{ opacity: 0.75, fontSize: 12 }}>
          {data?.fetchedAt ? `fetchedAt=${data.fetchedAt}` : ""}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          日付
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.2)",
              color: "white",
            }}
          />
        </label>

        <button
          onClick={() => fetchRankings(false)}
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.08)",
            color: "white",
            cursor: "pointer",
          }}
        >
          取得
        </button>

        <button
          onClick={() => fetchRankings(true)}
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.14)",
            color: "white",
            cursor: "pointer",
          }}
        >
          再取得（上書き）
        </button>

        <button
          onClick={copyJson}
          disabled={!data}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.08)",
            color: "white",
            cursor: "pointer",
          }}
        >
          コードをコピー
        </button>

        <div style={{ display: "flex", gap: 8, marginLeft: 6 }}>
          <button
            onClick={() => setActiveTab("up")}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.2)",
              background: activeTab === "up" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
            }}
          >
            上昇
          </button>
          <button
            onClick={() => setActiveTab("down")}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.2)",
              background: activeTab === "down" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
            }}
          >
            下落
          </button>
        </div>

        {loading && <div style={{ opacity: 0.8 }}>loading...</div>}
        {err && <div style={{ color: "#ffb4b4" }}>error: {err}</div>}
      </div>

      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.85 }}>
              <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>code</th>
              <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>name</th>
              <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>market</th>
              <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>close</th>
              <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>changePct</th>
              <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>reason</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((x) => (
              <tr key={`${activeTab}-${x.code}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "10px 8px" }}>{x.code}</td>
                <td style={{ padding: "10px 8px" }}>{x.name}</td>
                <td style={{ padding: "10px 8px" }}>{x.market}</td>
                <td style={{ padding: "10px 8px" }}>{x.close}</td>
                <td style={{ padding: "10px 8px" }}>{fmtPct(x.changePct)}</td>
                <td style={{ padding: "10px 8px", opacity: 0.9 }}>{x.reasonLite ?? ""}</td>
              </tr>
            ))}
            {!currentItems.length && (
              <tr>
                <td colSpan={6} style={{ padding: "12px 8px", opacity: 0.75 }}>
                  データなし（上の「取得」を押してください）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
