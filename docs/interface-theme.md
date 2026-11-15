# Parchment & Pine

The interface uses warm ivory surfaces, forest navigation, pine interaction
accents, and brass brand details. All interface color definitions live in the
`:root` palette in `frontend/src/styles.css`; components and SVG charts reference
those CSS variables.

| Role | Color | Usage |
| --- | --- | --- |
| Canvas | `#f3f1eb` | Workspace background |
| Paper | `#fffef9` | Cards, dialogs, fields |
| Forest | `#192b24` | Navigation and browser chrome |
| Pine | `#315f4d` | Actions, selection, heart-rate chart |
| Brass | `#d4ba87` | Brand details and navigation focus |
| Success | `#2e6546` | Valid, saved, live states |
| Information | `#3d6070` | Simulated, planned, review states |
| Ochre | `#79531a` | Warning, overdue, priority-two alerts |
| Burgundy | `#9a3939` | Errors and priority-one alerts |
| Plum | `#69546f` | Acknowledged states |

Each semantic color has matching surface and border tokens. Neutral text and
strong control borders maintain readability on the light surfaces. Focus uses
brass on navigation and a darker ochre on light surfaces. Selection and hover
states share the pine family.

The eight metric/chart colors remain distinct, using muted pine, blue, olive,
plum, terracotta, ochre, violet, and teal. ECG grids, body-region overlays, the
3D schematic, mood faces, calendars, tables, and dialog backdrops also use the
shared palette. Chart colors identify measurements; status labels separately
communicate freshness and alert severity.

Alert attention alternates between the severity color and its light surface.
Existing reduced-motion behavior is retained. Priority-two dialogs use ochre;
priority-one dialogs use burgundy.

Validation included browser inspection of the eleven main screens, text contrast
checks on their rendered states and alert dialogs, and overflow checks at 1366,
1024, and 390 pixels. The text scan checks 4.5:1 for normal text and 3:1 for large
text; it is a targeted review rather than a full accessibility audit.

Representative previews are stored in `artifacts/screenshots/theme-dashboard.png`,
`theme-risk-monitoring.png`, `theme-warning-alert.png`, and `theme-critical-alert.png`.
