import { AirportTowerIcon, Delete02Icon, Location01Icon, SignalFull02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  BackhaulMedium,
  Band,
  CellChange,
  LocationChange,
  Operator,
  Region,
  SectorChange,
  StationChange,
  StationIdentifierKind,
  StructureOwner,
  Submission,
  SubmissionAction,
} from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { StaleDataNotice } from "@/components/ui/error-state";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { structureOwnersQueryOptions } from "@/features/admin/reference/api/structureOwners";
import { toV1CellOperation, toV1SubmissionStatus, toV1SubmissionType } from "@/features/admin/submissions/api";
import { SubmissionCellCounts } from "@/features/admin/submissions/components/submissionListParts";
import { SubmissionLocationPhotoSelectionsSection } from "@/features/admin/submissions/components/submissionLocationPhotoSelectionsSection";
import { SubmissionPhotosSection } from "@/features/admin/submissions/components/submissionPhotosSection";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { bandsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { getBandDuplexMark, getBandLabel, isBandLabelInGhz } from "@/features/station-details/station/utils/bands";
import { getStructureTypeKey } from "@/features/station-details/station/utils/structure";
import { submissionQueryOptions } from "@/features/station-editing/data/submissions";
import { RAT_FIELDS } from "@/features/station-editing/model/ratFields";
import { SubmissionCellOperationBadge } from "@/features/submissions/components/submissionCellOperationBadge";
import { SubmissionStatusBadge } from "@/features/submissions/components/submissionStatusBadge";
import { SubmissionTypeBadge } from "@/features/submissions/components/submissionTypeBadge";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type SheetTranslate = TFunction<["submissions", "common", "stations", "stationDetails"]>;

type SubmissionChangesSheetProps = {
  submission: Submission;
  listUpdatedAt: number;
  operators: readonly Operator[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type StoredChangesProps = {
  submission: Submission;
  operators: readonly Operator[];
};

type ChangePair = {
  label: string;
  value: string;
};

type DetailPairProps = ChangePair & {
  className?: string;
};

type CellChangeItemProps = {
  cell: CellChange;
  band: Band | undefined;
  sectorText: string | null;
};

const ACTION_ORDER: readonly SubmissionAction[] = ["create", "update", "delete"];
const OPERATION_RAIL_CLASSES: Record<SubmissionAction, string> = {
  create: "before:bg-emerald-500",
  update: "before:bg-amber-500",
  delete: "before:bg-destructive",
};
const IDENTIFIER_ORDER: readonly StationIdentifierKind[] = ["networksId", "networksName", "operatorName"];
const MEDIUM_KEYS: Record<BackhaulMedium, string> = {
  fiber: "common:labels.uplinkFiber",
  microwave: "common:labels.uplinkMicrowave",
  satellite: "common:labels.uplinkSatellite",
};
const EMPTY_VALUE = "-";
const FALLBACK_OPERATOR_BRAND = "MNO";
const COORDINATE_DIGITS = 6;

function formatAzimuth(azimuth: number | null, t: SheetTranslate): string {
  return azimuth === null ? t("stationDetails:sectors.omnidirectional") : `${azimuth}°`;
}

function getIdentifierLabel(kind: StationIdentifierKind, operator: Operator | undefined, t: SheetTranslate): string {
  if (kind === "networksId") return t("common:labels.networksId");
  if (kind === "networksName") return t("common:labels.networksName");
  return t("common:labels.mnoName", { brand: operator?.name ?? FALLBACK_OPERATOR_BRAND });
}

function listStationPairs(change: StationChange | null, operator: Operator | undefined, t: SheetTranslate): ChangePair[] {
  if (change === null) return [];

  const { backhaul } = change;
  const pairs: ChangePair[] = [];
  if (change.siteId !== undefined) pairs.push({ label: t("common:labels.stationId"), value: change.siteId });
  if (change.operatorId !== undefined) pairs.push({ label: t("common:labels.operator"), value: operator?.name ?? `#${change.operatorId}` });
  for (const kind of IDENTIFIER_ORDER) {
    const identifier = change.identifiers?.find((entry) => entry.kind === kind);
    if (identifier !== undefined) pairs.push({ label: getIdentifierLabel(kind, operator, t), value: identifier.value ?? EMPTY_VALUE });
  }
  if (backhaul === null) pairs.push({ label: t("common:labels.uplinkType"), value: EMPTY_VALUE });
  if (backhaul?.medium !== undefined) pairs.push({ label: t("common:labels.uplinkType"), value: t(MEDIUM_KEYS[backhaul.medium]) });
  if (backhaul?.speedMbps !== undefined) {
    pairs.push({ label: t("common:labels.uplinkSpeed"), value: backhaul.speedMbps === null ? EMPTY_VALUE : String(backhaul.speedMbps) });
  }
  if (backhaul?.model !== undefined) pairs.push({ label: t("common:labels.uplinkModel"), value: backhaul.model || EMPTY_VALUE });
  if (change.notes !== undefined) pairs.push({ label: t("common:labels.notes"), value: change.notes || EMPTY_VALUE });
  return pairs;
}

function describeOwner(structure: NonNullable<LocationChange["structure"]>, owners: readonly StructureOwner[] | undefined): string {
  if (structure.ownerName) return structure.ownerName;
  if (structure.ownerId === null || structure.ownerId === undefined) return EMPTY_VALUE;
  return owners?.find((owner) => owner.id === structure.ownerId)?.name ?? `#${structure.ownerId}`;
}

function listLocationPairs(
  change: LocationChange | null,
  regions: readonly Region[] | undefined,
  owners: readonly StructureOwner[] | undefined,
  t: SheetTranslate,
): ChangePair[] {
  if (change === null) return [];

  const { regionId, latitude, longitude, structure } = change;
  const pairs: ChangePair[] = [];
  if (regionId !== undefined) {
    pairs.push({ label: t("common:labels.region"), value: regions?.find((region) => region.id === regionId)?.name ?? `#${regionId}` });
  }
  if (change.city !== undefined) pairs.push({ label: t("common:labels.city"), value: change.city || EMPTY_VALUE });
  if (change.address !== undefined) pairs.push({ label: t("common:labels.address"), value: change.address || EMPTY_VALUE });
  if (latitude !== undefined && longitude !== undefined) {
    pairs.push({ label: t("common:labels.coordinates"), value: `${latitude.toFixed(COORDINATE_DIGITS)}, ${longitude.toFixed(COORDINATE_DIGITS)}` });
  }
  if (structure?.type !== undefined) {
    pairs.push({ label: t("common:structure.type"), value: structure.type === null ? EMPTY_VALUE : t(getStructureTypeKey(structure.type)) });
  }
  if (structure !== undefined && (structure.ownerId !== undefined || structure.ownerName !== undefined)) {
    pairs.push({ label: t("common:structure.owner"), value: describeOwner(structure, owners) });
  }
  if (structure?.note !== undefined) pairs.push({ label: t("common:structure.note"), value: structure.note || EMPTY_VALUE });
  return pairs;
}

function getBandText(band: Band | undefined, bandId: number | null, language: string): string {
  if (band === undefined) return bandId === null ? EMPTY_VALUE : `#${bandId}`;

  const label = band.labelMhz === null || isBandLabelInGhz(band.labelMhz) ? (getBandLabel(band, language) ?? EMPTY_VALUE) : `${band.labelMhz} MHz`;
  const duplex = band.rat === "lte" || band.rat === "nr" ? getBandDuplexMark(band) : null;
  return duplex === null ? label : `${label} · ${duplex}`;
}

function findSectorText(cell: CellChange, sectors: readonly SectorChange[], t: SheetTranslate): string | null {
  const keyedIndex = cell.sectorKey === null ? -1 : sectors.findIndex((sector) => sector.key === cell.sectorKey);
  const keyed = keyedIndex === -1 ? undefined : sectors[keyedIndex];
  if (keyed !== undefined) {
    const azimuth = formatAzimuth(keyed.azimuth, t);
    return keyed.action === null ? `A${keyedIndex + 1} · ${azimuth}` : azimuth;
  }
  if (cell.sectorId === null) return null;

  const updated = sectors.find((sector) => sector.action === "update" && sector.id === cell.sectorId);
  return updated === undefined ? t("submissions:changesSheet.sectorId", { id: cell.sectorId }) : formatAzimuth(updated.azimuth, t);
}

function listRadioPairs(cell: CellChange, t: SheetTranslate): ChangePair[] {
  if (cell.rat === null) return [];

  const spec = RAT_FIELDS[cell.rat];
  const pairs: ChangePair[] = [];
  if (cell.mode !== undefined) pairs.push({ label: t("stations:edit.cells.columns.mode"), value: cell.mode.toUpperCase() });
  for (const { field, label } of spec.numbers) {
    const value = cell[field];
    if (value !== null && value !== undefined) pairs.push({ label, value: String(value) });
  }
  for (const { field, label } of spec.flags) {
    const isOn = cell[field];
    if (isOn !== undefined) pairs.push({ label, value: t(isOn ? "common:labels.yes" : "common:labels.no") });
  }
  return pairs;
}

function DetailPair({ label, value, className }: DetailPairProps) {
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word text-sm font-medium">{value}</dd>
    </div>
  );
}

function CellDetailPair({ label, value, className }: DetailPairProps) {
  return (
    <div className={cn("flex min-w-0 items-baseline gap-1.5", className)}>
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word min-w-0 font-mono text-xs font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function StationChanges({ submission, operators }: StoredChangesProps) {
  const { t } = useTranslation(["submissions", "common", "stations", "stationDetails"]);
  const { changes, station } = submission;
  const { sectors } = changes;
  const structure = changes.location?.structure;
  const { data: regions } = useQuery({ ...regionsQueryOptions(), enabled: changes.location?.regionId !== undefined });
  const { data: owners } = useQuery({ ...structureOwnersQueryOptions(), enabled: typeof structure?.ownerId === "number" });
  const operatorId = changes.station?.operatorId ?? station?.operatorId ?? null;
  const operator = operators.find((candidate) => candidate.id === operatorId);

  if (submission.action === "delete") {
    return (
      <section className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300">
            <HugeiconsIcon icon={Delete02Icon} className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="font-medium text-rose-800 dark:text-rose-200">{t("changesSheet.stationDelete")}</h3>
            <p className="mt-0.5 text-sm text-rose-800/80 dark:text-rose-200/80">
              {t("deletionBanner", { stationId: station?.siteId ?? submission.stationId })}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const stationFields = listStationPairs(changes.station, operator, t);
  const locationFields = listLocationPairs(changes.location, regions, owners, t);
  if (stationFields.length === 0 && locationFields.length === 0 && sectors.length === 0) return null;

  const isCompleteSectorList = sectors.some((sector) => sector.action === null);

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <HugeiconsIcon icon={AirportTowerIcon} className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-medium">{submission.action === "create" ? t("changesSheet.stationAdd") : t("changesSheet.stationUpdate")}</h3>
      </header>

      <div className="divide-y divide-border/60">
        {stationFields.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 px-3 py-3">
            {stationFields.map((field) => (
              <DetailPair key={field.label} label={field.label} value={field.value} />
            ))}
          </dl>
        ) : null}

        {locationFields.length > 0 ? (
          <div className="px-3 py-3">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Location01Icon} className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <h4 className="text-sm font-medium">{t("common:labels.location")}</h4>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-3">
              {locationFields.map((field) => (
                <DetailPair key={field.label} label={field.label} value={field.value} />
              ))}
            </dl>
          </div>
        ) : null}

        {sectors.length > 0 ? (
          <div className="px-3 py-3">
            <h4 className="text-sm font-medium">{t("changesSheet.sectors")}</h4>
            {isCompleteSectorList ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sectors.map((sector, index) => (
                  <span key={sector.key} className="rounded-md bg-muted px-2 py-1 font-mono text-xs tabular-nums">
                    A{index + 1} · {formatAzimuth(sector.azimuth, t)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                {ACTION_ORDER.flatMap((action) =>
                  sectors
                    .filter((sector) => sector.action === action)
                    .map((sector) => (
                      <span key={sector.key} className="inline-flex items-center gap-1.5">
                        <SubmissionCellOperationBadge operation={toV1CellOperation(action)} />
                        <span className="font-mono text-xs tabular-nums">{formatAzimuth(sector.azimuth, t)}</span>
                      </span>
                    )),
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CellChangeItem({ cell, band, sectorText }: CellChangeItemProps) {
  const { t, i18n } = useTranslation(["submissions", "common", "stations", "stationDetails"]);

  return (
    <li
      className={cn(
        "relative px-3 py-2.5",
        "before:absolute before:inset-y-2 before:left-0 before:w-px before:content-['']",
        OPERATION_RAIL_CLASSES[cell.action],
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <SubmissionCellOperationBadge operation={toV1CellOperation(cell.action)} />
        {cell.rat === null ? null : <TechnologySummary bands={[RAT_FIELDS[cell.rat].name]} className="mt-0 pl-0" />}
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{getBandText(band, cell.bandId, i18n.language)}</span>
        {cell.id === null ? null : (
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{t("changesSheet.cellId", { id: cell.id })}</span>
        )}
      </div>

      {cell.action === "delete" ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("changesSheet.deletedCell")}</p>
      ) : (
        <dl className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-2">
          {sectorText === null ? null : <CellDetailPair label={t("changesSheet.sector")} value={sectorText} />}
          {cell.cellType === null ? null : <CellDetailPair label={t("common:labels.cellType")} value={cell.cellType} />}
          {listRadioPairs(cell, t).map((pair) => (
            <CellDetailPair key={pair.label} label={pair.label} value={pair.value} />
          ))}
          {cell.notes ? <CellDetailPair label={t("common:labels.notes")} value={cell.notes} className="basis-full" /> : null}
        </dl>
      )}
    </li>
  );
}

function CellChanges({ submission }: Pick<StoredChangesProps, "submission">) {
  const { t } = useTranslation(["submissions", "common", "stations", "stationDetails"]);
  const { cells, sectors } = submission.changes;
  const { data: bands } = useQuery({ ...bandsQueryOptions(), enabled: cells.length > 0 });

  if (cells.length === 0) return null;

  return (
    <section className="@container overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={SignalFull02Icon} className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-medium">{t("changesSheet.cells")}</h3>
        </div>
        <SubmissionCellCounts cells={cells.map((cell) => ({ operation: toV1CellOperation(cell.action) }))} />
      </header>
      <ul className="divide-y divide-border/60">
        {ACTION_ORDER.flatMap((action) =>
          cells
            .filter((cell) => cell.action === action)
            .map((cell) => (
              <CellChangeItem
                key={cell.changeId}
                cell={cell}
                band={bands?.find((band) => band.id === cell.bandId)}
                sectorText={findSectorText(cell, sectors, t)}
              />
            )),
        )}
      </ul>
    </section>
  );
}

function SubmissionContext({ submission }: Pick<StoredChangesProps, "submission">) {
  const { t } = useTranslation("submissions");
  const { note, reviewNote } = submission;
  if (!note && !reviewNote) return null;

  return (
    <section className="space-y-3">
      {note ? (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">{t("detail.submitterNotes")}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{note}</p>
        </div>
      ) : null}
      {reviewNote ? (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">{t("detail.reviewerResponse")}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{reviewNote}</p>
        </div>
      ) : null}
    </section>
  );
}

export function SubmissionStoredChanges({ submission, operators }: StoredChangesProps) {
  return (
    <>
      <StationChanges submission={submission} operators={operators} />
      <CellChanges submission={submission} />
    </>
  );
}

export function SubmissionChangesSheet({ submission, listUpdatedAt, operators, open, onOpenChange }: SubmissionChangesSheetProps) {
  const { t, i18n } = useTranslation(["submissions", "common"]);
  const detailQuery = useQuery({
    ...submissionQueryOptions(submission.id),
    enabled: open,
    initialData: submission,
    initialDataUpdatedAt: listUpdatedAt,
  });
  const detail = detailQuery.data ?? submission;
  const shown = detailQuery.dataUpdatedAt >= listUpdatedAt ? detail : submission;
  const siteId = shown.station?.siteId ?? shown.changes.station?.siteId ?? t("common:labels.newStation");
  const { photos } = shown.changes;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full! max-w-2xl! gap-0 overflow-y-auto custom-scrollbar">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{t("changesSheet.title")}</SheetTitle>
          <SheetDescription>
            {siteId} · {formatFullDate(shown.createdAt, i18n.language)}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <SubmissionTypeBadge type={toV1SubmissionType(shown.action)} />
            <SubmissionStatusBadge status={toV1SubmissionStatus(shown.status)} />
          </div>
        </SheetHeader>

        <div className="space-y-6 px-4 py-4 pb-8">
          {detailQuery.isRefetchError ? (
            <div className="flex justify-center">
              <StaleDataNotice onRetry={() => detailQuery.refetch()} isRetrying={detailQuery.isFetching} />
            </div>
          ) : null}
          <SubmissionStoredChanges submission={shown} operators={operators} />
          <SubmissionLocationPhotoSelectionsSection photos={photos.selected} removalPhotos={photos.removed} />
          <SubmissionPhotosSection submissionId={shown.id} missingCount={Math.max(photos.announcedCount - photos.uploadedCount, 0)} />
          <SubmissionContext submission={shown} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
