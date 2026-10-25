import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CellRat } from "@openbts/shared/contract/constants";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Reveal } from "../../components/search-overlay/mapFilterMotion";
import { type MapLookups, getOperatorLook } from "../../data/mapLookups";
import { CARD_NOTE_CLASS, CARD_SECTION_TITLE_CLASS, CollapseButton, SwitchRow } from "../card/cardParts";
import { EdgesLegend, LegendTitle, LevelLegend, SinrLegend } from "../card/crowdLegend";
import { type CrowdTheme, getSectorColor } from "../style/palette";
import {
  type MeasuredCoverage,
  chooseMeasuredCoverageBand,
  chooseMeasuredCoverageCell,
  colorMeasuredCoverageBySinr,
  hideMeasuredCoverage,
} from "./coverageStore";
import type { MeasuredCoverageBand, MeasuredCoverageCell, MeasuredCoverageView } from "./coverageView";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ObservedCellMeasurementsPopover } from "@/features/station-details/station/measurements/cellMeasurementsPopover";
import { getBandCode, getBandLabel } from "@/features/station-details/station/utils/bands";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

type MeasuredCoverageCardProps = {
  theme: CrowdTheme;
  coverage: MeasuredCoverage;
  view: MeasuredCoverageView | null;
  lookups: MapLookups | undefined;
  isLoading: boolean;
  isZoomedOut: boolean;
  error: { onRetry: () => void; isRetrying: boolean } | null;
  isCountryPrivate: boolean;
};

type BandTabsProps = {
  bands: readonly MeasuredCoverageBand[];
  chosen: MeasuredCoverageBand;
};

type CellRowsProps = {
  band: MeasuredCoverageBand;
  theme: CrowdTheme;
};

type OneCellViewProps = {
  cell: MeasuredCoverageCell;
  coverage: MeasuredCoverage;
  theme: CrowdTheme;
};

const ROW_BUTTON_CLASS =
  "flex min-h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50";
const CELL_NODE_NAMES: Record<CellRat, string | null> = { lte: "eNBID", nr: "gNBID", umts: null, gsm: null };

function formatBearing(bearing: number | null): string | null {
  return bearing === null ? null : `${Math.round(bearing)}°`;
}

function getBandTabValue(band: MeasuredCoverageBand): string {
  return String(band.bandId);
}

function describeCell(cell: MeasuredCoverageCell, t: TFunction<"main">): string | null {
  const notes: string[] = [];
  if (cell.isOutsideDatabase) {
    const node = CELL_NODE_NAMES[cell.record.rat];
    notes.push(node === null ? t("crowd.coverage.outsideDatabase") : t("crowd.coverage.outsideDatabaseByNode", { node }));
  }
  if (cell.record.geometry === null) notes.push(t("crowd.coverage.noShape"));
  return notes.length > 0 ? notes.join(", ") : null;
}

function BandTabs({ bands, chosen }: BandTabsProps) {
  const { t, i18n } = useTranslation("main");
  const language = i18n.resolvedLanguage ?? i18n.language;
  const attachWheel = useHorizontalScroll<HTMLDivElement>();

  return (
    <Tabs
      value={getBandTabValue(chosen)}
      onValueChange={(value) => {
        const band = bands.find((entry) => getBandTabValue(entry) === value);
        if (band !== undefined) chooseMeasuredCoverageBand(band.bandId);
      }}
      className="mt-2.5"
    >
      <TabsList
        ref={attachWheel}
        aria-label={t("crowd.coverage.band")}
        className="no-scrollbar w-full justify-start overflow-x-auto overflow-y-hidden"
      >
        {bands.map((band) => {
          const code = getBandCode(band.band);
          return (
            <TabsTrigger key={getBandTabValue(band)} value={getBandTabValue(band)} className="cursor-pointer text-xs tabular-nums">
              <span>{getBandLabel(band.band, language) ?? t("crowd.unknownBand")}</span>
              {code === null ? null : <span className="text-[11px] font-medium text-muted-foreground">{code}</span>}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

function CellRows({ band, theme }: CellRowsProps) {
  const { t } = useTranslation("main");

  return (
    <ul className="-mx-1.5">
      {band.cells.map((cell) => {
        const note = describeCell(cell, t);
        const bearing = formatBearing(cell.bearingDegrees);
        return (
          <li key={cell.record.id} className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => chooseMeasuredCoverageCell(cell.record.id)}
              aria-label={t("crowd.coverage.showCell", { cell: cell.label })}
              className={ROW_BUTTON_CLASS}
            >
              <span aria-hidden="true" className="size-3 shrink-0 rounded-[3px]" style={{ background: getSectorColor(cell.colorIndex, theme) }} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs leading-4 font-medium">{cell.label}</span>
                {note === null ? null : <span className="block text-[11px] leading-3.5 text-muted-foreground">{note}</span>}
              </span>
              {bearing === null ? null : (
                <span className="shrink-0 font-mono text-[11px] leading-4 text-muted-foreground tabular-nums">{bearing}</span>
              )}
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
            {cell.isOutsideDatabase ? <ObservedCellMeasurementsPopover cell={cell} band={band.band} className="w-5 justify-center px-0" /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function OneCellView({ cell, coverage, theme }: OneCellViewProps) {
  const { t } = useTranslation("main");
  const isMobile = useIsMobile();
  const bearing = formatBearing(cell.bearingDegrees);

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="xs" onClick={() => chooseMeasuredCoverageCell(null)} className="-ml-1.5 cursor-pointer">
          <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("crowd.coverage.allCells")}
        </Button>
        <span className="flex-1" />
        <span className="text-xs leading-4 font-semibold">{cell.label}</span>
        {bearing === null || isMobile ? null : <span className="font-mono text-[11px] leading-4 text-muted-foreground tabular-nums">{bearing}</span>}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <p className="flex-1 text-xs leading-4 font-medium">
          {coverage.colorBySinr ? <LegendTitle title="SINR" unit="dB" /> : <LegendTitle title={t("crowd.legend.signal")} unit="dBm" />}
        </p>
        <SwitchRow
          label={t("crowd.coverage.colorBySinr")}
          checked={coverage.colorBySinr}
          onCheckedChange={colorMeasuredCoverageBySinr}
          className="-mr-1.5 h-6 px-1.5"
        />
      </div>
      <div className="mt-1.5">
        {coverage.colorBySinr ? <SinrLegend theme={theme} /> : <LevelLegend theme={theme} caption={t("crowd.coverage.oneCellCaption")} />}
      </div>
    </div>
  );
}

export function MeasuredCoverageCard({ theme, coverage, view, lookups, isLoading, isZoomedOut, error, isCountryPrivate }: MeasuredCoverageCardProps) {
  const { t } = useTranslation("main");
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [lastCellId, setLastCellId] = useState(coverage.observedCellId);
  const { target } = coverage;
  const look = getOperatorLook(lookups, target.operatorId);
  const band = view?.band ?? null;
  const chosenCell = view?.chosenCell ?? null;

  if (lastCellId !== coverage.observedCellId) {
    setLastCellId(coverage.observedCellId);
    if (coverage.observedCellId !== null) setIsCollapsed(false);
  }

  return (
    <>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-sm leading-5 font-medium">
            {t("crowd.coverage.title")}
            {isLoading ? <Spinner className="size-3" /> : null}
          </h3>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <BrandMark brand={{ color: look.color, logo: look.brand?.logo ?? null }} size={14} />
            <span className="truncate text-xs leading-4 font-medium">{look.operator?.name ?? t("unknownOperator")}</span>
            <span className="shrink-0 font-mono text-xs leading-4 text-foreground/70 tabular-nums">{target.title}</span>
            {target.kind === "estimatedSite" ? (
              <span className="shrink-0 text-[11px] leading-4 font-semibold text-muted-foreground">{t("crowd.estimated")}</span>
            ) : null}
          </div>
        </div>
        <CollapseButton isCollapsed={isCollapsed} onToggle={() => setIsCollapsed((collapsed) => !collapsed)} />
        <CloseButton size="xs" label={t("crowd.coverage.turnOff")} onClick={hideMeasuredCoverage} />
      </div>

      {view !== null && band !== null && error === null ? <BandTabs bands={view.bands} chosen={band} /> : null}

      <Reveal shown={!isCollapsed}>
        {error === null ? null : (
          <InlineError size="sm" title={t("crowd.coverage.loadError")} onRetry={error.onRetry} isRetrying={error.isRetrying} className="mt-2.5" />
        )}
        {view !== null && band === null && error === null ? (
          <p className={CARD_NOTE_CLASS}>{t(isCountryPrivate ? "crowd.coverage.notPublic" : "crowd.coverage.noCells")}</p>
        ) : null}
        {isZoomedOut && band !== null && error === null ? <p className={CARD_NOTE_CLASS}>{t("crowd.coverage.zoomIn")}</p> : null}
        {band !== null && chosenCell === null && error === null ? (
          <div className="mt-3">
            {isMobile ? null : <h4 className={cn(CARD_SECTION_TITLE_CLASS, "mb-1")}>{t("crowd.coverage.cells")}</h4>}
            <CellRows band={band} theme={theme} />
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("crowd.coverage.cellsCaption")}</p>
          </div>
        ) : null}
        {chosenCell !== null && error === null ? (
          <>
            <OneCellView cell={chosenCell} coverage={coverage} theme={theme} />
            <div className="mt-3">
              <EdgesLegend
                theme={theme}
                caption={t(isMobile ? "crowd.coverage.edgesCaptionShort" : "crowd.coverage.edgesCaptionCell")}
                showsTitle={!isMobile}
              />
            </div>
          </>
        ) : null}
      </Reveal>
    </>
  );
}
