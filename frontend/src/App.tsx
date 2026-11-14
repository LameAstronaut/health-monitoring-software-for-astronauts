import { useState } from "react";
import type { Observation } from "./services/api";
import { displayState } from "./telemetry";
import { useMission } from "./useMission";

const metrics = [
  {
    code: "heart_rate",
    name: "Heart rate",
    unit: "beats/min",
    color: "#80d4b0",
  },
  { code: "spo2", name: "Oxygen saturation", unit: "%", color: "#8cbcff" },
  {
    code: "suit_pressure",
    name: "Suit pressure",
    unit: "kPa",
    color: "#c5a4f5",
  },
] as const;
const pages = [
  "Mission overview",
  "Telemetry history",
  "Equipment",
  "Simulator guide",
] as const;

function time(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour12: false,
    timeZone: "UTC",
  });
}
function label(value: string) {
  return value.replaceAll("_", " ");
}

function Trend({
  readings,
  color,
}: {
  readings: Observation[];
  color: string;
}) {
  const valid = readings.filter((r) => r.quality === "VALID").slice(-40);
  if (valid.length < 2)
    return <p className="chart-empty">Awaiting a second valid sample</p>;
  const low = Math.min(...valid.map((r) => r.value)) - 1;
  const high = Math.max(...valid.map((r) => r.value)) + 1;
  const first = Date.parse(valid[0].observed_at);
  const duration = Math.max(1, Date.parse(valid.at(-1)!.observed_at) - first);
  const points = valid
    .map(
      (r) =>
        `${((Date.parse(r.observed_at) - first) / duration) * 300},${65 - ((r.value - low) / (high - low)) * 55}`,
    )
    .join(" ");
  return (
    <figure className="trend">
      <svg
        viewBox="0 0 300 80"
        role="img"
        aria-label={`Synthetic trend from ${low + 1} to ${high - 1}; historical samples`}
      >
        <path d="M0 20H300 M0 45H300 M0 70H300" stroke="#243044" fill="none" />
        <polyline points={points} stroke={color} strokeWidth="2" fill="none" />
      </svg>
      <figcaption>
        {time(valid[0].observed_at)} — {time(valid.at(-1)!.observed_at)} ·
        auto-scaled
      </figcaption>
    </figure>
  );
}

export default function App() {
  const mission = useMission();
  const [page, setPage] = useState<(typeof pages)[number]>("Mission overview");
  const device = mission.devices[0];
  const latest = mission.observations.at(-1);
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#main"
          onClick={() => setPage("Mission overview")}
        >
          <span className="brand-mark">✳</span>
          <span>
            ASTRA<span className="brand-sub">HEALTH SYSTEMS</span>
          </span>
        </a>
        <div className="mission-tag">
          <span className="dot" /> LOCAL RESEARCH DEMO
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {pages.map((name, i) => (
            <button
              key={name}
              onClick={() => setPage(name)}
              aria-current={page === name ? "page" : undefined}
            >
              <span aria-hidden="true">{["◫", "⌁", "◇", "▷"][i]}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">PROTOTYPE 0.1</span>
          <p>
            One interface.
            <br />
            Traceable measurements.
          </p>
          <small>Synthetic identities and instruments only.</small>
        </div>
        <div className="local-status">
          <span className={`dot ${mission.connected ? "" : "muted"}`} />
          {mission.connected
            ? "Backend stream connected"
            : "Backend stream disconnected"}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Medical operations <span className="breadcrumb">/ {page}</span>
          </span>
          <div>
            <span className="badge demo">DEMO / SIMULATED</span>
            <time>{new Date(mission.now).toISOString().slice(11, 19)} UTC</time>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">CREW HEALTH · LOCAL WORKSPACE</p>
              <h1>{page}</h1>
              <p className="subtitle">
                A clear view of your crew, instruments, and incoming
                observations.
              </p>
            </div>
            <span className={`badge ${mission.connected ? "live" : "warning"}`}>
              {mission.connected ? "API CONNECTED" : "API DISCONNECTED"}
            </span>
          </div>
          <div className="notice">
            Research prototype · Synthetic data only · Not for medical decisions
            or hardware control.
          </div>
          {mission.error && (
            <div className="error" role="alert">
              Data unavailable: {mission.error}. Check the local API.
              Reconnection is automatic.
            </div>
          )}
          {mission.loading && (
            <p role="status">Connecting to the local backend…</p>
          )}
          {page === "Mission overview" && (
            <>
              <section className="crew-banner" aria-label="Selected crew">
                <div className="avatar" aria-hidden="true">
                  AM
                </div>
                <div>
                  <span className="eyebrow">SELECTED DEMO CREW</span>
                  <h2>
                    {mission.crew[0]?.display_name ??
                      "Crew profile unavailable"}
                  </h2>
                  <p>
                    {mission.crew[0]?.id ?? "NO DATA"} <span> / </span>{" "}
                    {mission.crew[0]?.mission_id ?? "NO MISSION DATA"}
                  </p>
                </div>
                <div className="banner-status">
                  <span className="badge">SIMULATED</span>
                  <small>
                    {latest
                      ? `Last observation ${time(latest.observed_at)} UTC`
                      : "No observations received"}
                  </small>
                </div>
              </section>
              <div className="section-heading">
                <h2>Live telemetry</h2>
                <span>Source: {device?.id ?? "NOT AVAILABLE"} · SIMULATED</span>
              </div>
              <section
                className="metrics"
                aria-label="Live synthetic measurements"
              >
                {metrics.map((metric) => {
                  const readings = mission.observations.filter(
                    (r) => r.code === metric.code,
                  );
                  const reading = readings.at(-1);
                  const status = displayState(
                    reading,
                    mission.connected,
                    mission.now,
                    mission.serverNow,
                    mission.health?.stale_seconds ?? 5,
                    mission.health?.disconnect_seconds ?? 15,
                  );
                  return (
                    <article
                      className="metric-card"
                      key={metric.code}
                      style={
                        {
                          "--metric-color": metric.color,
                        } as React.CSSProperties
                      }
                    >
                      <div className="metric-title">
                        <h3>{metric.name}</h3>
                        <span
                          className={`badge ${status === "LIVE" ? "live" : "warning"}`}
                        >
                          {label(status)}
                        </span>
                      </div>
                      <p
                        className={`reading ${status === "LIVE" ? "" : "historical"}`}
                      >
                        {reading?.quality === "VALID"
                          ? reading.value.toFixed(
                              metric.code === "suit_pressure" ? 1 : 0,
                            )
                          : "—"}
                        <span>{metric.unit}</span>
                      </p>
                      <Trend readings={readings} color={metric.color} />
                      <p className="metric-meta">
                        {reading
                          ? `${time(reading.observed_at)} UTC · ${reading.quality}`
                          : "NO DATA · Awaiting simulator"}
                      </p>
                      <p className="metric-meta">
                        SIMULATED · {reading?.device_id ?? "No source received"}
                      </p>
                      {status !== "LIVE" && reading && (
                        <p className="no-live">
                          Historical value · NO LIVE DATA
                        </p>
                      )}
                    </article>
                  );
                })}
              </section>
              <div className="lower-grid">
                <section className="panel">
                  <div className="section-heading">
                    <h2>Review queue</h2>
                    <span>{mission.alerts.length} simulated alerts</span>
                  </div>
                  <p className="panel-caption">
                    Demo fixtures ordered by priority. No diagnosis or treatment
                    advice.
                  </p>
                  {mission.alerts.length === 0 ? (
                    <div className="empty-state">
                      <span aria-hidden="true">◎</span>
                      <h3>No demo alerts recorded</h3>
                      <p>
                        {latest
                          ? "Accepted observations will appear here when a demo rule matches."
                          : "Awaiting telemetry. An empty queue does not indicate crew health."}
                      </p>
                    </div>
                  ) : (
                    <div className="alert-list">
                      {mission.alerts.slice(0, 20).map((alert) => (
                        <article
                          className={`alert priority-${alert.priority}`}
                          key={alert.id}
                        >
                          <div>
                            <span className="badge warning">
                              P{alert.priority} · {label(alert.severity)}
                            </span>
                            <time>{time(alert.occurred_at)} UTC</time>
                          </div>
                          <h3>{alert.message}</h3>
                          <p>
                            {label(alert.state)} · {alert.rule_version}
                          </p>
                          <details>
                            <summary>Inspect triggering evidence</summary>
                            <p>
                              Event: {alert.event_id}
                              <br />
                              Device: {alert.device_id}
                              <br />
                              Crew: {alert.astronaut_id}
                              <br />
                              Rule: {alert.rule_id}
                            </p>
                            {alert.evidence.map((e) => (
                              <p key={e.id}>
                                Observation #{e.id}: {e.code} = {e.value}{" "}
                                {e.unit}
                                <br />
                                {e.observed_at} · {e.quality} · SIMULATED
                              </p>
                            ))}
                          </details>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <h2>Instrument status</h2>
                    <span>01 REGISTERED</span>
                  </div>
                  <div className="device-icon" aria-hidden="true">
                    ◇
                  </div>
                  <h3>{device?.model ?? "Registry unavailable"}</h3>
                  <p className="muted-text">{device?.id ?? "NO DATA"}</p>
                  <dl>
                    <div>
                      <dt>Connection</dt>
                      <dd>
                        {mission.connected
                          ? label(device?.status ?? "NOT_AVAILABLE")
                          : "DISCONNECTED"}
                      </dd>
                    </div>
                    <div>
                      <dt>Calibration</dt>
                      <dd>
                        {label(device?.calibration ?? "CALIBRATION_UNKNOWN")}
                      </dd>
                    </div>
                    <div>
                      <dt>Last seen</dt>
                      <dd>
                        {device?.last_seen
                          ? `${time(device.last_seen)} UTC`
                          : "NEVER"}
                      </dd>
                    </div>
                    <div>
                      <dt>Ground synchronization</dt>
                      <dd>NOT IMPLEMENTED</dd>
                    </div>
                  </dl>
                  <button
                    className="text-button"
                    onClick={() => setPage("Equipment")}
                  >
                    Inspect instrument →
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "Telemetry history" && (
            <section className="panel">
              <h2>Accepted observation history</h2>
              <p className="panel-caption">
                Most recent 240 samples in this session. Original timestamps and
                quality are preserved.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Observed (UTC)",
                        "Sequence",
                        "Measurement",
                        "Value",
                        "Quality",
                        "Source / event",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...mission.observations].reverse().map((o) => (
                      <tr key={o.id}>
                        <td>{o.observed_at}</td>
                        <td>
                          {o.sequence}
                          {o.sequence_gap ? " · GAP" : ""}
                        </td>
                        <td>{o.code}</td>
                        <td>
                          {o.value} {o.unit}
                        </td>
                        <td>{o.quality}</td>
                        <td>
                          SIMULATED
                          <br />
                          <small>
                            {o.device_id} / {o.event_id}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!latest && (
                  <p className="empty-state">
                    NO DATA · Start the Rust simulator to create synthetic
                    observations.
                  </p>
                )}
              </div>
            </section>
          )}
          {page === "Equipment" && (
            <section className="panel">
              <h2>Virtual instrument registry</h2>
              <p>{device?.model ?? "Device registry unavailable"}</p>
              <dl>
                <div>
                  <dt>Device / crew association</dt>
                  <dd>{device?.id ?? "NO DATA"} / DEMO-CREW-001</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>SIMULATED</dd>
                </div>
                <div>
                  <dt>Connection</dt>
                  <dd>
                    {mission.connected
                      ? label(device?.status ?? "NOT_AVAILABLE")
                      : "DISCONNECTED"}
                  </dd>
                </div>
                <div>
                  <dt>Calibration</dt>
                  <dd>CALIBRATION UNKNOWN</dd>
                </div>
                <div>
                  <dt>Capabilities</dt>
                  <dd>{device?.capabilities?.join(", ") ?? "Unavailable"}</dd>
                </div>
              </dl>
              <p className="panel-caption">
                This software instrument publishes observations. It has no
                connection to medical equipment or life-support hardware.
              </p>
            </section>
          )}
          {page === "Simulator guide" && (
            <section className="panel guide">
              <h2>Run a reproducible demonstration</h2>
              <p>
                The Rust CLI owns synthetic acquisition. Run these from the
                repository root while the API is running.
              </p>
              <pre>
                <code>
                  cargo run --manifest-path simulator/Cargo.toml -- --scenario
                  normal --seed 42
                </code>
              </pre>
              <p>
                Stop with Ctrl+C, then inject a fixture at the sixth sample:
              </p>
              <pre>
                <code>
                  cargo run --manifest-path simulator/Cargo.toml -- --scenario
                  simultaneous_demo --count 8
                </code>
              </pre>
              <p>
                Other scenarios: <code>oxygen_drop_demo</code>,{" "}
                <code>pressure_anomaly_demo</code>,{" "}
                <code>sensor_disconnect</code>, <code>invalid_packet</code>.
              </p>
              <p>
                Sensor disconnect stops packets after five ticks. The UI marks
                data stale after {mission.health?.stale_seconds ?? 5}s and
                disconnected after {mission.health?.disconnect_seconds ?? 15}s.
                Backend restarts mark prior records HISTORICAL.
              </p>
              <p className="panel-caption">
                Seeded values are repeatable; event IDs and UTC timestamps
                identify each live run. Only one simulator should publish for
                this instrument at a time.
              </p>
            </section>
          )}
          <footer>
            ASTRA HEALTH{" "}
            <span>
              DEMO / SIMULATED · Local research prototype · No clinical
              validation
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
