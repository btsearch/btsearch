import { ArrowUpRight01Icon, DocumentCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { OfficialPermit, OfficialPermitSite, OfficialSitePermit } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DEVICE_REGISTRY_DATASET, compareNullsLast, getPermitKindLook, listPermitSites, sortPermitsNewestRatFirst } from "../officialPermits";
import { stationPermitsQueryOptions } from "../queries";
import { formatSectorAzimuth } from "../station/utils/sectors";
import { OfficialBandLabel } from "./officialBandLabel";
import { Badge } from "@/components/ui/badge";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { getOfficialSiteCode } from "@/features/official/sites";
import { isPermitExpired, isRecent } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

type PermitsListProps = {
  stationId?: number;
  permits?: readonly OfficialSitePermit[];
  sourceName: string | null;
  isExternalLoading?: boolean;
  permitHolderNote?: ReactNode;
};

type PermitSiteLinksProps = {
  sites: readonly OfficialPermitSite[];
  sourceName: string | null;
};

const NO_PERMITS: OfficialPermit[] = [];
const SKELETON_ROWS = [1, 2, 3, 4];
const DATASET_LABEL_KEYS: ReadonlyMap<string, string> = new Map([
  ["permits", "permits.sourcePermits"],
  [DEVICE_REGISTRY_DATASET, "permits.sourceDeviceRegistry"],
]);

export function PermitsList({ stationId, permits: externalPermits, sourceName, isExternalLoading, permitHolderNote }: PermitsListProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const {
    data: fetchedPermits = NO_PERMITS,
    isLoading,
    isFetching,
    isLoadingError,
    isRefetchError,
    refetch,
  } = useQuery(stationPermitsQueryOptions(externalPermits ? undefined : stationId));

  const permits: readonly OfficialSitePermit[] = externalPermits ?? fetchedPermits;
  const sortedPermits = useMemo(() => sortPermitsNewestRatFirst(permits), [permits]);
  const permitSites = useMemo(() => listPermitSites(fetchedPermits), [fetchedPermits]);

  if (isExternalLoading || (!externalPermits && isLoading)) {
    return (
      <div className="overflow-hidden rounded-xl border">
        <div className="flex gap-8 border-b bg-muted/30 px-4 py-2.5">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
        {SKELETON_ROWS.map((row) => (
          <div key={row} className="flex gap-8 border-b px-4 py-3 last:border-0">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!externalPermits && isLoadingError) return <ErrorState className="min-h-0 py-8" onRetry={() => refetch()} isRetrying={isFetching} />;

  const staleNotice =
    !externalPermits && isRefetchError ? (
      <div className="flex justify-center">
        <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} />
      </div>
    ) : null;

  if (permits.length === 0) {
    return (
      <>
        {staleNotice}
        <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
          <HugeiconsIcon icon={DocumentCodeIcon} className="size-8 mb-2 opacity-20" />
          <p className="text-sm">{sourceName === null ? t("permits.noRegisterPermits") : t("permits.noPermits", { source: sourceName })}</p>
          {permitHolderNote}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {staleNotice}
      {permitSites.length > 0 ? <PermitSiteLinks sites={permitSites} sourceName={sourceName} /> : null}
      <PermitsTable permits={sortedPermits} />
    </div>
  );
}

function PermitSiteLinks({ sites, sourceName }: PermitSiteLinksProps) {
  const { t } = useTranslation("stationDetails");
  const { openOfficialSiteDialog } = useFloatingDialogStack();

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span>{sourceName === null ? t("permits.registerStation") : t("permits.sourceStation", { source: sourceName })}</span>
      {sites.map((site) => (
        <button
          key={site.id}
          type="button"
          onClick={() => openOfficialSiteDialog(site.id, site)}
          className="group inline-flex min-w-0 cursor-pointer items-center gap-1 font-medium text-foreground focus-visible:outline-none"
        >
          <span className="truncate underline-offset-2 group-hover:underline group-focus-visible:underline">
            {site.location ? [site.location.city, site.location.address].filter(Boolean).join(", ") : getOfficialSiteCode(site)}
          </span>
          <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

const headerCellClassName = "px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider";
const cellClassName = "px-4 py-2.5";

function DatasetBadge({ dataset }: { dataset: string }) {
  const { t } = useTranslation("stationDetails");
  const labelKey = DATASET_LABEL_KEYS.get(dataset);

  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px] px-1.5 py-0 font-semibold whitespace-nowrap bg-muted text-muted-foreground",
        dataset === DEVICE_REGISTRY_DATASET && "ring-1 ring-blue-500/30",
      )}
    >
      {labelKey === undefined ? dataset : t(labelKey)}
    </Badge>
  );
}

function PermitStatus({ status }: { status: OfficialSitePermit["status"] }) {
  const { t } = useTranslation("stationDetails");
  if (status === null) return <span className="text-[13px] text-muted-foreground">-</span>;
  if (status === "inService") return <span className="text-[13px] text-muted-foreground">{t("permits.inService")}</span>;

  return (
    <span className="inline-flex h-5.5 items-center rounded-md border border-dashed border-muted-foreground px-2 text-xs font-semibold whitespace-nowrap">
      {t("permits.notInService")}
    </span>
  );
}

function listPermitAzimuths(permit: OfficialSitePermit): (number | null)[] {
  const azimuths = new Set((permit.sectors ?? []).map((sector) => sector.azimuth));
  return [...azimuths].sort(compareNullsLast);
}

function PermitsTable({ permits }: { permits: readonly OfficialSitePermit[] }) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const showsStatus = permits.some((permit) => permit.status !== null);
  const showsDatasets = new Set(permits.flatMap((permit) => permit.datasets)).size > 1;
  const showsNumber = permits.some((permit) => permit.number !== null);
  const showsExpiry = permits.some((permit) => permit.expiresOn !== null);
  const showsAzimuths = permits.some((permit) => (permit.sectors ?? []).length > 0);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th scope="col" className={headerCellClassName}>
              {t("common:labels.band")}
            </th>
            {showsStatus ? (
              <th scope="col" className={headerCellClassName}>
                {t("common:labels.status")}
              </th>
            ) : null}
            {showsDatasets ? (
              <th scope="col" className={cn(headerCellClassName, "max-sm:hidden")}>
                {t("common:labels.source")}
              </th>
            ) : null}
            {showsNumber ? (
              <th scope="col" className={headerCellClassName}>
                {t("permits.decisionNumber")}
              </th>
            ) : null}
            {showsExpiry ? (
              <th scope="col" className={headerCellClassName}>
                {t("permits.expiryDate")}
              </th>
            ) : null}
            {showsAzimuths ? (
              <th scope="col" className={cn(headerCellClassName, "max-sm:hidden")}>
                {t("common:labels.azimuths")}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {permits.map((permit) => {
            const isExpired = permit.expiresOn !== null && isPermitExpired(permit.expiresOn);
            const isNew = isRecent(permit.createdAt);
            const kind = getPermitKindLook(permit.kind);
            const azimuths = listPermitAzimuths(permit);

            return (
              <tr key={permit.id} className="transition-colors hover:bg-muted/20">
                <td className={cn(cellClassName, isNew && "border-l-2 border-l-green-500")}>
                  <div className="flex items-center gap-2 font-semibold whitespace-nowrap">
                    <OfficialBandLabel label={permit.label} />
                    {isNew ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge
                            variant="secondary"
                            className="bg-green-500/10 text-green-800 dark:text-green-400 text-[11px] px-1.5 py-0 cursor-help"
                          >
                            {t("common:labels.new")}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{t("permits.newPermitTooltip")}</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                </td>
                {showsStatus ? (
                  <td className={cellClassName}>
                    <PermitStatus status={permit.status} />
                  </td>
                ) : null}
                {showsDatasets ? (
                  <td className={cn(cellClassName, "max-sm:hidden")}>
                    <div className="flex flex-wrap gap-1">
                      {permit.datasets.map((dataset) => (
                        <DatasetBadge key={dataset} dataset={dataset} />
                      ))}
                    </div>
                  </td>
                ) : null}
                {showsNumber ? (
                  <td className={cellClassName}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs">{permit.number ?? "-"}</span>
                      {kind === undefined ? null : (
                        <Tooltip>
                          <TooltipTrigger className="font-mono text-[10px] text-muted-foreground cursor-help">[{kind.code}]</TooltipTrigger>
                          <TooltipContent>{t(kind.labelKey)}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                ) : null}
                {showsExpiry ? (
                  <td className={cn(cellClassName, "text-[13px] whitespace-nowrap")}>
                    {permit.expiresOn === null ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={cn(isExpired && "text-destructive font-medium")}>
                          {new Date(permit.expiresOn).toLocaleDateString(i18n.language)}
                        </span>
                        {isExpired ? (
                          <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[11px] font-bold uppercase">
                            {t("common:status.expired")}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </td>
                ) : null}
                {showsAzimuths ? (
                  <td className={cn(cellClassName, "max-sm:hidden font-mono text-[13px]")}>
                    {azimuths.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      azimuths.map((azimuth, index) => (
                        <Fragment key={azimuth ?? "omnidirectional"}>
                          {index > 0 ? <span className="text-muted-foreground/50">{" / "}</span> : null}
                          {formatSectorAzimuth(azimuth, t)}
                        </Fragment>
                      ))
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
