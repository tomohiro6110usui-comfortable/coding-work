import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchRankings, type RankingsResponse } from "../lib/api";

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
        <div style={{ display: "grid", gap: 12 }}>
          <Section title="値上がり" items={data.up} />
          <Section title="値下がり" items={data.down} />
        </div>
      )}
    </div>
  );
}

function Section(props: { title: string; items: RankingsResponse["up"] }) {
  return (
    <section style={{ overflowX: "auto", border: "1px solid #e6e6e6", borderRadius: 14 }}>
      <div style={{ padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid #eee" }}>
        <b>{props.title}</b>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={th}>コード</th>
            <th style={th}>銘柄名</th>
            <th style={thRight}>終値</th>
            <th style={thRight}>騰落%</th>
            <th style={th}>要因</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((x) => (
            <tr key={`${props.title}-${x.code}`}>
              <td style={tdMono}>{x.code}</td>
              <td style={td}>{x.name}</td>
              <td style={tdRight}>{x.close}</td>
              <td style={tdRight}>{x.changePct}</td>
              <td style={td}>{x.reasonLite ?? ""}</td>
            </tr>
          ))}
          {props.items.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>
                データがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

const th: CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const thRight: CSSProperties = { ...th, textAlign: "right" };
const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" };
const tdMono: CSSProperties = { ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const tdRight: CSSProperties = { ...td, textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };