import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { fetchEarningsWatchlist, type WatchlistResponse } from "../lib/api";
import { defaultAnalysisDate } from "../lib/date";

function SourceBadge({ source }: { source?: "db" | "generated" }) {
  const label = source ?? "unknown";
  const style: CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    opacity: 0.9,
  };
  return <span style={style}>source: {label}</span>;
}

export default function WatchlistPanel() {
  const [date, setDate] = useState<string>(() => defaultAnalysisDate());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WatchlistResponse | null>(null);
  const [error, setError] = useState<string>("");

  const count = data?.items?.length ?? 0;

  const keyText = useMemo(() => {
    if (!data) return "";
    return `${data.key} / fetchedAt=${data.fetchedAt}`;
  }, [data]);

  async function fetchData(refresh: boolean) {
    setLoading(true);
    setError("");
    try {
      const res = await fetchEarningsWatchlist(date, refresh);
      setData(res);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function copyCodes() {
    if (!data?.items?.length) return;
    const text = data.items.map((x) => x.code).join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
       <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
         <h2 style={{ margin: 0 }}>決算監視（Watchlist）</h2>
-        <SourceBadge source={data?.source} />
+        <SourceBadge source={uiSource} />
         <span style={{ opacity: 0.85 }}>件数: {count}</span>
       </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.85 }}>日付</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: "6px 10px", borderRadius: 10 }} />
        </label>

        <button onClick={() => fetchData(false)} disabled={loading} style={{ padding: "8px 12px", borderRadius: 12 }}>
          {loading ? "取得中…" : "取得"}
        </button>

        <button onClick={() => fetchData(true)} disabled={loading} style={{ padding: "8px 12px", borderRadius: 12 }}>
          {loading ? "…" : "再取得（上書き）"}
        </button>

        <button onClick={copyCodes} disabled={!data?.items?.length} style={{ padding: "8px 12px", borderRadius: 12 }}>
          コードをコピー
        </button>

        {data && <span style={{ opacity: 0.75, fontSize: 12, marginLeft: 6, wordBreak: "break-all" }}>{keyText}</span>}
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 14, border: "1px solid rgba(255,0,0,0.35)" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>エラー</div>
          <div style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>{error}</div>
        </div>
      )}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,0.12)" }}>
              <th style={{ padding: 10 }}>code</th>
              <th style={{ padding: 10 }}>name</th>
              <th style={{ padding: 10 }}>market</th>
              <th style={{ padding: 10 }}>earningsDate</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((x) => (
              <tr key={`${x.code}-${x.earningsDate}`} style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <td style={{ padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{x.code}</td>
                <td style={{ padding: 10 }}>{x.name}</td>
                <td style={{ padding: 10 }}>{x.market}</td>
                <td style={{ padding: 10 }}>{x.earningsDate}</td>
              </tr>
            ))}
            {!loading && (data?.items?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 12, opacity: 0.75 }}>
                  データがありません（取得ボタンを押してください）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}