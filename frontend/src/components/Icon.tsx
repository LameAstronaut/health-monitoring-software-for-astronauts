const PATHS = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  crew: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87",
  waveform: "M2 12h4l3-8 5 16 3-8h5",
  examination: "M9 5V3h6v2 M3 5h18v16H3z M12 9v8 M8 13h8",
  equipment:
    "M6 6h12v12H6z M9 9h6v6H9z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4",
  risk: "M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7z M7 12h3l2-4 2 8 2-4h2",
  nutrition: "M4 3v5a3 3 0 0 0 6 0V3 M7 3v19 M17 22V3c-4 3-4 9 0 9h3V3",
  fitness: "M6 3v18 M3 6v12 M18 3v18 M21 6v12 M6 12h12",
  eva: "M5 15v-5a7 7 0 0 1 14 0v5 M4 15h16v5H4z M8 9h8v4H8z M8 20v2 M16 20v2",
  alert: "M12 3 2 21h20z M12 9v5 M12 17v.5",
  simulator:
    "M4 3v7 M4 14v7 M12 3v11 M12 18v3 M20 3v3 M20 10v11 M1 10h6v4H1z M9 14h6v4H9z M17 6h6v4h-6z",
  orbit: "M8 4a9 9 0 1 0 12 12 M12 8a4 4 0 1 0 4 4 M14 3h7v7 M21 3l-8 8",
  volume: "M11 4 6 8H2v8h4l5 4z M15 8a6 6 0 0 1 0 8 M18 4a11 11 0 0 1 0 16",
  muted: "M11 4 6 8H2v8h4l5 4z M16 9l6 6 M22 9l-6 6",
  check: "M4 12l5 5L20 6",
  task: "M9 4h6v4H9z M8 6H4v15h16V6h-4 M8 13l3 3 5-5",
  scan: "M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 12h3l2-4 2 8 2-4h2",
} as const;

export type IconName = keyof typeof PATHS;

/** Consistent, decorative instrument icons; adjacent labels carry meaning. */
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`app-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
