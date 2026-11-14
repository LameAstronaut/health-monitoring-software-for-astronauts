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
the phase of small, slow deterministic drift. There is no independently chosen random
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

- REST: HR approaches its personal baseline plus slow sinusoidal drift with total amplitude
  at most 0.40 beats/min. RR has an additional drift amplitude of 0.08 breaths/min.
- EXERCISE: target HR is baseline +65 beats/min; HR response time constant is 45 s,
  with a maximum increase of 0.9 beats/min per simulated second.
- RECOVERY: HR returns toward baseline with a 65 s time constant and the same rate bound.
- RR target is baseline RR +0.18×positive HR elevation +0.8 when exercising. A separate
  22 s lag and 0.3 breaths/min/s bound correlate respiration with actual modeled HR load.
- SpO₂ approaches 98.2%, or 0.3 percentage points lower during exercise, with small slow
  drift, a 35 s time constant, and a 0.18 percentage-point/s rate bound.
- Suit pressure approaches 30 kPa with drift amplitude 0.015 kPa, a 30 s time constant,
  and a 0.15 kPa/s rate bound.
- ANOMALY applies explicit oxygen/pressure fixture targets of 86% and 20 kPa. Transitions
  remain gradual. It does not model the physiological consequences of actual hypoxia or
  decompression. Other crew members continue their independent REST states.
- PULSE_SURGE adds 65 beats/min to the selected crew's target HR without exercise workload;
  respiration follows the usual HR coupling. RESPIRATORY_SURGE adds 22 breaths/min to the
  RR target and 20 beats/min to HR. MULTI_SYSTEM combines pulse, respiratory, oxygen and
  pressure fixtures. Acute onset uses the distinct lags and bounds below. All preserve
  continuous state, seeded drift and checkpoint behavior. These are artificial stress-test
  trajectories, not disease or arrhythmia models.

| Active acute fixture | State | Time constant | Maximum rate per simulated second |
| --- | --- | --- | --- |
| Pulse rise / combined | HR | 6 s | 8 beats/min/s |
| Respiratory rise without pulse rise | HR | 10 s | 3 beats/min/s |
| Respiratory rise / combined | RR | 6 s | 1.8 breaths/min/s |
| Pulse rise without respiratory rise | RR (coupled to HR) | 10 s | 0.8 breaths/min/s |
| Oxygen decrease / combined | SpO₂ | 10 s | 0.8 percentage points/s |
| Pressure decrease / combined | Pressure | 5 s | 1.2 kPa/s |

The old acute fixtures reused the slow exercise/recovery response. Distinct acute curves now
make pulse rise apparent in the first second and cross its marker within 12 simulated seconds
from any crew baseline (typically around 10 s, versus roughly 70–100 s previously). Tests
check all four markers within 12 s across all crew and several seeds, plus per-integration-step
rate bounds. The 25 Hz integration, 125 Hz ECG and default 1 Hz publication remain separate.
This gives different fault types distinct, coherent trajectories; these coefficients are still
illustrative engineering settings, not empirically validated human or spacesuit responses.
REST, normal exercise, recovery and event-only examination values retain their existing dynamics.
Restart seeded playback after updating the worker; historical runs retain their original samples.

Synthetic alert markers are SpO₂ <=92% and HR >=115 beats/min (priority 2), and pressure
<=25 kPa and RR >=26 breaths/min (priority 1),
only in explicit ANOMALY scenarios and only for valid, fresh observations. These arbitrary
markers are **not clinical or suit operating limits**. Alerts are deduplicated by rule,
crew and playback run; acknowledgment is a demo operator action, not a clinical review.
Every new alert opens full screen for any crew member; priority 1 takes precedence. The
initial view shows only the crew, anomaly name, triggering value, time and controls. Exact
provenance and the original message remain under Evidence and in alert history. A crisp red
turn-signal blink runs 500 ms on, 500 ms off, leaving the numbers and text steady. Stop flashing
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

Blood pressure, WBC/hemoglobin and bone density are fixed per-crew report fixtures,
generated by Rust **only for an explicit pending examination**. They are absent from the
continuous loop. Acquisition → validated REVIEW → explicit SAVE is durable and traceable
to crew, instrument, source timestamp and raw event. Static reports do not drift when the
model runs, pauses, changes speed or enters exercise. Actual BP/exercise coupling, changing
laboratory values, bone remodeling and medical interpretation are deliberately unmodeled.

## Verification and limits

Rust tests check resting stability, bounded exercise/recovery changes, correlated respiration,
seed/chunk determinism, checkpoint restoration, waveform separation and static report invariance.
Backend tests check schemas, provenance, sequence, persistence, controls and examination lifecycle.
Browser tests exercise the real Rust → FastAPI → React workflows and screen sizes.

This does not validate physiology, ECG accuracy, clinical thresholds, physical instruments,
human performance, target hardware fidelity or medical outcomes. All real-device adapters,
clinical rules, roles and assurance would require a separately reviewed integration effort.
