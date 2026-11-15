import { useState } from "react";
import { elapsed, Empty, Panel, stamp, Status } from "../components/medical";
import type { ScreenProps } from "./types";
import { MetricGrid } from "./monitoring";

export function Nutrition({ mission, crewId, busy, action }: ScreenProps) {
  const [foodId, setFoodId] = useState("oats");
  const [servings, setServings] = useState(1);
  const [today, setToday] = useState(true);
  const inventory = mission.operations?.inventory ?? [];
  const day = new Date(mission.serverNow).toISOString().slice(0, 10);
  const meals =
    mission.operations?.meals.filter(
      (m) =>
        m.astronaut_id === crewId && (!today || m.logged_at.startsWith(day)),
    ) ?? [];
  const totals = { kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0 };
  for (const meal of meals)
    for (const key of Object.keys(totals) as (keyof typeof totals)[])
      totals[key] += meal[key];
  return (
    <div className="screen-stack">
      <div className="summary-grid">
        {Object.entries(totals).map(([key, value]) => (
          <div className="summary-tile" key={key}>
            <p>
              {key === "kcal"
                ? "Recorded energy"
                : key.replace("_g", "").replace("carbohydrate", "Carbohydrate")}
            </p>
            <strong>
              {Math.round(value)}
              <span>{key === "kcal" ? "kcal" : "g"}</span>
            </strong>
          </div>
        ))}
      </div>
      <p className="caption">
        {today ? "Today’s" : "All recorded"} synthetic intake for the selected
        crew. These totals are not recommended nutritional targets.
      </p>
      <div className="two-columns">
        <Panel title="Log a synthetic meal">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                "nutrition/meals",
                { astronaut_id: crewId, food_id: foodId, servings },
                "Meal logged and inventory updated",
              );
            }}
          >
            <label className="field">
              Inventory item
              <select
                value={foodId}
                onChange={(e) => setFoodId(e.target.value)}
                disabled={busy || !inventory.length}
              >
                {inventory.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} · {item.servings} servings left
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Servings
              <input
                type="number"
                min="0.25"
                max="5"
                step="0.25"
                value={servings}
                onChange={(e) => setServings(Number(e.target.value))}
              />
            </label>
            <button
              className="primary-button"
              disabled={
                busy || !inventory.length || servings < 0.25 || servings > 5
              }
            >
              Log meal
            </button>
          </form>
          <p className="caption">
            Nutrient values are demonstration food records. Each meal stores a
            snapshot and decrements inventory in one transaction.
          </p>
        </Panel>
        <Panel title="Food inventory">
          <div className="inventory-list">
            {inventory.map((item) => (
              <article key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  <p>
                    {item.kcal} kcal · {item.protein_g} g protein / serving
                  </p>
                  <p>Demo expiry {item.expires_at} · SIMULATED</p>
                </div>
                <strong>
                  {item.servings}
                  <span>servings</span>
                </strong>
              </article>
            ))}
          </div>
        </Panel>
      </div>
      <Panel
        title="Meal history"
        action={
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={today}
              onChange={(e) => setToday(e.target.checked)}
            />
            Today only
          </label>
        }
      >
        {!meals.length ? (
          <Empty title="No meals recorded for this period">
            Log a synthetic meal to populate the nutrient summary and history.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Logged · UTC</th>
                  <th>Meal</th>
                  <th>Servings</th>
                  <th>Energy</th>
                  <th>Protein / carbohydrate / fat</th>
                </tr>
              </thead>
              <tbody>
                {meals.map((meal) => (
                  <tr key={meal.id}>
                    <td>{stamp(meal.logged_at, true)}</td>
                    <td>
                      {meal.food_name}
                      <small>SIMULATED</small>
                    </td>
                    <td>{meal.servings}</td>
                    <td>{meal.kcal} kcal</td>
                    <td>
                      {meal.protein_g} / {meal.carbohydrate_g} / {meal.fat_g} g
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function Fitness({
  mission,
  crewId,
  busy,
  action,
  navigate,
}: ScreenProps) {
  const [activity, setActivity] = useState("CYCLE");
  const [minutes, setMinutes] = useState(20);
  const sessions =
    mission.operations?.fitness.filter((s) => s.astronaut_id === crewId) ?? [];
  const active = sessions.find((s) => s.status === "ACTIVE");
  const readings = mission.observations.filter(
    (r) => r.code === "heart_rate" && !r.examination_id,
  );
  return (
    <div className="screen-stack">
      <div className="two-columns">
        <Panel
          title="Exercise session"
          action={active && <Status value="ACTIVE" />}
        >
          {active ? (
            <div className="active-session">
              <p>
                {active.activity} · {active.planned_minutes} planned minutes
              </p>
              <strong>
                {elapsed(
                  (mission.serverNow - Date.parse(active.started_at)) / 1000,
                )}
              </strong>
              <p>
                Wall-clock session duration · Started {stamp(active.started_at)}
              </p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void action(
                    `fitness/sessions/${active.id}/finish`,
                    undefined,
                    "Exercise completed; recovery scenario requested",
                  )
                }
              >
                Finish session & recover
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(
                  "fitness/sessions",
                  { astronaut_id: crewId, activity, planned_minutes: minutes },
                  "Exercise session started; gradual demand scenario requested",
                );
              }}
            >
              <label className="field">
                Activity
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                >
                  <option value="CYCLE">Cycle ergometer demo</option>
                  <option value="TREADMILL">Treadmill demo</option>
                  <option value="RESISTANCE">Resistance exercise demo</option>
                </select>
              </label>
              <label className="field">
                Planned duration · minutes
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </label>
              <button
                className="primary-button"
                disabled={busy || minutes < 1 || minutes > 120}
              >
                Start exercise session
              </button>
            </form>
          )}
          <p className="caption">
            Starting a session requests EXERCISE for this crew. Finishing
            requests RECOVERY. This is a generic workload fixture, not an
            exercise prescription.
          </p>
        </Panel>
        <Panel title="Response monitor">
          <div className="large-stat">
            {readings.at(-1)?.value.toFixed(0) ?? "—"}
            <span>beats/min · last recorded</span>
          </div>
          <p className="caption">
            Heart rate and respiration respond gradually to the active scenario.
            VO₂, strength and workload sensors are not modeled.
          </p>
          <button onClick={() => navigate("Live monitoring")}>
            Open physiological trends
          </button>
        </Panel>
      </div>
      <Panel title="Performance history">
        {!sessions.length ? (
          <Empty title="No exercise sessions recorded">
            Start and finish a demonstration session to create a durable
            history.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Activity</th>
                  <th>Duration</th>
                  <th>Peak recorded HR</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{stamp(s.started_at, true)}</td>
                    <td>
                      {s.activity}
                      <small>SIMULATED</small>
                    </td>
                    <td>{elapsed(s.duration_seconds ?? 0)}</td>
                    <td>
                      {s.peak_heart_rate
                        ? `${s.peak_heart_rate.toFixed(0)} beats/min`
                        : "Unavailable"}
                    </td>
                    <td>
                      <Status value={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function EvaOperations(props: ScreenProps) {
  const [pendingChecks, setPendingChecks] = useState<Record<string, boolean>>(
    {},
  );
  const { mission, crewId, busy, action } = props;
  const sessions =
    mission.operations?.eva.filter((s) => s.astronaut_id === crewId) ?? [];
  const active = sessions.find((s) => s.status !== "COMPLETED");
  const current = active ?? sessions[0];
  return (
    <div className="screen-stack">
      <div className="info-banner">
        EVA operations concept · SIMULATED ONLY. The checklist demonstrates
        software workflow and is not an approved EVA procedure.
      </div>
      <MetricGrid {...props} />
      <div className="two-columns">
        <Panel
          title="Procedural checklist"
          action={current && <Status value={current.status} />}
        >
          {!active && (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void action(
                  "eva/sessions",
                  { astronaut_id: crewId },
                  "EVA demonstration prepared",
                )
              }
            >
              Prepare EVA demonstration
            </button>
          )}
          {current ? (
            <>
              <div className="checklist">
                {current.checklist.map((step) => (
                  <label className="checkbox-label" key={step.id}>
                    <input
                      type="checkbox"
                      disabled={busy || current.status !== "PREPARATION"}
                      checked={
                        pendingChecks[`${current.id}:${step.id}`] ??
                        step.complete ??
                        false
                      }
                      onChange={(e) => {
                        const key = `${current.id}:${step.id}`;
                        const checked = e.target.checked;
                        setPendingChecks((old) => ({ ...old, [key]: checked }));
                        void action(`eva/sessions/${current.id}/actions`, {
                          action: "CHECK",
                          step_id: step.id,
                          complete: checked,
                        }).then(() =>
                          setPendingChecks((old) => {
                            const next = { ...old };
                            delete next[key];
                            return next;
                          }),
                        );
                      }}
                    />
                    <span>{step.label}</span>
                  </label>
                ))}
              </div>
              {current.status === "PREPARATION" && (
                <button
                  className="primary-button"
                  disabled={busy || !current.checklist.every((s) => s.complete)}
                  onClick={() =>
                    void action(
                      `eva/sessions/${current.id}/actions`,
                      { action: "START" },
                      "EVA demo timeline started",
                    )
                  }
                >
                  Start EVA demonstration
                </button>
              )}
              {current.status === "ACTIVE" && (
                <button
                  disabled={busy}
                  className="primary-button"
                  onClick={() =>
                    void action(
                      `eva/sessions/${current.id}/actions`,
                      { action: "COMPLETE" },
                      "EVA demonstration completed",
                    )
                  }
                >
                  Complete EVA demonstration
                </button>
              )}
            </>
          ) : (
            <Empty title="No EVA session prepared">
              Prepare a session, complete the checklist, and start a synthetic
              timeline with live suit telemetry.
            </Empty>
          )}
        </Panel>
        <Panel title="Session timeline">
          {current ? (
            <>
              <p className="caption">{current.id}</p>
              <ol className="timeline">
                {current.timeline.map((event, i) => (
                  <li key={i}>
                    <time>{stamp(event.at)}</time>
                    <p>{event.description}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <Empty title="No timeline yet">
              Session and checklist actions will be timestamped and persisted
              here.
            </Empty>
          )}
        </Panel>
      </div>
      <Panel title="EVA history">
        {sessions.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{stamp(s.created_at, true)}</td>
                    <td>{stamp(s.started_at)}</td>
                    <td>{stamp(s.completed_at)}</td>
                    <td>
                      <Status value={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="caption">
            No synthetic EVA records. No physical life-support controls are
            present.
          </p>
        )}
      </Panel>
    </div>
  );
}
