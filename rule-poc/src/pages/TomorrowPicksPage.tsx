import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchTomorrowPicks, type TomorrowPicksResponse } from "../lib/api";

type Props = { date: string };

export default function TomorrowPicksPage({ date }: Props) {
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<TomorrowPicksResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    fetchTomorrowPicks(date, refresh)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String((e as any)?.message ?? e)))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefresh(false);
      });

    return () => {
      alive = false;
    };
  }, [date, refresh]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ opacity: 0.75 }}>date: {date}</div>
        <button onClick={() => setRefresh(true)} disabled={loading} style={{ marginLeft: "auto" }}>
          再取得（refresh=1）
        </button>
      </div>

      {loading && <div>loading...</div>}
      {err && <div style={{ color: "crimson" }}>error: {err}</div>}

      {data && (
        <div style={{ overflowX: "auto", border: "1px solid #e6e6e6", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>コード</th>
                <th style={th}>銘柄名</th>
                <th style={th}>市場</th>
                <th style={thRight}>score</th>
                <th style={th}>reasons</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((x) => (
                <tr key={x.code}>
                  <td style={tdMono}>{x.code}</td>
                  <td style={td}>{x.name}</td>
                  <td style={td}>{x.market}</td>
                  <td style={tdRight}>{x.score}</td>
                  <td style={td}>{x.reasons.join(" / ")}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const thRight: CSSProperties = { ...th, textAlign: "right" };
const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" };
const tdMono: CSSProperties = { ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const tdRight: CSSProperties = { ...td, textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };