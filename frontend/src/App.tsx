import { MoodCheckIn } from "./components/MoodCheckIn";
import { DataWorkspace } from "./screens/data";
import { useState } from "react";
import { post } from "./services/api";
import { useMission } from "./useMission";
import { Status } from "./components/medical";
import { TelemetryWarnings } from "./components/TelemetryWarnings";
import { EarlyWarning } from "./components/EarlyWarning";
import { useDeceasedCrew } from "./useDeceasedCrew";
import { AlertReview } from "./components/AlertReview";
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
  "Data workspace":
    "Import NASA reference tables, define data fields, and edit simulation research records.",
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
const ICONS = ["▦", "♧", "⌁", "✚", "◇", "◉", "◫", "↗", "◎", "△", "▷", "▤"];
const SCREENS: Record<Page, (props: ScreenProps) => React.ReactNode> = {
  "Data workspace": DataWorkspace,
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
  const [minimizedAlerts, setMinimizedAlerts] = useState<Set<number>>(
    new Set(),
  );
  const [reviewId, setReviewId] = useState<number | null>(null);
  const mission = useMission(crewId);
  const deceasedCrewIds = useDeceasedCrew(mission);
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
  const pendingAlerts = mission.alerts
    .filter((a) => a.state === "PENDING_REVIEW")
    .sort((a, b) => a.priority - b.priority || a.id - b.id);
  const pending = pendingAlerts.length;
  const critical = pendingAlerts.filter((a) => a.priority === 1);
  const requestedReview = pendingAlerts.find((a) => a.id === reviewId);
  const automaticCritical = critical.find((a) => !minimizedAlerts.has(a.id));
  const automaticReview = pendingAlerts.find((a) => !minimizedAlerts.has(a.id));
  const review =
    requestedReview?.priority === 1
      ? requestedReview
      : (automaticCritical ?? requestedReview ?? automaticReview);
  const Screen = SCREENS[page];
  const props = {
    mission,
    crewId,
    selectCrew,
    navigate,
    busy,
    action,
    deceasedCrewIds,
  };
  return (
    <div className="app-shell">
      {review && (
        <AlertReview
          key={review.id}
          alert={review}
          crewName={
            mission.crew.find((c) => c.id === review.astronaut_id)
              ?.display_name ?? review.astronaut_id
          }
          pendingCount={pending}
          busy={busy}
          error={actionError}
          onMinimize={() => {
            setMinimizedAlerts((ids) => new Set(ids).add(review.id));
            setReviewId(null);
          }}
          onAcknowledge={() =>
            void action(
              `alerts/${review.id}/acknowledge`,
              undefined,
              "Demo alert acknowledged",
            )
          }
        />
      )}
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
              aria-label={name}
              aria-description={
                name === "Alerts" && pending > 0
                  ? `${pending} pending demo alerts`
                  : undefined
              }
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
          <div
            className={`page-heading ${page === "Mission dashboard" ? "page-heading-with-mood" : ""}`}
          >
            <div className="page-heading-copy">
              <p className="eyebrow">
                CREW HEALTH / {selected?.display_name ?? "LOCAL WORKSPACE"}
              </p>
              <h1>{page}</h1>
              <p>{DESCRIPTIONS[page]}</p>
            </div>
            {page === "Mission dashboard" && (
              <MoodCheckIn key={crewId} mission={mission} crewId={crewId} />
            )}
            <div className="page-status">
              <Status
                value={mission.connected ? "API_CONNECTED" : "API_DISCONNECTED"}
              />
              <span>DEMO / SIMULATED</span>
            </div>
          </div>
          <TelemetryWarnings {...props} />
          <EarlyWarning {...props} />
          {pending > 0 && (
            <div
              className={`alert-banner ${critical.length ? "has-critical" : ""}`}
              role="region"
              aria-label="Pending simulated alerts"
            >
              <div>
                <strong>
                  {critical.length
                    ? `PRIORITY 1 · ${critical.length} critical demo alert${critical.length === 1 ? "" : "s"}`
                    : "PRIORITY 2 · Warning demo"}
                </strong>
                <p>{pending} pending across crew · SIMULATED</p>
                <p>
                  {mission.crew.find(
                    (c) => c.id === pendingAlerts[0].astronaut_id,
                  )?.display_name ?? pendingAlerts[0].astronaut_id}
                  {" · "}
                  {pendingAlerts[0].message}
                </p>
              </div>
              <div className="button-row">
                <button onClick={() => setReviewId(pendingAlerts[0].id)}>
                  Review alert full screen
                </button>
                <button
                  onClick={() => {
                    selectCrew(pendingAlerts[0].astronaut_id);
                    navigate("Alerts");
                  }}
                >
                  Open alert history
                </button>
              </div>
            </div>
          )}
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
