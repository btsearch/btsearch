import { Alert02Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type BatchRow, type RowValueContext, type RowValues, getRowRat, getRowValues, isBandMissing } from "../model/batchRows";
import type { StationView } from "../model/batchView";
import { hasRowChanges, listFieldChoices } from "../model/fieldSelection";
import type { BatchRefusal } from "../model/refusals";
import type { BatchAction } from "../model/reviewState";
import { getBatchColumns } from "./batchColumns";
import { ChangeRow, RemoveButton, RestoreButton } from "./changeRow";
import { PhoneChangeRow } from "./phoneChangeRow";
import { BrandMark } from "@/components/cellular/brandMark";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import type { CellTexts } from "@/features/station-editing/components/cells/cellTexts";
import { CellHeadRow } from "@/features/station-editing/components/cells/ratCardHeader";
import { EditCard } from "@/features/station-editing/components/frame/editCard";
import { StatusStrip } from "@/features/station-editing/components/frame/statusStrip";
import type { EditReference } from "@/features/station-editing/data/lookups";
import { TEXT_SEPARATOR } from "@/features/station-editing/model/changes";
import { RAT_FIELDS, RAT_ORDER } from "@/features/station-editing/model/ratFields";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type StationChangeCardProps = {
  view: StationView;
  reference: EditReference;
  refusals: readonly BatchRefusal[];
  texts: CellTexts;
  isStaff: boolean;
  isPhone: boolean;
  isLocked: boolean;
  showsCountry: boolean;
  onChange: (action: BatchAction) => void;
};

type StationPlaceLineProps = {
  view: StationView;
  reference: EditReference;
  countText: string;
  isPhone: boolean;
  isMuted: boolean;
  showsCountry: boolean;
};

type WarningBadgeProps = {
  children: ReactNode;
};

type StationCardColumnsProps<Item> = {
  items: readonly Item[];
  renderCard: (item: Item) => ReactNode;
};

export const STATION_CARD_CLASS = "mb-3 max-md:mb-2.5";

const COLUMNS_CLASS = "flex flex-col gap-x-3 @[1620px]:flex-row @[1620px]:items-start";
const PHONE_BAR_CLASS = "max-md:py-1.5 max-md:pr-1.5 max-md:pl-3";
const BADGE_CLASS = cn(
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-amber-500/10 pr-2 pl-1.5",
  "text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400",
);

export function StationCardColumns<Item>({ items, renderCard }: StationCardColumnsProps<Item>) {
  const firstColumnSize = Math.ceil(items.length / 2);
  const columns = [items.slice(0, firstColumnSize), items.slice(firstColumnSize)];

  return (
    <div className={COLUMNS_CLASS}>
      {columns.map((column, position) => (
        <div key={position === 0 ? "first" : "second"} className="min-w-0 flex-1">
          {column.map((item) => renderCard(item))}
        </div>
      ))}
    </div>
  );
}

function WarningBadge({ children }: WarningBadgeProps) {
  return (
    <span className={BADGE_CLASS}>
      <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="size-3" />
      {children}
    </span>
  );
}

function getRowDisplayValues(row: BatchRow, sourceRow: BatchRow, context: RowValueContext): RowValues {
  const values = { ...getRowValues(sourceRow, context) };
  const included = new Set(listFieldChoices(row).map((choice) => choice.field));
  for (const choice of listFieldChoices(sourceRow)) {
    if (choice.required || included.has(choice.field)) continue;
    const value = values[choice.field];
    if (value !== undefined) values[choice.field] = { ...value, look: "plain", isMuted: true };
  }
  return values;
}

export function StationPlaceLine({ view, reference, countText, isPhone, isMuted, showsCountry }: StationPlaceLineProps) {
  const { t, i18n } = useTranslation();
  const { openStationDialog } = useFloatingDialogStack();
  const { station, countryCode } = view;
  const { place } = station;
  const regionName = place === null ? undefined : reference.regionsById.get(place.regionId)?.name;
  const city = place === null ? null : place.city;
  const hasRegion = !isPhone && regionName !== undefined;

  return (
    <>
      <button
        type="button"
        title={t("cellAnalyzer:batch.openStation", { siteId: station.siteId })}
        onClick={() => openStationDialog(station.id, "internal")}
        className={cn(
          "shrink-0 cursor-pointer font-mono text-[13px] leading-5 font-semibold tabular-nums hover:underline",
          isMuted && "text-muted-foreground",
        )}
      >
        {station.siteId}
      </button>
      {showsCountry && !isPhone && countryCode !== null ? (
        <CountryCodeTile code={countryCode} size="xs" label={getCountryName(countryCode, i18n.language)} />
      ) : null}
      <span className="min-w-0 truncate text-xs leading-4 text-muted-foreground">
        {city === null ? null : <span className={cn("font-medium", !isMuted && "text-foreground")}>{city}</span>}
        {city !== null && hasRegion ? TEXT_SEPARATOR : null}
        {hasRegion ? regionName : null}
      </span>
      <span className="shrink-0 text-xs leading-4 whitespace-nowrap text-muted-foreground">{countText}</span>
    </>
  );
}

function StationChangeCardInner({ view, reference, refusals, texts, isStaff, isPhone, isLocked, showsCountry, onChange }: StationChangeCardProps) {
  const { t, i18n } = useTranslation();
  const { station, rows, sectorsById, spread } = view;
  const { bandsById } = reference;
  const { language } = i18n;
  const valueContext = useMemo(
    (): RowValueContext => ({
      bandsById,
      sectorsById,
      language,
      unknownBandText: t("stations:cells.unknownBand"),
      omnidirectionalText: t("stationDetails:sectors.omnidirectional"),
      missingValueTitle: t("cellAnalyzer:batch.missingValue"),
    }),
    [bandsById, sectorsById, language, t],
  );

  const operator = station.operatorId === null ? undefined : reference.operatorsById.get(station.operatorId);
  const brand = getOperatorBrand(operator, reference.brands);
  const operatorName = operator === undefined ? t("common:labels.unknown") : operator.name;
  const keptChanges = t("stations:edit.frame.changeCount", {
    count: rows.filter((row) => !view.removedRows.has(row.index) && hasRowChanges(row)).length,
  });
  const removeLabel = t("submissions:batch.removeStation", { stationId: station.siteId });

  if (view.isRemoved) {
    return (
      <section
        aria-label={t("cellAnalyzer:batch.removedStationLabel", { siteId: station.siteId })}
        className={cn("overflow-hidden rounded-xl border border-dashed", STATION_CARD_CLASS)}
      >
        <div className={cn("flex min-h-[49px] items-center justify-between gap-2 py-2.5 pr-3 pl-4", PHONE_BAR_CLASS)}>
          <div className="flex min-w-0 items-center gap-2">
            <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden="true" className="size-3.5 shrink-0 -rotate-90 text-muted-foreground max-md:hidden" />
            <BrandMark brand={brand} />
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">{operatorName}</span>
            <StationPlaceLine
              view={view}
              reference={reference}
              countText={t("cellAnalyzer:batch.removedStation", { changes: keptChanges })}
              isPhone={isPhone}
              isMuted
              showsCountry={showsCountry}
            />
          </div>
          <RestoreButton isDisabled={isLocked} onClick={() => onChange({ type: "restoreStation", stationId: station.id })} />
        </div>
      </section>
    );
  }

  const stationRefusals = refusals.filter((refusal) => refusal.stationId === station.id);
  const spreadCount = spread === null ? 0 : spread.cellIds.length;
  const changes = t("stations:edit.frame.changeCount", { count: view.changeCount });
  const countText = spreadCount > 0 ? t("cellAnalyzer:batch.tacIncluded", { changes, count: spreadCount }) : changes;
  const rats = RAT_ORDER.filter((rat) => rows.some((row) => getRowRat(row) === rat));
  const RowComponent = isPhone ? PhoneChangeRow : ChangeRow;

  return (
    <EditCard
      title={<span className="whitespace-nowrap">{operatorName}</span>}
      lead={<BrandMark brand={brand} />}
      aside={
        <>
          <StationPlaceLine view={view} reference={reference} countText={countText} isPhone={isPhone} isMuted={false} showsCountry={showsCountry} />
          {view.isOutsideArea && !isPhone ? <WarningBadge>{t("cellAnalyzer:batch.outsideArea")}</WarningBadge> : null}
          {view.isCountryClosed && !isPhone ? <WarningBadge>{t("cellAnalyzer:batch.closedCountry")}</WarningBadge> : null}
        </>
      }
      actions={<RemoveButton label={removeLabel} isDisabled={isLocked} onClick={() => onChange({ type: "removeStation", stationId: station.id })} />}
      isCollapsible={!isPhone}
      ariaLabel={t("cellAnalyzer:batch.stationLabel", { siteId: station.siteId })}
      className={cn(STATION_CARD_CLASS, view.conflicts.size > 0 && "border-destructive/50")}
      barClassName={PHONE_BAR_CLASS}
    >
      {view.isGone ? <StatusStrip tone="danger" title={t("stations:edit.refusals.stationGone")} /> : null}
      {view.isOutsideArea ? (
        <StatusStrip tone="warning" title={t("cellAnalyzer:batch.outsideAreaTitle")}>
          {t("cellAnalyzer:batch.outsideAreaText")}
        </StatusStrip>
      ) : null}
      {view.isCountryClosed ? (
        <StatusStrip tone="warning" title={t("cellAnalyzer:batch.closedCountryTitle")}>
          {isStaff ? t("cellAnalyzer:batch.closedCountryStaffText") : t("cellAnalyzer:batch.closedCountryText")}
        </StatusStrip>
      ) : null}
      {stationRefusals.map((refusal, position) =>
        refusal.rowIndexes.length > 0 ? null : (
          <StatusStrip key={`${refusal.messageKey}:${position}`} tone="danger" title={t(refusal.messageKey, refusal.values)} />
        ),
      )}
      {rats.map((rat, ratPosition) => {
        const { columns, gridStyle } = getBatchColumns(rat, isStaff);

        return (
          <div key={rat} style={gridStyle} className={ratPosition > 0 ? "border-t" : undefined}>
            {isPhone ? null : (
              <CellHeadRow
                columns={columns}
                texts={texts}
                tail={
                  <>
                    <GenerationTag>{RAT_FIELDS[rat].generation}</GenerationTag>
                    <span className="font-semibold text-foreground/80">{RAT_FIELDS[rat].name}</span>
                  </>
                }
              />
            )}
            {rows.map((row, position) => {
              if (getRowRat(row) !== rat) return null;
              const sourceRow = view.sourceRows[position] ?? row;
              return (
                <RowComponent
                  key={row.key}
                  row={row}
                  sourceRow={sourceRow}
                  columns={columns}
                  values={getRowDisplayValues(row, sourceRow, valueContext)}
                  isRemoved={view.removedRows.has(row.index)}
                  isExcluded={!hasRowChanges(row)}
                  isLocked={isLocked}
                  conflict={view.conflicts.get(row.index)}
                  spreadCount={spread !== null && spread.firstRowIndex === row.index ? spreadCount : null}
                  isBandMissing={isBandMissing(row)}
                  refusals={stationRefusals.filter((refusal) => refusal.rowIndexes.includes(row.index))}
                  onChange={onChange}
                />
              );
            })}
          </div>
        );
      })}
    </EditCard>
  );
}

export const StationChangeCard = memo(StationChangeCardInner);
