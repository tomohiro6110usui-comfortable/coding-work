import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchEarningsWatchlist, type WatchlistResponse } from "../lib/api";

type Props = { date: string };

export default function EarningsWatchlistPage({ date }: Props) {
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<WatchlistResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    fetchEarningsWatchlist(date, refresh)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setErr(String((e as any)?.message ?? e));
      })
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ opacity: 0.75 }}>
          source: {data?.source ?? "-"} / fetchedAt: {data?.fetchedAt ?? "-"} / count: {data?.items.length ?? 0}
        </div>
        <button onClick={() => setRefresh(true)} disabled={loading} style={{ marginLeft: "auto" }}>
          refresh
        </button>
      </div>

      {loading && <div>loading...</div>}
      {err && <div style={{ color: "crimson" }}>error: {err}</div>}

      {data && (
        <div style={{ overflowX: "auto", border: "1px solid #e6e6e6", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>code</th>
                <th style={th}>name</th>
                <th style={th}>market</th>
                <th style={th}>earningsDate</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((x) => (
                <tr key={`${x.code}-${x.earningsDate ?? ""}`}>
                  <td style={tdMono}>{x.code}</td>
                  <td style={td}>{x.name ?? ""}</td>
                  <td style={td}>{x.market ?? ""}</td>
                  <td style={td}>{x.earningsDate ?? ""}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>
                    no data
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
const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" };
const tdMono: CSSProperties = { ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
