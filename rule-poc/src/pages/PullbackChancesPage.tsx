import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { fetchPullbackChances, type PullbackChancesResponse, type PullbackChanceItem } from "../lib/api";

type Props = { date: string };

export default function PullbackChancesPage({ date }: Props) {
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<PullbackChancesResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    fetchPullbackChances(date, refresh)
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

  const rows = useMemo(() => {
    const st = data?.shortTerm ?? [];
    const mt = data?.midTerm ?? [];
    return [...st, ...mt];
  }, [data]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ opacity: 0.75 }}>
          source: {data?.source ?? "-"} / universeKey: {data?.universeKey ?? "-"} / fetchedAt: {data?.fetchedAt ?? "-"}
        </div>

        <button onClick={() => setRefresh(true)} disabled={loading} style={{ marginLeft: "auto" }}>
          再取得（refresh=1）
        </button>
      </div>

      <div style={{ color: "#333", lineHeight: 1.55 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>判定条件</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>短期（直近2週間）</b>：最高値/最安値 ≥ 1.5 かつ 現在値/最高値 ≤ 0.8
          </li>
          <li>
            <b>中期（直近2か月）</b>：最高値/最安値 ≥ 2.0 かつ 現在値/最高値 ≤ 0.8
          </li>
        </ul>
      </div>

      {loading && <div>loading...</div>}
      {err && <div style={{ color: "crimson" }}>error: {err}</div>}

      {!loading && !err && rows.length === 0 && (
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 14, background: "#fafafa" }}>
          条件に合う銘柄がありません（ユニバースが小さい場合は、ランキング上位のみが対象になります）
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid #e6e6e6", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>区分</th>
                <th style={th}>コード</th>
                <th style={th}>銘柄名</th>
                <th style={th}>業種</th>
                <th style={thRight}>現在株価</th>
                <th style={thRight}>最高値/最安値</th>
                <th style={thRight}>現在値/最高値</th>
                <th style={thRight}>最高値</th>
                <th style={thRight}>最安値</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <Row key={`${x.bucket}-${x.code}`} x={x} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ x }: { x: PullbackChanceItem }) {
  return (
    <tr>
      <td style={td}>{x.bucket === "short" ? "短期" : "中期"}</td>
      <td style={tdMono}>{x.code}</td>
      <td style={td}>{x.name}</td>
      <td style={td}>{x.industry}</td>
      <td style={tdRight}>{x.price}</td>
      <td style={tdRight}>{x.ratioHighLow.toFixed(2)}</td>
      <td style={tdRight}>{x.ratioNowHigh.toFixed(2)}</td>
      <td style={tdRight}>{x.high}</td>
      <td style={tdRight}>{x.low}</td>
    </tr>
  );
}

const th: CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const thRight: CSSProperties = { ...th, textAlign: "right" };
const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" };
const tdMono: CSSProperties = { ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const tdRight: CSSProperties = { ...td, textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };