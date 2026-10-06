import { useTranslation } from "react-i18next";

import {
  DifferencesCell,
  IdentifiersCell,
  OperatorName,
  RegisterHint,
  ResultBadge,
  RowTick,
  StationIdButton,
  StationPlace,
  TechnologyText,
  UnconfirmedMark,
} from "./analyzerCells";
import { ANALYZER_SECOND_LINE_CLASS } from "./analyzerLayout";
import { GroupTick, type StationGroupProps } from "./analyzerRow";
import type { RowOpeners, RowView } from "./rowView";
import { BrandMark } from "@/components/cellular/brandMark";
import { cn } from "@/lib/utils";

type AnalyzerCardProps = {
  view: RowView;
  isTicked: boolean;
  hasCountryTile: boolean;
  openers: RowOpeners;
  onToggle: (index: number, isTicked: boolean) => void;
};

const CARD_CLASS = "flex gap-2.5 border-t border-border/60 px-3 py-[9px] transition-colors first:border-t-0";
const CARD_LINE_CLASS = "flex min-w-0 items-center gap-1.5";
const ROW_NUMBER_CLASS = "ml-auto shrink-0 font-mono text-[11px] leading-4 tabular-nums text-muted-foreground";
const GROUP_CARD_CLASS = "flex h-9 items-center gap-2.5 border-t border-border/60 bg-muted/30 px-3 first:border-t-0";

export function AnalyzerCard({ view, isTicked, hasCountryTile, openers, onToggle }: AnalyzerCardProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { stationView, officialSites } = view;
  const placeClass = cn("flex min-w-0 flex-1 items-center gap-1.5", ANALYZER_SECOND_LINE_CLASS);

  return (
    <li className={cn(CARD_CLASS, isTicked ? "bg-muted/50" : null)}>
      <div className="flex pt-0.5">
        <RowTick view={view} isTicked={isTicked} onToggle={onToggle} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={CARD_LINE_CLASS}>
          <BrandMark brand={view.operator?.brand} />
          <OperatorName view={view} />
          <TechnologyText view={view} />
          {view.facts.isUnconfirmed ? <UnconfirmedMark /> : null}
          <span className={ROW_NUMBER_CLASS}>{view.index + 1}</span>
        </div>
        <IdentifiersCell view={view} isSingleLine />
        <div className={CARD_LINE_CLASS}>
          <ResultBadge status={view.facts.status} />
          {stationView === null ? null : (
            <>
              <StationIdButton station={stationView.station} className="shrink-0 text-[13px]" onOpen={openers.openStation} />
              <div className={placeClass}>
                <StationPlace stationView={stationView} hasCountryTile={hasCountryTile} hasRegion={false} />
              </div>
            </>
          )}
          {stationView === null && officialSites.length > 0 ? (
            <div className={placeClass}>
              <RegisterHint sites={officialSites} hasMoreSites={false} onOpen={openers.openOfficialSite} />
            </div>
          ) : null}
          {stationView === null && officialSites.length === 0 ? (
            <span className={cn("min-w-0 truncate", ANALYZER_SECOND_LINE_CLASS)}>{t("table.noStation")}</span>
          ) : null}
        </div>
        <DifferencesCell view={view} isSingleLine />
      </div>
    </li>
  );
}

export function StationGroupCard({ stationView, rowIndexes, mark, differenceCount, hasCountryTile, openers, onToggle }: StationGroupProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { station, operator } = stationView;

  return (
    <li className={GROUP_CARD_CLASS}>
      <GroupTick mark={mark} label={t("selection.selectStation", { siteId: station.siteId })} onToggle={() => onToggle(rowIndexes)} />
      <BrandMark brand={operator?.brand} />
      <StationIdButton station={station} className="shrink-0 text-[13px]" onOpen={openers.openStation} />
      <div className={cn("flex min-w-0 flex-1 items-center gap-1.5", ANALYZER_SECOND_LINE_CLASS)}>
        <StationPlace stationView={stationView} hasCountryTile={hasCountryTile} hasRegion={false} />
      </div>
      <span className="shrink-0 text-xs leading-4 font-medium tabular-nums">{t("table.differenceCount", { count: differenceCount })}</span>
    </li>
  );
}
