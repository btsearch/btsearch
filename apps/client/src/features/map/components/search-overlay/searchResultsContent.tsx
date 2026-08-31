import { AirportTowerIcon, Alert02Icon, Location04Icon, MapsIcon, RefreshIcon, Route02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { StationTitle } from "@/features/station-details/components/stationTitle";
import { cn } from "@/lib/utils";

import type { SearchStation, UkeSearchPermitStation } from "../../searchApi";
import { getStationBands } from "../../utils";
import { type SearchResultGroup, type SearchResultOption, getSearchOptionId } from "./searchOptions";

export type SearchFailureSource = "locations" | "stations" | "uke";

export type SearchSurfaceState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; failedSources: SearchFailureSource[] }
  | { kind: "ready"; updating: boolean; failedSources: SearchFailureSource[] };

type SearchResultsProps = {
  state: SearchSurfaceState;
  listboxId: string;
  activeKey: string | null;
  queryText: string;
  isGpsAddressLoading: boolean;
  groups: SearchResultGroup[];
  stationTotalCount: number;
  onActiveKeyChange: (key: string) => void;
  onRetry: () => void;
  onSelect: (option: SearchResultOption) => void;
};

function ResultGroupHeader({ id, icon, label, count }: { id: string; icon: IconSvgElement; label: string; count: number }) {
  const { t } = useTranslation("main");

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-muted/30 px-4 py-2 backdrop-blur-sm">
      <HugeiconsIcon icon={icon} className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span id={id} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="ml-auto rounded-full bg-muted/60 px-2 py-0.5 text-[9px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border/60">
        {t("searchResults.resultCount", { count })}
      </span>
    </div>
  );
}

function normalizeEvidenceValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function includesLiteral(value: string | number | null | undefined, query: string): boolean {
  if (value === null || value === undefined || query === "") return false;
  return normalizeEvidenceValue(String(value)).includes(query);
}

function getInternalStationEvidence(station: SearchStation, query: string): "stationId" | "networkId" | "location" | null {
  if (query === "") return null;
  if (includesLiteral(station.station_id, query)) return "stationId";
  if (includesLiteral(station.extra_identificators?.networks_id, query)) return "networkId";
  if (
    includesLiteral(station.extra_address, query) ||
    includesLiteral(station.location?.address, query) ||
    includesLiteral(station.location?.city, query)
  ) {
    return "location";
  }
  return null;
}

function getPermitEvidence(station: UkeSearchPermitStation, query: string): { kind: "stationId" | "permit" | "location"; value?: string } | null {
  if (query === "") return null;
  if (includesLiteral(station.station_id, query)) return { kind: "stationId" };
  const permit = station.permits.find((item) => includesLiteral(item.decision_number, query));
  if (permit) return { kind: "permit", value: permit.decision_number };
  if (includesLiteral(station.location?.address, query) || includesLiteral(station.location?.city, query)) return { kind: "location" };
  return null;
}

function joinPresent(values: Array<string | null | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(" · ");
}

function SearchResultOptionButton({
  option,
  listboxId,
  activeKey,
  className,
  onActiveKeyChange,
  onSelect,
  children,
}: {
  option: SearchResultOption;
  listboxId: string;
  activeKey: string | null;
  className?: string;
  onActiveKeyChange: (key: string) => void;
  onSelect: (option: SearchResultOption) => void;
  children: ReactNode;
}) {
  const isActive = activeKey === option.key;

  return (
    <button
      id={getSearchOptionId(listboxId, option.key)}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={isActive}
      onPointerEnter={() => {
        if (!isActive) onActiveKeyChange(option.key);
      }}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => onSelect(option)}
      className={cn(
        "group min-h-11 w-full cursor-pointer rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
        className,
        isActive ? "bg-accent" : "hover:bg-accent/70",
      )}
    >
      {children}
    </button>
  );
}

export function SearchResults({
  state,
  listboxId,
  activeKey,
  queryText,
  isGpsAddressLoading,
  groups,
  stationTotalCount,
  onActiveKeyChange,
  onRetry,
  onSelect,
}: SearchResultsProps) {
  const { t } = useTranslation("main");
  const normalizedQuery = normalizeEvidenceValue(queryText);

  return (
    <div
      aria-busy={state.kind === "loading" || (state.kind === "ready" && state.updating)}
      className="custom-scrollbar mt-2 max-h-[min(70dvh,calc(100dvh-8rem-var(--floating-nav-map-offset,0rem)))] overflow-y-auto overscroll-contain rounded-xl bg-background/95 shadow-lg ring-1 ring-foreground/10 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-150"
    >
      {state.kind === "loading" ? (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground" role="status" aria-live="polite">
          <Spinner className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs font-medium">{t("search.searching")}</p>
        </div>
      ) : null}

      {state.kind === "empty" ? (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground" role="status" aria-live="polite">
          <HugeiconsIcon icon={Search01Icon} className="size-6 opacity-20" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{t("search.noResults")}</p>
            <p className="text-xs text-muted-foreground">{t("search.noResultsHint")}</p>
          </div>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="flex flex-col items-center justify-center gap-3 p-7 text-center" role="alert">
          <HugeiconsIcon icon={Alert02Icon} className="size-6 text-destructive" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{t("search.errorTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("search.errorHint")}</p>
          </div>
          <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
            <HugeiconsIcon icon={RefreshIcon} className="size-4" aria-hidden="true" />
            {t("common:actions.retry")}
          </Button>
        </div>
      ) : null}

      {state.kind === "ready" && (state.updating || state.failedSources.length > 0) ? (
        <div
          className={cn(
            "flex min-h-9 items-center gap-2 border-b px-3 py-1.5 text-xs",
            state.failedSources.length > 0 ? "bg-destructive/10 text-destructive" : "bg-muted/35 text-muted-foreground",
          )}
          role="status"
          aria-live="polite"
        >
          {state.failedSources.length > 0 ? (
            <>
              <HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{t("search.partialError")}</span>
              <Button type="button" variant="ghost" size="sm" className="min-h-9 text-current max-md:min-h-11" onClick={onRetry}>
                <HugeiconsIcon icon={RefreshIcon} className="size-3.5" aria-hidden="true" />
                {t("common:actions.retry")}
              </Button>
            </>
          ) : (
            <>
              <Spinner className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{t("common:actions.updating")}</span>
            </>
          )}
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <div id={listboxId} role="listbox" aria-label={t("search.resultsLabel")}>
          {groups.map((group) => {
            const groupLabelId = `${listboxId}-${group.kind}-label`;

            switch (group.kind) {
              case "gps":
                return (
                  <div key={group.kind} role="group" aria-labelledby={groupLabelId} className="border-b last:border-0">
                    <ResultGroupHeader id={groupLabelId} icon={Location04Icon} label={t("searchResults.gps")} count={group.options.length} />
                    <div className="p-1">
                      {group.options.map((option) => {
                        const { result } = option;
                        return (
                          <SearchResultOptionButton
                            key={option.key}
                            option={option}
                            listboxId={listboxId}
                            activeKey={activeKey}
                            onActiveKeyChange={onActiveKeyChange}
                            onSelect={onSelect}
                            className="flex items-center gap-3"
                          >
                            <HugeiconsIcon
                              icon={Location04Icon}
                              className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="font-mono text-sm font-bold transition-colors group-hover:text-primary">
                                {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
                              </span>
                              {result.address ? <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{result.address}</p> : null}
                              {isGpsAddressLoading ? (
                                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <Spinner className="size-3" aria-hidden="true" />
                                  {t("searchResults.resolvingAddress")}
                                </p>
                              ) : null}
                            </div>
                          </SearchResultOptionButton>
                        );
                      })}
                    </div>
                  </div>
                );

              case "location":
                return (
                  <div key={group.kind} role="group" aria-labelledby={groupLabelId} className="border-b last:border-0">
                    <ResultGroupHeader id={groupLabelId} icon={MapsIcon} label={t("searchResults.locations")} count={group.options.length} />
                    <div className="space-y-0.5 p-1">
                      {group.options.map((option) => {
                        const { result } = option;
                        const [primaryName, ...secondaryParts] = result.display_name.split(",");
                        return (
                          <SearchResultOptionButton
                            key={option.key}
                            option={option}
                            listboxId={listboxId}
                            activeKey={activeKey}
                            onActiveKeyChange={onActiveKeyChange}
                            onSelect={onSelect}
                            className="flex flex-col gap-0.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="line-clamp-1 text-sm font-bold transition-colors group-hover:text-primary">{primaryName}</span>
                              {result.addresstype === "place" || result.type === "place" || result.type === "locality" ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700 shadow-sm dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
                                  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                                  {t("common:labels.city")}
                                </span>
                              ) : null}
                            </div>
                            <span className="line-clamp-1 text-[11px] text-muted-foreground">{secondaryParts.join(",").trim()}</span>
                          </SearchResultOptionButton>
                        );
                      })}
                    </div>
                  </div>
                );

              case "station":
                return (
                  <div key={group.kind} role="group" aria-labelledby={groupLabelId} className="border-b last:border-0">
                    <ResultGroupHeader id={groupLabelId} icon={AirportTowerIcon} label={t("searchResults.stations")} count={stationTotalCount} />
                    <div className="space-y-0.5 p-1">
                      {group.options.map((option) => {
                        const station = option.result;
                        const location = joinPresent([station.location?.city, station.extra_address ?? station.location?.address]);
                        const evidence = getInternalStationEvidence(station, normalizedQuery);
                        return (
                          <SearchResultOptionButton
                            key={option.key}
                            option={option}
                            listboxId={listboxId}
                            activeKey={activeKey}
                            onActiveKeyChange={onActiveKeyChange}
                            onSelect={onSelect}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <StationTitle
                                stationId={station.station_id}
                                operator={station.operator ?? undefined}
                                stationIdClassName="group-hover:underline"
                              />
                              {station.extra_identificators?.networks_id ? (
                                <span className="shrink-0 font-mono text-[11px] text-foreground/70">
                                  N!{station.extra_identificators.networks_id}
                                </span>
                              ) : null}
                            </div>
                            {location ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{location}</p> : null}
                            <TechnologySummary bands={getStationBands(station.cells)} className="mt-0.5 pl-0" />
                            {evidence ? <p className="mt-1 text-[10px] font-medium text-primary">{t(`searchResults.match.${evidence}`)}</p> : null}
                          </SearchResultOptionButton>
                        );
                      })}
                      {stationTotalCount > group.options.length ? (
                        <div className="border-t border-dashed bg-muted/10 px-4 py-3 text-center text-[11px] italic text-muted-foreground">
                          {t("search.showingTop", { shown: group.options.length, total: stationTotalCount })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );

              case "permit":
                return (
                  <div key={group.kind} role="group" aria-labelledby={groupLabelId} className="border-b last:border-0">
                    <ResultGroupHeader id={groupLabelId} icon={AirportTowerIcon} label={t("searchResults.permits")} count={group.options.length} />
                    <div className="space-y-0.5 p-1">
                      {group.options.map((option) => {
                        const permit = option.result;
                        const location = joinPresent([permit.location?.city, permit.location?.address]);
                        const evidence = getPermitEvidence(permit, normalizedQuery);
                        return (
                          <SearchResultOptionButton
                            key={option.key}
                            option={option}
                            listboxId={listboxId}
                            activeKey={activeKey}
                            onActiveKeyChange={onActiveKeyChange}
                            onSelect={onSelect}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <StationTitle
                                stationId={permit.station_id}
                                operator={permit.operator ?? undefined}
                                stationIdClassName="group-hover:underline"
                              />
                            </div>
                            {location ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{location}</p> : null}
                            {evidence ? (
                              <p className="mt-1 text-[10px] font-medium text-primary">
                                {evidence.kind === "permit"
                                  ? t("searchResults.match.permit", { permit: evidence.value })
                                  : t(`searchResults.match.${evidence.kind}`)}
                              </p>
                            ) : null}
                          </SearchResultOptionButton>
                        );
                      })}
                    </div>
                  </div>
                );

              case "radioline":
                return (
                  <div key={group.kind} role="group" aria-labelledby={groupLabelId} className="border-b last:border-0">
                    <ResultGroupHeader id={groupLabelId} icon={Route02Icon} label={t("searchResults.radiolines")} count={group.options.length} />
                    <div className="space-y-0.5 p-1">
                      {group.options.map((option) => {
                        const radioline = option.result;
                        const txCity = radioline.tx.city?.trim() || null;
                        const rxCity = radioline.rx.city?.trim() || null;
                        const permitMatches = includesLiteral(radioline.permit_number, normalizedQuery);
                        return (
                          <SearchResultOptionButton
                            key={option.key}
                            option={option}
                            listboxId={listboxId}
                            activeKey={activeKey}
                            onActiveKeyChange={onActiveKeyChange}
                            onSelect={onSelect}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {radioline.operator ? (
                                <DialogOperatorName
                                  name={radioline.operator.name}
                                  mnc={radioline.operator.mnc}
                                  compact
                                  labelClassName="text-sm font-semibold group-hover:underline"
                                />
                              ) : (
                                <span className="text-sm font-semibold text-muted-foreground">{t("searchResults.unknownOperator")}</span>
                              )}
                              <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
                                {radioline.permit_number}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {txCity && rxCity ? (
                                <>
                                  {txCity}
                                  <span aria-hidden="true"> ↔ </span>
                                  {rxCity}
                                </>
                              ) : (
                                (txCity ?? rxCity ?? t("searchResults.unknownEndpoint"))
                              )}
                            </p>
                            {permitMatches ? (
                              <p className="mt-1 text-[10px] font-medium text-primary">
                                {t("searchResults.match.permit", { permit: radioline.permit_number })}
                              </p>
                            ) : null}
                          </SearchResultOptionButton>
                        );
                      })}
                    </div>
                  </div>
                );
            }
          })}
        </div>
      ) : null}
    </div>
  );
}
