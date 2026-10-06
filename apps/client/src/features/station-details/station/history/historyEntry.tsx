import {
  AirportTowerIcon,
  ArrowUpRight01Icon,
  CompassIcon,
  EarthIcon,
  FullSignalIcon,
  Image01Icon,
  LinkIcon,
  Location01Icon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { getPartTitleKey } from "./entries";
import { describeFieldChanges } from "./fieldChanges";
import { HistoryCellChanges } from "./historyCellChanges";
import { HistoryChangeLines } from "./historyChangeLines";
import { HistoryPhotoChanges } from "./historyPhotoChanges";
import type { HistoryNames } from "./names";
import type { HistoryPartKind, StationHistoryAction, StationHistoryChange, StationHistoryItem } from "./types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserLink } from "@/features/user-profile/components/userLink";
import { formatFullDate, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

type HistoryEntryProps = {
  item: StationHistoryItem;
  part: StationHistoryChange;
  revertParts?: readonly StationHistoryChange[];
  names: HistoryNames;
  canOpenAuditLog: boolean;
  onRevert: (operationId: number, entryIds: number[]) => void;
};
type HistoryPartChangesProps = { part: StationHistoryChange; names: HistoryNames; topLevel?: boolean };

const PART_ICONS: Record<HistoryPartKind, IconSvgElement> = {
  station: AirportTowerIcon,
  location: Location01Icon,
  cells: FullSignalIcon,
  sectors: CompassIcon,
  identifiers: EarthIcon,
  backhaul: LinkIcon,
  photos: Image01Icon,
};

const ACTION_TEXT_CLASSES: Record<StationHistoryAction, string> = {
  create: "text-emerald-700 dark:text-emerald-300",
  update: "text-blue-700 dark:text-blue-300",
  delete: "text-rose-700 dark:text-rose-300",
};

const SOURCE_LABEL_KEYS: Record<StationHistoryItem["source"], string | null> = {
  api: null,
  import: "stationDetails:history.sources.import",
  system: "stationDetails:history.sources.system",
};

const ACTION_BUTTON_CLASS_NAME =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function HistoryPartChanges({ part, names, topLevel = false }: HistoryPartChangesProps) {
  const { t } = useTranslation();

  if (part.kind === "cells") return <HistoryCellChanges part={part} names={names} topLevel={topLevel} />;

  return (
    <div className={topLevel ? "mt-0" : "mt-0.5"}>
      {part.kind === "photos" ? <HistoryPhotoChanges part={part} /> : <HistoryChangeLines lines={describeFieldChanges(part.fields, names, t)} />}
    </div>
  );
}

function HistoryEntryRow({ item, part, revertParts, names, canOpenAuditLog, onRevert }: HistoryEntryProps) {
  const { t, i18n } = useTranslation("stationDetails");
  const isRevert = revertParts !== undefined;
  const icon = isRevert ? Undo02Icon : PART_ICONS[part.kind];
  const iconClassName = isRevert ? ACTION_TEXT_CLASSES.update : ACTION_TEXT_CLASSES[part.action];
  const titleKey = isRevert ? "stationDetails:history.operations.revert" : getPartTitleKey(part);
  const sourceLabelKey = item.author === null ? SOURCE_LABEL_KEYS[item.source] : null;

  return (
    <article className="flex gap-2.5 py-2.5 [content-visibility:auto] [contain-intrinsic-size:auto_5rem]">
      <span aria-hidden className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center", iconClassName)}>
        <HugeiconsIcon icon={icon} className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("flex min-w-0 flex-col gap-1 sm:flex-row sm:justify-between sm:gap-2", isRevert ? "sm:items-start" : "sm:items-end")}>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h4 className="min-w-0 text-sm font-medium leading-5 text-foreground">{t(titleKey)}</h4>
            {part.revertStatus !== "none" ? (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <HugeiconsIcon icon={Undo02Icon} className="size-3" aria-hidden="true" />
                {t(part.revertStatus === "complete" ? "history.revert.reverted" : "history.revert.partiallyReverted")}
              </span>
            ) : null}
          </div>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            {item.author !== null ? (
              <>
                <Avatar className="size-5 shrink-0">
                  <AvatarImage src={resolveAvatarUrl(item.author.image)} />
                  <AvatarFallback className="text-[9px]">{(item.author.name ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <UserLink user={item.author} className="max-w-48 truncate">
                  {item.author.name}
                  {item.author.username ? ` (@${item.author.username})` : null}
                </UserLink>
                <span className="text-muted-foreground/50">·</span>
              </>
            ) : null}
            {sourceLabelKey !== null ? (
              <>
                <span className="truncate">{t(sourceLabelKey)}</span>
                <span className="text-muted-foreground/50">·</span>
              </>
            ) : null}
            <time dateTime={item.createdAt} title={formatFullDate(item.createdAt, i18n.language)} className="shrink-0 tabular-nums">
              {new Date(item.createdAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
            </time>
            {part.isRevertible ? (
              <button
                type="button"
                onClick={() => onRevert(item.id, part.entryIds)}
                className={ACTION_BUTTON_CLASS_NAME}
                aria-label={t("common:actions.revertChange")}
              >
                <HugeiconsIcon icon={Undo02Icon} className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {canOpenAuditLog ? (
              <Link
                to="/admin/audit-logs"
                search={{ operation: item.id }}
                target="_blank"
                rel="noopener noreferrer"
                className={ACTION_BUTTON_CLASS_NAME}
                aria-label={t("history.openOperation")}
              >
                <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </span>
        </div>

        {isRevert ? (
          <div className="mt-1.5 space-y-2">
            {revertParts.map((revertPart, position) => (
              <section key={`${revertPart.kind}-${revertPart.action}-${position}`}>
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <HugeiconsIcon
                    icon={PART_ICONS[revertPart.kind]}
                    className={cn("size-3.5", ACTION_TEXT_CLASSES[revertPart.action])}
                    aria-hidden="true"
                  />
                  <h5>{t(getPartTitleKey(revertPart))}</h5>
                </div>
                <div className="pl-5">
                  <HistoryPartChanges part={revertPart} names={names} />
                </div>
              </section>
            ))}
          </div>
        ) : (
          <HistoryPartChanges part={part} names={names} topLevel />
        )}
      </div>
    </article>
  );
}

export const HistoryEntry = memo(HistoryEntryRow);
