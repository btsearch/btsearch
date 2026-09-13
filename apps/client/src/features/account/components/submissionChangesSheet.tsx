import { AirportTowerIcon, AlertCircleIcon, Delete02Icon, Location01Icon, SignalFull02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmissionCellCounts } from "@/features/admin/submissions/components/submissionListParts";
import { SubmissionLocationPhotoSelectionsSection } from "@/features/admin/submissions/components/submissionLocationPhotoSelectionsSection";
import { SubmissionPhotosSection } from "@/features/admin/submissions/components/submissionPhotosSection";
import { SUBMISSION_STATUS } from "@/features/admin/submissions/submissionUI";
import type { ProposedCell, SubmissionDetail, SubmissionRow } from "@/features/admin/submissions/types";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { CELL_TYPE_LABELS } from "@/features/shared/cellTypes";
import { bandsQueryOptions, regionsQueryOptions } from "@/features/shared/queries";
import { getRatDetailFieldLabel, getRatDetailFields } from "@/features/shared/ratCellFields";
import { SubmissionCellOperationBadge } from "@/features/submissions/components/submissionCellOperationBadge";
import { SubmissionTypeBadge } from "@/features/submissions/components/submissionTypeBadge";
import { submissionDetailQueryOptions } from "@/features/submissions/queries";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Band, Operator } from "@/types/station";

type CellOperation = ProposedCell["operation"];

type SubmissionChangesSheetProps = {
  submission: SubmissionRow | null;
  operators: Operator[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const OPERATION_ORDER: CellOperation[] = ["add", "update", "delete"];

const OPERATION_RAIL_CLASS = {
  add: "before:bg-emerald-500",
  update: "before:bg-amber-500",
  delete: "before:bg-destructive",
} satisfies Record<CellOperation, string>;

function formatCellValue(value: unknown, t: TFunction<["submissions", "common"]>): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return t(value ? "common:labels.yes" : "common:labels.no");
  if (typeof value === "string" && (value === "nsa" || value === "sa")) return value.toUpperCase();
  if (Array.isArray(value)) return value.map((item) => formatCellValue(item, t)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  return "-";
}

function DetailPair({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word text-sm font-medium">{value}</dd>
    </div>
  );
}

function CellDetailPair({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-baseline gap-1.5", className)}>
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word min-w-0 font-mono text-xs font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function StationChanges({ submission, operators }: { submission: SubmissionDetail; operators: Operator[] }) {
  const { t } = useTranslation(["submissions", "common"]);
  const operatorById = useMemo(() => new Map(operators.map((operator) => [operator.id, operator])), [operators]);
  const { data: regions = [] } = useQuery({ ...regionsQueryOptions(), enabled: submission.proposedLocation !== null });
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const proposedStation = submission.proposedStation;
  const proposedLocation = submission.proposedLocation;
  const proposedOperator =
    proposedStation?.operator_id !== null && proposedStation?.operator_id !== undefined ? operatorById.get(proposedStation.operator_id) : undefined;
  const hasStationFields =
    proposedStation !== null &&
    [
      proposedStation.station_id,
      proposedStation.operator_id,
      proposedStation.notes,
      proposedStation.networks_id,
      proposedStation.networks_name,
      proposedStation.mno_name,
    ].some((value) => value !== null && value !== undefined);

  if (submission.type === "delete") {
    return (
      <section className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300">
            <HugeiconsIcon icon={Delete02Icon} className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="font-medium text-rose-800 dark:text-rose-200">{t("changesSheet.stationDelete")}</h3>
            <p className="mt-0.5 text-sm text-rose-800/80 dark:text-rose-200/80">
              {t("deletionBanner", { stationId: submission.station?.station_id ?? submission.station_id })}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!hasStationFields && proposedLocation === null && submission.sectors.length === 0) return null;

  const stationFields: Array<{ label: string; value: string }> = [];
  if (proposedStation?.station_id !== null && proposedStation?.station_id !== undefined)
    stationFields.push({ label: t("common:labels.stationId"), value: proposedStation.station_id });
  if (proposedStation?.operator_id !== null && proposedStation?.operator_id !== undefined)
    stationFields.push({
      label: t("common:labels.operator"),
      value: proposedOperator?.name ?? `#${proposedStation.operator_id}`,
    });
  if (proposedStation?.networks_id !== null && proposedStation?.networks_id !== undefined)
    stationFields.push({ label: t("common:labels.networksId"), value: String(proposedStation.networks_id) });
  if (proposedStation?.networks_name !== null && proposedStation?.networks_name !== undefined)
    stationFields.push({ label: t("common:labels.networksName"), value: proposedStation.networks_name });
  if (proposedStation?.mno_name !== null && proposedStation?.mno_name !== undefined)
    stationFields.push({ label: t("common:labels.mnoName", { brand: proposedOperator?.name ?? "MNO" }), value: proposedStation.mno_name });
  if (proposedStation?.notes !== null && proposedStation?.notes !== undefined)
    stationFields.push({ label: t("common:labels.notes"), value: proposedStation.notes || "-" });

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <HugeiconsIcon icon={AirportTowerIcon} className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-medium">{t(submission.type === "new" ? "changesSheet.stationAdd" : "changesSheet.stationUpdate")}</h3>
      </header>

      <div className="divide-y divide-border/60">
        {stationFields.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 px-3 py-3">
            {stationFields.map((field) => (
              <DetailPair key={field.label} label={field.label} value={field.value} />
            ))}
          </dl>
        ) : null}

        {proposedLocation ? (
          <div className="px-3 py-3">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Location01Icon} className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <h4 className="text-sm font-medium">{t("common:labels.location")}</h4>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-3">
              <DetailPair
                label={t("common:labels.region")}
                value={regionById.get(proposedLocation.region_id)?.name ?? `#${proposedLocation.region_id}`}
              />
              <DetailPair label={t("common:labels.city")} value={proposedLocation.city || "-"} />
              <DetailPair label={t("common:labels.address")} value={proposedLocation.address || "-"} />
              <DetailPair
                label={t("common:labels.coordinates")}
                value={`${proposedLocation.latitude.toFixed(6)}, ${proposedLocation.longitude.toFixed(6)}`}
              />
            </dl>
          </div>
        ) : null}

        {submission.sectors.length > 0 ? (
          <div className="px-3 py-3">
            <h4 className="text-sm font-medium">{t("changesSheet.sectors")}</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {submission.sectors.map((sector, index) => (
                <span key={sector.id} className="rounded-md bg-muted px-2 py-1 font-mono text-xs tabular-nums">
                  A{index + 1} · {sector.azimuth}°
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getBandLabel(cell: ProposedCell, band: Band | undefined): string {
  if (band) return `${band.value} MHz${band.duplex ? ` · ${band.duplex}` : ""}`;
  if (cell.band_id !== null) return `#${cell.band_id}`;
  return "-";
}

function CellChangeItem({ cell, band, sectorLabel }: { cell: ProposedCell; band: Band | undefined; sectorLabel: string | null }) {
  const { t } = useTranslation(["submissions", "common", "stations"]);
  const details = cell.details ?? {};
  const configuredFields = getRatDetailFields(cell.rat).filter((field) => details[field.key] !== null && details[field.key] !== undefined);
  const configuredKeys = new Set(configuredFields.map((field) => field.key));
  const extraFields = Object.keys(details).filter((key) => !configuredKeys.has(key) && details[key] !== null && details[key] !== undefined);
  const bandLabel = getBandLabel(cell, band);

  return (
    <li
      className={cn(
        "relative px-3 py-2.5",
        "before:absolute before:inset-y-2 before:left-0 before:w-px before:content-['']",
        OPERATION_RAIL_CLASS[cell.operation],
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <SubmissionCellOperationBadge operation={cell.operation} />
        <TechnologySummary bands={[cell.rat]} className="mt-0 pl-0" />
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{bandLabel}</span>
        {cell.target_cell_id !== null ? (
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
            {t("changesSheet.cellId", { id: cell.target_cell_id })}
          </span>
        ) : null}
      </div>

      {cell.operation === "delete" && Object.keys(details).length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("changesSheet.deletedCell")}</p>
      ) : (
        <dl className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-2">
          {sectorLabel ? <CellDetailPair label={t("changesSheet.sector")} value={sectorLabel} /> : null}
          {cell.type ? <CellDetailPair label={t("stations:cells.cellType")} value={CELL_TYPE_LABELS[cell.type]} /> : null}
          {configuredFields.map((field) => (
            <CellDetailPair key={field.key} label={field.label} value={formatCellValue(details[field.key], t)} />
          ))}
          {extraFields.map((key) => (
            <CellDetailPair key={key} label={getRatDetailFieldLabel(cell.rat, key)} value={formatCellValue(details[key], t)} />
          ))}
          {cell.notes ? <CellDetailPair label={t("common:labels.notes")} value={cell.notes} className="basis-full" /> : null}
        </dl>
      )}
    </li>
  );
}

function CellChanges({ submission }: { submission: SubmissionDetail }) {
  const { t } = useTranslation("submissions");
  const { data: bands = [] } = useQuery({ ...bandsQueryOptions(), enabled: submission.cells.length > 0 });
  const bandById = useMemo(() => new Map(bands.map((band) => [band.id, band])), [bands]);
  const sectorLabelByLocalId = useMemo(
    () => new Map(submission.sectors.map((sector, index) => [sector.local_id, `A${index + 1} · ${sector.azimuth}°`] as const)),
    [submission.sectors],
  );

  if (submission.cells.length === 0) return null;

  return (
    <section className="@container overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={SignalFull02Icon} className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-medium">{t("changesSheet.cells")}</h3>
        </div>
        <SubmissionCellCounts cells={submission.cells} />
      </header>
      <ul className="divide-y divide-border/60">
        {OPERATION_ORDER.flatMap((operation) =>
          submission.cells
            .filter((cell) => cell.operation === operation)
            .map((cell) => {
              const sectorLabel =
                (cell.sector_local_id ? sectorLabelByLocalId.get(cell.sector_local_id) : undefined) ??
                (cell.target_sector_id !== null ? t("changesSheet.sectorId", { id: cell.target_sector_id }) : null);
              return (
                <CellChangeItem
                  key={cell.id}
                  cell={cell}
                  band={cell.band_id !== null ? bandById.get(cell.band_id) : undefined}
                  sectorLabel={sectorLabel}
                />
              );
            }),
        )}
      </ul>
    </section>
  );
}

function SubmissionContext({ submission }: { submission: SubmissionDetail }) {
  const { t } = useTranslation("submissions");
  if (!submission.submitter_note && !submission.review_notes) return null;

  return (
    <section className="space-y-3">
      {submission.submitter_note ? (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">{t("detail.submitterNotes")}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{submission.submitter_note}</p>
        </div>
      ) : null}
      {submission.review_notes ? (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">{t("detail.reviewerResponse")}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{submission.review_notes}</p>
        </div>
      ) : null}
    </section>
  );
}

function ChangesSheetSkeleton() {
  return (
    <div className="space-y-5 px-4 pb-5">
      <Skeleton className="h-12 rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  );
}

export function SubmissionChangesSheet({ submission, operators, open, onOpenChange }: SubmissionChangesSheetProps) {
  const { t, i18n } = useTranslation(["submissions", "common"]);
  const submissionId = submission?.id ?? "";
  const detailQuery = useQuery({
    ...submissionDetailQueryOptions(submissionId),
    enabled: open && submission !== null,
  });

  const displayedSubmission = detailQuery.data ?? submission;
  const stationId = displayedSubmission?.station?.station_id ?? displayedSubmission?.proposedStation?.station_id ?? t("common:labels.newStation");
  const status = displayedSubmission ? SUBMISSION_STATUS[displayedSubmission.status] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full! max-w-2xl! gap-0 overflow-y-auto custom-scrollbar">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{t("changesSheet.title")}</SheetTitle>
          <SheetDescription>
            {stationId}
            {displayedSubmission ? ` · ${formatFullDate(displayedSubmission.createdAt, i18n.language)}` : ""}
          </SheetDescription>
          {displayedSubmission && status ? (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SubmissionTypeBadge type={displayedSubmission.type} />
              <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium", status.bgClass)}>
                <HugeiconsIcon icon={status.icon} className={cn("size-3.5", status.iconClass)} aria-hidden="true" />
                {t(`common:status.${displayedSubmission.status}`)}
              </span>
            </div>
          ) : null}
        </SheetHeader>

        {detailQuery.isLoading && submission ? <ChangesSheetSkeleton /> : null}

        {detailQuery.isError ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <HugeiconsIcon icon={AlertCircleIcon} className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium">{t("changesSheet.loadError")}</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => void detailQuery.refetch()}>
              {t("common:actions.retry")}
            </Button>
          </div>
        ) : null}

        {detailQuery.data ? (
          <div className="space-y-6 px-4 py-4 pb-8">
            <StationChanges submission={detailQuery.data} operators={operators} />
            <CellChanges submission={detailQuery.data} />
            <SubmissionLocationPhotoSelectionsSection
              photos={detailQuery.data.locationPhotoSelections}
              removalPhotos={detailQuery.data.locationPhotoRemovalSelections}
            />
            <SubmissionPhotosSection submissionId={detailQuery.data.id} readOnly pendingPhotos={detailQuery.data.pending_photos ?? undefined} />
            <SubmissionContext submission={detailQuery.data} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
