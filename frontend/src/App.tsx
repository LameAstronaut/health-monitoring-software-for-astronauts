import { useState } from "react";
import { post } from "./services/api";
import { useMission } from "./useMission";
import { Status } from "./components/medical";
import { PAGES } from "./screens/types";
import type { Page, ScreenProps } from "./screens/types";
import { CrewProfiles, Dashboard, LiveMonitoring } from "./screens/monitoring";
import { Examinations } from "./screens/examinations";
import { Equipment } from "./screens/equipment";
import { Alerts } from "./screens/alerts";
import { SimulatorControls } from "./screens/simulator";
import { EvaOperations, Fitness, Nutrition } from "./screens/lifestyle";
import { RiskMonitoring } from "./screens/risk";

const DESCRIPTIONS: Record<Page, string> = {
  "Mission dashboard":
    "A clear view of your crew, physiological data, and scheduled medical work.",
  "Crew profiles":
    "Individual simulation baselines, provenance, and longitudinal records.",
  "Live monitoring":
    "Readable numerical summaries and a separate continuous synthetic ECG signal.",
  Examinations:
    "Select an instrument, acquire a synthetic result, review it, and save the report.",
  Equipment:
    "Virtual instrument connectivity, acquisition capabilities, and calibration metadata.",
  "Risk monitoring":
    "Eleven observation views with explicit data availability and model limitations.",
  Nutrition:
    "Synthetic food inventory, recorded meals, and transparent nutrient totals.",
  Fitness:
    "Exercise demonstrations, gradual physiological response, and session history.",
  "EVA operations":
    "Simulated suit telemetry, procedural checklist, and a persistent session timeline.",
  Alerts:
    "Priority-ordered demo findings with exact triggering evidence and acknowledgment.",
  "Simulator controls":
    "Reproducible physiological scenarios, playback, speed, and sensor faults.",
};
const ICONS = ["▦", "♧", "⌁", "✚", "◇", "◉", "◫", "↗", "◎", "△", "▷"];
const SCREENS: Record<Page, (props: ScreenProps) => React.ReactNode> = {
  "Mission dashboard": Dashboard,
  "Crew profiles": CrewProfiles,
  "Live monitoring": LiveMonitoring,
  Examinations: Examinations,
  Equipment: Equipment,
  "Risk monitoring": RiskMonitoring,
  Nutrition: Nutrition,
  Fitness: Fitness,
  "EVA operations": EvaOperations,
  Alerts: Alerts,
  "Simulator controls": SimulatorControls,
};

function initialCrew() {
  try {
    const stored = localStorage.getItem("astra-selected-crew");
    if (/^DEMO-CREW-00[1-3]$/.test(stored ?? "")) return stored!;
  } catch {
    /* storage is optional */
  }
  return "DEMO-CREW-001";
}

export default function App() {
  const [crewId, setCrewId] = useState(initialCrew);
  const [page, setPage] = useState<Page>("Mission dashboard");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const mission = useMission(crewId);
  const selectCrew = (id: string) => {
    setCrewId(id);
    setNotice("");
    setActionError("");
    try {
      localStorage.setItem("astra-selected-crew", id);
    } catch {
      /* selection remains usable without storage */
    }
  };
  const navigate = (next: Page) => {
    setPage(next);
    setNotice("");
    setActionError("");
  };
  const action: ScreenProps["action"] = async (route, body, success) => {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await post(route, body);
      await mission.refresh();
      if (success) setNotice(success);
      return true;
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const selected = mission.crew.find((c) => c.id === crewId);
  const pending = mission.alerts.filter(
    (a) => a.state === "PENDING_REVIEW",
  ).length;
  const Screen = SCREENS[page];
  const props = { mission, crewId, selectCrew, navigate, busy, action };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to medical workspace
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#main-content"
          onClick={() => navigate("Mission dashboard")}
        >
          <span className="brand-mark">✳</span>
          <span>
            ASTRA<span>HEALTH SYSTEMS</span>
          </span>
        </a>
        <div className="mission-label">
          <span />
          LOCAL MISSION WORKSPACE
        </div>
        <nav aria-label="Main navigation">
          {PAGES.map((name, i) => (
            <button
              key={name}
              aria-current={page === name ? "page" : undefined}
              onClick={() => navigate(name)}
            >
              <span className="nav-icon" aria-hidden="true">
                {ICONS[i]}
              </span>
              <span>{name}</span>
              {name === "Alerts" && pending > 0 && (
                <b className="nav-count">{pending}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Status value="SIMULATED" />
          <p>
            Synthetic identities.
            <br />
            Traceable observations.
          </p>
          <div className="sidebar-connection">
            <span
              className={
                mission.connected
                  ? "connection-dot"
                  : "connection-dot disconnected"
              }
            />
            {mission.connected
              ? "Backend stream connected"
              : "Backend stream disconnected"}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="workspace-title">
            <span className="orbit-icon">◎</span>
            <span>
              Medical operations<strong>Local research mission</strong>
            </span>
          </div>
          <div className="topbar-right">
            <Status value="SIMULATED" />
            <time>{new Date(mission.now).toISOString().slice(11, 19)} UTC</time>
            <label className="crew-select">
              Selected crew
              <select
                aria-label="Selected crew"
                value={crewId}
                onChange={(e) => selectCrew(e.target.value)}
              >
                {mission.crew.length ? (
                  mission.crew.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))
                ) : (
                  <option value={crewId}>Crew registry unavailable</option>
                )}
              </select>
            </label>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                CREW HEALTH / {selected?.display_name ?? "LOCAL WORKSPACE"}
              </p>
              <h1>{page}</h1>
              <p>{DESCRIPTIONS[page]}</p>
            </div>
            <div className="page-status">
              <Status
                value={mission.connected ? "API_CONNECTED" : "API_DISCONNECTED"}
              />
              <span>DEMO / SIMULATED</span>
            </div>
          </div>
          <div className="safety-ribbon">
            <span>DEMO / SIMULATED</span>Research prototype · Synthetic data
            only · No medical decisions or hardware control.
          </div>
          {(mission.error || actionError) && (
            <div className="error-banner" role="alert">
              <div>
                <strong>
                  {actionError
                    ? "Action could not be completed"
                    : "Connection or record error"}
                </strong>
                <p>{actionError || mission.error}</p>
              </div>
              <button
                disabled={busy}
                onClick={() => {
                  setActionError("");
                  void mission.refresh();
                }}
              >
                Retry connection
              </button>
            </div>
          )}
          {notice && (
            <div className="success-banner" role="status">
              ✓ {notice}
            </div>
          )}
          {mission.loading && (
            <div className="loading-banner" role="status">
              Connecting to the local medical workspace…
            </div>
          )}
          <Screen key={`${page}-${crewId}`} {...props} />
          <footer>
            <strong>ASTRA HEALTH</strong>
            <span>
              SIMULATED · Local records · Ground synchronization not configured
            </span>
            <span>Research prototype · No clinical validation</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
