import { useTranslation } from "react-i18next";

import type { TerrainProfilePanelModel } from "../hooks/useTerrainProfileController";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";

const BRAND_MARK_SIZE = 16;

export function TerrainProfileStationButton({ panel }: { panel: TerrainProfilePanelModel }) {
  const { t } = useTranslation("terrainProfile");
  const { openStationDialog } = useFloatingDialogStack();
  const { station } = panel;
  const label = t("header.openStation");

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`${label}: ${station.operatorName} ${station.siteId}`}
        onClick={() => openStationDialog(station.id, station.source)}
        render={<Button type="button" variant="ghost" size="sm" className="-mx-1 min-w-0 cursor-pointer gap-1.5 px-1.5" />}
      >
        <BrandMark brand={panel.brand} size={BRAND_MARK_SIZE} />
        <span className="truncate text-[13px] font-semibold">{station.operatorName}</span>
        <span className="font-mono text-xs font-medium text-muted-foreground">{station.siteId}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
