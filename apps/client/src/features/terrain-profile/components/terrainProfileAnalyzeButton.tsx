import { MountainIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { TerrainProfileStationTarget } from "../types";
import { cn } from "@/lib/utils";

type TerrainProfileAnalyzeButtonProps = {
  target: TerrainProfileStationTarget;
  onStart: (station: TerrainProfileStationTarget) => void;
  className?: string;
  labelClassName?: string;
};

export function TerrainProfileAnalyzeButton({ target, onStart, className, labelClassName }: TerrainProfileAnalyzeButtonProps) {
  const { t } = useTranslation("terrainProfile");
  const label = t("actions.analyze");

  return (
    <button
      type="button"
      aria-label={label}
      className={cn("shrink-0 cursor-pointer rounded p-1.5 transition-colors hover:bg-muted", className)}
      onClick={() => onStart(target)}
    >
      <HugeiconsIcon icon={MountainIcon} className="size-4 text-muted-foreground" />
      <span className={labelClassName}>{label}</span>
    </button>
  );
}
