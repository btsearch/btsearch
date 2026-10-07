import { Note01Icon, SquareArrowExpand01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import type { TickMark } from "../model/selection";
import { DescriptionCell, DifferencesCell, IdentifiersCell, MatchCell, OperatorCell, RowTick, StationIdButton, StationPlace } from "./analyzerCells";
import {
  ANALYZER_DESCRIPTION_ICON_CLASS,
  ANALYZER_DESCRIPTION_TEXT_CLASS,
  ANALYZER_GRID_CLASSES,
  ANALYZER_SECOND_LINE_CLASS,
  type DescriptionColumn,
} from "./analyzerLayout";
import type { RowOpeners, RowView, StationView } from "./rowView";
import { BrandMark } from "@/components/cellular/brandMark";
import { Checkbox } from "@/components/ui/checkbox";
import { ListCell, ListIconMark } from "@/features/stations/list/components/table/listCells";
import { ListRowActionButton, ListRowActions, ListRowMapLink } from "@/features/stations/list/components/table/listRowActions";
import { LIST_HEAD_ROW_CLASS, LIST_ROW_CLASS } from "@/features/stations/list/components/table/listTableRow";
import { cn } from "@/lib/utils";

type GroupTickProps = {
  mark: TickMark;
  label: string;
  onToggle: () => void;
};

type AnalyzerHeadRowProps = {
  column: DescriptionColumn;
  mark: TickMark;
  onTogglePage: () => void;
};

type AnalyzerRowProps = {
  view: RowView;
  column: DescriptionColumn;
  isTicked: boolean;
  hasCountryTile: boolean;
  hasRowActions: boolean;
  openers: RowOpeners;
  onToggle: (index: number, isTicked: boolean) => void;
};

export type StationGroupProps = {
  stationView: StationView;
  rowIndexes: readonly number[];
  mark: TickMark;
  differenceCount: number;
  hasCountryTile: boolean;
  openers: RowOpeners;
  onToggle: (rowIndexes: readonly number[]) => void;
};

const ROW_STATE_CLASS = "group/row transition-colors hover:bg-muted/50 has-[:focus-visible]:bg-muted/50";
const ROW_NUMBER_CLASS = "font-mono text-[11px] leading-3 tabular-nums text-muted-foreground";
const GROUP_ROW_CLASS = "flex h-9 shrink-0 items-center gap-3 border-t bg-muted/30 px-3 first:border-t-0";

export function GroupTick({ mark, label, onToggle }: GroupTickProps) {
  const isOff = mark === "none";

  return (
    <Checkbox
      checked={mark === "on"}
      indeterminate={mark === "mixed"}
      disabled={isOff}
      aria-label={label}
      className={isOff ? undefined : "cursor-pointer"}
      onCheckedChange={onToggle}
    />
  );
}

export function AnalyzerHeadRow({ column, mark, onTogglePage }: AnalyzerHeadRowProps) {
  const { t } = useTranslation("cellAnalyzer");
  const descriptionLabel = t("table.sourceDescription");

  return (
    <div role="row" className={cn(ANALYZER_GRID_CLASSES[column], LIST_HEAD_ROW_CLASS)}>
      <div role="columnheader" className="flex">
        <GroupTick mark={mark} label={t("selection.selectPage")} onToggle={onTogglePage} />
      </div>
      <div role="columnheader" className="truncate">
        {t("table.parsedCell")}
      </div>
      <div role="columnheader" className="truncate">
        {t("table.identifiers")}
      </div>
      <div role="columnheader" className="truncate">
        {t("table.matchResult")}
      </div>
      <div role="columnheader" className="truncate">
        {t("diff.title")}
      </div>
      {column === "shown" ? (
        <div role="columnheader" className="min-w-0">
          <div className={cn("truncate", ANALYZER_DESCRIPTION_TEXT_CLASS)}>{descriptionLabel}</div>
          <div className={ANALYZER_DESCRIPTION_ICON_CLASS}>
            <ListIconMark icon={Note01Icon} label={descriptionLabel} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AnalyzerRow({ view, column, isTicked, hasCountryTile, hasRowActions, openers, onToggle }: AnalyzerRowProps) {
  const { t } = useTranslation("terrainProfile");
  const station = view.stationView?.station;
  const location = station?.location ?? null;

  return (
    <div role="row" className={cn(ANALYZER_GRID_CLASSES[column], LIST_ROW_CLASS, ROW_STATE_CLASS, isTicked ? "bg-muted/50" : null)}>
      <ListCell className="flex flex-col items-start gap-1">
        <RowTick view={view} isTicked={isTicked} onToggle={onToggle} />
        <span className={ROW_NUMBER_CLASS}>{view.index + 1}</span>
      </ListCell>
      <ListCell>
        <OperatorCell view={view} />
      </ListCell>
      <ListCell>
        <IdentifiersCell view={view} />
      </ListCell>
      <ListCell>
        <MatchCell view={view} hasCountryTile={hasCountryTile} openers={openers} />
      </ListCell>
      <ListCell>
        <DifferencesCell view={view} />
      </ListCell>
      {column === "shown" ? (
        <ListCell>
          <DescriptionCell description={view.row.description} />
        </ListCell>
      ) : null}
      {hasRowActions && station !== undefined ? (
        <ListRowActions placement="row">
          <ListRowActionButton
            placement="row"
            label={t("header.openStation")}
            icon={SquareArrowExpand01Icon}
            onClick={() => openers.openStation(station)}
          />
          {location === null ? null : (
            <ListRowMapLink placement="row" locationId={location.id} latitude={location.latitude} longitude={location.longitude} />
          )}
        </ListRowActions>
      ) : null}
    </div>
  );
}

export function StationGroupRow({ stationView, rowIndexes, mark, differenceCount, hasCountryTile, openers, onToggle }: StationGroupProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { station, operator, regionName } = stationView;

  return (
    <div role="row" className={GROUP_ROW_CLASS}>
      <div role="cell" className="flex w-9 shrink-0">
        <GroupTick mark={mark} label={t("selection.selectStation", { siteId: station.siteId })} onToggle={() => onToggle(rowIndexes)} />
      </div>
      <div role="cell" className="flex min-w-0 flex-1 items-center gap-2">
        <BrandMark brand={operator?.brand} />
        {operator === undefined ? null : <span className="shrink-0 text-[13.5px] leading-5 font-semibold">{operator.operator.name}</span>}
        <StationIdButton station={station} className="shrink-0" onOpen={openers.openStation} />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] leading-5 text-muted-foreground">
          <StationPlace stationView={stationView} hasCountryTile={hasCountryTile} hasRegion={false} />
        </div>
      </div>
      {regionName === null ? null : (
        <div role="cell" className={cn("shrink-0", ANALYZER_SECOND_LINE_CLASS)}>
          {regionName}
        </div>
      )}
      <div role="cell" className="min-w-18.5 shrink-0 text-right text-xs leading-4 font-medium tabular-nums">
        {t("table.differenceCount", { count: differenceCount })}
      </div>
    </div>
  );
}
