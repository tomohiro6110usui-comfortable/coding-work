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
        return "Pullback Chances";
      case "tomorrow":
        return "Tomorrow Picks";
      case "earnings":
        return "Earnings Watchlist";
      case "rankings":
        return "Rankings";
    }
  }, [tab]);

  return (
    <div className="AppRoot">
      <header className="TopBar">
        <div className="TopBarTitle">
          <div className="AppName">rule-poc dashboard</div>
          <div className="AppSubtitle">earnings, rankings, tomorrow picks, and pullback scan</div>
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
          Pullback
        </TabButton>
        <TabButton active={tab === "tomorrow"} onClick={() => setTab("tomorrow")}>
          Tomorrow
        </TabButton>
        <TabButton active={tab === "earnings"} onClick={() => setTab("earnings")}>
          Earnings
        </TabButton>
        <TabButton active={tab === "rankings"} onClick={() => setTab("rankings")}>
          Rankings
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
