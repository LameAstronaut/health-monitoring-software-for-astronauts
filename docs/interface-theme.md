# Flight Deck

The interface uses midnight navy backgrounds, cool instrument panels, cyan
controls, and bright telemetry colors. All interface color definitions live in the
`:root` palette in `frontend/src/styles.css`; components and SVG charts reference
those CSS variables.

| Role | Color | Usage |
| --- | --- | --- |
| Canvas | `#070d18` | Workspace background |
| Panel | `#111d2e` | Cards, dialogs, fields |
| Navigation | `#060c15` | Navigation and browser chrome |
| Cyan | `#63d9f5` | Actions, selection, heart-rate chart |
| Ice | `#8ee7ff` | Brand details and keyboard focus |
| Success | `#69e1b0` | Valid, saved, live states |
| Information | `#8ccaff` | Simulated, planned, review states |
| Amber | `#ffd176` | Warning, overdue, priority-two alerts |
| Coral | `#ff9aa7` | Errors and priority-one alerts |
| Violet | `#d0b8ff` | Acknowledged states |
| Mood face | `#ffd43b` / `#000000` | Yellow faces with black features |

Each semantic color has matching dark surface and border tokens. Pale text and
strong control borders maintain readability on navy panels. Filled cyan buttons
use a dark foreground; filled alert badges use dedicated darker severity colors
with light text. Focus, selection, and hover states share the cyan family. Native
controls use the dark browser color scheme.

The eight metric/chart colors remain distinct, using cyan, blue, mint, lilac,
coral, amber, violet, and turquoise. ECG grids, body-region overlays, the 3D
schematic, calendars, tables, and dialog backdrops also use the shared palette.
Chart colors identify measurements; status labels separately communicate
freshness and alert severity. Every mood face is yellow with black eyes, mouth,
and outline. Expression and labels distinguish unhappy, neutral, and happy;
the unrecorded state retains its dashed outline.

Alert attention alternates between dark severity surfaces with light text.
Existing reduced-motion behavior is retained. Priority-two dialogs use amber;
priority-one dialogs use coral and dark red.

Validation included browser inspection of the eleven main screens, text contrast
checks on their rendered states and alert dialogs, and overflow checks at 1366,
1024, and 390 pixels. The text scan checks 4.5:1 for normal text and 3:1 for large
text; it is a targeted review rather than a full accessibility audit. Browser
checks also verified yellow fill and black features at all three mood slider steps.

Representative previews are stored in `artifacts/screenshots/theme-dashboard.png`,
`theme-risk-monitoring.png`, `theme-warning-alert.png`, and `theme-critical-alert.png`.
Mood previews are in `mood-dashboard.png` and `mood-dialog.png` in the same directory.
