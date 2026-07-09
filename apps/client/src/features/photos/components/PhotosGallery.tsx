import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Camera01Icon,
  Cancel01Icon,
  FilterIcon,
  Location01Icon,
  RefreshIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Lightbox } from "@/components/lightbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useNavActionTarget } from "@/contexts/navActions";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/queries";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useIsMobile } from "@/hooks/useMobile";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

import type { GalleryPhoto, PhotosGalleryFilters, PhotosGalleryOrder, PhotosGallerySortBy } from "../api";
import { usePhotosGallery } from "../hooks";
import { GallerySkeleton } from "./GallerySkeleton";
import { PhotoTile } from "./PhotoTile";

const ALL_FILTER_VALUE = "__all__";
const STORAGE_KEY = "photos:filters";
const STORAGE_VERSION = 1;

function ClearFiltersButton({ count, onClick, className }: { count: number; onClick: () => void; className?: string }) {
  const { t } = useTranslation("common");
  return (
    <Button type="button" variant="ghost" size="sm" className={cn("text-muted-foreground", className)} onClick={onClick}>
      <HugeiconsIcon icon={Cancel01Icon} className="size-3" data-icon="inline-start" />
      {t("actions.clearAll")}
      <span className="ml-1 bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-none">{count}</span>
    </Button>
  );
}

type StationPhotoGroup = {
  stationId: number;
  stationIdentifier: string;
  operator: GalleryPhoto["station"]["operator"];
  location: GalleryPhoto["location"];
  items: { photo: GalleryPhoto; index: number }[];
};

const DEFAULT_FILTERS: PhotosGalleryFilters = {
  q: "",
  operator: null,
  region: null,
  sortBy: "uploaded",
  order: "desc",
  mainOnly: false,
  recentOnly: false,
};

type PersistedFilters = {
  version?: unknown;
  q?: unknown;
  operator?: unknown;
  region?: unknown;
  sortBy?: unknown;
  order?: unknown;
  mainOnly?: unknown;
  recentOnly?: unknown;
};

function isPersistedFilters(value: unknown): value is PersistedFilters {
  return typeof value === "object" && value !== null;
}

function isSortBy(value: unknown): value is PhotosGallerySortBy {
  return value === "station" || value === "uploaded" || value === "taken";
}

function isOrder(value: unknown): value is PhotosGalleryOrder {
  return value === "asc" || value === "desc";
}

function readStoredFilters(): PhotosGalleryFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_FILTERS;

    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedFilters(parsed)) return DEFAULT_FILTERS;
    if (parsed.version !== STORAGE_VERSION) return DEFAULT_FILTERS;

    return {
      q: typeof parsed.q === "string" ? parsed.q : DEFAULT_FILTERS.q,
      operator: typeof parsed.operator === "number" ? parsed.operator : DEFAULT_FILTERS.operator,
      region: typeof parsed.region === "string" ? parsed.region : DEFAULT_FILTERS.region,
      sortBy: isSortBy(parsed.sortBy) ? parsed.sortBy : DEFAULT_FILTERS.sortBy,
      order: isOrder(parsed.order) ? parsed.order : DEFAULT_FILTERS.order,
      mainOnly: typeof parsed.mainOnly === "boolean" ? parsed.mainOnly : DEFAULT_FILTERS.mainOnly,
      recentOnly: typeof parsed.recentOnly === "boolean" ? parsed.recentOnly : DEFAULT_FILTERS.recentOnly,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function writeStoredFilters(filters: PhotosGalleryFilters) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...filters }));
  } catch {
    return;
  }
}

function groupPhotosByStation(photos: GalleryPhoto[]): StationPhotoGroup[] {
  const groups = new Map<number, StationPhotoGroup>();

  photos.forEach((photo, index) => {
    const existing = groups.get(photo.station.id);

    if (existing) {
      existing.items.push({ photo, index });
      return;
    }

    groups.set(photo.station.id, {
      stationId: photo.station.id,
      stationIdentifier: photo.station.station_id,
      operator: photo.station.operator,
      location: photo.location,
      items: [{ photo, index }],
    });
  });

  return Array.from(groups.values());
}

function getActiveFilterCount(filters: PhotosGalleryFilters) {
  return [
    filters.q.trim().length > 0,
    filters.operator !== null,
    filters.region !== null,
    filters.sortBy !== DEFAULT_FILTERS.sortBy,
    filters.order !== DEFAULT_FILTERS.order,
    filters.mainOnly,
    filters.recentOnly,
  ].filter(Boolean).length;
}

type PhotosGalleryState = {
  filters: PhotosGalleryFilters;
  lightboxIndex: number | null;
  showScrollTop: boolean;
};

type PhotosGalleryAction =
  | { type: "SET_SEARCH"; value: string }
  | { type: "SET_OPERATOR"; value: number | null }
  | { type: "SET_REGION"; value: string | null }
  | { type: "SET_SORT_BY"; value: PhotosGallerySortBy }
  | { type: "SET_ORDER"; value: PhotosGalleryOrder }
  | { type: "SET_MAIN_ONLY"; value: boolean }
  | { type: "SET_RECENT_ONLY"; value: boolean }
  | { type: "TOGGLE_MAIN_ONLY" }
  | { type: "TOGGLE_RECENT_ONLY" }
  | { type: "TOGGLE_ORDER" }
  | { type: "CLEAR_FILTERS" }
  | { type: "OPEN_LIGHTBOX"; index: number }
  | { type: "CLOSE_LIGHTBOX" }
  | { type: "STEP_LIGHTBOX"; direction: -1 | 1; photoCount: number }
  | { type: "SET_SHOW_SCROLL_TOP"; value: boolean };

function createInitialGalleryState(): PhotosGalleryState {
  return {
    filters: readStoredFilters(),
    lightboxIndex: null,
    showScrollTop: false,
  };
}

function photosGalleryReducer(state: PhotosGalleryState, action: PhotosGalleryAction): PhotosGalleryState {
  switch (action.type) {
    case "SET_SEARCH":
      return { ...state, filters: { ...state.filters, q: action.value } };
    case "SET_OPERATOR":
      return { ...state, filters: { ...state.filters, operator: action.value } };
    case "SET_REGION":
      return { ...state, filters: { ...state.filters, region: action.value } };
    case "SET_SORT_BY":
      return { ...state, filters: { ...state.filters, sortBy: action.value } };
    case "SET_ORDER":
      return { ...state, filters: { ...state.filters, order: action.value } };
    case "SET_MAIN_ONLY":
      return { ...state, filters: { ...state.filters, mainOnly: action.value } };
    case "SET_RECENT_ONLY":
      return { ...state, filters: { ...state.filters, recentOnly: action.value } };
    case "TOGGLE_MAIN_ONLY":
      return { ...state, filters: { ...state.filters, mainOnly: !state.filters.mainOnly } };
    case "TOGGLE_RECENT_ONLY":
      return { ...state, filters: { ...state.filters, recentOnly: !state.filters.recentOnly } };
    case "TOGGLE_ORDER":
      return { ...state, filters: { ...state.filters, order: state.filters.order === "asc" ? "desc" : "asc" } };
    case "CLEAR_FILTERS":
      return { ...state, filters: DEFAULT_FILTERS };
    case "OPEN_LIGHTBOX":
      return { ...state, lightboxIndex: action.index };
    case "CLOSE_LIGHTBOX":
      return state.lightboxIndex === null ? state : { ...state, lightboxIndex: null };
    case "STEP_LIGHTBOX": {
      if (state.lightboxIndex === null || action.photoCount === 0) return state;

      return { ...state, lightboxIndex: (state.lightboxIndex + action.direction + action.photoCount) % action.photoCount };
    }
    case "SET_SHOW_SCROLL_TOP":
      return state.showScrollTop === action.value ? state : { ...state, showScrollTop: action.value };
  }
}

type PhotosMobileFilterRailProps = {
  activeFilterCount: number;
  filters: PhotosGalleryFilters;
  order: PhotosGalleryOrder;
  operators: Operator[];
  regions: Region[];
  search: string;
  selectedOperator: Operator | null;
  selectedRegion: Region | null;
  sortBy: PhotosGallerySortBy;
  sortLabels: Record<PhotosGallerySortBy, string>;
  loadedCount: number;
  totalCount: number;
  onClearFilters: () => void;
  onMainOnlyToggle: () => void;
  onOperatorChange: (operatorId: number | null) => void;
  onOrderChange: (order: PhotosGalleryOrder) => void;
  onRecentOnlyToggle: () => void;
  onRegionChange: (regionCode: string | null) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (sortBy: PhotosGallerySortBy) => void;
};

function PhotosMobileFilterRail({
  activeFilterCount,
  filters,
  order,
  operators,
  regions,
  search,
  selectedOperator,
  selectedRegion,
  sortBy,
  sortLabels,
  loadedCount,
  totalCount,
  onClearFilters,
  onMainOnlyToggle,
  onOperatorChange,
  onOrderChange,
  onRecentOnlyToggle,
  onRegionChange,
  onSearchChange,
  onSortByChange,
}: PhotosMobileFilterRailProps) {
  const { t } = useTranslation(["main", "common"]);
  const hasSearch = search.trim().length > 0;
  const sortActive = sortBy !== DEFAULT_FILTERS.sortBy || order !== DEFAULT_FILTERS.order;
  const photoFilterCount = [filters.mainOnly, filters.recentOnly].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0 || hasSearch;

  return (
    <div className="flex items-center gap-1">
      <MobileFilterChip active={hasSearch} icon={Search01Icon} label={t("common:labels.search")}>
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder={t("photos.searchPlaceholder")}
            className="h-9 w-full rounded-md border bg-background py-2 pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip
        active={selectedOperator !== null}
        count={selectedOperator === null ? 0 : 1}
        icon={FilterIcon}
        label={t("common:labels.operator")}
      >
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          <button
            type="button"
            onClick={() => onOperatorChange(null)}
            className={cn(
              "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
              selectedOperator === null ? "bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{t("common:labels.allOperators")}</span>
          </button>
          {operators.map((operator) => {
            const selected = selectedOperator?.id === operator.id;
            return (
              <button
                key={operator.id}
                type="button"
                onClick={() => onOperatorChange(operator.id)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                <span className="min-w-0 flex-1 truncate">{operator.name}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip
        active={selectedRegion !== null}
        count={selectedRegion === null ? 0 : 1}
        icon={Location01Icon}
        label={t("common:labels.region")}
      >
        <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => onRegionChange(null)}
            className={cn(
              "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
              selectedRegion === null ? "bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{t("photos.allRegions")}</span>
          </button>
          {regions.map((region) => {
            const selected = selectedRegion?.code === region.code;
            return (
              <button
                key={region.id}
                type="button"
                onClick={() => onRegionChange(region.code)}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{region.name}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={sortActive} count={sortActive ? 1 : 0} icon={ArrowDown01Icon} label={t("photos.sortLabel")}>
        <MobileFilterPanelTitle>{t("photos.sortLabel")}</MobileFilterPanelTitle>
        <div className="grid gap-3">
          <div className="grid gap-1">
            {(["uploaded", "taken", "station"] as const).map((value) => {
              const selected = sortBy === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onSortByChange(value)}
                  className={cn(
                    "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                    selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{sortLabels[value]}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {(["asc", "desc"] as const).map((value) => {
              const selected = order === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onOrderChange(value)}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md px-2 text-sm transition-colors",
                    selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  {value === "asc" ? t("photos.order.asc") : t("photos.order.desc")}
                </button>
              );
            })}
          </div>
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={photoFilterCount > 0} count={photoFilterCount} icon={Camera01Icon} label={t("photos.title")}>
        <MobileFilterPanelTitle>{t("photos.title")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          <button
            type="button"
            onClick={onMainOnlyToggle}
            className={cn(
              "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
              filters.mainOnly ? "bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{t("photos.mainOnly")}</span>
          </button>
          <button
            type="button"
            onClick={onRecentOnlyToggle}
            className={cn(
              "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
              filters.recentOnly ? "bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{t("photos.recentOnly")}</span>
          </button>
        </div>
      </MobileFilterChip>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {t("common:actions.clearAll")}
        </button>
      ) : null}

      <div className="inline-flex h-8 max-w-44 shrink-0 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
        <HugeiconsIcon icon={Camera01Icon} className="mr-1.5 size-3.5 shrink-0" />
        <span className="truncate">{t("photos.loadedCount", { count: loadedCount, total: totalCount })}</span>
      </div>
    </div>
  );
}

export function PhotosGallery() {
  const { t, i18n } = useTranslation(["main", "common"]);
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const { openStationDialog } = useFloatingDialogStack();
  const navActionTarget = useNavActionTarget();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(photosGalleryReducer, undefined, createInitialGalleryState);
  const { filters: storedFilters, lightboxIndex, showScrollTop } = state;
  const { q: search, operator, region, sortBy, order, mainOnly, recentOnly } = storedFilters;
  const debouncedSearch = useDebouncedValue(search, 300);

  const filters = useMemo<PhotosGalleryFilters>(
    () => ({ q: debouncedSearch, operator, region, sortBy, order, mainOnly, recentOnly }),
    [debouncedSearch, mainOnly, operator, order, recentOnly, region, sortBy],
  );

  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { data: regions = [] } = useQuery(regionsQueryOptions());
  const { data, isLoading, isError, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = usePhotosGallery(filters);

  const photos = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
  const stationGroups = useMemo(() => groupPhotosByStation(photos), [photos]);
  const selectedOperator = useMemo(
    () => (operator === null ? null : (operators.find((item) => item.id === operator) ?? null)),
    [operator, operators],
  );
  const selectedRegion = useMemo(() => (region === null ? null : (regions.find((item) => item.code === region) ?? null)), [region, regions]);
  const sortLabels = useMemo<Record<PhotosGallerySortBy, string>>(
    () => ({
      station: t("photos.sort.station"),
      uploaded: t("photos.sort.uploaded"),
      taken: t("photos.sort.taken"),
    }),
    [t],
  );
  const totalCount = data?.pages[0]?.totalCount ?? 0;
  const loadedCount = photos.length;
  const activeFilterCount = getActiveFilterCount(filters);
  const activeFilters = activeFilterCount > 0;
  const showFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const labels = useMemo(
    () => ({
      mainPhoto: t("photos.mainPhoto"),
      openPhoto: t("photos.openPhoto"),
      recent: t("photos.recent"),
      taken: t("photos.taken"),
      unknownOperator: t("unknownOperator"),
      unknownUser: t("photos.unknownUser"),
      uploaded: t("photos.uploaded"),
      viewStation: t("photos.viewStation"),
      imageUnavailable: t("photos.imageUnavailable"),
    }),
    [t],
  );

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const handleScroll = () => dispatch({ type: "SET_SHOW_SCROLL_TOP", value: scrollElement.scrollTop > 520 });
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage && lightboxIndex === null) void fetchNextPage();
      },
      { root, rootMargin: "900px 0px", threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, lightboxIndex]);

  useEffect(() => {
    writeStoredFilters(storedFilters);
  }, [storedFilters]);

  useEffect(() => dispatch({ type: "CLOSE_LIGHTBOX" }), [debouncedSearch, operator, region, sortBy, order, mainOnly, recentOnly]);

  const openPhoto = useCallback((index: number) => dispatch({ type: "OPEN_LIGHTBOX", index }), []);
  const closeLightbox = useCallback(() => dispatch({ type: "CLOSE_LIGHTBOX" }), []);
  const openStation = useCallback((stationId: number) => openStationDialog(stationId, "internal"), [openStationDialog]);
  const retry = useCallback(() => void refetch(), [refetch]);
  const clearFilters = useCallback(() => dispatch({ type: "CLEAR_FILTERS" }), []);
  const handleOperatorChange = useCallback((value: string | null) => {
    if (value === null) return;
    dispatch({ type: "SET_OPERATOR", value: value === ALL_FILTER_VALUE ? null : Number(value) });
  }, []);
  const handleRegionChange = useCallback((value: string | null) => {
    if (value === null) return;
    dispatch({ type: "SET_REGION", value: value === ALL_FILTER_VALUE ? null : value });
  }, []);
  const handleSortChange = useCallback((value: PhotosGallerySortBy | null) => {
    if (value === null) return;
    dispatch({ type: "SET_SORT_BY", value });
  }, []);
  const setSearch = useCallback((value: string) => dispatch({ type: "SET_SEARCH", value }), []);
  const setOperator = useCallback((value: number | null) => dispatch({ type: "SET_OPERATOR", value }), []);
  const setRegion = useCallback((value: string | null) => dispatch({ type: "SET_REGION", value }), []);
  const setSortBy = useCallback((value: PhotosGallerySortBy) => dispatch({ type: "SET_SORT_BY", value }), []);
  const setOrder = useCallback((value: PhotosGalleryOrder) => dispatch({ type: "SET_ORDER", value }), []);
  const setMainOnly = useCallback((value: boolean) => dispatch({ type: "SET_MAIN_ONLY", value }), []);
  const setRecentOnly = useCallback((value: boolean) => dispatch({ type: "SET_RECENT_ONLY", value }), []);
  const toggleMainOnly = useCallback(() => dispatch({ type: "TOGGLE_MAIN_ONLY" }), []);
  const toggleRecentOnly = useCallback(() => dispatch({ type: "TOGGLE_RECENT_ONLY" }), []);
  const toggleOrder = useCallback(() => dispatch({ type: "TOGGLE_ORDER" }), []);

  const prev = useCallback(() => dispatch({ type: "STEP_LIGHTBOX", direction: -1, photoCount: photos.length }), [photos.length]);
  const next = useCallback(() => dispatch({ type: "STEP_LIGHTBOX", direction: 1, photoCount: photos.length }), [photos.length]);
  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }), [reduceMotion]);

  const emptyTitle = activeFilters ? t("photos.filteredEmptyTitle") : t("photos.emptyTitle");
  const emptySubtitle = activeFilters ? t("photos.filteredEmptySubtitle") : t("photos.emptySubtitle");

  const content = isLoading ? (
    <GallerySkeleton />
  ) : isError ? (
    <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
      <HugeiconsIcon icon={Camera01Icon} className="mb-3 size-10 text-muted-foreground/50" />
      <h2 className="text-base font-semibold">{t("photos.errorTitle")}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("photos.errorSubtitle")}</p>
      <Button type="button" variant="outline" size="sm" className="mt-4 gap-2" onClick={retry}>
        <HugeiconsIcon icon={RefreshIcon} className="size-4" />
        {t("photos.retry")}
      </Button>
    </div>
  ) : photos.length === 0 ? (
    <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
      <HugeiconsIcon icon={Camera01Icon} className="mb-3 size-10 text-muted-foreground/50" />
      <h2 className="text-base font-semibold">{emptyTitle}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{emptySubtitle}</p>
      {activeFilters ? <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} className="mt-4" /> : null}
    </div>
  ) : (
    <div className="space-y-7">
      {stationGroups.map((group) => (
        <section key={group.stationId} className="scroll-mt-6">
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              className="group/header flex min-w-0 cursor-pointer items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => openStation(group.stationId)}
            >
              <span className="truncate text-sm font-semibold tabular-nums">{group.stationIdentifier}</span>
              {group.operator ? (
                <span className="inline-flex max-w-44 items-center gap-1.5 truncate rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-[2px]" style={{ backgroundColor: getOperatorColor(group.operator.mnc ?? 0) }} />
                  <span className="truncate">{group.operator.name}</span>
                </span>
              ) : null}
              <span className="hidden max-w-80 truncate text-xs text-muted-foreground sm:inline">{group.location.label}</span>
            </button>
            <div className="h-px min-w-6 flex-1 bg-border" />
            <span className="shrink-0 text-xs text-muted-foreground">{t("photos.stationPhotoCount", { count: group.items.length })}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 2xl:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            {group.items.map(({ photo, index }) => (
              <PhotoTile key={photo.id} photo={photo} index={index} locale={i18n.language} labels={labels} onOpen={openPhoto} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="w-full">
          <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">{t("photos.title")}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("photos.subtitle")}</p>
            </div>
            {isLoading || isError ? null : (
              <p className="text-sm text-muted-foreground">{t("photos.loadedCount", { count: loadedCount, total: totalCount })}</p>
            )}
          </header>

          <div
            className={cn(
              "mb-5 flex flex-col gap-2 border-b pb-4 lg:flex-row lg:items-center lg:justify-between",
              showFloatingMobileFilters && "max-md:hidden",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative min-w-0 flex-1 sm:max-w-96">
                <HugeiconsIcon
                  icon={Search01Icon}
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("photos.searchPlaceholder")}
                  className="h-8 pl-8 pr-8"
                />
                {search.length > 0 ? (
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("common:actions.clear")}
                    onClick={() => setSearch("")}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                  </button>
                ) : null}
              </div>

              <Select value={operator === null ? ALL_FILTER_VALUE : String(operator)} onValueChange={handleOperatorChange}>
                <SelectTrigger className="h-8 w-full sm:w-48">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      {selectedOperator ? (
                        <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: getOperatorColor(selectedOperator.mnc ?? 0) }} />
                      ) : null}
                      <span className="truncate">{selectedOperator?.name ?? t("common:labels.allOperators")}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>{t("common:labels.allOperators")}</SelectItem>
                  {operators.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: getOperatorColor(item.mnc ?? 0) }} />
                        {item.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={region ?? ALL_FILTER_VALUE} onValueChange={handleRegionChange}>
                <SelectTrigger className="h-8 w-full sm:w-48">
                  <SelectValue>{selectedRegion?.name ?? t("photos.allRegions")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>{t("photos.allRegions")}</SelectItem>
                  {regions.map((item) => (
                    <SelectItem key={item.id} value={item.code}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className="h-8 w-full sm:w-40">
                  <SelectValue>{sortLabels[sortBy]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="station">{sortLabels.station}</SelectItem>
                  <SelectItem value="uploaded">{sortLabels.uploaded}</SelectItem>
                  <SelectItem value="taken">{sortLabels.taken}</SelectItem>
                </SelectContent>
              </Select>

              <Button type="button" variant="outline" size="sm" className="h-8 gap-2" onClick={toggleOrder}>
                <HugeiconsIcon icon={order === "asc" ? ArrowUp01Icon : ArrowDown01Icon} className="size-4" />
                {order === "asc" ? t("photos.order.asc") : t("photos.order.desc")}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex h-8 items-center gap-2 text-sm text-muted-foreground">
                <Switch size="sm" checked={mainOnly} onCheckedChange={setMainOnly} />
                {t("photos.mainOnly")}
              </label>
              <label className="inline-flex h-8 items-center gap-2 text-sm text-muted-foreground">
                <Switch size="sm" checked={recentOnly} onCheckedChange={setRecentOnly} />
                {t("photos.recentOnly")}
              </label>
              {activeFilters ? <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} /> : null}
            </div>
          </div>

          {content}

          <div ref={sentinelRef} className="h-8" aria-hidden="true" />

          {isFetchingNextPage ? (
            <div className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              {t("photos.loadingMore")}
            </div>
          ) : null}
          {!hasNextPage && photos.length > 0 && !isFetchingNextPage ? (
            <p className="py-5 text-center text-sm text-muted-foreground">{t("photos.allLoaded")}</p>
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showScrollTop ? (
          <motion.button
            type="button"
            className={cn(
              "absolute bottom-5 right-5 inline-flex size-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-colors",
              "hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            aria-label={t("photos.scrollTop")}
            onClick={scrollToTop}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} className="size-5" />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <Lightbox photos={photos} index={lightboxIndex} onClose={closeLightbox} onPrev={prev} onNext={next} />

      {showFloatingMobileFilters &&
        createPortal(
          <div className="flex items-center gap-1 max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 md:hidden">
            <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
              <div className="w-max">
                <PhotosMobileFilterRail
                  activeFilterCount={activeFilterCount}
                  filters={filters}
                  order={order}
                  operators={operators}
                  regions={regions}
                  search={search}
                  selectedOperator={selectedOperator}
                  selectedRegion={selectedRegion}
                  sortBy={sortBy}
                  sortLabels={sortLabels}
                  loadedCount={loadedCount}
                  totalCount={totalCount}
                  onClearFilters={clearFilters}
                  onMainOnlyToggle={toggleMainOnly}
                  onOperatorChange={setOperator}
                  onOrderChange={setOrder}
                  onRecentOnlyToggle={toggleRecentOnly}
                  onRegionChange={setRegion}
                  onSearchChange={setSearch}
                  onSortByChange={setSortBy}
                />
              </div>
            </div>
          </div>,
          navActionTarget,
        )}
    </div>
  );
}
