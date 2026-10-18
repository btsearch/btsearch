import {
  AddCircleIcon,
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  CompassIcon,
  FlashIcon,
  MagicWand01Icon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { StationDraftApi } from "../../hooks/useStationDraft";
import { type CellToolId, runCellTool } from "../../model/cellTools";
import type { Rat } from "../../model/types";
import { getToolInput } from "./cellRules";
import { BAR_LABEL_CLASS } from "./ratCardHeader";
import { SharedNetworksDialog } from "./sharedNetworksDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ToolsMenuProps = {
  edit: StationDraftApi;
  rat: Rat;
  tools: readonly CellToolId[];
  hasNetworksTool: boolean;
  isLabelled?: boolean;
};

type ToolItemsProps = Pick<ToolsMenuProps, "edit" | "rat" | "tools">;

type ToolItemProps = {
  icon: IconSvgElement;
  label: string;
  hint: string | null;
  isDisabled?: boolean;
  onClick: () => void;
};

const TOOL_ICONS: Record<CellToolId, IconSvgElement> = {
  fillChannels: FlashIcon,
  addMissingCells: AddCircleIcon,
  assignSectorsByPci: CompassIcon,
  confirmCells: CheckmarkCircle02Icon,
};

function ToolItem({ icon, label, hint, isDisabled, onClick }: ToolItemProps) {
  return (
    <DropdownMenuItem disabled={isDisabled} onClick={onClick} className="cursor-pointer items-start gap-2 px-2 py-1.5">
      <HugeiconsIcon icon={icon} aria-hidden="true" className="mt-0.5 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-[18px]">{label}</span>
        {hint === null ? null : <span className="block text-xs leading-4 text-muted-foreground">{hint}</span>}
      </span>
    </DropdownMenuItem>
  );
}

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
        return (
          <ToolItem
            key={tool}
            icon={TOOL_ICONS[tool]}
            label={labels[tool]}
            hint={hints[tool]}
            isDisabled={result === input.cells}
            onClick={() => edit.dispatch({ type: "applyCells", cells: result })}
          />
        );
      })}
    </>
  );
}

export function ToolsMenu({ edit, rat, tools, hasNetworksTool, isLabelled = true }: ToolsMenuProps) {
  const { t } = useTranslation();
  const [isNetworksOpen, setIsNetworksOpen] = useState(false);
  const label = t("stations:edit.cells.tools.button");

  return (
    <>
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
          {hasNetworksTool ? (
            <ToolItem
              icon={Share08Icon}
              label={t("stations:edit.cells.tools.sharedNetworks")}
              hint={t("stations:edit.cells.tools.sharedNetworksHint")}
              onClick={() => setIsNetworksOpen(true)}
            />
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {hasNetworksTool ? <SharedNetworksDialog edit={edit} rat={rat} isOpen={isNetworksOpen} onOpenChange={setIsNetworksOpen} /> : null}
    </>
  );
}
