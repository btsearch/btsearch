import { useTranslation } from "react-i18next";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/useMobile";
import type { Operator, Region } from "@/types/station";

import type { LocationFilters } from "../hooks/useLocationsData";
import { LocationsFilters } from "./locationsFilters";

interface LocationsResponsiveFiltersProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filters: LocationFilters;
  operators: Operator[];
  regions: Region[];
  selectedRegions: number[];
  searchQuery: string;
  onFiltersChange: (filters: LocationFilters) => void;
  onRegionsChange: (regionIds: number[]) => void;
  onClearAllFilters: () => void;
  onSearchQueryChange: (query: string) => void;
  hasActiveFilters: boolean;
  locationCount: number;
  totalLocations?: number;
}

export function LocationsResponsiveFilters({
  isOpen,
  onOpenChange,
  filters,
  operators,
  regions,
  selectedRegions,
  searchQuery,
  onFiltersChange,
  onRegionsChange,
  onClearAllFilters,
  onSearchQueryChange,
  hasActiveFilters,
  locationCount,
  totalLocations,
}: LocationsResponsiveFiltersProps) {
  const { t } = useTranslation("admin");
  const isMobile = useIsMobile();

  const filterProps = {
    filters,
    operators,
    regions,
    selectedRegions,
    searchQuery,
    onFiltersChange,
    onRegionsChange,
    onClearAllFilters,
    onSearchQueryChange,
    hasActiveFilters,
    locationCount,
    totalLocations,
  };

  return (
    <>
      {!isMobile ? (
        <div className="shrink-0">
          <LocationsFilters {...filterProps} />
        </div>
      ) : null}

      {isMobile ? (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>{t("common:labels.filters")}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <LocationsFilters {...filterProps} isSheet />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}
