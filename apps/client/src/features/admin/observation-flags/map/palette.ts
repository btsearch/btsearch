import { type CrowdTheme, toRgba } from "@/features/map/crowd/style/palette";

export type EvidenceOverlay = {
  zone: string;
  zoneScale: number;
  ring: string;
  point: string;
  label: string;
  halo: string;
  taRing: string;
  taOutline: string;
};

type OverlayLook = "light" | "dark" | "satellite";

export const ESTIMATE_COLORS: Record<CrowdTheme, string> = { light: "#004f6e", dark: "#449ac0" };

export const OVERLAYS: Record<OverlayLook, EvidenceOverlay> = {
  light: {
    zone: ESTIMATE_COLORS.light,
    zoneScale: 1,
    ring: ESTIMATE_COLORS.light,
    point: ESTIMATE_COLORS.light,
    label: "#04080b",
    halo: "#f2f2ef",
    taRing: "#04080b",
    taOutline: "rgba(255,255,255,0.95)",
  },
  dark: {
    zone: ESTIMATE_COLORS.dark,
    zoneScale: 1.1,
    ring: "#6db3d3",
    point: ESTIMATE_COLORS.dark,
    label: "#f3f5f7",
    halo: "#111416",
    taRing: "#f3f5f7",
    taOutline: "rgba(0,0,0,0.65)",
  },
  satellite: {
    zone: "#67e8f9",
    zoneScale: 1.25,
    ring: "#ffffff",
    point: "#0e7490",
    label: "#ffffff",
    halo: "rgba(0,0,0,0.7)",
    taRing: "#ffffff",
    taOutline: "rgba(0,0,0,0.6)",
  },
};

export const TA_COLORS = ["#fde68a", "#f59e0b", "#b45309", "#78350f"] as const;

const GRID_ALPHAS = [0.62, 0.42, 0.26, 0.12] as const;
const MOST_GRID_ALPHA = 0.62;

export function listZoneColors(overlay: EvidenceOverlay): string[] {
  return GRID_ALPHAS.map((alpha) => toRgba(overlay.zone, Math.min(MOST_GRID_ALPHA, alpha * overlay.zoneScale)));
}
