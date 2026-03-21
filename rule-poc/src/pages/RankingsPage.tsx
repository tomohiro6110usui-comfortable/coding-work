import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchRankings, type RankingItem, type RankingsResponse } from "../lib/api";

type Props = { date: string };

export default function RankingsPage({ date }: Props) {
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<RankingsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    fetchRankings(date, refresh)
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

  const rows = data?.items ?? [];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ opacity: 0.75 }}>
          source: {data?.source ?? "-"} / fetchedAt: {data?.fetchedAt ?? "-"} / count: {rows.length}
        </div>
        <button onClick={() => setRefresh(true)} disabled={loading} style={{ marginLeft: "auto" }}>
          refresh
        </button>
      </div>

      {loading && <div>loading...</div>}
      {err && <div style={{ color: "crimson" }}>error: {err}</div>}

      {!loading && !err && rows.length === 0 && (
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 14, background: "#fafafa" }}>no data</div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid #e6e6e6", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>code</th>
                <th style={th}>name</th>
                <th style={th}>market</th>
                <th style={thRight}>value</th>
                <th style={thRight}>pct</th>
                <th style={th}>reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <Row key={x.code} x={x} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ x }: { x: RankingItem }) {
  return (
    <tr>
      <td style={tdMono}>{x.code}</td>
      <td style={td}>{x.name ?? ""}</td>
      <td style={td}>{x.market ?? ""}</td>
      <td style={tdRight}>{x.value ?? x.close ?? ""}</td>
      <td style={tdRight}>{x.pct ?? x.changePct ?? ""}</td>
      <td style={td}>{x.reason ?? x.reasonLite ?? ""}</td>
    </tr>
  );
}

const th: CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const thRight: CSSProperties = { ...th, textAlign: "right" };
const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" };
const tdMono: CSSProperties = { ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const tdRight: CSSProperties = { ...td, textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
