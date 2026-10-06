import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { Cell, NrMode } from "../../types";
import { type DuplexMark, getBandCode, getBandDuplexMark, getBandLabel } from "../../utils/bands";
import { getCellTypeNameKey, getNrMode, isEGsmCell } from "../../utils/cells";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const DUPLEX_NAMES: Record<DuplexMark, string> = {
  FDD: "Frequency Division Duplex",
  TDD: "Time Division Duplex",
  SDL: "Supplemental Downlink",
};
const NR_MODE_NAMES: Record<NrMode, string> = { nsa: "Non-Standalone (LTE anchor)", sa: "Standalone" };

const E_GSM_MARK_CLASS =
  "inline-flex items-center justify-center size-5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 cursor-help text-xs font-bold";
const UNCONFIRMED_MARK_CLASS = "inline-flex items-center justify-center size-5 rounded-md bg-destructive/10 text-destructive cursor-help";

type BandCellProps = {
  cell: Cell;
};

type TextMarkProps = {
  label: string;
  name: string;
  isHighlighted?: boolean;
};

export function BandCell({ cell }: BandCellProps) {
  const { t, i18n } = useTranslation("stations");
  const code = getBandCode(cell.band);
  const duplex = getBandDuplexMark(cell.band);
  const mode = getNrMode(cell);
  const hasMarkBeforeSize = duplex !== null || mode !== null;

  return (
    <td className="px-4 py-2 font-mono">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span>{getBandLabel(cell.band, i18n.language) ?? t("cells.unknownBand")}</span>
        {code !== null ? <span className="text-[11px] leading-5 text-muted-foreground">{code}</span> : null}
        {duplex !== null ? <TextMark label={duplex} name={DUPLEX_NAMES[duplex]} /> : null}
        {mode !== null ? <TextMark label={mode.toUpperCase()} name={NR_MODE_NAMES[mode]} isHighlighted={mode === "sa"} /> : null}
        {hasMarkBeforeSize && cell.cellType !== null ? <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border" /> : null}
        {cell.cellType !== null ? <TextMark label={cell.cellType} name={t(getCellTypeNameKey(cell.cellType))} /> : null}
        {isEGsmCell(cell) ? (
          <Tooltip>
            <TooltipTrigger aria-label="E-GSM">
              <span className={E_GSM_MARK_CLASS}>E</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>E-GSM</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        {cell.isConfirmed ? null : (
          <Tooltip>
            <TooltipTrigger aria-label={t("cells.cellNotConfirmed")}>
              <span className={UNCONFIRMED_MARK_CLASS}>
                <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{t("cells.cellNotConfirmed")}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </td>
  );
}

function TextMark({ label, name, isHighlighted = false }: TextMarkProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          "cursor-help text-[10px] font-medium leading-5",
          isHighlighted ? "font-semibold text-blue-600 dark:text-blue-400" : "text-muted-foreground",
        )}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent side="top">{name}</TooltipContent>
    </Tooltip>
  );
}
