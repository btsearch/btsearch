import { ArrowDown01Icon, ArrowUpRight01Icon, DocumentCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { stationPermitsQueryOptions } from "../queries";
import { groupPermitsByUkeStation } from "../utils";
import { StationLink } from "./stationLink";
import { UKESourceBadge } from "@/components/cellular/ukeSourceBadge";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { registerBandsQueryOptions } from "@/features/map/api";
import { compareRatsByName, toRegisterRatComparator } from "@/features/shared/rat";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { isPermitExpired, isRecent } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { PhysicalStation, UkeStation, UkeStationPermit } from "@/types/station";

function groupPermitsByRat(permits: UkeStationPermit[], compareRats: (left: string, right: string) => number): Map<string, UkeStationPermit[]> {
  const groups = new Map<string, UkeStationPermit[]>();

  for (const permit of permits) {
    const rat = permit.band?.rat?.toUpperCase() || "OTHER";
    const existing = groups.get(rat) ?? [];
    existing.push(permit);
    groups.set(rat, existing);
  }

  for (const [_, groupPermits] of groups) {
    groupPermits.sort((a, b) => {
      const valA = Number(a.band?.value ?? 0);
      const valB = Number(b.band?.value ?? 0);
      return valA - valB;
    });
  }

  return new Map([...groups].sort(([left], [right]) => Number(left === "OTHER") - Number(right === "OTHER") || compareRats(left, right)));
}

type PermitsListProps = {
  stationId?: number;
  permits?: UkeStationPermit[];
  isExternalLoading?: boolean;
  physicalStation?: PhysicalStation;
  permitHolderNote?: ReactNode;
};

export function PermitsList({ stationId, permits: externalPermits, isExternalLoading, physicalStation, permitHolderNote }: PermitsListProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const { data: compareRats = compareRatsByName } = useQuery({ ...registerBandsQueryOptions(), select: toRegisterRatComparator });
  const {
    data: fetchedPermits = [],
    isLoading,
    isFetching,
    isLoadingError,
    isRefetchError,
    refetch,
  } = useQuery(stationPermitsQueryOptions(externalPermits ? undefined : stationId));

  const permits = externalPermits ?? fetchedPermits;
  const permitsByRat = useMemo(() => groupPermitsByRat(permits, compareRats), [permits, compareRats]);
  const ukeStations = useMemo(() => groupPermitsByUkeStation(fetchedPermits), [fetchedPermits]);
  const hasDeviceRegistryData = useMemo(() => permits.some((p) => p.source === "device_registry"), [permits]);

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
          <p className="text-sm">{t("permits.noPermits")}</p>
          {physicalStation ? <PermitHolderNote station={physicalStation} /> : permitHolderNote}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {staleNotice}
      {ukeStations.length > 0 ? <UkeStationLinks stations={ukeStations} /> : null}
      {Array.from(permitsByRat.entries()).map(([rat, ratPermits]) => (
        <CollapsiblePermitGroup key={rat} rat={rat} ratPermits={ratPermits} t={t} i18n={i18n} showAntennaData={hasDeviceRegistryData} />
      ))}
    </div>
  );
}

function UkeStationLinks({ stations }: { stations: UkeStation[] }) {
  const { t } = useTranslation("stationDetails");
  const { openUkePermitDialog } = useFloatingDialogStack();

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span>{t("permits.ukeStation")}</span>
      {stations.map((station) => (
        <button
          key={station.id}
          type="button"
          onClick={() => openUkePermitDialog(station)}
          className="group inline-flex min-w-0 cursor-pointer items-center gap-1 font-medium text-foreground focus-visible:outline-none"
        >
          <span className="truncate underline-offset-2 group-hover:underline group-focus-visible:underline">
            {station.location ? [station.location.city, station.location.address].filter(Boolean).join(", ") : station.station_id}
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
  ratPermits: UkeStationPermit[];
  t: ReturnType<typeof useTranslation<"stationDetails">>["t"];
  i18n: ReturnType<typeof useTranslation>["i18n"];
  showAntennaData?: boolean;
};

type SectorValueTooltipProps = {
  label: string;
  children: ReactNode;
};

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
                const expiryDate = new Date(permit.expiry_date);
                const isExpired = isPermitExpired(permit.expiry_date);
                const neverExpires = expiryDate.getFullYear() >= 2099;
                const isNew = isRecent(permit.createdAt);

                return (
                  <tr key={permit.id} className={cn("hover:bg-muted/20 transition-colors")}>
                    <td className={cn("px-4 py-2.5 font-mono font-medium", isNew && "border-l-2 border-l-green-500")}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>
                          {permit.band?.value ? (Number(permit.band.value) === 0 ? t("stations:cells.unknownBand") : permit.band.value) : "-"}
                        </span>
                        {permit.band?.variant === "railway" && (
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
                        {permit.source && <UKESourceBadge source={permit.source} />}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs">{permit.decision_number}</span>
                        <Tooltip>
                          <TooltipTrigger className="font-mono text-[10px] text-muted-foreground cursor-help">
                            [{permit.decision_type}]
                          </TooltipTrigger>
                          <TooltipContent>
                            {permit.decision_type === "zmP" ? t("permits.decisionTypeZmP") : t("permits.decisionTypeP")}
                          </TooltipContent>
                        </Tooltip>
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
                                      <span>{sector.antenna_height !== null ? `${sector.antenna_height} m` : "-"}</span>
                                    </SectorValueTooltip>
                                    {sector.antenna_type && (
                                      <Tooltip>
                                        <TooltipTrigger className="px-1 py-0.5 rounded bg-muted text-muted-foreground text-[11px] font-bold uppercase cursor-help">
                                          {t(`permits.antennaType.${sector.antenna_type}Short`)}
                                        </TooltipTrigger>
                                        <TooltipContent>{t(`permits.antennaType.${sector.antenna_type}`)}</TooltipContent>
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
                            <span className="text-destructive font-medium">{expiryDate.toLocaleDateString(i18n.language)}</span>
                            <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[11px] font-bold uppercase">
                              {t("common:status.expired")}
                            </span>
                          </>
                        ) : (
                          <span>{neverExpires ? t("permits.neverExpires") : expiryDate.toLocaleDateString(i18n.language)}</span>
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
