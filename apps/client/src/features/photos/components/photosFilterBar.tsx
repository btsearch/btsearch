import { ArrowDown01Icon, ArrowUp01Icon, Globe02Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PhotoSort, StationStatus } from "@openbts/shared/contract";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import {
  PHOTOS_GALLERY_SORT_FIELDS,
  PHOTO_SEARCH_TEXT_MAX_LENGTH,
  type PhotosGalleryFilters,
  type PhotosGalleryFiltersUpdate,
  type PhotosGallerySortBy,
  clearPhotosGalleryFilters,
  countActivePhotosGalleryFilters,
  getPhotosGallerySortParts,
  setPhotosGallerySortBy,
  togglePhotosGalleryOrder,
  togglePhotosGalleryStatus,
} from "../galleryFilters";
import { FilterMenuTrigger, PhotosOperatorMenu } from "./photosOperatorMenu";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import { ListSearchField } from "@/features/stations/list/components/frame/listSearchField";
import { ListFacetCombobox } from "@/features/stations/list/components/panel/listFacetCombobox";
import { listCountryOptionGroups, listRegionOptionGroups } from "@/features/stations/list/components/panel/listPanelSections";
import type { ListPanelScope } from "@/features/stations/list/data/listPanel";
import { LIST_STATION_STATUSES } from "@/features/stations/list/data/listStationStatuses";
import { cn, toggleValue } from "@/lib/utils";

type PhotosFilterBarProps = {
  filters: PhotosGalleryFilters;
  scope: ListPanelScope;
  onFiltersChange: (update: PhotosGalleryFiltersUpdate) => void;
  onPickCountries: (countryCodes: readonly string[]) => void;
};

type BarFieldProps = {
  label: string;
  className?: string;
  children: ReactNode;
};

type StatusMenuProps = {
  statuses: readonly StationStatus[];
  onToggleStatus: (status: StationStatus) => void;
};

type SortControlsProps = {
  sort: PhotoSort;
  onFiltersChange: (update: PhotosGalleryFiltersUpdate) => void;
};

const NAME_SEPARATOR = ", ";
const LABEL_CLASS = "text-xs font-medium text-muted-foreground";
const GROUP_CLASS = "flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2";
const SINGLE_COUNTRY_HEAD_CLASS = "flex-[999_1_980px]";
const SEVERAL_COUNTRIES_HEAD_CLASS = "flex-[999_1_1168px]";
const SWITCH_CLASS = "inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-muted-foreground";

function BarField({ label, className, children }: BarFieldProps) {
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className={cn("flex flex-col gap-1", className)}>
      <span id={labelId} className={LABEL_CLASS}>
        {label}
      </span>
      {children}
    </div>
  );
}

function StatusMenu({ statuses, onToggleStatus }: StatusMenuProps) {
  const { t } = useTranslation(["common", "stations"]);
  const statusLabels: Record<StationStatus, string> = {
    active: t("stations:status.published"),
    awaitingCells: t("stations:status.pending"),
    inactive: t("stations:status.inactive"),
  };
  const hasEveryStatus = statuses.length === LIST_STATION_STATUSES.length;
  const chosenStatusNames = LIST_STATION_STATUSES.filter((status) => statuses.includes(status)).map((status) => statusLabels[status]);

  return (
    <DropdownMenu>
      <FilterMenuTrigger>
        <span className="truncate">{hasEveryStatus ? t("common:labels.allStatuses") : chosenStatusNames.join(NAME_SEPARATOR)}</span>
      </FilterMenuTrigger>
      <DropdownMenuContent align="start">
        {LIST_STATION_STATUSES.map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={statuses.includes(status)}
            closeOnClick={false}
            className="cursor-pointer"
            onCheckedChange={() => onToggleStatus(status)}
          >
            {statusLabels[status]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortControls({ sort, onFiltersChange }: SortControlsProps) {
  const { t } = useTranslation("common");
  const { sortBy, order } = getPhotosGallerySortParts(sort);
  const sortLabels: Record<PhotosGallerySortBy, string> = {
    station: t("labels.stationId"),
    uploaded: t("photos.uploaded"),
    taken: t("photos.taken"),
  };

  return (
    <div className="ml-auto flex shrink-0 items-end gap-3">
      <BarField label={t("sorting.title")} className="w-40 shrink-0">
        <Select
          value={sortBy}
          onValueChange={(value: PhotosGallerySortBy | null) => {
            if (value !== null) onFiltersChange((current) => setPhotosGallerySortBy(current, value));
          }}
        >
          <SelectTrigger className="h-8 w-full cursor-pointer">
            <SelectValue>{sortLabels[sortBy]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PHOTOS_GALLERY_SORT_FIELDS.map((field) => (
              <SelectItem key={field} value={field} className="cursor-pointer">
                {sortLabels[field]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </BarField>
      <BarField label={t("sorting.order")} className="shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 cursor-pointer gap-2"
          onClick={() => onFiltersChange(togglePhotosGalleryOrder)}
        >
          <HugeiconsIcon icon={order === "asc" ? ArrowUp01Icon : ArrowDown01Icon} className="size-4" aria-hidden="true" />
          {order === "asc" ? t("sorting.ascending") : t("sorting.descending")}
        </Button>
      </BarField>
    </div>
  );
}

export function PhotosFilterBar({ filters, scope, onFiltersChange, onPickCountries }: PhotosFilterBarProps) {
  const { t, i18n } = useTranslation(["main", "common", "admin", "stationDetails"]);
  const searchInputId = useId();
  const { language } = i18n;
  const { countries, regionGroups } = scope;
  const hasSeveralCountries = countries.hasCountrySection;
  const activeFilterCount = countActivePhotosGalleryFilters(filters);
  const countryGroups = listCountryOptionGroups(countries.options, language);
  const regionOptionGroups = listRegionOptionGroups(regionGroups, language);
  const regionLabel = hasSeveralCountries ? t("stationDetails:specs.region") : t("common:labels.region");

  function toggleOperator(operatorId: number) {
    onFiltersChange((current) => ({ ...current, operatorIds: toggleValue(current.operatorIds, operatorId) }));
  }

  function toggleStatus(status: StationStatus) {
    onFiltersChange((current) => togglePhotosGalleryStatus(current, status));
  }

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-x-3 gap-y-2 border-b pb-4">
      <div className={cn(GROUP_CLASS, hasSeveralCountries ? SEVERAL_COUNTRIES_HEAD_CLASS : SINGLE_COUNTRY_HEAD_CLASS)}>
        <div className="flex min-w-64 flex-[1_1_320px] flex-col gap-1">
          <label htmlFor={searchInputId} className={LABEL_CLASS}>
            {t("common:labels.search")}
          </label>
          <ListSearchField
            id={searchInputId}
            size="sm"
            maxLength={PHOTO_SEARCH_TEXT_MAX_LENGTH}
            searchText={filters.searchText}
            onSearchTextChange={(searchText) => onFiltersChange((current) => ({ ...current, searchText }))}
            placeholder={t("main:photos.searchFieldPlaceholder")}
            label={t("common:labels.search")}
          />
        </div>

        {hasSeveralCountries ? (
          <BarField label={t("main:filters.country")} className="w-44 shrink-0">
            <ListFacetCombobox
              groups={countryGroups}
              pickedKeys={countries.picked}
              icon={Globe02Icon}
              label={t("main:filters.country")}
              placeholder={t("admin:auditLogs.filters.allCountries")}
              emptyText={t("admin:reference.countries.addDialog.noMatches")}
              hasChips
              showPickedNames={false}
              getCountText={(shownCount, optionCount) => t("main:filters.countriesShown", { shown: shownCount, count: optionCount })}
              onChange={onPickCountries}
            />
          </BarField>
        ) : null}

        <BarField label={t("common:labels.operator")} className="w-56 shrink-0">
          <PhotosOperatorMenu operatorIds={filters.operatorIds} scope={scope} onToggleOperator={toggleOperator} />
        </BarField>

        <BarField label={regionLabel} className="w-56 shrink-0">
          <ListFacetCombobox
            groups={regionOptionGroups}
            pickedKeys={filters.regionIds}
            icon={Location01Icon}
            label={regionLabel}
            placeholder={hasSeveralCountries ? t("main:filters.allRegions") : t("common:labels.allRegions")}
            emptyText={hasSeveralCountries ? t("main:filters.noRegionsFound") : t("common:placeholder.noRegionsFound")}
            hasChips
            showPickedNames={false}
            isLoadingOptions={scope.lookups === undefined && !scope.hasLookupsError}
            onChange={(regionIds) => onFiltersChange((current) => ({ ...current, regionIds }))}
          />
        </BarField>

        <BarField label={t("main:filters.stationStatus")} className="w-44 shrink-0">
          <StatusMenu statuses={filters.statuses} onToggleStatus={toggleStatus} />
        </BarField>
      </div>

      <div className={cn(GROUP_CLASS, "flex-auto")}>
        <label className={SWITCH_CLASS}>
          <Switch
            size="sm"
            checked={filters.isMainOnly}
            onCheckedChange={(isMainOnly) => onFiltersChange((current) => ({ ...current, isMainOnly }))}
          />
          {t("main:photos.mainOnly")}
        </label>
        <label className={SWITCH_CLASS}>
          <Switch
            size="sm"
            checked={filters.isRecentOnly}
            onCheckedChange={(isRecentOnly) => onFiltersChange((current) => ({ ...current, isRecentOnly }))}
          />
          {t("main:photos.recentUploadsOnly")}
        </label>
        <span className={cn("inline-flex shrink-0", activeFilterCount > 0 ? null : "invisible")}>
          <ClearFiltersButton
            count={Math.max(activeFilterCount, 1)}
            onClick={() => onFiltersChange(clearPhotosGalleryFilters)}
            className="cursor-pointer"
          />
        </span>

        <SortControls sort={filters.sort} onFiltersChange={onFiltersChange} />
      </div>
    </div>
  );
}
