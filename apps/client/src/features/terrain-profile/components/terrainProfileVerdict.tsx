import { AlertCircleIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";

import type { TerrainFormat } from "../format";
import type { TerrainResult } from "../types";
import type { TerrainPathVerdict } from "../verdict";
import { getStaleTextClassName } from "./terrainProfileStyles";
import { cn } from "@/lib/utils";

type TerrainVerdictIconProps = {
  verdict: TerrainPathVerdict;
  isStale: boolean;
  className?: string;
};

const VERDICT_TONE_CLASSES: Record<TerrainPathVerdict, string> = {
  clear: "text-emerald-600 dark:text-emerald-400",
  blocked: "text-destructive",
  unavailable: "text-muted-foreground",
};

function CrossCircleIcon({ className }: { className: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9L9 15M9 9L15 15" />
    </svg>
  );
}

export function TerrainVerdictIcon({ verdict, isStale, className }: TerrainVerdictIconProps) {
  const iconClassName = cn("shrink-0", getStaleTextClassName(isStale, VERDICT_TONE_CLASSES[verdict]), className);
  if (verdict === "blocked") return <CrossCircleIcon className={iconClassName} />;

  return <HugeiconsIcon icon={verdict === "clear" ? CheckmarkCircle02Icon : AlertCircleIcon} className={iconClassName} aria-hidden="true" />;
}

export function getVerdictSentence(verdict: TerrainPathVerdict, t: TFunction): string {
  if (verdict === "clear") return t("terrainProfile:verdict.clear");
  if (verdict === "blocked") return t("terrainProfile:verdict.blocked");
  return t("terrainProfile:verdict.unavailable");
}

export function getShortVerdict(verdict: TerrainPathVerdict, t: TFunction): string {
  if (verdict === "clear") return t("terrainProfile:verdict.short.clear");
  if (verdict === "blocked") return t("terrainProfile:verdict.short.blocked");
  return t("terrainProfile:verdict.short.unavailable");
}

export function getPathSummary(result: TerrainResult, format: TerrainFormat, t: TFunction): string {
  return t("terrainProfile:verdict.summary", {
    distance: format.decimal(result.distanceMeters / 1000, 2),
    bearing: format.decimal(result.bearing, 1),
  });
}
