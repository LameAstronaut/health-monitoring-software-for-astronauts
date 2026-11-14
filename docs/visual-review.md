# Visual review and interaction evidence

Screenshots are generated from the actual React application with the Rust worker and
FastAPI/SQLite stack. All identities, measurements and examination results are synthetic.

| View | Evidence |
| --- | --- |
| Laptop dashboard, 1366×768 viewport | [Viewport](../artifacts/screenshots/dashboard-laptop-viewport.png), [full page](../artifacts/screenshots/dashboard-laptop.png) |
| Desktop dashboard, 1920×1080 viewport | [Viewport](../artifacts/screenshots/dashboard-desktop-viewport.png), [full page](../artifacts/screenshots/dashboard-desktop.png) |
| Tablet dashboard, 1024×768 viewport | [Viewport](../artifacts/screenshots/dashboard-tablet-viewport.png), [full page](../artifacts/screenshots/dashboard-tablet.png) |
| Saved examination with source and history | [Examination](../artifacts/screenshots/examination-laptop.png) |
| Virtual equipment registry | [Equipment](../artifacts/screenshots/equipment-laptop.png) |
| Live metrics, trends, ECG and source history | [Live monitoring](../artifacts/screenshots/live-monitoring-laptop.png) |

The design uses a dark navigation rail, light workspace, white reading surfaces, restrained
measurement accents, 16 px base text, 28–34 px page headings, 36–46 px main values, stable
tabular numerals and controls at least 44 px high. Timestamp/source/quality are adjacent
to values. Text labels distinguish LIVE, STALE, DISCONNECTED, NOT AVAILABLE, HISTORICAL,
INVALID and ERROR; color is supplementary. Medical values have no transition animation.

The laptop keeps all eleven main destinations and the primary measurement row visible.
The desktop provides wider charts and review panels. Tablet layouts use two metric columns
and stacked panels at narrower widths. Main content scrolls; tables scroll inside their
panels rather than forcing page-wide overflow. Exact source times remain UTC.

The automated visual tests check body/heading/metric sizes, visible button heights, no
horizontal page overflow, keyboard focus and keyboard navigation at the three viewports.
Screenshots were inspected for the dashboard and saved examination, including stable resting
readings, readable values/units, explicit provenance and the saved-result affordance.

Ten Playwright cases cover these viewports plus actual acquisition/review/save/export/reload,
all navigation, crew baselines, pause/frozen time, source expiry while the API is connected,
exercise/recovery, sensor loss, meals/inventory, fitness history, EVA checklist/timeline,
gradual prioritized anomalies and persistent acknowledgment. See [validation](validation.md).

These checks are not a formal accessibility or human-factors certification. Screen-reader
and clinical usability studies, additional browsers, long-duration sessions and other device
sizes remain unverified. A saved DEMO report is not a clinician-signed medical record.
