import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StationsFilters } from "@/features/stations/components/stationsFilters";
import { useIsMobile } from "@/hooks/useMobile";
import type { Operator, Region, StationFilters } from "@/types/station";

interface ResponsiveFiltersProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filters: StationFilters;
  operators: Operator[];
  regions: Region[];
  uniqueBandValues: number[];
  selectedRegions: number[];
  searchQuery: string;
  onFiltersChange: (filters: StationFilters) => void;
  onRegionsChange: (regionIds: number[]) => void;
  onClearAllFilters: () => void;
  onSearchQueryChange: (query: string) => void;
  hasActiveFilters: boolean;
  stationCount: number;
  totalStations?: number;
}

export function ResponsiveFilters({
  isOpen,
  onOpenChange,
  filters,
  operators,
  regions,
  uniqueBandValues,
  selectedRegions,
  searchQuery,
  onFiltersChange,
  onRegionsChange,
  onClearAllFilters,
  onSearchQueryChange,
  hasActiveFilters,
  stationCount,
  totalStations,
}: ResponsiveFiltersProps) {
  const { t } = useTranslation("stations");
  const isMobile = useIsMobile();
  const sheetFocusRef = useRef<HTMLDivElement>(null);

  const filterProps = {
    filters,
    operators,
    regions,
    uniqueBandValues,
    selectedRegions,
    searchQuery,
    onFiltersChange,
    onRegionsChange,
    onClearAllFilters,
    onSearchQueryChange,
    hasActiveFilters,
    stationCount,
    totalStations,
  };

  return (
    <>
      {!isMobile ? (
        <div className="shrink-0">
          <StationsFilters {...filterProps} />
        </div>
      ) : null}

      {isMobile ? (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
          <SheetContent side="left" className="w-72 p-0" initialFocus={sheetFocusRef}>
            <div ref={sheetFocusRef} tabIndex={-1} className="sr-only" />
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>{t("common:labels.filters")}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <StationsFilters {...filterProps} isSheet />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}
