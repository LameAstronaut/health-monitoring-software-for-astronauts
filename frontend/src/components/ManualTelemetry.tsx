import { useState } from "react";
import type { ScreenProps } from "../screens/types";
import { Panel } from "./medical";
const FIELDS = [
  ["heart_rate", "Heart rate", "beats/min", 1000],
  ["respiratory_rate", "Respiratory rate", "breaths/min", 1000],
  ["spo2", "Oxygen saturation", "%", 100],
  ["suit_pressure", "Suit pressure", "kPa", 1000],
  ["systolic_bp", "Systolic pressure", "mmHg", 1000],
  ["diastolic_bp", "Diastolic pressure", "mmHg", 1000],
  ["sleep_duration", "Sleep duration", "h", 24],
] as const;
export function ManualTelemetry({
  mission,
  crewId,
  busy,
  action,
}: ScreenProps) {
  const control = mission.operations!.control;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map(([key]) => [
        key,
        control.astronaut_id === crewId && control.manual_values?.[key] != null
          ? String(control.manual_values[key])
          : "",
      ]),
    ),
  );
  const valid = FIELDS.every(
    ([key, , , max]) =>
      values[key] === "" ||
      (Number.isFinite(Number(values[key])) &&
        Number(values[key]) >= 0 &&
        Number(values[key]) <= max),
  );
  return (
    <Panel title="Manual telemetry editor">
      <p className="caption">
        Override published readings for the selected crew. Blank fields follow
        the model. Overrides hold until cleared, restarted, or the target crew
        changes. A valid zero vital triggers the terminal fixture; physiological
        overrides cannot revive it. Restart playback to reset. Other overrides
        leave ECG and physiology independent. Alert test markers are evaluated
        only in the ANOMALY scenario. Bounds are data representation limits, not
        clinical ranges. Sleep duration is the latest completed sleep period;
        zero sleep does not trigger the terminal fixture.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid)
            void action(
              "demo/control",
              {
                action: "CONFIGURE",
                expected_revision: control.revision,
                astronaut_id: crewId,
                manual_values: Object.fromEntries(
                  FIELDS.filter(([key]) => values[key] !== "").map(([key]) => [
                    key,
                    Number(values[key]),
                  ]),
                ),
              },
              "Manual readings applied; waiting for the next worker publication",
            );
        }}
      >
        <div className="manual-fields">
          {FIELDS.map(([key, label, unit, max]) => (
            <label className="field" key={key}>
              {label}{" "}
              <span className="caption">
                {unit} · 0–{max}
              </span>
              <input
                type="number"
                min="0"
                max={max}
                step="any"
                placeholder="Follow model"
                value={values[key]}
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <div className="button-row">
          <button className="primary-button" disabled={busy || !valid}>
            Apply readings
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (
                await action(
                  "demo/control",
                  {
                    action: "CONFIGURE",
                    expected_revision: control.revision,
                    manual_values: {},
                  },
                  "Automatic model readings restored",
                )
              )
                setValues(Object.fromEntries(FIELDS.map(([key]) => [key, ""])));
            }}
          >
            Clear all overrides
          </button>
        </div>
        <p className="caption">
          {control.astronaut_id === crewId &&
          Object.values(control.manual_values ?? {}).some((v) => v != null)
            ? "Manual overrides active for this crew."
            : "This crew currently follows the model."}{" "}
          Paused or disconnected workers publish no readings.
        </p>
      </form>
    </Panel>
  );
}
