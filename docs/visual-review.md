# Visual review and interaction evidence

The curated screenshots below were captured from the actual React application with the Rust worker and
FastAPI/SQLite stack. All identities, measurements and examination results are synthetic.
New test evidence is saved under `frontend/test-results/<test-name>` and uploaded by CI;
ordinary tests do not overwrite these curated screenshots.

| View | Evidence |
| --- | --- |
| Laptop dashboard, 1366×768 viewport | [Viewport](../artifacts/screenshots/dashboard-laptop-viewport.png), [full page](../artifacts/screenshots/dashboard-laptop.png) |
| Desktop dashboard, 1920×1080 viewport | [Viewport](../artifacts/screenshots/dashboard-desktop-viewport.png), [full page](../artifacts/screenshots/dashboard-desktop.png) |
| Tablet dashboard, 1024×768 viewport | [Viewport](../artifacts/screenshots/dashboard-tablet-viewport.png), [full page](../artifacts/screenshots/dashboard-tablet.png) |
| Rapid pulse-rise alert | [Laptop](../artifacts/screenshots/pulse-alert-laptop.png) |
| Full-screen priority 1 alert | [Laptop](../artifacts/screenshots/critical-alert-laptop.png), [desktop](../artifacts/screenshots/critical-alert-desktop.png), [tablet](../artifacts/screenshots/critical-alert-tablet.png) |
| Saved examination with source and history | [Examination](../artifacts/screenshots/examination-laptop.png) |
| Interactive body view | Risk monitoring includes a realistic synthetic astronaut illustration with touch-sized head, chest, arms, abdomen and legs regions overlaid with linked measurement details |
| Virtual equipment registry | [Equipment](../artifacts/screenshots/equipment-laptop.png) |
| Live metrics, trends, ECG and source history | [Live monitoring](../artifacts/screenshots/live-monitoring-laptop.png) |

The design uses a dark navigation rail, midnight workspace, dark reading surfaces, restrained
measurement accents, 18 px base text, 34–38 px page headings, 56 px main values, stable
tabular numerals and controls at least 56 px high (64 px in full-screen alert review). Timestamp/source/quality are adjacent
to values. Text labels distinguish LIVE, STALE, DISCONNECTED, NOT AVAILABLE, HISTORICAL,
INVALID and ERROR; color is supplementary. Medical values have no transition animation.

The navigation rail scrolls to keep all twelve destinations usable with larger touch targets.
Laptop and tablet layouts use two metric columns and stacked panels; desktop uses four metric
columns and wider charts. Every new anomaly opens a full-screen red alert, including
priority 2 events and events for another crew member. The initial view shows a short anomaly
name, crew, large trigger value and time. Response actions and trigger evidence are visible. Its acknowledgment
bar remains visible while evidence scrolls; Minimize/Escape leaves the alert pending.
A red icon blink (500 ms on, 500 ms off) keeps the review background, text and numeric values steady. Recovery cards and the navigation attention indicator pulse only their borders. Stop flashing and
the OS reduced-motion preference disable it without acknowledgment. Screenshots capture a
static frame; browser checks verify the animation, off control and reduced-motion behavior. Main content scrolls; tables scroll inside their
panels rather than forcing page-wide overflow. Exact source times remain UTC.

The automated visual tests check body/heading/metric sizes, visible button heights, no
horizontal page overflow, keyboard focus and keyboard navigation at the three viewports.
Screenshots were inspected for the dashboard and saved examination, including stable resting
readings, readable values/units, explicit provenance and the saved-result affordance.

Eleven Playwright cases cover these viewports plus actual acquisition/review/save/export/reload,
all navigation, crew baselines, pause/frozen time, source expiry while the API is connected,
exercise/recovery, sensor loss, meals/inventory, fitness history, EVA checklist/timeline,
gradual prioritized anomalies, pulse/respiratory scenarios, modal focus, minimize/reopen and persistent acknowledgment. See [validation](validation.md).

These checks are not a formal accessibility or human-factors certification. Screen-reader
and clinical usability studies, additional browsers, long-duration sessions and other device
sizes remain unverified. A saved DEMO report is not a clinician-signed medical record.
