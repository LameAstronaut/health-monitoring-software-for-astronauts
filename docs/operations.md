# Local synthetic medical operations

Run `make setup` after updating dependencies, then `make dev`. Existing SQLite databases
are upgraded through Alembic 0002 without deleting accepted telemetry. The API and Rust
worker remain separate processes; the React app reads shared observations and records.

- **Dashboard:** select one of three crew; inspect timestamped HR/RR/SpO₂/pressure,
  ECG, priority-ordered demo findings and scheduled tasks. Completing a task is explicit.
- **Crew profiles:** personal simulation constants, provenance and measurement history.
- **Live monitoring:** fixed-scale plots, recorded ranges, UTC labels and a separate ECG.
- **Examinations:** choose blood pressure, a lab panel or a bone-density report; the virtual
  adapter queues an acquisition for Rust. Review the returned measurements, add a demo
  note, save and later inspect/export the synthetic report. Without a live worker the
  request fails visibly; lost acquisition times out rather than inventing a reading.
- **Equipment:** seven virtual instruments, capabilities, association, connection, firmware,
  last receipt and unknown physical calibration. Event instruments are IDLE, not falsely LIVE.
- **Risk monitoring:** eleven shared-record categories with grouped observations, trends,
  context and missing-instrument notices. No risk scores, diagnoses or AI conclusions.
- **Nutrition:** portion-based synthetic inventory, meal logging, recorded nutrient totals
  and persistent history. Inventory decrement and meal insertion are atomic.
- **Fitness:** start a synthetic activity, request EXERCISE, finish and request RECOVERY;
  retain elapsed wall time and peak accepted HR, or explicitly unavailable HR.
- **EVA:** prepare a demonstration, complete the conceptual checklist, start with live
  synthetic suit telemetry, complete and inspect a persistent action timeline. This is
  not an approved EVA procedure and has no life-support command channel.
- **Alerts:** inspect triggering observations, rule version, UTC time, source and priority;
  explicitly acknowledge as DEMO-OPERATOR and retain history.
- **Simulator:** select scenario, target crew, speed, seed, restart, pause/resume and faults.
  Other crew remain independently at rest. Restart uses a new run; it does not erase records.

Control and operations writes are restricted to loopback, reject untrusted browser origins,
and are DEMO-only. Ingestion/runtime/worker heartbeat additionally require the configured
demo token, which is shared with Rust through environment configuration, never the browser.
These controls are not clinician authentication, medical role access or deployment security.

The common `DeviceAdapter` interface exposes identify/status/capabilities/acquire/stop.
Only `SimulatedAdapter` is implemented. Its acquisition is a durable software request;
Rust returns the fixture through the validated telemetry path. A real implementation
must be separate and must not silently substitute simulated results.

Operation records use a shared SQLAlchemy JSON record table with Pydantic types at API
boundaries. Packets, normalized observations and alert evidence retain the existing tables.
Examination transitions and telemetry writes share a transaction; publication follows commit.
Meals, sessions, tasks, EVA checklists and acknowledgment survive reload and API restart.

Specialist sensorimotor, microbiome and ophthalmic instruments, advanced lab markers,
ground synchronization, clinical review signatures, PWA caching, retention/backup and
shared-user roles remain outside this local prototype. Their absence is visible in the UI.


## Daily mood check-in

The Mission dashboard heading contains a mood face between the title and API
status. Click it to answer “How are you feeling today?” with a three-step slider:
1 Unhappy (sad face), 2 Neutral, 3 Happy. Submit saves the choice for the selected
synthetic crew member. Cancel or Escape closes without changing it; failed saves
keep the dialog and draft open for retry.

Check-ins are stored locally in operational records, independently per crew and
UTC calendar day. Updating today's mood replaces that crew's current-day entry;
previous days remain recorded. Reloads, crew selection and playback restarts retain
saved choices. A new day shows a neutral placeholder labeled Not recorded until
a choice is submitted. Mood is a self-reported demo record, not a derived clinical
assessment or a simulator fault.


## Weekly examination calendars

Mission dashboard and Examinations show a Monday–Sunday calendar for the selected
crew member, using UTC to match the rest of the interface. Previous week, This week
and Next week navigate across month/year boundaries. Tablet calendars scroll
horizontally; phone calendars stack the seven labeled days without page overflow.

Crew calendars are read-only: crew can start examinations and view their history,
but cannot create, reschedule, or cancel plans. An administration panel is deferred.
The existing operator plan API remains available for future administration tooling.
Plans persist in local operational records across reloads and playback/API restarts.
The calendar starts from a fresh shared demo template; old calendar settings and
routine task dates are not imported. Previous plans are archived and their pending
examination tasks retired, preserving examination reports. An examination already
in acquisition/review can finish before its previous plan is archived.

Every crew member receives the same weekly UTC schedule:

| Day | Time | Examination |
| --- | --- | --- |
| Monday | 09:00 | Blood pressure |
| Monday | 09:30 | Body temperature |
| Wednesday | 09:00 | Laboratory panel |
| Wednesday | 09:30 | Body temperature |
| Friday | 09:00 | Blood pressure |
| Friday | 10:00 | Bone density |

The backend preschedules this week and next week with separate persistent plans
and linked tasks for every slot and crew member. Completed/cancelled slots are not
regenerated on refresh or restart. This is a synthetic demo template.

Upcoming tasks shows only pending tasks scheduled for the current server UTC day,
including every examination on that day. It updates at midnight UTC. The weekly
calendar retains the full schedule, including overdue examinations from earlier
days. Examination entries derive directly from the same
plans as the calendar, including plans without linked task records. Rescheduling changes the
due date in both places; cancelled and completed plans leave the upcoming list.
Examination tasks cannot be manually marked complete: Review & save result records
completion and links the report atomically. Other task types retain manual completion.

Start examination uses the planned crew, type and registered virtual instrument.
Acquisition requires fresh running telemetry and a living crew member. An active
acquisition/review must be finished or cancelled before another begins. A failed
or cancelled acquisition leaves the plan available to retry.

An accessible, dismissible in-app notification appears on every screen only during
the scheduled minute of an examination for the selected crew, using server UTC.
It never appears early or replays older overdue appointments. It links to
Examinations and clears after that minute, on dismissal, during acquisition/review,
or after completion or plan cancellation. Switching crew switches reminders. Disconnected views label the
schedule as last received. Notifications operate while the application is open;
no browser push permission or background delivery is configured.

## Sensorimotor Adaptation reaction practice

Risk monitoring → Sensorimotor Adaptation includes a 30-second spacebar reaction test. The
Head & eyes region in Crew body view shows only the latest average reaction time,
in a measurement card matching Sleep duration. The same average card is displayed
in the Sensorimotor Adaptation record view, using the latest completed result for
the selected crew member, including after navigation or reload. Head & eyes has no test-launch button.
Select Sensorimotor Adaptation to run the test. Start focuses the test area.
Wait for the text and color cue, then press and release
Space. Random 1–3 second waits separate cues. Early presses count as false starts;
key repeats and held keys do not generate repeated responses. Unanswered cues time
out after two seconds. Timing uses the browser's monotonic performance clock and
animation frames, independently of mission playback speed or server timestamps.

After 30 seconds, the summary shows response count, average, median and fastest
reaction time, false starts and missed cues. Stop, leaving the test, switching
crew, hiding the tab, or losing focus ends the attempt without a completed score.
Only the latest average and its timestamp are displayed in the Head & eyes region;
without recorded responses, the card shows NOT AVAILABLE. Full statistics remain
in the practice test. Results are kept separately per crew in
this browser and survive navigation and reloads. Starting or interrupting another
attempt does not replace the latest completed result. Browser practice results are
not clinical findings or saved medical reports.


## Recorded weight

Weight appears as the eighth dashboard metric, directly below suit pressure and
to the right of sleep duration on the four-column layout. It uses canonical kg,
shows RECORDED while telemetry is fresh, and keeps its own timestamp and quality.
The same code is included in live monitoring, measurement history and export,
crew baselines, the abdomen body region, Nutritional Status,
and Physical Conditioning. Initial synthetic weights are 64 / 78 / 82 kg for Alex / Jordan / Sam.

Weight remains stable across simulation activities. Overrides affect published
values until cleared; they do not change baseline body mass. A zero weight is a
representable demo value and never triggers the terminal fixture. No weight-based
clinical thresholds or alerts are introduced. Previous simulator checkpoints that
lack weight load a 70 kg compatibility default; newly initialized models use the
per-crew baselines. Simulator state includes weight across worker/API restarts.
