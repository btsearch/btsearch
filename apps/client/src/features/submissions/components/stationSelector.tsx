import { Add01Icon, AirportTowerIcon, PencilEdit02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactElement, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { TARGET_SEARCH_MIN_LENGTH, targetStationSearchQueryOptions } from "../api";
import type { SubmissionMode } from "../types";
import { SegmentButton, SegmentSwitch } from "./segmentSwitch";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { type StationSearchHit, isRejectedSearchQuery } from "@/features/map/searchApi";
import { getCellTechnologyBands } from "@/features/map/utils";
import { brandsQueryOptions } from "@/features/shared/lookups";
import type { StationRecord } from "@/features/station-details/station/types";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { NETWORKS_ID_KIND, findStationIdentifier } from "@/features/station-details/station/utils/stations";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { normalizeSearchText } from "@/lib/apiValues";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

export type TargetStation = Pick<StationRecord, "id" | "siteId" | "operator" | "identifiers" | "location" | "cells">;

type StationSelectorProps = {
  mode: SubmissionMode;
  station: TargetStation | null;
  isStationLoading: boolean;
  stationError: ReactElement | null;
  isLocked: boolean;
  focusesModeSwitch: boolean;
  onModeChange: (mode: SubmissionMode) => void;
  onStationPick: (station: StationSearchHit) => void;
  onStationClear: () => void;
};

type SelectorBodyProps = Omit<StationSelectorProps, "focusesModeSwitch" | "onModeChange">;

type StationSummaryProps = {
  station: TargetStation;
  action?: ReactNode;
};

type StationSearchProps = {
  onStationPick: (station: StationSearchHit) => void;
};

type StationSearchResultsProps = StationSearchProps & {
  searchText: string;
  isSettling: boolean;
};

const SEARCH_DELAY_MS = 300;
const NO_HITS: StationSearchHit[] = [];
const HIT_CLASS = cn(
  "group min-h-11 w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/70",
  "focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);
const STATE_CLASS = "p-3 text-center text-sm text-muted-foreground";

function StationSummary({ station, action }: StationSummaryProps) {
  const { data: brands } = useQuery(brandsQueryOptions());
  const { operator } = station;
  const place = [station.location?.city, station.location?.address].filter((part): part is string => Boolean(part)).join(" · ");
  const networksId = findStationIdentifier(station.identifiers, NETWORKS_ID_KIND);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        {operator === null ? null : (
          <span className="flex min-w-0 items-center gap-1.5">
            <BrandMark brand={getOperatorBrand(operator, brands)} size={16} />
            <span className="min-w-0 truncate text-xs font-medium text-foreground">{operator.name}</span>
          </span>
        )}
        <span className="shrink-0 font-mono text-sm font-medium text-foreground tabular-nums group-hover:underline">{station.siteId}</span>
        {networksId === null ? null : <span className="shrink-0 font-mono text-[11px] text-foreground/70">N!{networksId}</span>}
        {action === undefined ? null : <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {place === "" ? null : <p className="mt-1 truncate text-[11px] text-muted-foreground">{place}</p>}
      <TechnologySummary bands={getCellTechnologyBands(station.cells)} className="mt-0.5 pl-0" />
    </div>
  );
}

function StationSearchResults({ searchText, isSettling, onStationPick }: StationSearchResultsProps) {
  const { t } = useTranslation(["common", "main"]);
  const { data: hits = NO_HITS, error, isLoading, isLoadingError, isFetching, refetch } = useQuery(targetStationSearchQueryOptions(searchText));

  if (isSettling || isLoading) return <div className={STATE_CLASS}>{t("actions.loading")}</div>;
  if (isLoadingError && isRejectedSearchQuery(error)) return <div className={STATE_CLASS}>{t("main:search.queryRejected")}</div>;
  if (isLoadingError) {
    return <InlineError size="sm" title={t("main:search.errorTitle")} onRetry={() => refetch()} isRetrying={isFetching} className="m-1" />;
  }
  if (hits.length === 0) return <div className={STATE_CLASS}>{t("main:search.noResults")}</div>;

  return (
    <div className="space-y-0.5 p-1">
      {hits.map((hit) => (
        <button type="button" key={hit.id} onClick={() => onStationPick(hit)} className={HIT_CLASS}>
          <StationSummary station={hit} />
        </button>
      ))}
    </div>
  );
}

function StationSearch({ onStationPick }: StationSearchProps) {
  const { t } = useTranslation("common");
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const delayedText = useDebouncedValue(searchText, SEARCH_DELAY_MS);

  const typedText = normalizeSearchText(searchText);
  const isSettling = typedText !== normalizeSearchText(delayedText);

  function closeOnEscape(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") setIsOpen(false);
  }

  function changeSearchText(text: string) {
    setSearchText(text);
    setIsOpen(true);
  }

  return (
    <div className="relative">
      <HugeiconsIcon icon={Search01Icon} aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        {...NO_AUTOFILL_PROPS}
        aria-label={t("actions.selectStation")}
        placeholder={t("placeholder.search")}
        value={searchText}
        onChange={(event) => changeSearchText(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onKeyDown={closeOnEscape}
        className="h-9 pl-10"
      />
      {isOpen && typedText.length >= TARGET_SEARCH_MIN_LENGTH ? (
        <div className="custom-scrollbar absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
          <StationSearchResults searchText={delayedText} isSettling={isSettling} onStationPick={onStationPick} />
        </div>
      ) : null}
    </div>
  );
}

function SelectorBody({ mode, station, isStationLoading, stationError, isLocked, onStationPick, onStationClear }: SelectorBodyProps) {
  const { t } = useTranslation(["submissions", "common"]);

  if (mode === "new") return <p className="text-sm text-muted-foreground">{t("submissionSelector.newStationHint")}</p>;
  if (stationError !== null) return stationError;
  if (station !== null) {
    const clearButton = isLocked ? undefined : (
      <Button type="button" variant="ghost" size="sm" onClick={onStationClear} className="h-8 cursor-pointer px-2 text-xs">
        {t("common:actions.clear")}
      </Button>
    );
    return <StationSummary station={station} action={clearButton} />;
  }
  if (!isStationLoading) return <StationSearch onStationPick={onStationPick} />;

  return (
    <div role="status" className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
      <Spinner aria-hidden="true" />
      {t("common:actions.loading")}
    </div>
  );
}

export function StationSelector({ focusesModeSwitch, onModeChange, ...body }: StationSelectorProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const { mode, isLocked } = body;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-t-xl border-b bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon icon={AirportTowerIcon} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold tracking-tight">{t("common:actions.selectStation")}</span>
        </div>
        <SegmentSwitch label={t("form.targetSwitch")}>
          <SegmentButton
            label={t("submissionSelector.new")}
            icon={Add01Icon}
            isActive={mode === "new"}
            isDisabled={isLocked}
            hasAutoFocus={focusesModeSwitch && mode === "new"}
            onClick={() => onModeChange("new")}
          />
          <SegmentButton
            label={t("submissionSelector.existing")}
            icon={PencilEdit02Icon}
            isActive={mode === "existing"}
            isDisabled={isLocked}
            hasAutoFocus={focusesModeSwitch && mode === "existing"}
            onClick={() => onModeChange("existing")}
          />
        </SegmentSwitch>
      </div>
      <div className="p-4">
        <SelectorBody {...body} />
      </div>
    </div>
  );
}
