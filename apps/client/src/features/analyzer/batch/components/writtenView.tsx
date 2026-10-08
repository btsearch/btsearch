import { ArrowLeft01Icon, ArrowRight01Icon, CheckmarkCircle02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { readNumber } from "../model/batchRows";
import type { StationView } from "../model/batchView";
import { type WrittenLine, type WrittenStation, toWrittenStations } from "../model/written";
import { STATION_CARD_CLASS, StationCardColumns, StationPlaceLine } from "./stationChangeCard";
import type { WrittenResult } from "./useAnalyzerBatch";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { getBandCode, getBandLabel } from "@/features/station-details/station/utils/bands";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { EditCard } from "@/features/station-editing/components/frame/editCard";
import { StatusStrip } from "@/features/station-editing/components/frame/statusStrip";
import type { EditReference } from "@/features/station-editing/data/lookups";
import { TEXT_SEPARATOR } from "@/features/station-editing/model/changes";
import { CELL_NUMBER_LABELS, RAT_FIELDS, isCellNumberField } from "@/features/station-editing/model/ratFields";
import type { CellNumberField, Rat } from "@/features/station-editing/model/types";
import { cn } from "@/lib/utils";

type WrittenViewProps = {
  result: WrittenResult;
  reference: EditReference;
  isPhone: boolean;
  showsCountry: boolean;
  onBack: () => void;
};

type WrittenCardProps = {
  view: StationView;
  written: WrittenStation;
  reference: EditReference;
  isPhone: boolean;
  showsCountry: boolean;
};

type WrittenRowProps = {
  line: WrittenLine;
  reference: EditReference;
};

const IDENTITY_FIELDS: Record<Rat, readonly CellNumberField[]> = { nr: ["gnbid", "clid"], lte: ["enbid", "clid"], umts: ["cid"], gsm: ["cid"] };

function formatNumbers(entries: readonly (readonly [string, number | null])[]): string {
  const texts = entries.flatMap(([field, value]) => (isCellNumberField(field) && value !== null ? [`${CELL_NUMBER_LABELS[field]} ${value}`] : []));
  return texts.join(TEXT_SEPARATOR);
}

function WrittenRow({ line, reference }: WrittenRowProps) {
  const { t, i18n } = useTranslation();
  const { cell, kind } = line;
  const band = cell.bandId === null ? undefined : reference.bandsById.get(cell.bandId);
  const bandCode = getBandCode(band);
  const identity = formatNumbers(IDENTITY_FIELDS[cell.rat].map((field) => [field, readNumber(cell, field)] as const));
  const changedNumbers = formatNumbers(Object.entries(line.numbers));

  let mark = changedNumbers;
  if (kind === "created") mark = t("cellAnalyzer:batch.writtenNew");
  if (kind === "confirmed") mark = t("cellAnalyzer:batch.writtenConfirmed");
  if (kind === "spread") mark = t("cellAnalyzer:batch.writtenSpread", { value: changedNumbers });

  return (
    <div className="flex min-h-9 items-center gap-2 border-t border-border/60 px-4 py-1.5 text-[13px] leading-[18px] first:border-t-0">
      <GenerationTag>{RAT_FIELDS[cell.rat].generation}</GenerationTag>
      <span className="shrink-0 font-semibold">{getBandLabel(band, i18n.language) ?? t("stations:cells.unknownBand")}</span>
      {bandCode === null ? null : <span className="shrink-0 text-xs text-muted-foreground">{bandCode}</span>}
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground/80">{identity}</span>
      {mark === "" ? null : <span className={cn("shrink-0 text-xs leading-4", kind === "spread" && "text-muted-foreground")}>{mark}</span>}
      <span title={t("common:labels.confirmed")} className="flex shrink-0 text-emerald-600 dark:text-emerald-400">
        <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{t("common:labels.confirmed")}</span>
      </span>
    </div>
  );
}

function WrittenCard({ view, written, reference, isPhone, showsCountry }: WrittenCardProps) {
  const { t } = useTranslation();
  const { station } = view;
  const operator = station.operatorId === null ? undefined : reference.operatorsById.get(station.operatorId);

  return (
    <EditCard
      title={<span className="whitespace-nowrap">{operator === undefined ? t("common:labels.unknown") : operator.name}</span>}
      lead={<BrandMark brand={getOperatorBrand(operator, reference.brands)} />}
      aside={
        <StationPlaceLine
          view={view}
          reference={reference}
          countText={t("common:labels.cells", { count: written.lines.length })}
          isPhone={isPhone}
          isMuted={false}
          showsCountry={showsCountry}
        />
      }
      ariaLabel={t("cellAnalyzer:batch.stationLabel", { siteId: station.siteId })}
      className={STATION_CARD_CLASS}
    >
      {written.lines.map((line) => (
        <WrittenRow key={line.cell.id} line={line} reference={reference} />
      ))}
    </EditCard>
  );
}

export function WrittenView({ result, reference, isPhone, showsCountry, onBack }: WrittenViewProps) {
  const { t } = useTranslation();
  const { operationId } = result.answer;
  const stations = t("cellAnalyzer:batch.onStations", { count: result.stationCount });
  const cards = toWrittenStations(result.answer, result.sources).flatMap((written) => {
    const view = result.stations.find((candidate) => candidate.station.id === written.stationId);
    return view === undefined ? [] : [{ view, written }];
  });

  return (
    <>
      <StatusStrip
        tone="success"
        icon={CheckmarkCircle02Icon}
        title={t("cellAnalyzer:batch.applied", { count: result.changeCount, stations })}
        action={
          <>
            {result.canOpenAudit && typeof operationId === "number" ? (
              <Link
                to="/admin/audit-logs"
                search={{ operation: operationId }}
                className="inline-flex shrink-0 items-center gap-1 text-[13px] leading-[18px] font-medium text-primary hover:underline"
              >
                {t("cellAnalyzer:batch.openAudit")}
                <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="size-3.5" />
              </Link>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={onBack} className="shrink-0 cursor-pointer text-foreground">
              <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" />
              {t("submissions:batch.backToAnalyzer")}
            </Button>
          </>
        }
      />
      <div className="@container min-h-0 flex-1 overflow-y-auto p-3 max-md:px-2 max-md:pb-28">
        <StationCardColumns
          items={cards}
          renderCard={({ view, written }) => (
            <WrittenCard key={written.stationId} view={view} written={written} reference={reference} isPhone={isPhone} showsCountry={showsCountry} />
          )}
        />
      </div>
    </>
  );
}
