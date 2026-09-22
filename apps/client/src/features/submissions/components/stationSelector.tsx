import { Add01Icon, AirportTowerIcon, PencilEdit02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type ChangeEvent, type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { type SearchStation, searchStations } from "../api";
import type { SubmissionMode } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { getStationBands } from "@/features/map/utils";
import { StationTitle } from "@/features/station-details/components/stationTitle";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

type StationSelectorProps = {
  mode: SubmissionMode;
  selectedStation: SearchStation | null;
  onModeChange: (mode: SubmissionMode) => void;
  onStationSelect: (station: SearchStation | null) => void;
};

function StationSummary({ station, action }: { station: SearchStation; action?: ReactNode }) {
  const location = [station.location?.city, station.extra_address ?? station.location?.address]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        <StationTitle stationId={station.station_id} operator={station.operator ?? undefined} stationIdClassName="group-hover:underline" />
        {station.extra_identificators?.networks_id ? (
          <span className="shrink-0 font-mono text-[11px] text-foreground/70">N!{station.extra_identificators.networks_id}</span>
        ) : null}
        {action ? <div className="ml-auto shrink-0">{action}</div> : null}
      </div>
      {location ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{location}</p> : null}
      <TechnologySummary bands={getStationBands(station.cells)} className="mt-0.5 pl-0" />
    </div>
  );
}

export function StationSelector({ mode, selectedStation, onModeChange, onStationSelect }: StationSelectorProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const [isOpen, setIsOpen] = useState(false);

  const { data: searchResults = [], isLoading } = useQuery({
    queryKey: ["stations-search", debouncedQuery],
    queryFn: () => searchStations(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 30,
  });

  const handleStationSelect = useCallback(
    (station: SearchStation) => {
      onStationSelect(station);
      setSearchQuery("");
      setIsOpen(false);
    },
    [onStationSelect],
  );

  const handleClearSelection = useCallback(() => {
    onStationSelect(null);
    setSearchQuery("");
  }, [onStationSelect]);

  const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setIsOpen(true);
  }, []);

  const handleSearchFocus = useCallback(() => {
    setIsOpen(true);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-t-xl border-b bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon icon={AirportTowerIcon} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold tracking-tight">{t("submissionSelector.title")}</span>
        </div>
        <div className="flex shrink-0 items-center rounded-lg border bg-card p-0.5 shadow-sm">
          <button
            type="button"
            aria-label={t("submissionSelector.new")}
            aria-pressed={mode === "new"}
            onClick={() => onModeChange("new")}
            className={cn(
              "flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-all focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mode === "new"
                ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/50"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            <span className="hidden sm:inline">{t("submissionSelector.new")}</span>
          </button>
          <button
            type="button"
            aria-label={t("submissionSelector.existing")}
            aria-pressed={mode === "existing"}
            onClick={() => onModeChange("existing")}
            className={cn(
              "flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-all focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mode === "existing"
                ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/50"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
            <span className="hidden sm:inline">{t("submissionSelector.existing")}</span>
          </button>
        </div>
      </div>

      <div className="p-4">
        {mode === "existing" && (
          <div>
            {selectedStation ? (
              <StationSummary
                station={selectedStation}
                action={
                  <Button type="button" variant="ghost" size="sm" onClick={handleClearSelection} className="h-8 cursor-pointer px-2 text-xs">
                    {t("common:actions.clear")}
                  </Button>
                }
              />
            ) : (
              <div className="relative">
                <HugeiconsIcon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder={t("common:placeholder.search")}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={handleSearchFocus}
                  className="pl-10 h-9"
                />

                {isOpen && searchQuery.length >= 2 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {isLoading ? (
                      <div className="p-3 text-center text-sm text-muted-foreground">{t("common:actions.loading")}</div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-3 text-center text-sm text-muted-foreground">{t("main:search.noResults")}</div>
                    ) : (
                      <div className="p-1 space-y-0.5">
                        {searchResults.map((station) => (
                          <button
                            type="button"
                            key={station.id}
                            onClick={() => handleStationSelect(station)}
                            className="group min-h-11 w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/70 focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <StationSummary station={station} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "new" && <p className="text-sm text-muted-foreground">{t("submissionSelector.newStationHint")}</p>}
      </div>
    </div>
  );
}
