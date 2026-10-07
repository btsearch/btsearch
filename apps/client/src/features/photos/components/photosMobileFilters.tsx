import { Camera01Icon, CheckmarkCircle02Icon, FilterIcon, Globe02Icon, Location01Icon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import {
  PHOTOS_GALLERY_ORDERS,
  PHOTOS_GALLERY_SORT_FIELDS,
  type PhotosGalleryFilters,
  type PhotosGalleryFiltersUpdate,
  type PhotosGalleryOrder,
  type PhotosGallerySortBy,
  clearPhotosGalleryRailFilters,
  countPhotosGalleryRailFilters,
  getPhotosGallerySortParts,
  setPhotosGalleryOrder,
  setPhotosGallerySortBy,
  togglePhotosGalleryStatus,
} from "../galleryFilters";
import { DEFAULT_MAP_FILTERS, type MapFilters, type MapFiltersChange } from "@/features/map/data/mapFilters";
import { FacetPill, FilterPanelSection } from "@/features/shared/filterPanel";
import { toV1StationStatus, toV2StationStatus } from "@/features/station-details/station/utils/stations";
import { StationStatusPills } from "@/features/stations/components/stationStatusFilter";
import { ListMobileFilterChip, ListMobileFilterRail, useHeldClearChip } from "@/features/stations/list/components/panel/listMobileFilterRail";
import { ListCountrySection, ListOperatorSection, ListRegionSection } from "@/features/stations/list/components/panel/listPanelSections";
import type { ListPanelScope } from "@/features/stations/list/data/listPanel";
import { DEFAULT_LIST_STATION_STATUSES, isDefaultListStationStatuses } from "@/features/stations/list/data/listStationStatuses";
import { toggleValue } from "@/lib/utils";

type PhotosMobileFiltersProps = {
  filters: PhotosGalleryFilters;
  scope: ListPanelScope;
  onFiltersChange: (update: PhotosGalleryFiltersUpdate) => void;
  onPickCountries: (countryCodes: readonly string[]) => void;
};

const PILLS_CLASS = "flex flex-wrap gap-1.5";

export function PhotosMobileFilters({ filters, scope, onFiltersChange, onPickCountries }: PhotosMobileFiltersProps) {
  const { t } = useTranslation(["main", "common", "stationDetails"]);
  const { isClearChipShown, handleChipOpenChange } = useHeldClearChip(countPhotosGalleryRailFilters(filters) > 0);
  const { countries } = scope;
  const { sortBy, order } = getPhotosGallerySortParts(filters.sort);
  const hasOwnStatuses = !isDefaultListStationStatuses(filters.statuses);
  const photoChoiceCount = Number(filters.isMainOnly) + Number(filters.isRecentOnly);
  const photosLabel = t("stationDetails:tabs.photos");

  const operatorFilters: MapFilters = { ...DEFAULT_MAP_FILTERS, operatorIds: filters.operatorIds, countryCodes: [...countries.picked] };
  const operatorPanel = {
    mapFilters: operatorFilters,
    countries,
    lookups: scope.lookups,
    hasLookupsError: scope.hasLookupsError,
    isRetryingLookups: scope.isRetryingLookups,
    retryLookups: scope.retryLookups,
  };
  const sortLabels: Record<PhotosGallerySortBy, string> = {
    station: t("common:labels.stationId"),
    uploaded: t("common:photos.uploaded"),
    taken: t("common:photos.taken"),
  };
  const orderLabels: Record<PhotosGalleryOrder, string> = { asc: t("common:sorting.ascending"), desc: t("common:sorting.descending") };

  function toggleOperator(operatorId: number) {
    onFiltersChange((current) => ({ ...current, operatorIds: toggleValue(current.operatorIds, operatorId) }));
  }

  function applyOperatorPanelChange(change: MapFiltersChange) {
    const nextOperatorFilters = typeof change === "function" ? change(operatorFilters) : change;
    onFiltersChange((current) => ({ ...current, operatorIds: nextOperatorFilters.operatorIds }));
  }

  return (
    <ListMobileFilterRail isClearChipShown={isClearChipShown} onClearFilters={() => onFiltersChange(clearPhotosGalleryRailFilters)}>
      {countries.hasCountrySection ? (
        <ListMobileFilterChip
          icon={Globe02Icon}
          label={t("main:filters.country")}
          count={countries.picked.length}
          onOpenChange={handleChipOpenChange}
        >
          <ListCountrySection countries={countries} isInline onPickCountries={onPickCountries} />
        </ListMobileFilterChip>
      ) : null}
      <ListMobileFilterChip
        icon={FilterIcon}
        label={t("common:labels.operator")}
        count={filters.operatorIds.length}
        onOpenChange={handleChipOpenChange}
      >
        <ListOperatorSection panel={operatorPanel} onToggleOperator={toggleOperator} onMapFiltersChange={applyOperatorPanelChange} />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={Location01Icon}
        label={t("stationDetails:specs.region")}
        count={filters.regionIds.length}
        onOpenChange={handleChipOpenChange}
      >
        <ListRegionSection
          regionGroups={scope.regionGroups}
          regionIds={filters.regionIds}
          isInline
          onRegionIdsChange={(regionIds) => onFiltersChange((current) => ({ ...current, regionIds }))}
        />
      </ListMobileFilterChip>
      <ListMobileFilterChip
        icon={CheckmarkCircle02Icon}
        label={t("main:filters.stationStatus")}
        count={hasOwnStatuses ? filters.statuses.length : 0}
        onOpenChange={handleChipOpenChange}
      >
        <FilterPanelSection
          title={t("main:filters.stationStatus")}
          onClear={hasOwnStatuses ? () => onFiltersChange((current) => ({ ...current, statuses: [...DEFAULT_LIST_STATION_STATUSES] })) : undefined}
        >
          <StationStatusPills
            statuses={filters.statuses.map(toV1StationStatus)}
            onToggleStatus={(status) => onFiltersChange((current) => togglePhotosGalleryStatus(current, toV2StationStatus(status)))}
          />
        </FilterPanelSection>
      </ListMobileFilterChip>
      <ListMobileFilterChip icon={Camera01Icon} label={photosLabel} count={photoChoiceCount} onOpenChange={handleChipOpenChange}>
        <FilterPanelSection
          title={photosLabel}
          onClear={photoChoiceCount > 0 ? () => onFiltersChange((current) => ({ ...current, isMainOnly: false, isRecentOnly: false })) : undefined}
        >
          <div className={PILLS_CLASS}>
            <FacetPill active={filters.isMainOnly} onClick={() => onFiltersChange((current) => ({ ...current, isMainOnly: !current.isMainOnly }))}>
              {t("main:photos.mainOnly")}
            </FacetPill>
            <FacetPill
              active={filters.isRecentOnly}
              onClick={() => onFiltersChange((current) => ({ ...current, isRecentOnly: !current.isRecentOnly }))}
            >
              {t("main:photos.recentUploadsOnly")}
            </FacetPill>
          </div>
        </FilterPanelSection>
      </ListMobileFilterChip>
      <ListMobileFilterChip icon={Sorting05Icon} label={t("common:sorting.title")} count={0} onOpenChange={handleChipOpenChange}>
        <div className="space-y-2.5">
          <FilterPanelSection title={t("common:sorting.title")}>
            <div className={PILLS_CLASS}>
              {PHOTOS_GALLERY_SORT_FIELDS.map((field) => (
                <FacetPill key={field} active={field === sortBy} onClick={() => onFiltersChange((current) => setPhotosGallerySortBy(current, field))}>
                  {sortLabels[field]}
                </FacetPill>
              ))}
            </div>
          </FilterPanelSection>
          <FilterPanelSection title={t("common:sorting.order")}>
            <div className={PILLS_CLASS}>
              {PHOTOS_GALLERY_ORDERS.map((entry) => (
                <FacetPill key={entry} active={entry === order} onClick={() => onFiltersChange((current) => setPhotosGalleryOrder(current, entry))}>
                  {orderLabels[entry]}
                </FacetPill>
              ))}
            </div>
          </FilterPanelSection>
        </div>
      </ListMobileFilterChip>
    </ListMobileFilterRail>
  );
}
