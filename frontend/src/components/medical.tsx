import type { ReactNode } from "react";
import type { Observation, WaveformReading } from "../services/api";
import { displayState } from "../telemetry";

export const METRICS = [
  {
    code: "heart_rate",
    label: "Heart rate",
    unit: "beats/min",
    range: [40, 160],
    color: "#087f8c",
  },
  {
    code: "respiratory_rate",
    label: "Respiratory rate",
    unit: "breaths/min",
    range: [0, 60],
    color: "#5265bf",
  },
  {
    code: "spo2",
    label: "Oxygen saturation",
    unit: "%",
    range: [80, 100],
    color: "#047d63",
  },
  {
    code: "suit_pressure",
    label: "Suit pressure",
    unit: "kPa",
    range: [15, 35],
    color: "#8759ab",
  },
  {
    code: "systolic_bp",
    label: "Systolic pressure",
    unit: "mmHg",
    range: [80, 180],
    color: "#b45465",
  },
  {
    code: "diastolic_bp",
    label: "Diastolic pressure",
    unit: "mmHg",
    range: [40, 110],
    color: "#a46b24",
  },
  {
    code: "sleep_duration",
    label: "Sleep duration",
    unit: "h",
    range: [0, 24],
    color: "#6653a3",
  },
] as const;
export const NAMES: Record<string, string> = {
  heart_rate: "Heart rate",
  respiratory_rate: "Respiratory rate",
  spo2: "Oxygen saturation",
  suit_pressure: "Suit pressure",
  systolic_bp: "Systolic pressure",
  diastolic_bp: "Diastolic pressure",
  sleep_duration: "Sleep duration",
  wbc: "White blood cell count",
  hemoglobin: "Hemoglobin",
  bone_density: "Bone mineral density",
  body_temperature: "Body temperature",
};
export function stamp(value: string | undefined | null, date = false) {
  if (!value) return "Not recorded";
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      ...(date ? ({ month: "short", day: "2-digit" } as const) : {}),
    }).format(new Date(value)) + " UTC"
  );
}
export function elapsed(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`status status-${value.toLowerCase().replaceAll("_", "-")}`}
    >
      <span aria-hidden="true" />
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Panel({
  title,
  children,
  action,
  className = "",
  id,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`panel ${className}`} id={id}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({
  title = "No data available",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol" aria-hidden="true">
        ◇
      </span>
      <h3>{title}</h3>
      <p>
        {children ??
          "Start simulated acquisition to populate this view. No replacement readings are generated."}
      </p>
    </div>
  );
}
export function MetricCard({
  code,
  reading,
  connected,
  now,
  serverNow,
  stale = 5,
  disconnect = 15,
  deviceStatus,
  baseline,
  recovering = false,
  deceased = false,
}: {
  code: string;
  reading?: Observation;
  connected: boolean;
  now: number;
  serverNow: number;
  stale?: number;
  disconnect?: number;
  deviceStatus?: string;
  baseline?: number;
  recovering?: boolean;
  deceased?: boolean;
}) {
  const metric = METRICS.find((m) => m.code === code)!;
  let status = displayState(
    reading,
    connected,
    now,
    serverNow,
    stale,
    disconnect,
  );
  if (deviceStatus === "ERROR" || deviceStatus === "DISCONNECTED")
    status = deviceStatus;
  const live = status === "LIVE";
  const noOxygenSignal = deceased && code === "spo2";
  const terminalVital =
    deceased && code !== "suit_pressure" && code !== "sleep_duration";
  if (live && terminalVital) status = "DECEASED";
  if (live && code === "sleep_duration") status = "RECORDED";
  if (noOxygenSignal && status === "INVALID") status = "NO_SIGNAL";
  return (
    <article
      className={`metric-card ${recovering ? "is-recovering" : ""}`}
      style={{ "--metric-color": metric.color } as React.CSSProperties}
    >
      {recovering && (
        <p className="recovery-note">
          Acknowledged · awaiting baseline recovery
        </p>
      )}
      <div className="metric-heading">
        <h3>{metric.label}</h3>
        <Status value={status} />
      </div>
      <div className={`metric-value ${status !== "LIVE" ? "last-known" : ""}`}>
        {reading?.quality === "VALID"
          ? reading.value.toFixed(code === "heart_rate" ? 0 : 1)
          : "—"}
        <span>{metric.unit}</span>
      </div>
      <p>
        {reading ? stamp(reading.observed_at) : "Awaiting first observation"} ·{" "}
        {reading?.quality ?? "NO DATA"}
      </p>
      <p className="source-line">
        SIMULATED · {reading?.device_id ?? "No source received"}
      </p>
      {noOxygenSignal ? (
        <p className="last-known-label">No pulsatile signal · SIMULATED</p>
      ) : !live && reading ? (
        <p className="last-known-label">Last known value · NO LIVE DATA</p>
      ) : code === "sleep_duration" ? (
        <p className="baseline-note">
          Latest completed sleep period · SIMULATED
        </p>
      ) : terminalVital ? (
        <p className="baseline-note">
          Terminal fixture · restart playback to reset
        </p>
      ) : (
        baseline !== undefined && (
          <p className="baseline-note">
            Fixture baseline {baseline} {metric.unit}
          </p>
        )
      )}
    </article>
  );
}
export function TrendChart({
  readings,
  code,
  minutes = 5,
}: {
  readings: Observation[];
  code: string;
  minutes?: number;
}) {
  const metric = METRICS.find((m) => m.code === code);
  const filtered = readings.filter(
    (r) => r.code === code && r.quality === "VALID",
  );
  const latest = filtered.at(-1);
  const currentRun = metric
    ? filtered.filter((r) => r.run_id === latest?.run_id)
    : filtered;
  const points = latest
    ? currentRun.filter(
        (r) =>
          Date.parse(r.observed_at) >=
          Date.parse(latest.observed_at) - minutes * 60000,
      )
    : [];
  if (points.length < 2)
    return (
      <Empty title="Trend awaiting samples">
        Two valid, timestamped observations are needed. Existing values retain
        their source and quality.
      </Empty>
    );
  const values = points.map((p) => p.value);
  const low = Math.min(metric?.range[0] ?? Math.min(...values) - 1, ...values);
  const high = Math.max(metric?.range[1] ?? Math.max(...values) + 1, ...values);
  const begin = Date.parse(points[0].observed_at);
  const span = Math.max(Date.parse(points.at(-1)!.observed_at) - begin, 1000);
  const xy = points
    .map(
      (p) =>
        `${56 + ((Date.parse(p.observed_at) - begin) / span) * 640},${200 - ((p.value - low) / (high - low)) * 168}`,
    )
    .join(" ");
  return (
    <figure className="trend-chart">
      <div className="chart-summary">
        <span>
          Observed range{" "}
          <strong>
            {Math.min(...values).toFixed(1)}–{Math.max(...values).toFixed(1)}{" "}
            {points[0].unit}
          </strong>
        </span>
        <span>{points.length} valid samples · SIMULATED</span>
      </div>
      <svg
        viewBox="0 0 720 225"
        role="img"
        aria-label={`${NAMES[code]} trend with UTC time axis; range ${low} to ${high} ${points[0].unit}`}
      >
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="56"
              x2="696"
              y1={32 + i * 56}
              y2={32 + i * 56}
              stroke="#dae3ea"
              strokeDasharray="4 5"
            />
            <text x="46" y={38 + i * 56} textAnchor="end">
              {(high - ((high - low) * i) / 3).toFixed(0)}
            </text>
          </g>
        ))}
        <polyline
          points={xy}
          fill="none"
          stroke={metric?.color ?? "#087f8c"}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
      <figcaption>
        <span>{stamp(points[0].observed_at)}</span>
        <span>Source time · {points[0].unit}</span>
        <span>{stamp(points.at(-1)!.observed_at)}</span>
      </figcaption>
    </figure>
  );
}
export function EcgChart({
  chunks,
  connected,
  serverNow = Date.now(),
  stale = 5,
  disconnect = 15,
  deceased = false,
}: {
  deceased?: boolean;
  chunks: WaveformReading[];
  connected: boolean;
  serverNow?: number;
  stale?: number;
  disconnect?: number;
}) {
  const latest = chunks.at(-1);
  const candidates = latest
    ? chunks.filter((c) => c.run_id === latest.run_id && c.quality === "VALID")
    : [];
  const valid: WaveformReading[] = [];
  for (const candidate of [...candidates].reverse()) {
    const next = valid[0];
    const end =
      candidate.waveform.start_simulated_at +
      candidate.waveform.samples.length / 125;
    if (next && Math.abs(end - next.waveform.start_simulated_at) > 0.02) break;
    valid.unshift(candidate);
  }
  const samples = valid.flatMap((c) => c.waveform.samples).slice(-1000);
  if (samples.length < 2 || !latest)
    return (
      <Empty title="ECG waveform unavailable">
        The Rust worker produces a separate synthetic lead at 125 Hz. Numeric
        heart rate is not used to fabricate a waveform in the UI.
      </Empty>
    );
  const xy = samples
    .map(
      (value, i) => `${(i / (samples.length - 1)) * 720},${108 - value * 64}`,
    )
    .join(" ");
  const age =
    Math.max(
      serverNow - Date.parse(latest.observed_at),
      serverNow - Date.parse(latest.received_at),
    ) / 1000;
  const status = !connected
    ? "DISCONNECTED"
    : latest.freshness === "HISTORICAL"
      ? "HISTORICAL"
      : latest.quality === "INVALID"
        ? "INVALID"
        : age > disconnect
          ? "DISCONNECTED"
          : age > stale
            ? "STALE"
            : latest.freshness;
  return (
    <figure className="ecg-chart">
      <div className="chart-summary">
        <span>DEMO-II · 125 Hz · mV</span>
        <Status value={deceased && status === "LIVE" ? "DECEASED" : status} />
      </div>
      {deceased && <p>Terminal fixture · ECG from simulator</p>}
      <svg
        viewBox="0 0 720 180"
        role="img"
        aria-label="Synthetic ECG waveform in millivolts; demonstration shape, not diagnostically validated"
      >
        <defs>
          <pattern
            id="ecg-grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="#c9e2dd"
              strokeWidth="0.7"
            />
          </pattern>
        </defs>
        <rect width="720" height="180" fill="url(#ecg-grid)" />
        <polyline
          points={xy}
          stroke={status === "LIVE" ? "#087b67" : "#778493"}
          strokeWidth="1.7"
          fill="none"
        />
      </svg>
      <figcaption>
        <span>
          {(samples.length / 125).toFixed(1)} simulated seconds · no sweep
          animation
        </span>
        <span>{stamp(latest.observed_at)} · SIMULATED</span>
      </figcaption>
    </figure>
  );
}
