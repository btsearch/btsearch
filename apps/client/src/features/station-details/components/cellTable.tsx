import { AlertCircleIcon, ArrowDown01Icon, BatteryLowIcon, Clock01Icon, WifiConnected01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CELL_TYPE_I18N_KEY, CELL_TYPE_LABELS } from "@/features/shared/cellTypes";
import { getRatChannelField, getRatShowsBandDuplex } from "@/features/shared/rat";
import { type RatDetailField, getRatDetailFields } from "@/features/shared/ratCellFields";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { isRecent } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { Cell } from "@/types/station";

import { calcExactFrequency, getBandName } from "../frequencyCalc";
type CellTableProps = {
  rat: string;
  cells: Cell[];
  sectorInfoById?: ReadonlyMap<number, { label: string; azimuth: number }>;
};

export function CellTable({ rat, cells, sectorInfoById }: CellTableProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const [open, setOpen] = useState(true);
  const scrollRef = useHorizontalScroll<HTMLDivElement>();
  const detailFields = getRatDetailFields(rat, "station");

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-xl overflow-hidden">
      <CollapsibleTrigger className={cn("w-full px-4 py-2.5 bg-muted/50 flex items-center gap-2 cursor-pointer", open && "border-b")}>
        <RatGenerationLabel rat={rat} />
        <span className="font-semibold text-sm">{rat}</span>
        <span className="text-xs text-muted-foreground">({t("stations:cells.cellsCount", { count: cells.length })})</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className={cn("size-3.5 ml-auto text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>

      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out [&[hidden]:not([hidden='until-found'])]:hidden data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <div ref={scrollRef} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-px whitespace-nowrap px-4 py-2 text-left font-medium text-muted-foreground">{t("common:labels.band")}</th>
                {getRatShowsBandDuplex(rat) && <th className="px-4 py-2 text-left font-medium text-muted-foreground">Duplex</th>}
                {detailFields.map((field) => (
                  <StationDetailHeaderCell key={field.key} field={field} />
                ))}
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">{t("common:labels.notes")}</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((cell) => {
                const isNew = isRecent(cell.createdAt);
                const isUpdated = !isNew && isRecent(cell.updatedAt);
                const channelField = getRatChannelField(rat);
                const arfcnForCalc = channelField ? (cell.details?.[channelField as keyof typeof cell.details] as number | null | undefined) : null;
                const freqInfo = calcExactFrequency(rat, Number(cell.band.value), arfcnForCalc, cell.band.duplex);
                const bandName = freqInfo?.bandName ?? getBandName(rat, Number(cell.band.value), cell.band.duplex);
                const hasTooltip = freqInfo || bandName;
                const bandLabel = Number(cell.band.value) === 0 ? t("stations:cells.unknownBand") : cell.band.value;
                const sectorInfo = cell.sector_id !== null ? sectorInfoById?.get(cell.sector_id) : undefined;
                const nrType = rat === "NR" && (cell.details?.type === "nsa" || cell.details?.type === "sa") ? cell.details.type : null;
                const nrTypeTooltip = nrType === "nsa" ? "Non-Standalone (LTE anchor)" : "Standalone";
                const sectorLabel = sectorInfo ? (
                  <Tooltip>
                    <TooltipTrigger className="cursor-help text-[11px] font-semibold leading-5 text-foreground/80 tabular-nums">
                      {sectorInfo.label}
                    </TooltipTrigger>
                    <TooltipContent side="top">{sectorInfo.azimuth}°</TooltipContent>
                  </Tooltip>
                ) : null;
                const nrTypeLabel =
                  nrType !== null ? (
                    <Tooltip>
                      <TooltipTrigger className="relative isolate cursor-help px-0.5 text-[10px] font-semibold leading-5 text-blue-950 dark:text-blue-100">
                        <svg
                          aria-hidden="true"
                          focusable="false"
                          viewBox="0 0 100 20"
                          preserveAspectRatio="none"
                          className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 h-5 w-full -translate-y-1/2 scale-x-110 overflow-visible text-blue-500/25 dark:text-blue-400/20"
                        >
                          <path
                            fill="currentColor"
                            d="M1 6C12 3 23 5 35 3C49 1 62 5 75 3C86 2 94 4 99 3L97 15C83 14 73 17 60 15C46 13 33 17 20 15C11 14 5 17 2 14Z"
                          />
                          <path
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="5"
                            strokeLinecap="round"
                            opacity="0.35"
                            d="M5 10C24 8 39 11 55 8C72 6 84 10 95 7"
                          />
                        </svg>
                        {nrType.toUpperCase()}
                      </TooltipTrigger>
                      <TooltipContent side="top">{nrTypeTooltip}</TooltipContent>
                    </Tooltip>
                  ) : null;
                const cellMetadata =
                  nrType !== null || cell.type ? (
                    <span className="inline-flex items-center gap-1.5">
                      {nrTypeLabel}
                      {nrType !== null && cell.type ? <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border" /> : null}
                      {cell.type ? (
                        <Tooltip>
                          <TooltipTrigger className="cursor-help text-[10px] font-medium leading-5 text-muted-foreground">
                            {CELL_TYPE_LABELS[cell.type]}
                          </TooltipTrigger>
                          <TooltipContent side="top">{t(`stations:cells.${CELL_TYPE_I18N_KEY[cell.type]}`)}</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </span>
                  ) : null;
                return (
                  <tr
                    key={cell.id}
                    className={cn(
                      "border-b last:border-b-0 hover:bg-muted/20",
                      isNew && "border-l-2 border-l-green-500",
                      isUpdated && "border-l-2 border-l-amber-500",
                    )}
                  >
                    <td className="px-4 py-2 font-mono">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        {sectorLabel}
                        {hasTooltip ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                                {bandLabel}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {freqInfo?.frequency && <span>{freqInfo.frequency}</span>}
                              {bandName && (freqInfo?.frequency ? <span className="ml-1.5 opacity-75">({bandName})</span> : <span>{bandName}</span>)}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span>{bandLabel}</span>
                        )}
                        {rat === "GSM" && cell.details?.e_gsm && (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="inline-flex items-center justify-center size-5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 cursor-help text-xs font-bold">
                                E
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>E-GSM</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {cellMetadata}
                        {!cell.is_confirmed && (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="inline-flex items-center justify-center size-5 rounded-md bg-destructive/10 text-destructive cursor-help">
                                <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{t("stations:cells.cellNotConfirmed")}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    {getRatShowsBandDuplex(rat) && <td className="px-4 py-2">{cell.band.duplex || "-"}</td>}
                    {detailFields.map((field) => (
                      <td key={field.key} className="px-4 py-2 font-mono">
                        {getStationDetailValue(field, cell.details as Record<string, unknown> | null | undefined)}
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        {cell.notes ? (
                          <Tooltip>
                            <TooltipTrigger render={<span className="text-muted-foreground truncate max-w-32 cursor-help" />}>
                              {cell.notes}
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-64">
                              {cell.notes}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                        {cell.details?.supports_iot && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded text-[10px] font-medium">
                            <HugeiconsIcon icon={WifiConnected01Icon} className="size-3" /> IoT
                          </span>
                        )}
                        {cell.details?.supports_nr_redcap && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded text-[10px] font-medium">
                            <HugeiconsIcon icon={BatteryLowIcon} className="size-3" /> RedCap
                          </span>
                        )}
                        {isNew && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge
                                variant="secondary"
                                className="bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] px-1.5 py-0 cursor-help whitespace-nowrap"
                              >
                                {t("common:submissionType.new")}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("specs.newCellTooltip")}</p>
                              <p className="opacity-75">
                                {new Date(cell.createdAt).toLocaleDateString(i18n.language, { year: "numeric", month: "short", day: "numeric" })}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {isUpdated && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge
                                variant="secondary"
                                className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1 py-0 cursor-help inline-flex items-center"
                              >
                                <HugeiconsIcon icon={Clock01Icon} className="size-3" />
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("specs.updatedCellTooltip")}</p>
                              <p className="opacity-75">
                                {new Date(cell.updatedAt).toLocaleDateString(i18n.language, { year: "numeric", month: "short", day: "numeric" })}
                              </p>
                            </TooltipContent>
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

function StationDetailHeaderCell({ field }: { field: RatDetailField }) {
  return (
    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
      {field.tooltip ? (
        <Tooltip>
          <TooltipTrigger>
            <span className="cursor-help">{field.label}</span>
          </TooltipTrigger>
          <TooltipContent>{field.tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        field.label
      )}
    </th>
  );
}

function getStationDetailValue(field: RatDetailField, details: Record<string, unknown> | null | undefined): string | number {
  if (!details) return "-";
  const value = details[field.valueKey ?? field.key];
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return "-";
}
