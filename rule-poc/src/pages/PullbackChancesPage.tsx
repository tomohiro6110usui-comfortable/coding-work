import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  fetchPullbackChances,
  type PullbackChanceItem,
  type PullbackChancesResponse,
  type PullbackSelectionRequest,
} from "../lib/api";

type Props = { date: string };

function toFiniteNumber(text: string, fallback: number): number {
  const n = Number(text);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(text: string, fallback: number): number {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default function PullbackChancesPage({ date }: Props) {
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<PullbackChancesResponse | null>(null);

  const [minScoreText, setMinScoreText] = useState("58");
  const [maxPerBucketText, setMaxPerBucketText] = useState("40");
  const [requireRebound, setRequireRebound] = useState(true);
  const [selection, setSelection] = useState<PullbackSelectionRequest>({
    minScore: 58,
    maxPerBucket: 40,
    requireRebound: true,
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    fetchPullbackChances(date, refresh, undefined, selection)
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
  }, [date, refresh, selection]);

  const rows = useMemo(() => {
    const st = data?.shortTerm ?? [];
    const mt = data?.midTerm ?? [];
    return [...st, ...mt].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.ratioNowHigh - b.ratioNowHigh);
  }, [data]);

  const failedCount = data?.debug?.failedCount ?? 0;
  const rateLimit429Count = data?.debug?.rateLimit429Count ?? 0;
  const retriedCount = data?.debug?.retriedCount ?? 0;
  const recoveredByRetryCount = data?.debug?.recoveredByRetryCount ?? 0;
  const failedCodes = (data?.debug?.perCode ?? []).filter((x) => !x.ok).map((x) => x.code);
  const succeeded = (data?.debug?.perCode ?? []).filter((x) => x.ok);
  const succeededCodes = succeeded.map((x) => x.code);
  const showNoCandidates = !loading && !err && rows.length === 0 && failedCount === 0;

  const selectionSummary = data?.debug?.selectionSummary;
  const nearMissTop = data?.debug?.nearMissTop ?? [];

  const applySelection = () => {
    const minScore = Math.max(0, Math.min(100, toFiniteNumber(minScoreText, 58)));
    const maxPerBucket = Math.max(1, toPositiveInt(maxPerBucketText, 40));
    setSelection({ minScore, maxPerBucket, requireRebound });
    setRefresh(true);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 8, padding: 12, border: "1px solid #e6e6e6", borderRadius: 14, background: "#fcfcfc" }}>
        <div style={{ fontWeight: 700 }}>selection settings</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={labelRow}>
            min score
            <input value={minScoreText} onChange={(e) => setMinScoreText(e.target.value)} style={input} />
          </label>
          <label style={labelRow}>
            max per bucket
            <input value={maxPerBucketText} onChange={(e) => setMaxPerBucketText(e.target.value)} style={input} />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={requireRebound} onChange={(e) => setRequireRebound(e.target.checked)} />
            require rebound
          </label>
          <button onClick={applySelection} disabled={loading}>
            apply filters
          </button>
          <button onClick={() => setRefresh(true)} disabled={loading} style={{ marginLeft: "auto" }}>
            refresh
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ opacity: 0.75 }}>
          source: {data?.source ?? "-"} / universeKey: {data?.universeKey ?? "-"} / fetchedAt: {data?.fetchedAt ?? "-"}
        </div>
      </div>

      {loading && <div>loading...</div>}
      {err && <div style={{ color: "crimson" }}>error: {err}</div>}

      {!loading && !err && selectionSummary && (
        <div style={{ padding: 12, border: "1px solid #e6e6e6", borderRadius: 14, background: "#fcfcfc", fontSize: 13 }}>
          selection: minScore={selectionSummary.minScore} / maxPerBucket={selectionSummary.maxPerBucket} / requireRebound=
          {selectionSummary.requireRebound ? "1" : "0"} / short={selectionSummary.shortCandidates} / mid={selectionSummary.midCandidates}
        </div>
      )}

      {!loading && !err && failedCount > 0 && (
        <div style={{ padding: 12, border: "1px solid #f3c4c4", borderRadius: 14, background: "#fff7f7" }}>
          fetch failures: {failedCount} / 429: {rateLimit429Count} / retried: {retriedCount} / recovered: {recoveredByRetryCount}
          {failedCodes.length > 0 && <div style={{ marginTop: 6, fontSize: 12 }}>failed codes: {failedCodes.join(", ")}</div>}
        </div>
      )}

      {!loading && !err && (
        <div style={{ display: "grid", gap: 10, padding: 12, border: "1px solid #e6e6e6", borderRadius: 14, background: "#fcfcfc" }}>
          <div style={{ fontWeight: 700 }}>price fetch status</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            success: {succeeded.length} / failed: {failedCount} / cache hit: {data?.debug?.cacheHitCount ?? 0}
          </div>
          {succeededCodes.length > 0 && <div style={{ fontSize: 12, lineHeight: 1.5 }}>success codes: {succeededCodes.join(", ")}</div>}
          {failedCodes.length > 0 && (
            <div style={{ fontSize: 12, lineHeight: 1.5, color: "#8a1f1f" }}>failed codes: {failedCodes.join(", ")}</div>
          )}
        </div>
      )}

      {!loading && !err && nearMissTop.length > 0 && (
        <div style={{ display: "grid", gap: 6, padding: 12, border: "1px solid #eee", borderRadius: 14, background: "#fafafa" }}>
          <div style={{ fontWeight: 700 }}>near miss top</div>
          {nearMissTop.slice(0, 8).map((x) => (
            <div key={x.code} style={{ fontSize: 12, lineHeight: 1.5 }}>
              {x.code} / score {x.score?.toFixed?.(1) ?? x.score} / gap {x.thresholdGap?.toFixed?.(3) ?? x.thresholdGap}
            </div>
          ))}
        </div>
      )}

      {showNoCandidates && (
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 14, background: "#fafafa" }}>no candidates</div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid #e6e6e6", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>term</th>
                <th style={th}>code</th>
                <th style={thRight}>score</th>
                <th style={th}>grade</th>
                <th style={thRight}>price</th>
                <th style={thRight}>high/low</th>
                <th style={thRight}>now/high</th>
                <th style={thRight}>pullback%</th>
                <th style={thRight}>rebound3%</th>
                <th style={thRight}>vol20%</th>
                <th style={th}>reasons</th>
                <th style={th}>risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x, i) => (
                <Row key={`${x.bucket}-${x.code}-${i}`} x={x} />
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
      <td style={td}>{x.bucket}</td>
      <td style={tdMono}>{x.code}</td>
      <td style={tdRight}>{x.score?.toFixed(1) ?? "-"}</td>
      <td style={td}>{x.grade ?? "-"}</td>
      <td style={tdRight}>{x.price.toFixed(2)}</td>
      <td style={tdRight}>{x.ratioHighLow.toFixed(2)}</td>
      <td style={tdRight}>{x.ratioNowHigh.toFixed(2)}</td>
      <td style={tdRight}>{x.pullbackPct?.toFixed(1) ?? "-"}</td>
      <td style={tdRight}>{x.rebound3Pct?.toFixed(1) ?? "-"}</td>
      <td style={tdRight}>{x.volatility20Pct?.toFixed(1) ?? "-"}</td>
      <td style={td}>{(x.reasons ?? []).slice(0, 2).join(" / ")}</td>
      <td style={td}>{(x.riskFlags ?? []).join(", ") || "-"}</td>
    </tr>
  );
}

const labelRow: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 };
const input: CSSProperties = { width: 72, padding: "4px 6px" };
const th: CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const thRight: CSSProperties = { ...th, textAlign: "right" };
const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" };
const tdMono: CSSProperties = { ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const tdRight: CSSProperties = { ...td, textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
