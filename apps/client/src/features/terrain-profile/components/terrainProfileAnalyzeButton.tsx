import { MountainIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { TerrainProfileStationTarget } from "../types";

type TerrainProfileAnalyzeButtonProps = {
  target: TerrainProfileStationTarget;
  onStart: (station: TerrainProfileStationTarget) => void;
};

export function TerrainProfileAnalyzeButton({ target, onStart }: TerrainProfileAnalyzeButtonProps) {
  const { t } = useTranslation("terrainProfile");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" className="p-0.5 hover:bg-muted rounded transition-colors cursor-pointer shrink-0" onClick={() => onStart(target)} />
        }
      >
        <HugeiconsIcon icon={MountainIcon} className="size-3 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent>{t("actions.analyze")}</TooltipContent>
    </Tooltip>
  );
}
