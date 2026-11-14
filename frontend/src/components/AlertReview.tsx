import { useEffect, useRef, useState } from "react";
import type { Alert } from "../services/api";
import { NAMES, stamp } from "./medical";

const TITLES: Record<string, string> = {
  "pulse-rise-fixture": "Pulse rising",
  "respiratory-rise-fixture": "Breathing rate rising",
  "oxygen-fixture": "Oxygen falling",
  "pressure-fixture": "Suit pressure falling",
};

/** Native modal semantics keep the workspace inert; evidence stays available on demand. */
export function AlertReview({
  alert,
  crewName,
  pendingCount,
  busy,
  error,
  onMinimize,
  onAcknowledge,
}: {
  alert: Alert;
  crewName: string;
  pendingCount: number;
  busy: boolean;
  error: string;
  onMinimize: () => void;
  onAcknowledge: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const minimize = useRef<HTMLButtonElement>(null);
  const [flashing, setFlashing] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!preference) return;
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    // Never place opening focus on the acknowledgment action.
    minimize.current?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`alert-takeover priority-${alert.priority} ${flashing && !reducedMotion ? "is-flashing" : ""}`}
      role="alertdialog"
      aria-labelledby="takeover-title takeover-crew"
      aria-describedby="takeover-description"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          "button:not(:disabled), summary",
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onMinimize();
      }}
    >
      <div className="alert-takeover-content">
        <div className="alert-takeover-toolbar">
          <strong>SIMULATED · PRIORITY {alert.priority}</strong>
          <div className="button-row">
            <button ref={minimize} disabled={busy} onClick={onMinimize}>
              Minimize
            </button>
            {!reducedMotion && (
              <button onClick={() => setFlashing((value) => !value)}>
                {flashing ? "Stop flashing" : "Enable flashing"}
              </button>
            )}
          </div>
        </div>
        <header className="alert-takeover-heading">
          <span aria-hidden="true" className="alert-symbol">
            !
          </span>
          <div>
            <p id="takeover-crew">{crewName}</p>
            <h1 id="takeover-title">
              {TITLES[alert.rule_id] ?? "Telemetry anomaly"}
            </h1>
          </div>
        </header>
        <div className="alert-evidence-grid">
          {alert.evidence.map((item) => (
            <article key={item.id}>
              <h3>{NAMES[item.code]}</h3>
              <p className="alert-evidence-value">
                {item.value} <span>{item.unit}</span>
              </p>
            </article>
          ))}
        </div>
        <p id="takeover-description">
          At trigger · {stamp(alert.occurred_at)} · {pendingCount} pending
        </p>
        <details className="alert-details">
          <summary>Evidence</summary>
          <p>{alert.message}</p>
          <p>
            {stamp(alert.occurred_at, true)} · {alert.astronaut_id}
          </p>
          {alert.evidence.map((item) => (
            <p key={item.id}>
              {item.device_id} · {item.quality} at trigger ·{" "}
              {stamp(item.observed_at, true)}
            </p>
          ))}
          <p className="monospace">
            Rule {alert.rule_id} / {alert.rule_version} · Event {alert.event_id}
          </p>
          <p>
            SIMULATED test markers, not clinical limits. Minimize leaves the
            alert pending. Acknowledgment saves review, not resolution.
          </p>
        </details>
        {error && (
          <p className="alert-review-error" role="alert">
            Could not save: {error}. Retry acknowledgment.
          </p>
        )}
        <div className="alert-takeover-actions">
          <button disabled={busy} onClick={onAcknowledge}>
            {busy ? "Saving…" : "Acknowledge"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
