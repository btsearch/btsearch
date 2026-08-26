import { MountainIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { TerrainProfileStationTarget } from "../types";

type TerrainProfileAnalyzeButtonProps = {
  target: TerrainProfileStationTarget;
  onStart: (station: TerrainProfileStationTarget) => void;
  size?: "sm" | "md";
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
  showTooltip?: boolean;
};

export function TerrainProfileAnalyzeButton({
  target,
  onStart,
  size = "sm",
  className,
  showLabel = false,
  labelClassName,
  showTooltip = true,
}: TerrainProfileAnalyzeButtonProps) {
  const { t } = useTranslation("terrainProfile");
  const label = t("actions.analyze");
  const iconSize = size === "md" ? "size-4" : "size-3";
  const buttonPadding = size === "md" ? "p-1.5" : "p-0.5";
  const buttonContent = (
    <>
      <HugeiconsIcon icon={MountainIcon} className={cn(iconSize, "text-muted-foreground")} />
      {showLabel ? <span className={labelClassName}>{label}</span> : null}
    </>
  );

  if (!showTooltip) {
    return (
      <button
        type="button"
        className={cn(buttonPadding, "shrink-0 cursor-pointer rounded transition-colors hover:bg-muted", className)}
        onClick={() => onStart(target)}
        aria-label={label}
      >
        {buttonContent}
      </button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(buttonPadding, "shrink-0 cursor-pointer rounded transition-colors hover:bg-muted", className)}
            onClick={() => onStart(target)}
            aria-label={label}
            title={label}
          />
        }
      >
        {buttonContent}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
