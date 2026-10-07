import { ArrowUp01Icon, Camera01Icon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  PHOTO_SEARCH_TEXT_MAX_LENGTH,
  type PhotosGallerySearch,
  clearPhotosGalleryFilters,
  countActivePhotosGalleryFilters,
} from "../galleryFilters";
import { useGalleryLayout } from "../galleryLayout";
import { usePhotosGalleryPages } from "../galleryRequests";
import { usePhotosGalleryState } from "../galleryState";
import { buildGallery, listGalleryPhotos, listTilePlaces } from "../galleryTiles";
import { GalleryGrid } from "./galleryGrid";
import { GallerySkeleton } from "./GallerySkeleton";
import { PhotosFilterBar } from "./photosFilterBar";
import { PhotosMobileFilters } from "./photosMobileFilters";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { PhotoLightbox } from "@/components/photos/photoLightbox";
import { PhotoStationsInfo } from "@/components/photos/photoStationsInfo";
import { ErrorState, InlineError, StaleDataNotice } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { useNavActionTarget } from "@/contexts/navActions";
import { ClearFiltersButton, MobileFilterRailFloating, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { ListTitleRow } from "@/features/stations/list/components/frame/listFrame";
import { ListSearchField } from "@/features/stations/list/components/frame/listSearchField";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

type PhotosGalleryPageProps = {
  search: PhotosGallerySearch;
  onSearchChange: (search: PhotosGallerySearch) => void;
};

const SCROLL_TOP_BUTTON_OFFSET = 520;
const NEXT_PAGE_ROOT_MARGIN = "900px 0px";

export function PhotosGalleryPage({ search, onSearchChange }: PhotosGalleryPageProps) {
  const { t, i18n } = useTranslation(["main", "common", "stations"]);
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const navActionTarget = useNavActionTarget();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { galleryRef, layout } = useGalleryLayout();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [openedTileIndex, setOpenedTileIndex] = useState<number | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const { filters, appliedFilters, appliedFiltersKey, recentUploadsStart, scope, changeFilters, pickCountries } = usePhotosGalleryState({
    search,
    onSearchChange,
  });
  const [shownFiltersKey, setShownFiltersKey] = useState(appliedFiltersKey);
  const {
    data,
    isLoading,
    isLoadingError,
    isFetching,
    isRefetching,
    isRefetchError,
    isFetchNextPageError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = usePhotosGalleryPages(appliedFilters, recentUploadsStart);
  const { lookups } = scope;

  const photos = useMemo(() => listGalleryPhotos(data?.pages), [data]);
  const gallery = useMemo(() => buildGallery(photos, appliedFilters, lookups), [photos, appliedFilters, lookups]);
  const lightboxPhotos = useMemo(
    () =>
      gallery.slides.map(({ photo, tiles }) => ({
        ...photo,
        isMain: tiles.every((tile) => tile.isMain),
        extra: <PhotoStationsInfo places={listTilePlaces(tiles).map(({ location, tiles }) => ({ location, selections: tiles }))} />,
      })),
    [gallery],
  );
  const openPhoto = useCallback((slideIndex: number, tileIndex: number) => {
    setLightboxIndex(slideIndex);
    setOpenedTileIndex(tileIndex);
  }, []);
  const isWaitingForOperators = photos.length > 0 && appliedFilters.operatorIds.length > 0 && lookups === undefined && !scope.hasLookupsError;
  const canLoadNextPage = hasNextPage && !isFetching && !isFetchNextPageError && lightboxIndex === null && !isWaitingForOperators;

  if (shownFiltersKey !== appliedFiltersKey) {
    setShownFiltersKey(appliedFiltersKey);
    setLightboxIndex(null);
  }

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement === null) return;

    const handleScroll = () => setShowScrollTop(scrollElement.scrollTop > SCROLL_TOP_BUTTON_OFFSET);
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!canLoadNextPage || root === null || target === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.at(-1)?.isIntersecting) void fetchNextPage({ cancelRefetch: false });
      },
      { root, rootMargin: NEXT_PAGE_ROOT_MARGIN, threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [canLoadNextPage, fetchNextPage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [appliedFiltersKey]);

  function retry() {
    void refetch();
  }

  function scrollToTop() {
    scrollRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function getLightboxTrigger(slideIndex: number) {
    const tiles = gallery.slides[slideIndex]?.tiles ?? [];
    const tile = tiles.find((candidate) => candidate.tileIndex === openedTileIndex) ?? tiles[0];
    if (tile === undefined) return null;
    return scrollRef.current?.querySelector<HTMLElement>(`[data-tile-index="${tile.tileIndex}"]`) ?? null;
  }

  function clearFilters() {
    changeFilters(clearPhotosGalleryFilters);
  }

  function changeSearchText(searchText: string) {
    changeFilters((current) => ({ ...current, searchText }));
  }

  const { language } = i18n;
  const total = data?.pages[0]?.paging.total ?? 0;
  const hasPhotos = photos.length > 0 && !isWaitingForOperators;
  const activeFilterCount = countActivePhotosGalleryFilters(filters);
  const hasFloatingFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  let paginationAnnouncement = "";
  if (isFetchingNextPage) paginationAnnouncement = t("main:photos.loadingMore");
  else if (!hasNextPage && hasPhotos) paginationAnnouncement = t("main:photos.allLoaded");

  let content = (
    <GalleryGrid gallery={gallery} layout={layout} lookups={lookups} hasCountryTiles={scope.countries.hasCountryTiles} onPhotoOpen={openPhoto} />
  );
  if (isLoading || isWaitingForOperators) content = <GallerySkeleton layout={layout} />;
  else if (isLoadingError) {
    content = (
      <ErrorState
        className="flex-1"
        title={t("common:photos.loadError")}
        description={t("main:photos.errorSubtitle")}
        onRetry={retry}
        isRetrying={isFetching}
      />
    );
  } else if (!hasPhotos && activeFilterCount > 0) {
    content = (
      <div role="status" className="flex flex-1 flex-col">
        <ErrorState
          tone="neutral"
          className="flex-1"
          icon={SearchRemoveIcon}
          title={t("main:photos.filteredEmptyTitle")}
          description={t("main:photos.filteredEmptySubtitle")}
          action={<ClearFiltersButton count={activeFilterCount} onClick={clearFilters} className="cursor-pointer" />}
        />
      </div>
    );
  } else if (!hasPhotos) {
    content = (
      <div role="status" className="flex flex-1 flex-col">
        <ErrorState
          tone="neutral"
          className="flex-1"
          icon={Camera01Icon}
          title={t("main:photos.emptyTitle")}
          description={t("main:photos.emptySubtitle")}
        />
      </div>
    );
  }

  const mobileFilters = isMobile ? (
    <PhotosMobileFilters filters={filters} scope={scope} onFiltersChange={changeFilters} onPickCountries={pickCountries} />
  ) : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
      <div className={cn("flex min-h-0 flex-1 flex-col p-3", hasFloatingFilters ? "pb-0" : null)}>
        <ListTitleRow
          title={t("main:photos.title")}
          count={
            data === undefined ? undefined : (
              <>
                <span aria-hidden="true">{total.toLocaleString(language)}</span>
                <span className="sr-only">{t("main:photos.stationPhotoCount", { count: total })}</span>
              </>
            )
          }
          className="mb-2.5"
        />

        {isMobile ? (
          <>
            <div className="mb-2.5 shrink-0">
              <ListSearchField
                maxLength={PHOTO_SEARCH_TEXT_MAX_LENGTH}
                searchText={filters.searchText}
                onSearchTextChange={changeSearchText}
                placeholder={t("stations:list.searchPlaceholderShort")}
                label={t("common:labels.search")}
              />
            </div>
            {hasFloatingFilters ? null : (
              <div className="min-w-0 shrink-0">
                <MobileFilterRailInline>{mobileFilters}</MobileFilterRailInline>
              </div>
            )}
          </>
        ) : (
          <PhotosFilterBar filters={filters} scope={scope} onFiltersChange={changeFilters} onPickCountries={pickCountries} />
        )}

        <div className="@container flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className={cn(
              "custom-scrollbar -mr-3 flex min-h-0 flex-1 flex-col overflow-y-auto md:pt-4",
              hasFloatingFilters ? "pb-[calc(7rem+env(safe-area-inset-bottom))]" : null,
            )}
          >
            <div ref={galleryRef} className="flex w-[100cqw] flex-1 flex-col">
              {isRefetchError ? (
                <div className="mb-4">
                  <StaleDataNotice onRetry={retry} isRetrying={isRefetching} />
                </div>
              ) : null}

              {content}

              <div ref={sentinelRef} className={hasPhotos ? "h-8 shrink-0" : "h-0"} aria-hidden="true" />

              {isFetchNextPageError ? (
                <InlineError title={t("main:photos.loadMoreError")} onRetry={() => fetchNextPage()} isRetrying={isFetchingNextPage} />
              ) : null}
              {hasPhotos ? (
                <div className="flex shrink-0 flex-col items-center gap-1.5 py-5 text-center text-sm text-muted-foreground">
                  <p className="tabular-nums">{t("main:photos.loadedCount", { count: photos.length, total })}</p>
                  {isFetchingNextPage && !isFetchNextPageError ? (
                    <div className="flex items-center justify-center gap-2">
                      <Spinner className="size-4" />
                      {t("main:photos.loadingMore")}
                    </div>
                  ) : null}
                  {!hasNextPage && !isFetchingNextPage ? <p>{t("main:photos.allLoaded")}</p> : null}
                </div>
              ) : null}
              <p className="sr-only" aria-live="polite" aria-atomic="true">
                {paginationAnnouncement}
              </p>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showScrollTop ? (
          <motion.button
            type="button"
            className={cn(
              "absolute right-5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full",
              "bg-foreground text-background shadow-lg transition-colors hover:bg-foreground/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              hasFloatingFilters ? "bottom-[calc(6.25rem+env(safe-area-inset-bottom))]" : "bottom-5",
            )}
            aria-label={t("main:photos.scrollTop")}
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

      <PhotoLightbox photos={lightboxPhotos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} getTrigger={getLightboxTrigger} />

      {hasFloatingFilters && navActionTarget !== null ? (
        <MobileFilterRailFloating target={navActionTarget} hasEdgeFade>
          {mobileFilters}
        </MobileFilterRailFloating>
      ) : null}
    </div>
  );
}
