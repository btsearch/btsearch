import { AddCircleIcon, ArrowDown01Icon, CheckmarkCircle02Icon, CompassIcon, FlashIcon, MagicWand01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { StationDraftApi } from "../../hooks/useStationDraft";
import { type CellToolId, runCellTool } from "../../model/cellTools";
import type { Rat } from "../../model/types";
import { getToolInput } from "./cellRules";
import { BAR_LABEL_CLASS } from "./ratCardHeader";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ToolsMenuProps = {
  edit: StationDraftApi;
  rat: Rat;
  tools: readonly CellToolId[];
  isLabelled?: boolean;
};

type ToolItemsProps = Omit<ToolsMenuProps, "isLabelled">;

const TOOL_ICONS: Record<CellToolId, IconSvgElement> = {
  fillChannels: FlashIcon,
  addMissingCells: AddCircleIcon,
  assignSectorsByPci: CompassIcon,
  confirmCells: CheckmarkCircle02Icon,
};

function ToolItems({ edit, rat, tools }: ToolItemsProps) {
  const { t } = useTranslation();
  const input = getToolInput(edit, rat);
  const labels: Record<CellToolId, string> = {
    fillChannels: t("stations:cells.fillEarfcn"),
    addMissingCells: t("stations:cells.addRemainingCells"),
    assignSectorsByPci: t("stations:cells.syncSectorsByPci"),
    confirmCells: t("stations:cells.confirmCells"),
  };
  const hints: Record<CellToolId, string | null> = {
    fillChannels: t("stations:edit.cells.tools.fillChannelsHint"),
    addMissingCells: t("stations:edit.cells.tools.addMissingCellsHint"),
    assignSectorsByPci: rat === "nr" ? t("stations:edit.cells.tools.assignSectorsHintNr") : t("stations:edit.cells.tools.assignSectorsHint"),
    confirmCells: null,
  };

  return (
    <>
      {tools.map((tool) => {
        const result = runCellTool(tool, input);
        const hint = hints[tool];
        return (
          <DropdownMenuItem
            key={tool}
            disabled={result === input.cells}
            onClick={() => edit.dispatch({ type: "applyCells", cells: result })}
            className="cursor-pointer items-start gap-2 px-2 py-1.5"
          >
            <HugeiconsIcon icon={TOOL_ICONS[tool]} aria-hidden="true" className="mt-0.5 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-[18px]">{labels[tool]}</span>
              {hint === null ? null : <span className="block text-xs leading-4 text-muted-foreground">{hint}</span>}
            </span>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export function ToolsMenu({ edit, rat, tools, isLabelled = true }: ToolsMenuProps) {
  const { t } = useTranslation();
  const label = t("stations:edit.cells.tools.button");

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={<DropdownMenuTrigger aria-label={label} render={<Button type="button" variant="ghost" size="sm" className="cursor-pointer" />} />}
        >
          <HugeiconsIcon icon={MagicWand01Icon} aria-hidden="true" />
          <span className={isLabelled ? BAR_LABEL_CLASS : "sr-only"}>{label}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden="true" className="text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[300px] max-w-[calc(100vw-1rem)]">
        <ToolItems edit={edit} rat={rat} tools={tools} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
