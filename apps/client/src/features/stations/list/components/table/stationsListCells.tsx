import { AlertCircleIcon, Note01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { LIST_DETAIL_SEPARATOR, ListIconMark } from "./listCells";
import { LIST_ROW_LINK_CLASS } from "./listTableRow";
import { BrandMark } from "@/components/cellular/brandMark";
import { EmptyValue } from "@/components/ui/emptyValue";
import { EDITOR_STATION_SEARCH } from "@/features/admin/stations/editorStationSearch";
import { HighlightedText } from "@/features/shared/HighlightedText";
import { groupTechnologyBands } from "@/features/station-details/station/utils/bands";
import { type CellIdentifierField, findCellIdentifierLabel } from "@/features/station-details/station/utils/cells";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import type { StationsListVariant } from "@/features/stations/list/data/stationsListFilters";
import type { StationsListMatchLine, StationsListRow } from "@/features/stations/list/data/stationsListRows";
import type { GpsFormat } from "@/hooks/usePreferences";
import { hasModifierKey } from "@/lib/dom/keyboard";
import { formatCoordinates } from "@/lib/geo/coordinates";
import { cn } from "@/lib/utils";

type StationLinkProps = {
  row: StationsListRow;
  variant: StationsListVariant;
  className: string;
  label?: string;
  title?: string;
  onWindowOpen: (row: StationsListRow) => void;
  children: ReactNode;
};

type StationIdentityProps = {
  row: StationsListRow;
  variant: StationsListVariant;
  onWindowOpen: (row: StationsListRow) => void;
};

type StationMatchLineProps = {
  matchLine: StationsListMatchLine;
  operatorName: string | null;
  className?: string;
};

type StationNodeIdsProps = {
  enbIds: readonly number[];
  gnbIds: readonly number[];
};

type StationCoordinatesProps = {
  latitude: number;
  longitude: number;
  gpsFormat: GpsFormat;
  hasAddress: boolean;
  className?: string;
};

const STATION_PATHS: Record<StationsListVariant, string> = { public: "/stations", admin: "/admin/stations" };
const GENERIC_OPERATOR_CODE = "MNO";
const WORD_SEPARATOR = " ";
const TECHNOLOGY_SEPARATOR = " / ";
const NODE_IDS_LINE_CLASS = "block text-[13px] leading-5";
const GNBID_LABEL = getIdentifierLabel("gnbid");

export const STATION_ID_CLASS = "font-mono text-sm leading-5 font-semibold tabular-nums";
export const STATION_ENBID_LABEL = getIdentifierLabel("enbid");

function getIdentifierLabel(field: CellIdentifierField): string {
  return findCellIdentifierLabel(field) ?? field;
}

export function getStationHref(row: StationsListRow, variant: StationsListVariant): string {
  return `${STATION_PATHS[variant]}/${row.id}`;
}

export function getStationLabel(row: StationsListRow): string {
  return [row.operatorName, row.siteId, row.city].filter((part) => part !== null).join(WORD_SEPARATOR);
}

export function getStationBandsText(bands: readonly string[], language: string): string {
  const technologies = [...groupTechnologyBands(bands, language)];
  return technologies.map(([technology, values]) => [technology, ...values].join(WORD_SEPARATOR)).join(TECHNOLOGY_SEPARATOR);
}

function getMatchedCellsText(matchLine: StationsListMatchLine, t: TFunction): string | null {
  if (matchLine.kind !== "cells" || matchLine.cellCount === 0) return null;
  if (matchLine.rat === null) return t("common:labels.cells", { count: matchLine.cellCount });
  return t("stations:list.cellsOfRat", { count: matchLine.cellCount, rat: matchLine.rat });
}

export function StationLink({ row, variant, className, label, title, onWindowOpen, children }: StationLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (hasModifierKey(event)) return;

    event.preventDefault();
    onWindowOpen(row);
  }

  if (variant === "admin") {
    return (
      <Link
        to="/admin/stations/$id"
        params={{ id: String(row.id) }}
        search={EDITOR_STATION_SEARCH}
        className={className}
        aria-label={label}
        title={title}
      >
        {children}
      </Link>
    );
  }

  return (
    <a href={getStationHref(row, variant)} className={className} aria-label={label} title={title} onClick={handleClick}>
      {children}
    </a>
  );
}

export function StationMarks({ row }: { row: StationsListRow }) {
  const { t } = useTranslation("stations");

  return (
    <>
      {row.note === null ? null : <ListIconMark icon={Note01Icon} label={`${t("common:labels.notes")}: ${row.note}`} tooltip={row.note} />}
      {row.isConfirmed ? null : <ListIconMark icon={AlertCircleIcon} label={t("list.unconfirmed")} />}
    </>
  );
}

export function StationOperatorLine({ row, className }: { row: StationsListRow; className?: string }) {
  const { t } = useTranslation("main");
  const operatorName = row.operatorName ?? t("unknownOperator");

  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground", className)}>
      <span className="truncate" title={operatorName}>
        {operatorName}
      </span>
      {row.badgeStatus === null ? null : (
        <>
          <span aria-hidden="true">·</span>
          <StationStatusBadge status={row.badgeStatus} statusChangedAt={row.statusChangedAt} className="shrink-0" />
        </>
      )}
    </span>
  );
}

export function StationIdentity({ row, variant, onWindowOpen }: StationIdentityProps) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1.5">
      <BrandMark brand={row.brand} />
      <div className="flex min-w-0 items-center gap-1.5">
        <StationLink
          row={row}
          variant={variant}
          className={cn(STATION_ID_CLASS, LIST_ROW_LINK_CLASS, "min-w-0 truncate")}
          label={getStationLabel(row)}
          title={row.siteId}
          onWindowOpen={onWindowOpen}
        >
          <HighlightedText text={row.siteId} query={row.siteIdMark} />
        </StationLink>
        <StationMarks row={row} />
      </div>
      <StationOperatorLine row={row} className="col-start-2" />
    </div>
  );
}

export function StationMatchLine({ matchLine, operatorName, className }: StationMatchLineProps) {
  const { t } = useTranslation("stations");
  const identifierLabels = {
    networksId: t("common:labels.networksId"),
    networksName: t("common:labels.networksName"),
    operatorName: t("common:labels.mnoName", { brand: operatorName ?? GENERIC_OPERATOR_CODE }),
  };
  const label = matchLine.kind === "cells" ? matchLine.label : identifierLabels[matchLine.field];
  const cellsText = getMatchedCellsText(matchLine, t);
  const fullText = [`${label} ${matchLine.value}`, cellsText].filter((part) => part !== null).join(LIST_DETAIL_SEPARATOR);

  return (
    <span title={fullText} className={cn("flex min-w-0 items-center gap-1 overflow-hidden text-xs leading-4 text-muted-foreground", className)}>
      <HugeiconsIcon icon={Search01Icon} className="size-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t("list.matched")}: </span>
      <span className="min-w-0 truncate">
        {label}{" "}
        <span className="font-mono">
          <HighlightedText text={matchLine.value} query={matchLine.value.toLocaleLowerCase()} />
        </span>
        {cellsText === null ? null : (
          <>
            <span aria-hidden="true">{LIST_DETAIL_SEPARATOR}</span>
            <span className="sr-only">, </span>
            {cellsText}
          </>
        )}
      </span>
    </span>
  );
}

export function StationNodeIds({ enbIds, gnbIds }: StationNodeIdsProps) {
  const enbText = enbIds.join(WORD_SEPARATOR);
  const gnbText = gnbIds.join(WORD_SEPARATOR);

  if (enbIds.length === 0 && gnbIds.length === 0) {
    return (
      <span className={NODE_IDS_LINE_CLASS}>
        <EmptyValue />
      </span>
    );
  }

  return (
    <>
      {enbIds.length === 0 ? null : (
        <span className={cn(NODE_IDS_LINE_CLASS, "truncate font-mono tabular-nums")} title={`${STATION_ENBID_LABEL} ${enbText}`}>
          {enbText}
        </span>
      )}
      {gnbIds.length === 0 ? null : (
        <span className="block truncate text-xs leading-4 text-muted-foreground" title={`${GNBID_LABEL} ${gnbText}`}>
          {GNBID_LABEL} <span className="font-mono tabular-nums">{gnbText}</span>
        </span>
      )}
    </>
  );
}

export function StationCoordinates({ latitude, longitude, gpsFormat, hasAddress, className }: StationCoordinatesProps) {
  const { t } = useTranslation("common");
  const text = formatCoordinates(latitude, longitude, gpsFormat);

  return (
    <span title={text} className={cn("min-w-0 truncate", className)}>
      {hasAddress ? (
        <span aria-hidden="true" className="mr-2">
          ·
        </span>
      ) : null}
      <span className="sr-only">{t("labels.coordinates")}: </span>
      <span className="font-mono tabular-nums">{text}</span>
    </span>
  );
}
