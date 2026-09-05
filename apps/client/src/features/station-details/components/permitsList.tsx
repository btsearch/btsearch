import { AlertCircleIcon, ArrowDown01Icon, DocumentCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { UKESourceBadge } from "@/components/cellular/uke-source-badge";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { fetchApiData } from "@/lib/api";
import { isPermitExpired, isRecent } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { UkePermit, UkeStationPermit } from "@/types/station";

async function fetchPermits(stationId: number, isUkeSource: boolean): Promise<UkeStationPermit[]> {
  if (isUkeSource) {
    const permit = await fetchApiData<UkePermit>(`uke/permits/${stationId}`);
    return permit ? [permit] : [];
  }

  const permits = await fetchApiData<UkePermit[]>(`stations/${stationId}/permits`, {
    allowedErrors: [404],
  });
  return permits ?? [];
}

function groupPermitsByRat(permits: UkeStationPermit[]): Map<string, UkeStationPermit[]> {
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

  const ratOrder = ["NR", "LTE", "UMTS", "CDMA", "GSM", "IOT", "OTHER"];
  const sorted = new Map<string, UkeStationPermit[]>();
  for (const rat of ratOrder) {
    if (groups.has(rat)) {
      const groupGet = groups.get(rat);
      if (groupGet) sorted.set(rat, groupGet);
    }
  }

  return sorted;
}

type PermitsListProps = {
  stationId?: number;
  isUkeSource?: boolean;
  permits?: UkeStationPermit[];
  isExternalLoading?: boolean;
};

export function PermitsList({ stationId, isUkeSource = false, permits: externalPermits, isExternalLoading }: PermitsListProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const {
    data: fetchedPermits = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["station-permits", stationId, isUkeSource],
    queryFn: () => {
      if (stationId === undefined) return Promise.resolve([]);
      return fetchPermits(stationId, isUkeSource);
    },
    enabled: !!stationId && !externalPermits,
    staleTime: 1000 * 60 * 10,
  });

  const permits = externalPermits ?? fetchedPermits;
  const permitsByRat = useMemo(() => groupPermitsByRat(permits), [permits]);
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

  if (!externalPermits && error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground px-4">
        <div className="size-10 rounded-full bg-destructive/5 flex items-center justify-center text-destructive/50 mb-3">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
        </div>
        <p className="text-sm">{t("common:placeholder.errorFetching")}</p>
      </div>
    );
  }

  if (permits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
        <HugeiconsIcon icon={DocumentCodeIcon} className="size-8 mb-2 opacity-20" />
        <p className="text-sm">{t("permits.noPermits")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(permitsByRat.entries()).map(([rat, ratPermits]) => (
        <CollapsiblePermitGroup key={rat} rat={rat} ratPermits={ratPermits} t={t} i18n={i18n} showAntennaData={hasDeviceRegistryData} />
      ))}
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("permits.sectors")}</th>
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
                                    <SectorValueTooltip label={t("permits.sectorsAzimuth")}>
                                      <span>{sector.azimuth !== null ? `${sector.azimuth}°` : "-"}</span>
                                    </SectorValueTooltip>
                                    <span className="text-muted-foreground">/</span>
                                    <SectorValueTooltip label={t("permits.sectorsAntennaHeight")}>
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
                                className="bg-green-500/10 text-green-600 dark:text-green-400 text-[11px] px-1.5 py-0 ml-auto cursor-help"
                              >
                                {t("common:submissionType.new")}
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
