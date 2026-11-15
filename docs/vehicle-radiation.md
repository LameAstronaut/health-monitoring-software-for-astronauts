# Vehicle radiation sensors

Risk monitoring displays three simulated environmental radiation sensors:
`VEH-RAD-001` (main cabin), `VEH-RAD-002` (airlock), and `VEH-RAD-003`
(radiation shelter), all belonging to `DEMO-VEHICLE-001`.

These are shared vehicle measurements. Packets have no astronaut identifier;
personal fields are rejected. Readings are stored as `vehicle-radiation`
operation records with a null crew association, separately from observations,
examinations, and personal alerts. Selecting a crew member does not change them.

The controlled Rust simulator publishes to `POST /api/v1/vehicle/radiation`
using the existing `X-Demo-Token`. `GET /api/v1/vehicle/radiation` supplies the
shared snapshot; the dashboard refreshes it every two seconds. API schemas
appear in OpenAPI and generated frontend types. No physical instrument adapter
is connected.

Each reading reports absorbed dose rate in µGy/h and accumulated environmental
absorbed dose in mGy, with measurement time and freshness. Freshness uses the
configured stale/disconnect windows; the frontend also ages retained values
when polling fails. Before acquisition, values are null and explicitly unavailable.

The arbitrary demonstration rate is `b * (1 + 0.1 * sin(t / 60))`, where `t` is
vehicle simulation seconds and `b` is 14, 22, or 5 µGy/h, respectively. These
constants are fixture choices, not calibrated measurements or safety limits.
Accumulated dose is the analytic integral from time zero:
`b * (t + 6 * (1 - cos(t / 60))) / 3_600_000` mGy.

Vehicle simulation time advances with playback speed, independently of crew
physiology and crew sensor faults. Pause freezes acquisition and accumulation;
retained readings become stale. The latest packet for each run persists in SQLite
and supplies the vehicle clock checkpoint when the worker reconnects. Restart
creates a new run with accumulation starting at zero; earlier run records remain
stored. Replayed packets are idempotent; outdated control revisions, time
regressions, and decreasing cumulative dose within a run are rejected.

No individual exposure, equivalent dose, clinical conclusion, or radiation alert
threshold is inferred from these fixtures.
