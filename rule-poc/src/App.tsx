import { useMemo, useState } from "react";
import "./App.css";
import { defaultAnalysisDate } from "./lib/date";
import PullbackChancesPage from "./pages/PullbackChancesPage";
import TomorrowPicksPage from "./pages/TomorrowPicksPage";
import EarningsWatchlistPage from "./pages/EarningsWatchlistPage";
import RankingsPage from "./pages/RankingsPage";

type Tab = "pullback" | "tomorrow" | "earnings" | "rankings";

export default function App() {
  const [tab, setTab] = useState<Tab>("pullback");
  const [date, setDate] = useState<string>(() => defaultAnalysisDate());

  const title = useMemo(() => {
    switch (tab) {
      case "pullback":
        return "絶好の押し目買いチャンス";
      case "tomorrow":
        return "明日注目（API）";
      case "earnings":
        return "決算監視TOP50（API）";
      case "rankings":
        return "ランキング（API）";
    }
  }, [tab]);

  return (
    <div className="AppRoot">
      <header className="TopBar">
        <div className="TopBarTitle">
          <div className="AppName">投資ルール管理 + 決算監視 + ランキング + 明日注目 + 押し目抽出</div>
          <div className="AppSubtitle">監視優先度を最適化するための統合ツール</div>
        </div>

        <div className="TopBarRight">
          <label className="DateField">
            <span>date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </header>

      <nav className="Tabs">
        <TabButton active={tab === "pullback"} onClick={() => setTab("pullback")}>
          押し目買いチャンス
        </TabButton>
        <TabButton active={tab === "tomorrow"} onClick={() => setTab("tomorrow")}>
          明日注目（API）
        </TabButton>
        <TabButton active={tab === "earnings"} onClick={() => setTab("earnings")}>
          決算監視TOP50（API）
        </TabButton>
        <TabButton active={tab === "rankings"} onClick={() => setTab("rankings")}>
          ランキング（API）
        </TabButton>
      </nav>

      <main className="Main">
        <section className="Card">
          <div className="CardHeader">
            <h1>{title}</h1>
            <div className="Meta">date: {date}</div>
          </div>

          {tab === "pullback" && <PullbackChancesPage date={date} />}
          {tab === "tomorrow" && <TomorrowPicksPage date={date} />}
          {tab === "earnings" && <EarningsWatchlistPage date={date} />}
          {tab === "rankings" && <RankingsPage date={date} />}
        </section>

        <footer className="FooterNote">
          これは買い推奨ツールではなく「反応が出た銘柄を並べ替える順番最適化ツール」です。
          <br />
          押し目抽出は“当てる”のではなく“監視優先度を上げる”のが目的です。
        </footer>
      </main>
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={props.active ? "Tab Active" : "Tab"} onClick={props.onClick}>
      {props.children}
    </button>
  );
}