import type { TerrainResult } from "./types";

export type TerrainPathVerdict = "clear" | "blocked" | "unavailable";

export function getTerrainPathVerdict(result: TerrainResult): TerrainPathVerdict {
  if (result.terrainVerdict === "blocked") return "blocked";
  if (result.surfaceVerdict === "unknown" || result.warnings.includes("surfaceDataIncomplete")) return "unavailable";
  return result.surfaceVerdict;
}

export function isBlockedBySurfaceOnly(result: TerrainResult): boolean {
  return getTerrainPathVerdict(result) === "blocked" && result.terrainVerdict === "clear";
}
