# Two-minute synthetic demo

1. Start API and UI using development.md. Observe DEMO / SIMULATED and no data.
2. Run `normal` with seed 42. Confirm all three cards show units, UTC timestamps,
   VALID, SIMULATED, device ID, and LIVE status.
3. Stop with Ctrl+C. Run `simultaneous_demo --count 8`. At sample six, inspect
   priority 1 suit-pressure and priority 2 oxygen fixture alerts and their exact evidence.
4. Open Telemetry history to inspect accepted packet event IDs and sequences.
5. Run `sensor_disconnect --count 22`. Five packets arrive, then delivery stops.
   After five seconds source data becomes STALE; after fifteen it is DISCONNECTED.
6. Restart the backend. Previously stored values must say HISTORICAL / NO LIVE DATA.
   Start `normal` again; the CLI resumes the durable sequence and fresh data returns.

This demonstrates a local telemetry pipeline and uncertainty handling, not an examination,
clinical diagnosis, medical-device integration or NASA-qualified software.
