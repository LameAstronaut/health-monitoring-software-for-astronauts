# Stateful physiological demonstration, model v2 — acute-onset revision

This is an artificial, simplified test model. It is **not clinically validated, not
astronaut-specific, and not an instrument emulator suitable for diagnosis**. No NASA
approval or operational limit is claimed. Its purpose is to exercise coherent data flow,
examinations, transitions, freshness and reproducible failure scenarios on a laptop.

## Individual state and clocks

The three synthetic identities start with different fixture baselines:

| Identity | HR (beats/min) | Respiratory rate (breaths/min) | SpO₂ (%) | Suit pressure (kPa) |
| --- | --- | --- | --- | --- |
| DEMO-CREW-001 | 68 | 13 | 98.2 | 30 |
| DEMO-CREW-002 | 72 | 14 | 98.2 | 30 |
| DEMO-CREW-003 | 64 | 12 | 98.2 | 30 |

These are selected constants, not medically established targets. The seed determines
the phase of deterministic breathing variation and slower drift. There is no independently chosen random
number for each measurement. Each crew has a separate persistent Rust state: HR, RR,
SpO₂, pressure, activity, logical tick count, ECG phase, seed and crew index.

Three clocks are distinct:

- The physiological model integrates every 0.04 simulated seconds (25 Hz).
- ECG samples are generated every 0.008 simulated seconds (125 Hz), with continuous phase.
- Numeric summaries and waveform chunks are published at the nominal CLI rate (default 1 Hz in
  wall time). React batches stream events at 4 Hz; it does not synthesize sensor values.

HTTP/storage overhead can reduce the achieved publication cadence. This is not a real-time
or high-fidelity simulator; actual source and receipt times remain visible.

Speed changes the number of logical samples advanced per wall-clock interval. Source and
receipt timestamps remain actual UTC. `simulated_at` and waveform sample offsets carry
logical time separately, so accelerated playback cannot create future UTC observations.

## Simplified dynamics

Every state approaches a target using `x += clamp((target-x)*(1-exp(-dt/tau)), -rate*dt, rate*dt)`.
All parameters below are demonstration settings, not measured response coefficients.

- REST: HR follows a seeded 24 s drift (4 beats/min amplitude) and a breathing-rate
  oscillation (0.8 beats/min amplitude), plus a 7.3 s rhythm (0.6 beats/min).
  Resting response uses a 1.8 s lag and a 1.8 beats/min/s rate bound.
- EXERCISE: target HR is baseline +65 beats/min; response time constant is 25 s,
  with a maximum change of 1.8 beats/min per simulated second.
- RECOVERY: HR returns toward its varying baseline with a 35 s time constant.
- RR target is baseline RR +0.18×positive HR elevation +0.8 when exercising,
  plus seeded 11 s drift, shared breathing, and a 7.3 s rhythm. Its normal lag is 2.2 s,
  with a 0.6 breaths/min/s rate bound.
- SpO₂ approaches 98.2%, or 0.3 percentage points lower during exercise, plus
  shared drift/breathing amplitudes of 0.45/0.2 percentage points and a 0.1-point
  faster rhythm, with a 2.5 s lag and a 0.2 percentage-point/s rate bound.
- Suit pressure approaches 30 kPa with shared drift/breathing amplitudes of
  0.22/0.1 kPa plus a 0.04 kPa faster rhythm, a 2 s lag, and a 0.18 kPa/s rate bound.
- Systolic/diastolic pressure follow positive HR load (0.55/0.08 mmHg per beat/min),
  plus shared drift/breathing variation of up to 5/2.5 mmHg. Their lags are 2.4/2.8 s,
  with rate bounds of 1.8/0.8 mmHg/s. These are illustrative coefficients only.
- ANOMALY applies explicit oxygen/pressure fixture targets of 86% and 20 kPa. Transitions
  remain gradual. It does not model the physiological consequences of actual hypoxia or
  decompression. Other crew members continue their independent REST states.
- PULSE_DECREASE lowers the selected crew's target HR by 35 beats/min with an 8 s
  lag and a 2 beats/min/s rate cap. It preserves continuous ECG phase and returns
  toward baseline when cleared.
- PULSE_SURGE adds 65 beats/min to the selected crew's target HR without exercise workload;
  respiration follows the usual HR coupling. RESPIRATORY_SURGE adds 22 breaths/min to the
  RR target and 20 beats/min to HR. MULTI_SYSTEM combines pulse, respiratory, oxygen and
  pressure fixtures. Acute onset uses the distinct lags and bounds below. All preserve
  continuous state, seeded drift and checkpoint behavior. These are artificial stress-test
  trajectories, not disease or arrhythmia models.

| Active acute fixture | State | Time constant | Maximum rate per simulated second |
| --- | --- | --- | --- |
| Pulse rise / combined | HR | 8 s | 4 beats/min/s |
| Pulse decrease | HR | 8 s | 2 beats/min/s |
| Respiratory rise without pulse rise | HR | 10 s | 1.8 beats/min/s |
| Respiratory rise / combined | RR | 8 s | 1 breath/min/s |
| Pulse rise without respiratory rise | RR (coupled to HR) | 10 s | 0.8 breaths/min/s |
| Oxygen decrease / combined | SpO₂ | 12 s | 0.5 percentage points/s |
| Pressure decrease / combined | Pressure | 9 s | 0.6 kPa/s |

Acute curves reach their markers within 20 simulated seconds from each crew baseline.
Tests check onset, per-integration-step rate bounds, and at least two simulated seconds
between entering an early-warning band and reaching its marker. Integration remains
25 Hz, ECG sampling 125 Hz, and default publication 1 Hz. These are illustrative
engineering settings. Restart the worker after updates; historical samples retain their
original values.

Synthetic alert markers are SpO₂ <=92%, HR >=115 beats/min and HR <=45 beats/min (priority 2), and pressure
<=25 kPa and RR >=26 breaths/min (priority 1),
only in explicit ANOMALY scenarios and only for valid, fresh observations. These arbitrary
markers are **not clinical or suit operating limits**. Alerts are deduplicated by rule,
crew and playback run while pending or continuously abnormal. After acknowledgment
and a valid continuous sample within the crew's baseline recovery band, a subsequent
anomaly can create a new alert in the same run. Recovery samples must be fresh when
received and belong to the same crew and run. Invalid, stale, examination and other-run
samples do not rearm an alert. Acknowledgment is a demo operator action, not a clinical review.
Every new alert opens full screen for any crew member; priority 1 takes precedence. The
initial view shows only the crew, anomaly name, triggering value, time and controls. Exact
provenance and the original message remain under Evidence and in alert history. The warning background alternates red/cyan at two cycles per second. Stop flashing
turns it off without acknowledging; the operating system's reduced-motion preference disables
it automatically. Minimizing or Escape leaves the record pending with a red banner; reloading
shows pending alerts again. Only explicit acknowledgment changes persisted state.
Priorities are presentation test fixtures, not a validated medical urgency ranking.

The ECG shape is a sum of simple Gaussian bumps with a small sinusoidal component.
It has no diagnostic morphology, arrhythmia interpretation, electrode or noise model.
It is generated independently of numerical publication and never fabricated by the UI.

## Playback and event-based results

`make dev` starts Rust with `--controlled`: it polls durable API controls for the target
crew, REST/EXERCISE/RECOVERY/ANOMALY, seed, 0.25–4× speed, pause/resume and injected faults.
Commands use revision checks. A worker heartbeat distinguishes desired configuration
from an observed worker state. A paused worker sends heartbeats but no fresh readings,
and logical time does not advance. Disconnect and invalid-quality faults stay visible.

Accepted packets store the full model checkpoint. Restarting Rust restores each matching
run checkpoint and continues durable device sequences. Restarting playback creates a new
run and resets state from the seed; it preserves examination/history records. API restart
marks old telemetry HISTORICAL and pauses playback until explicitly resumed. At most the
uncommitted in-flight interval can be lost after a worker crash; there is no durable sender queue.

The same seed, initial state and logical control schedule reproduce the same model samples.
IDs and UTC timestamps deliberately identify each real run and differ. Manual button timing
is not an identical logical schedule across runs; use the fixed-scenario CLI or tests for
exact reproducibility. Speed affects logical time, not the model's integration step size.

Systolic and diastolic pressure are continuously simulated in mmHg, with per-crew baselines
of 118/76, 120/77 and 122/78. They follow modeled heart-rate load with smooth lags and
return toward baseline during recovery. They support manual overrides and checkpoint replay.
These are illustrative dynamics, not validated cardiovascular predictions.

Examination blood pressure, WBC/hemoglobin and bone density are fixed per-crew report fixtures,
generated by Rust **only for an explicit pending examination**. They are absent from the
continuous loop. Acquisition → validated REVIEW → explicit SAVE is durable and traceable
to crew, instrument, source timestamp and raw event. Static reports do not drift when the
model runs, pauses, changes speed or enters exercise. Validated BP/exercise coupling, changing
laboratory values, bone remodeling and medical interpretation are deliberately unmodeled.

## Verification and limits

Rust tests check resting stability, bounded exercise/recovery changes, correlated respiration,
seed/chunk determinism, checkpoint restoration, waveform separation and static report invariance.
Backend tests check schemas, provenance, sequence, persistence, controls and examination lifecycle.
Browser tests exercise the real Rust → FastAPI → React workflows and screen sizes.

This does not validate physiology, ECG accuracy, clinical thresholds, physical instruments,
human performance, target hardware fidelity or medical outcomes. All real-device adapters,
clinical rules, roles and assurance would require a separately reviewed integration effort.


## Early warnings and smoother transitions

The UI shows a compact amber warning for fresh, valid ANOMALY readings before a
full alert: SpO₂ above 92 through 96%, suit pressure above 25 through 28 kPa,
heart rate from 100 to below 115 beats/min (rising) or above 45 through 55 beats/min
(falling), and respiratory rate from 20 to below
26 breaths/min. These are demonstration bands, not clinical danger zones.
Warnings clear outside the band or on loss of live valid data. Full anomaly alerts
continue to use the backend markers and retain their review workflow.


## ECG morphology and recovery indicators

The Rust ECG uses circular P–QRS–T components with asymmetric P/T shapes, a stable
QRS duration, rate-dependent P/T spacing, subtle respiratory amplitude modulation,
baseline wander and low-amplitude deterministic texture. Phase is continuous and
replay/checkpoint behavior stays exact. This is an illustrative morphology model,
not a diagnostic lead or an implementation of the validated ECGSYN generator.
The design is informed by the component timing and variability discussed in
[McSharry et al., synthetic ECG generation](https://archive.physionet.org/physiotools/ecgsyn/paper/).

Crew summaries select the latest continuous observation for each code, including
all six vitals and completed sleep duration, and retain older code-specific
readings after partial packets. Publications are not truncated to four observations.

Acknowledged alerts keep the corresponding vital card highlighted until a valid
recovery sample is observed with live telemetry. Baseline bands allow ordinary
simulated fluctuation: HR ±4 beats/min, RR ±1.5 breaths/min, SpO₂ ±0.7 percentage
points, suit pressure ±0.35 kPa, systolic ±5 mmHg and diastolic ±3 mmHg. These are
UI recovery bands, not clinical criteria. Recovery is remembered locally across
page reloads, and prior playback runs do not highlight the current run. Cards
alternate the same red (#b00020) and cyan (#4fffdf) as the alert screen twice per
second, with white/dark text for contrast; reduced motion uses a static red highlight.
The full-screen acknowledgment footer inherits the animated alert background,
and the full-screen Evidence disclosure has been removed.


## Suit-pressure refill

Clearing a pressure fault (including combined faults) enables a faster synthetic
refill while suit pressure is below 29.5 kPa: a 0.8 s lag and a 4 kPa/s rate cap.
Near baseline, the ordinary 2 s lag and 0.18 kPa/s cap resume. Pressure stays
continuous, without snapping to baseline; the pressure-drop behavior is unchanged.
This is a demonstration response, not a physical suit pump model. Tests verify
recovery to within 0.35 kPa of baseline within eight simulated seconds across
all crew, several seeds, and each pressure-related fault.


## Fault application and connection warnings

The Fault injection selector stages a choice. Apply fault submits the selected
fault, target crew and current control revision; choosing None also requires Apply.
Failed applications retain the staged choice, while the applied-fault label
continues to reflect the backend state.

Early yellow warnings require a matching active anomaly fault (or manual override)
and disappear when that fault is cleared or the latest readings move toward baseline.
Recovery-card highlights and persisted anomaly review records remain independent.

A separate red connection warning identifies disconnected continuous sensors,
affected crew, last receipt time and reconnection steps. It also detects expired
telemetry when a device status update is delayed. Backend stream loss is reported
as a telemetry connection loss, not proof that individual sensors disconnected.
Intentional pauses do not produce sensor-disconnection warnings; explicitly injected
disconnections and quality errors remain visible.


## Simulated deceased status

A fresh, valid continuous reading of exactly zero for heart rate, respiratory rate,
oxygen saturation, suit pressure, systolic pressure or diastolic pressure marks
only the affected crew member DECEASED in the mission dashboard crew strip,
replacing LIVE. These are synthetic scenario markers, not medical death criteria.
Historical, stale, invalid, disconnected, examination and previous-run samples do
not trigger this status. The latest reading for each crew/metric takes precedence.

The status remains for the current playback run, including navigation between
screens and later telemetry loss. Restarting seeded playback clears it for the
new run. The dashboard and simulator controls stay usable. There is no ending
screen, fade, or automatic restart prompt.


## Consistent terminal physiology fixture

The Rust worker now latches `deceased` in each crew's model checkpoint when a
valid zero vital triggers the existing terminal fixture. Invalid-quality and
disconnected sensor fixtures cannot trigger it. This illustrative fixture chooses
absent electrical cardiac activity: HR becomes zero and newly generated ECG samples
are flat at 0 mV, with old beats scrolling out of the eight-second history window.
This is one artificial terminal scenario, not a model of every mechanism of death.

Respiration declines toward zero with a 3 s lag and a 4 breaths/min/s rate cap.
Systolic/diastolic pressures decline with a 1.5 s lag and 60/40 mmHg/s rate caps.
Values below 0.05 become zero. These constants are presentation settings, not
validated physiological timing. A directly overridden zero starts that metric at
zero; the other metrics follow their terminal transitions.

SpO₂ keeps its last estimate internally but publishes INVALID quality, and the UI
shows “No signal” rather than a normal saturation or a fabricated 0%. This fixture
choice reflects pulse-oximetry's dependence on an adequate pulsatile signal;
[FDA guidance](https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters)
notes poor circulation as a source of inaccurate readings. It is not a new validated
pulse-oximeter model. Suit pressure remains an environmental signal and continues
to follow the suit fault and manual pressure settings independently.

Physiological manual overrides and Recovery cannot revive a terminal run. Changing
the selected crew does not reset the deceased crew. Worker/API restart and UI
reload preserve the checkpoint and deceased label; restarting seeded playback
creates fresh living models. Freshness/disconnection indications remain separate
from the persisted deceased state. Recovery highlights stop for deceased crew.
New examinations are blocked and pending acquisitions fail visibly, avoiding new
normal laboratory/cuff fixtures after the terminal event. Existing reports,
laboratory values, bone density and recorded history keep their original provenance.


Restart seeded playback revives every crew member by creating new living models,
clearing all manual overrides and injected faults, and resuming playback. The
restart button returns the scenario to REST. API callers can explicitly choose a
starting scenario, but cannot carry faults or zero overrides into a restart.


## Completed sleep duration

A seventh published measurement, `sleep_duration` in hours (0–24), records the latest
completed synthetic sleep period. Initial crew fixtures are 7.5, 7 and 8 hours.
This is fixture context, not a recommended sleep target or a sleep-stage model.
It stays constant through REST, EXERCISE, RECOVERY, ANOMALY and terminal states.
Manual overrides use the normal control revision, persistence and reset behavior.
A zero duration never triggers death, and terminal-state overrides leave this
record editable. Legacy model checkpoints missing the field default to 7.5 hours.

The seventh dashboard card follows diastolic pressure. On the four-column desktop
and laptop layout, it sits below oxygen saturation and to the right of diastolic
pressure. Tablet/mobile layouts retain the existing two-column flow. The same
measurement is available in live monitoring, trends, crew baselines, observation
history and the Sensorimotor Adaptation/body-map contextual view. Missing readings show no data.


## Body-temperature examinations

The virtual thermometer `DEMO-TEMP-001` completes an explicit BODY_TEMPERATURE
request with one `body_temperature` result in °C: 36.6, 36.7 or 36.8 for the selected
crew. These are static per-crew fixtures, not thermal physiology or clinical limits.
Exercise, recovery, seed and faults do not silently change a saved temperature.
The result follows Acquire → Review → Save, supports the existing report export,
and appears in the arms region of Risk monitoring's crew body view only after save.
Missing/cancelled/unreviewed results do not substitute a default reading. Worker
connectivity, acquisition timeout and deceased-state checks also apply to this exam.
