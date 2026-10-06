import { BatteryLowIcon, Clock01Icon, WifiConnected01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { Cell } from "../../types";
import { type CellFreshness, getCellNote, hasIotSupport, hasRedCapSupport } from "../../utils/cells";
import { Badge } from "@/components/ui/badge";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatShortDate } from "@/lib/format";

const IOT_MARK_CLASS = "inline-flex items-center gap-0.5 px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded text-[10px] font-medium";
const REDCAP_MARK_CLASS =
  "inline-flex items-center gap-0.5 px-1.5 py-0 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded text-[10px] font-medium";
const NEW_BADGE_CLASS = "bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] px-1.5 py-0 cursor-help whitespace-nowrap";
const UPDATED_BADGE_CLASS = "bg-amber-500/10 text-amber-800 dark:text-amber-400 text-[11px] pl-1 pr-1.5 py-0 cursor-help";

type NotesCellProps = {
  cell: Cell;
  freshness: CellFreshness | null;
};

export function NotesCell({ cell, freshness }: NotesCellProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const note = getCellNote(cell);
  const updatedOn = freshness === "updated" ? formatDayAndMonth(cell.updatedAt, i18n.language) : null;

  return (
    <td className="px-4 py-2">
      <div className="flex items-center gap-1.5">
        {note === null ? (
          <EmptyValue />
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span className="text-muted-foreground truncate max-w-32 cursor-help" />}>{note}</TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              {note}
            </TooltipContent>
          </Tooltip>
        )}
        {hasIotSupport(cell) ? (
          <span className={IOT_MARK_CLASS}>
            <HugeiconsIcon icon={WifiConnected01Icon} className="size-3" aria-hidden="true" /> IoT
          </span>
        ) : null}
        {hasRedCapSupport(cell) ? (
          <span className={REDCAP_MARK_CLASS}>
            <HugeiconsIcon icon={BatteryLowIcon} className="size-3" aria-hidden="true" /> RedCap
          </span>
        ) : null}
        {freshness === "new" ? (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary" className={NEW_BADGE_CLASS}>
                {t("common:labels.new")}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("specs.newCellTooltip")}</p>
              <p className="opacity-75">{formatShortDate(cell.createdAt, i18n.language)}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        {updatedOn !== null ? (
          <Tooltip>
            <TooltipTrigger aria-label={`${t("common:labels.updated")}: ${updatedOn}`}>
              <Badge variant="secondary" className={UPDATED_BADGE_CLASS}>
                <HugeiconsIcon icon={Clock01Icon} className="size-3" aria-hidden="true" />
                {updatedOn}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("specs.updatedCellTooltip")}</p>
              <p className="opacity-75">{formatShortDate(cell.updatedAt, i18n.language)}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </td>
  );
}

function formatDayAndMonth(date: string, language: string): string {
  return new Date(date).toLocaleDateString(language, { day: "numeric", month: "short" });
}
