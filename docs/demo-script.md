# Two-minute synthetic demo

1. Run `make dev`, open the dashboard and select a crew. Resting values remain stable;
   inspect units, UTC timestamps, source, quality, device IDs and independent crew baselines.
2. Open Simulator controls. Choose EXERCISE and 4× speed; inspect the gradual HR/RR
   response in Live monitoring, then choose RECOVERY. The ECG is a separate synthetic signal.
3. Choose REST, 1× speed. In Examinations select blood pressure, initiate acquisition,
   review 118/76 (crew 1's fixed fixture), add a demo note and save. Reload and view/export
   the saved report. Lab and bone-density reports are also explicit event-only fixtures.
4. In Simulator controls choose ANOMALY, both faults, 4× speed and restart seeded playback.
   After roughly 9–12 wall seconds, inspect priority 1 pressure and priority 2 oxygen
   marker alerts, their exact evidence and the stored operator acknowledgment.
5. Select the DISCONNECT fault. Readings show DISCONNECTED; no replacement numbers appear.
   Clear the fault, restart REST and pause. With default windows, old samples become STALE
   after five seconds and DISCONNECTED after fifteen while the API remains connected.
6. Inspect Equipment, all nine risk views (including honest specialist NO DATA states),
   log a meal, start/finish a fitness demo and prepare/complete an EVA checklist/timeline.
7. Restart the API. Historical readings and saved records remain; playback is paused until
   explicitly resumed. Resume controls and confirm the Rust worker continues its checkpoint.

This demonstrates a local synthetic operations interface, not clinical diagnosis, real-device
integration, approved EVA procedure, NASA certification or medically validated simulation.
