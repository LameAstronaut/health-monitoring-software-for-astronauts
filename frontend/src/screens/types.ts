import type { useMission } from "../useMission";

export const PAGES = [
  "Mission dashboard",
  "Crew profiles",
  "Live monitoring",
  "Examinations",
  "Equipment",
  "Risk monitoring",
  "Nutrition",
  "Fitness",
  "EVA operations",
  "Alerts",
  "Simulator controls",
  "Data workspace",
] as const;
export type Page = (typeof PAGES)[number];
export type Mission = ReturnType<typeof useMission>;
export type ScreenProps = {
  mission: Mission;
  crewId: string;
  selectCrew: (id: string) => void;
  navigate: (page: Page) => void;
  busy: boolean;
  action: (route: string, body?: unknown, success?: string) => Promise<boolean>;
};
