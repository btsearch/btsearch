import {
  AirportTowerIcon,
  City02Icon,
  Globe02Icon,
  Gps01Icon,
  Home01Icon,
  InformationCircleIcon,
  Location01Icon,
  Location04Icon,
  Mailbox01Icon,
  MapsIcon,
  Route02Icon,
  Search01Icon,
  SignpostIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

import { type MapLookups, useMapLookups } from "../../data/mapLookups";
import type { StationSearchHit, UkeSearchPermitStation } from "../../searchApi";
import { getCellTechnologyBands } from "../../utils";
import { type SearchResultGroup, type SearchResultOption, getSearchOptionId } from "./searchOptions";
import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { GeocodingAttribution } from "@/features/shared/GeocodingAttribution";
import { HighlightedText } from "@/features/shared/HighlightedText";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { NETWORKS_ID_KIND, findStationIdentifier } from "@/features/station-details/station/utils/stations";
import { useGpsFormat } from "@/hooks/usePreferences";
import { formatCoordinates } from "@/lib/geo/coordinates";
import type { GeocodingKind } from "@/lib/geo/geocoding";
import { cn } from "@/lib/utils";

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

type OperatorNameProps = {
  name: string;
  brand?: BrandLook | null;
  labelClassName?: string;
};

type StationResultTitleProps = {
  siteId: string;
  operatorName?: string;
  brand?: BrandLook | null;
  query: string;
};

const LOCATION_KIND_ICONS: Record<GeocodingKind, IconSvgElement> = {
  country: Globe02Icon,
  region: MapsIcon,
  county: MapsIcon,
  city: City02Icon,
  district: MapsIcon,
  postcode: Mailbox01Icon,
  street: SignpostIcon,
  address: Home01Icon,
  place: Location01Icon,
};

const RESULT_ICON_CLASS_NAME =
  "size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground group-aria-selected:text-foreground";
const BRAND_MARK_SIZE = 16;

function ResultGroupHeader({ id, icon, label, count }: { id: string; icon: IconSvgElement; label: string; count: number }) {
  const { t } = useTranslation("main");

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-muted/30 px-4 py-2 backdrop-blur-sm">
      <HugeiconsIcon icon={icon} className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span id={id} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="ml-auto rounded-full bg-muted/60 px-2 py-0.5 text-[9px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border/60">
        {t("common:labels.results", { count })}
      </span>
    </div>
  );
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function joinPresent(values: (string | null | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" · ");
}

function getHitBrand(hit: StationSearchHit, lookups: MapLookups | undefined): BrandLook | null | undefined {
  return lookups === undefined ? undefined : getOperatorBrand(hit.operator, lookups.brands);
}

function getPermitStationBrand(station: UkeSearchPermitStation, lookups: MapLookups | undefined): BrandLook | null | undefined {
  if (lookups === undefined) return undefined;
  if (station.operator === null) return null;
  return lookups.operatorsById.get(station.operator.id)?.brand ?? null;
}

function OperatorName({ name, brand, labelClassName }: OperatorNameProps) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {brand === undefined ? null : <BrandMark brand={brand} size={BRAND_MARK_SIZE} />}
      <span className={cn("min-w-0 truncate text-xs font-medium text-foreground", labelClassName)}>{name}</span>
    </span>
  );
}

function StationResultTitle({ siteId, operatorName, brand, query }: StationResultTitleProps) {
  return (
    <>
      {operatorName === undefined ? null : <OperatorName name={operatorName} brand={brand} />}
      <span className="shrink-0 font-mono text-sm font-medium text-foreground tabular-nums group-hover:underline">
        <HighlightedText text={siteId} query={query} />
      </span>
    </>
  );
}

function SearchResultOptionButton({
  option,
  listboxId,
  activeKey,
  onActiveKeyChange,
  onSelect,
  children,
}: {
  option: SearchResultOption;
  listboxId: string;
  activeKey: string | null;
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
  const gpsFormat = useGpsFormat();
  const { lookups } = useMapLookups();
  const normalizedQuery = normalizeSearchText(queryText);

  return (
    <div
      aria-busy={state.kind === "loading" || (state.kind === "ready" && state.updating)}
      className="custom-scrollbar min-h-0 overflow-y-auto overscroll-contain border-t border-border/60"
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
        <ErrorState
          title={t("search.errorTitle")}
          description={t("common:error.loadDescription")}
          onRetry={onRetry}
          className="min-h-0 rounded-none border-0 py-7"
        />
      ) : null}

      {state.kind === "ready" && state.failedSources.length > 0 ? (
        <InlineError size="sm" title={t("search.partialError")} onRetry={onRetry} isRetrying={state.updating} className="m-1" />
      ) : null}

      {state.kind === "ready" && state.updating && state.failedSources.length === 0 ? (
        <div
          className="flex min-h-9 items-center gap-2 border-b bg-muted/35 px-3 py-1.5 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Spinner className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{t("common:actions.updating")}</span>
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
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <HugeiconsIcon icon={Gps01Icon} className={RESULT_ICON_CLASS_NAME} aria-hidden="true" />
                              <span className="truncate font-mono text-sm font-medium tabular-nums group-hover:underline">
                                {formatCoordinates(result.lat, result.lng, gpsFormat)}
                              </span>
                            </div>
                            {result.address ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{result.address}</p> : null}
                            {!result.address && isGpsAddressLoading ? (
                              <>
                                <Skeleton className="mt-1.5 mb-1 h-2.5 w-44 max-w-full rounded-sm" aria-hidden="true" />
                                <span className="sr-only">{t("searchResults.resolvingAddress")}</span>
                              </>
                            ) : null}
                          </SearchResultOptionButton>
                        );
                      })}
                    </div>
                    {group.source ? <GeocodingAttribution source={group.source} className="px-4 pb-2" /> : null}
                  </div>
                );

              case "location":
                return (
                  <div key={group.kind} role="group" aria-labelledby={groupLabelId} className="border-b last:border-0">
                    <ResultGroupHeader id={groupLabelId} icon={MapsIcon} label={t("searchResults.locations")} count={group.options.length} />
                    <div className="space-y-0.5 p-1">
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
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <HugeiconsIcon icon={LOCATION_KIND_ICONS[result.kind]} className={RESULT_ICON_CLASS_NAME} aria-hidden="true" />
                              <span className="truncate text-sm font-medium group-hover:underline">{result.name}</span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              <span className="font-medium text-foreground/70">{t(`searchResults.kinds.${result.kind}`)}</span>
                              {result.description ? (
                                <>
                                  {" "}
                                  <span className="text-muted-foreground/40" aria-hidden="true">
                                    ·
                                  </span>{" "}
                                  {result.description}
                                </>
                              ) : null}
                            </p>
                          </SearchResultOptionButton>
                        );
                      })}
                    </div>
                    {group.source ? <GeocodingAttribution source={group.source} className="px-4 pb-2" /> : null}
                  </div>
                );

              case "station":
                return (
                  <div key={group.kind} role="group" aria-labelledby={groupLabelId} className="border-b last:border-0">
                    <ResultGroupHeader id={groupLabelId} icon={AirportTowerIcon} label={t("searchResults.stations")} count={stationTotalCount} />
                    <div className="space-y-0.5 p-1">
                      {group.options.map((option) => {
                        const hit = option.result;
                        const location = joinPresent([hit.location?.city, hit.location?.address]);
                        const networksId = findStationIdentifier(hit.identifiers, NETWORKS_ID_KIND);
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
                              <StationResultTitle
                                siteId={hit.siteId}
                                operatorName={hit.operator?.name}
                                brand={getHitBrand(hit, lookups)}
                                query={normalizedQuery}
                              />
                              {networksId ? (
                                <span className="shrink-0 font-mono text-[11px] text-foreground/70">
                                  N!
                                  <HighlightedText text={networksId} query={normalizedQuery} />
                                </span>
                              ) : null}
                            </div>
                            {location ? (
                              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                <HighlightedText text={location} query={normalizedQuery} />
                              </p>
                            ) : null}
                            <TechnologySummary bands={getCellTechnologyBands(hit.cells)} className="mt-0.5 pl-0" />
                          </SearchResultOptionButton>
                        );
                      })}
                    </div>
                    {stationTotalCount > group.options.length ? (
                      <p className="flex items-center gap-2 border-t bg-muted/30 px-4 py-2 text-[11px] leading-4 text-muted-foreground">
                        <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          <Trans
                            t={t}
                            i18nKey="search.showingTop"
                            values={{ shown: group.options.length, total: stationTotalCount }}
                            components={{ num: <span className="font-medium text-foreground/80 tabular-nums" /> }}
                          />
                        </span>
                      </p>
                    ) : null}
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
                        const matchedPermit =
                          normalizedQuery === ""
                            ? undefined
                            : permit.permits.find((item) => normalizeSearchText(item.decision_number).includes(normalizedQuery));
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
                              <StationResultTitle
                                siteId={permit.station_id}
                                operatorName={permit.operator?.name}
                                brand={getPermitStationBrand(permit, lookups)}
                                query={normalizedQuery}
                              />
                              {matchedPermit ? (
                                <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
                                  <HighlightedText text={matchedPermit.decision_number} query={normalizedQuery} />
                                </span>
                              ) : null}
                            </div>
                            {location ? (
                              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                <HighlightedText text={location} query={normalizedQuery} />
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
                    <ResultGroupHeader id={groupLabelId} icon={Route02Icon} label={t("common:labels.radiolines")} count={group.options.length} />
                    <div className="space-y-0.5 p-1">
                      {group.options.map((option) => {
                        const radioline = option.result;
                        const txCity = radioline.tx.city?.trim() || null;
                        const rxCity = radioline.rx.city?.trim() || null;
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
                                <OperatorName name={radioline.operator.name} labelClassName="text-sm font-semibold group-hover:underline" />
                              ) : (
                                <span className="text-sm font-semibold text-muted-foreground">{t("unknownOperator")}</span>
                              )}
                              <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
                                <HighlightedText text={radioline.permit_number} query={normalizedQuery} />
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {txCity && rxCity ? (
                                <>
                                  <HighlightedText text={txCity} query={normalizedQuery} />
                                  <span aria-hidden="true"> ↔ </span>
                                  <HighlightedText text={rxCity} query={normalizedQuery} />
                                </>
                              ) : (
                                <HighlightedText text={txCity ?? rxCity ?? t("searchResults.unknownEndpoint")} query={normalizedQuery} />
                              )}
                            </p>
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
