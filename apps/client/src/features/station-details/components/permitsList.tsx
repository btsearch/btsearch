import { ArrowDown01Icon, ArrowUpRight01Icon, DocumentCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { OfficialPermit, OfficialPermitSite, OfficialSitePermit } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DEVICE_REGISTRY_DATASET, getPermitKindLook, groupPermitsByRat, hasDeviceRegistryListing, listPermitSites } from "../officialPermits";
import { stationPermitsQueryOptions } from "../queries";
import { StationLink } from "./stationLink";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { toOfficialRatComparator } from "@/features/official/labels";
import { officialBandLabelsQueryOptions } from "@/features/official/queries";
import { getOfficialSiteCode } from "@/features/official/sites";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { isPermitExpired, isRecent } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { PhysicalStation } from "@/types/station";

type PermitsListProps = {
  stationId?: number;
  permits?: readonly OfficialSitePermit[];
  sourceName: string | null;
  isExternalLoading?: boolean;
  physicalStation?: PhysicalStation;
  permitHolderNote?: ReactNode;
};

type PermitSiteLinksProps = {
  sites: readonly OfficialPermitSite[];
  sourceName: string | null;
};

const NO_PERMITS: OfficialPermit[] = [];
const COMPARE_RATS_BY_NAME = toOfficialRatComparator([]);
const DATASET_LABEL_KEYS: ReadonlyMap<string, string> = new Map([
  ["permits", "permits.sourcePermits"],
  [DEVICE_REGISTRY_DATASET, "permits.sourceDeviceRegistry"],
]);

export function PermitsList({
  stationId,
  permits: externalPermits,
  sourceName,
  isExternalLoading,
  physicalStation,
  permitHolderNote,
}: PermitsListProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const { data: compareRats = COMPARE_RATS_BY_NAME } = useQuery({ ...officialBandLabelsQueryOptions(), select: toOfficialRatComparator });
  const {
    data: fetchedPermits = NO_PERMITS,
    isLoading,
    isFetching,
    isLoadingError,
    isRefetchError,
    refetch,
  } = useQuery(stationPermitsQueryOptions(externalPermits ? undefined : stationId));

  const permits: readonly OfficialSitePermit[] = externalPermits ?? fetchedPermits;
  const permitsByRat = useMemo(() => groupPermitsByRat(permits, compareRats), [permits, compareRats]);
  const permitSites = useMemo(() => listPermitSites(fetchedPermits), [fetchedPermits]);
  const hasDeviceRegistryData = useMemo(() => hasDeviceRegistryListing(permits), [permits]);

  if (isExternalLoading || (!externalPermits && isLoading)) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={`skeleton-${i}`} className="rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
              <Skeleton className="h-3 w-16 rounded ml-auto" />
            </div>
            <div className="overflow-x-auto">
              <div className="w-full">
                <div className="flex border-b bg-muted/10 px-4 py-2">
                  <Skeleton className="h-3 w-16 rounded mr-8" />
                  <Skeleton className="h-3 w-24 rounded mr-8" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
                {[1, 2, 3].map((j) => (
                  <div key={`skeleton-row-${j}`} className="flex px-4 py-2.5 border-b last:border-0">
                    <Skeleton className="h-4 w-20 rounded mr-8" />
                    <Skeleton className="h-4 w-32 rounded mr-8" />
                    <Skeleton className="h-4 w-24 rounded" />
                  </div>
                ))}
              </div>
            </div>
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
          {physicalStation ? <PermitHolderNote station={physicalStation} /> : permitHolderNote}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {staleNotice}
      {permitSites.length > 0 ? <PermitSiteLinks sites={permitSites} sourceName={sourceName} /> : null}
      {Array.from(permitsByRat.entries()).map(([rat, ratPermits]) => (
        <CollapsiblePermitGroup key={rat} rat={rat} ratPermits={ratPermits} t={t} i18n={i18n} showAntennaData={hasDeviceRegistryData} />
      ))}
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

function PermitHolderNote({ station }: { station: PhysicalStation }) {
  const { t } = useTranslation("stationDetails");
  const { openStationDialog } = useFloatingDialogStack();

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm">
      <span>{t("permits.permitHolder")}</span>
      <StationLink
        station={station}
        onOpen={(id) => openStationDialog(id, "internal")}
        className="inline-flex"
        stationIdClassName="underline-offset-2 group-hover:underline group-focus-visible:underline"
      />
    </div>
  );
}

type CollapsiblePermitGroupProps = {
  rat: string;
  ratPermits: readonly OfficialSitePermit[];
  t: ReturnType<typeof useTranslation<"stationDetails">>["t"];
  i18n: ReturnType<typeof useTranslation>["i18n"];
  showAntennaData?: boolean;
};

type SectorValueTooltipProps = {
  label: string;
  children: ReactNode;
};

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

function PermitBand({ permit }: { permit: OfficialSitePermit }) {
  const { t } = useTranslation("stations");
  const { rat, labelMhz } = permit.label;
  if (labelMhz !== null) return <span>{labelMhz}</span>;
  return <span>{rat === null ? "-" : t("cells.unknownBand")}</span>;
}

function SectorValueTooltip({ label, children }: SectorValueTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CollapsiblePermitGroup({ rat, ratPermits, t, i18n, showAntennaData }: CollapsiblePermitGroupProps) {
  return (
    <Collapsible defaultOpen className="rounded-xl border overflow-hidden">
      <CollapsibleTrigger className="w-full px-4 py-2.5 bg-muted/30 border-b flex items-center gap-2 cursor-pointer">
        <RatGenerationLabel rat={rat} />
        <span className="font-bold text-sm">{rat}</span>
        <span className="text-xs text-muted-foreground">({t("permits.permitsCount", { count: ratPermits.length })})</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 ml-auto text-muted-foreground transition-transform in-data-open:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out [&[hidden]:not([hidden='until-found'])]:hidden data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/10">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("common:labels.band")}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("permits.decisionNumber")}
                </th>
                {showAntennaData && (
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("common:labels.azimuths")}
                  </th>
                )}
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("permits.expiryDate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {ratPermits.map((permit) => {
                const expiryText =
                  permit.expiresOn === null ? t("permits.neverExpires") : new Date(permit.expiresOn).toLocaleDateString(i18n.language);
                const isExpired = permit.expiresOn !== null && isPermitExpired(permit.expiresOn);
                const isNew = isRecent(permit.createdAt);
                const kind = getPermitKindLook(permit.kind);

                return (
                  <tr key={permit.id} className={cn("hover:bg-muted/20 transition-colors")}>
                    <td className={cn("px-4 py-2.5 font-mono font-medium", isNew && "border-l-2 border-l-green-500")}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <PermitBand permit={permit} />
                        {permit.label.variant === "railway" && (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="inline-flex items-center justify-center size-5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 cursor-help text-xs font-bold">
                                R
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>GSM-R</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {permit.datasets.map((dataset) => (
                          <DatasetBadge key={dataset} dataset={dataset} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
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
                    {showAntennaData && (
                      <td className="px-4 py-2.5">
                        {permit.sectors && permit.sectors.length > 0 ? (
                          <Collapsible>
                            <CollapsibleTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex">
                              {t("permits.sectorsCount", { count: permit.sectors.length })}{" "}
                              <HugeiconsIcon
                                icon={ArrowDown01Icon}
                                className="size-3.5 ml-1 text-muted-foreground transition-transform in-data-panel-open:rotate-180"
                              />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="flex flex-col gap-1 mt-1">
                                {permit.sectors.map((sector) => (
                                  <div key={sector.id} className="flex items-center gap-2 font-mono text-xs">
                                    <SectorValueTooltip label={t("common:labels.azimuth")}>
                                      <span>{sector.azimuth !== null ? `${sector.azimuth}°` : "-"}</span>
                                    </SectorValueTooltip>
                                    <span className="text-muted-foreground">/</span>
                                    <SectorValueTooltip label={t("common:labels.antennaHeight")}>
                                      <span>{sector.antennaHeightMeters !== null ? `${sector.antennaHeightMeters} m` : "-"}</span>
                                    </SectorValueTooltip>
                                    {sector.antennaType && (
                                      <Tooltip>
                                        <TooltipTrigger className="px-1 py-0.5 rounded bg-muted text-muted-foreground text-[11px] font-bold uppercase cursor-help">
                                          {t(`permits.antennaType.${sector.antennaType}Short`)}
                                        </TooltipTrigger>
                                        <TooltipContent>{t(`permits.antennaType.${sector.antennaType}`)}</TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ) : (
                          "-"
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {isExpired ? (
                          <>
                            <span className="text-destructive font-medium">{expiryText}</span>
                            <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[11px] font-bold uppercase">
                              {t("common:status.expired")}
                            </span>
                          </>
                        ) : (
                          <span>{expiryText}</span>
                        )}
                        {isNew && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge
                                variant="secondary"
                                className="bg-green-500/10 text-green-800 dark:text-green-400 text-[11px] px-1.5 py-0 ml-auto cursor-help"
                              >
                                {t("common:labels.new")}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>{t("permits.newPermitTooltip")}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
