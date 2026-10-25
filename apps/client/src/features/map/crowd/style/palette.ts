export type CrowdTheme = "light" | "dark";

export const LEVEL_COLORS: Record<CrowdTheme, readonly string[]> = {
  light: ["#67aaff", "#4f96ee", "#3c83da", "#2870c5", "#105db1", "#004c98", "#003c7a", "#002c5e"],
  dark: ["#004b96", "#0f5db0", "#2870c5", "#3d84db", "#5198f0", "#6cadfe", "#92c1fe", "#b6d5fe"],
};

export const SINR_COLORS: Record<CrowdTheme, readonly string[]> = {
  light: ["#fe8c2c", "#e87802", "#cc6904", "#b25b00", "#984d01", "#7e3f02"],
  dark: ["#874300", "#a65402", "#c76600", "#e87802", "#fe933f", "#ffb98a"],
};

export const NO_SINR_COLORS: Record<CrowdTheme, string> = { light: "#9aa0a3", dark: "#5c6366" };
export const NO_SINR_OPACITY = 0.7;

export const MY_TRAIL_COLORS: Record<CrowdTheme, string> = { light: "#6250d6", dark: "#9085e9" };

export const MUTED_MARK_COLORS: Record<CrowdTheme, string> = { light: "#636a6d", dark: "#8f9597" };

export const EDGE_COLORS: Record<CrowdTheme, string> = { light: "#04080b", dark: "#f3f5f7" };

const SECTOR_COLORS: Record<CrowdTheme, readonly string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#636a6d"],
  dark: ["#3987e5", "#d95926", "#199e70", "#8f9597"],
};

export const LEVEL_TICKS_DBM = [-120, -110, -100, -90, -80, -70, -60] as const;
export const SINR_TICKS_DB = [0, 5, 10, 15, 20] as const;

export const MY_TRAIL_BUCKETS = [
  { minSamples: 1, label: "1-9", alpha: 0.35 },
  { minSamples: 10, label: "10-49", alpha: 0.65 },
  { minSamples: 50, label: "50+", alpha: 0.95 },
] as const;

export function getSectorColor(index: number, theme: CrowdTheme): string {
  const colors = SECTOR_COLORS[theme];
  return colors[Math.min(index, colors.length - 1)];
}

export function toRgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}
