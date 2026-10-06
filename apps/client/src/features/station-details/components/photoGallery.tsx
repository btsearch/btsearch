import { ArrowDown01Icon, ArrowUp01Icon, Camera01Icon, Image01Icon, Note02Icon, StarIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { replaceStationPhotos, stationPhotoRecordsQueryOptions } from "../station/api";
import { type ShownPhoto, listShownPhotos } from "../station/components/photos/stationPhotos";
import { useLightbox } from "@/components/lightbox";
import { PhotoWithFallback, isRecentPhoto } from "@/components/photos/photoGridPrimitives";
import { PhotoLightbox } from "@/components/photos/photoLightbox";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isGloballyHandledError } from "@/lib/api";
import { formatMonthYear, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = { stationId: number; canEditStation: boolean };
type PhotoSortOrder = "asc" | "desc";

function PhotoMeta({ photo, locale }: { photo: ShownPhoto; locale: string }) {
  const { t } = useTranslation("stationDetails");
  const username = photo.author?.username ?? t("common:labels.unknown");

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">@{username}</span>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Upload04Icon} className="size-3 opacity-60" />
          <span className="tabular-nums">{formatShortDate(photo.createdAt, locale)}</span>
        </div>
        {photo.takenAt ? (
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Camera01Icon} className="size-3 opacity-60" />
            <span className="tabular-nums">{formatMonthYear(photo.takenAt, locale, "short")}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PhotoGallery({ stationId, canEditStation }: Props) {
  const { t, i18n } = useTranslation("stationDetails");
  const queryClient = useQueryClient();
  const lightbox = useLightbox();
  const [sortOrder, setSortOrder] = useState<PhotoSortOrder>("desc");

  const { data: photos, isLoading, isFetching, isLoadingError, refetch } = useQuery(stationPhotoRecordsQueryOptions(stationId));

  const setMainMutation = useMutation({
    mutationFn: ({ photoId }: { photoId: string }) =>
      replaceStationPhotos(
        stationId,
        (photos ?? []).map((p) => p.id),
        photoId,
      ),
    onSuccess: (shownPhotos) => {
      queryClient.setQueryData(stationPhotoRecordsQueryOptions(stationId).queryKey, shownPhotos);
      return queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] });
    },
    onError: (error) => {
      if (isGloballyHandledError(error)) return;
      toast.error(t("submissions:photos.setMainFailed"));
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (isLoadingError) {
    return <ErrorState className="min-h-0 py-8" title={t("common:photos.loadError")} onRetry={() => refetch()} isRetrying={isFetching} />;
  }

  if (!photos || photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <HugeiconsIcon icon={Image01Icon} className="size-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">{t("photos.noPhotos")}</p>
        <p className="text-xs mt-1 text-muted-foreground">{t("photos.noPhotosHint")}</p>
      </div>
    );
  }

  const direction = sortOrder === "asc" ? 1 : -1;
  const sortedPhotos = listShownPhotos(photos, stationId).sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;

    return a.createdAt.localeCompare(b.createdAt) * direction;
  });
  const sortLabel = sortOrder === "asc" ? t("photos.sortOldestFirst") : t("photos.sortNewestFirst");

  return (
    <>
      <div className="mb-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSortOrder((current) => (current === "asc" ? "desc" : "asc"))}
          className="h-7 cursor-pointer gap-1.5 px-2 text-xs font-normal text-muted-foreground"
        >
          <HugeiconsIcon icon={sortOrder === "asc" ? ArrowUp01Icon : ArrowDown01Icon} className="size-3.5" />
          {sortLabel}
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sortedPhotos.map((photo, idx) => (
          <div
            key={`${photo.id}-${photo.isMain ? "main" : sortOrder}`}
            className="relative group rounded-lg overflow-hidden animate-in fade-in zoom-in-95 animation-duration-300 fill-mode-both motion-reduce:animate-none"
            style={{ animationDelay: `${Math.min(idx * 50, 400)}ms` }}
          >
            <button
              type="button"
              aria-label={t("photos.openPhoto", { number: idx + 1 })}
              {...lightbox.getTriggerProps(idx)}
              className="block w-full cursor-zoom-in text-left"
            >
              <PhotoWithFallback
                src={photo.urls.thumb}
                alt={t("photos.photoAlt", { number: idx + 1 })}
                loading="lazy"
                decoding="async"
                className="block w-full aspect-square object-cover transition-[scale,opacity] duration-200 group-hover:scale-[1.03] group-hover:opacity-90"
                fallbackClassName="group-hover:scale-100 group-hover:opacity-100"
              />
            </button>
            <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1.5">
              {photo.isMain ? (
                <span className="bg-black/60 text-yellow-400 rounded-full p-1">
                  <HugeiconsIcon icon={StarIcon} className="size-3" />
                </span>
              ) : null}
              {isRecentPhoto(photo.createdAt) ? (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium text-white" title={t("common:labels.new")}>
                  {t("common:labels.new")}
                </span>
              ) : null}
            </span>
            {photo.note ? (
              <span
                className={cn(
                  "absolute top-1.5 right-1.5 bg-black/60 text-white/80 rounded-full p-1 transition-opacity",
                  canEditStation && !photo.isMain ? "group-hover:opacity-0 group-has-[[data-set-main]:focus-visible]:opacity-0" : "",
                )}
                title={photo.note}
              >
                <HugeiconsIcon icon={Note02Icon} className="size-3" />
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2 py-1.5 rounded-b-lg bg-linear-to-t from-black/70 to-transparent text-white text-[11px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <PhotoMeta photo={photo} locale={i18n.language} />
            </div>
            {canEditStation && !photo.isMain ? (
              <button
                type="button"
                data-set-main
                onClick={() => setMainMutation.mutate({ photoId: photo.id })}
                disabled={setMainMutation.isPending}
                className="absolute top-1.5 right-1.5 cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity bg-black/70 text-white rounded-md px-2 py-0.5 text-xs font-medium disabled:cursor-default"
              >
                {t("common:photos.setAsMain")}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <PhotoLightbox photos={sortedPhotos} {...lightbox.lightboxProps} />
    </>
  );
}
