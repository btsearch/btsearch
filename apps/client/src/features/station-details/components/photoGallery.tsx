import { ArrowDown01Icon, ArrowUp01Icon, Camera01Icon, Image01Icon, Note02Icon, StarIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Lightbox } from "@/components/lightbox";
import { PhotoWithFallback, isRecentPhoto } from "@/components/photoGridPrimitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { type StationPhoto, fetchStationPhotos, setStationPhotoSelection } from "../api";

type Props = { stationId: number; isAdmin: boolean };
type PhotoSortOrder = "asc" | "desc";

function PhotoMeta({ photo, locale }: { photo: StationPhoto; locale: string }) {
  const { t } = useTranslation("stationDetails");
  const username = photo.author?.username ?? t("photos.unknownUser");

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">@{username}</span>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Upload04Icon} className="size-3 opacity-60" />
          <span className="tabular-nums">
            {new Date(photo.createdAt).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}
          </span>
        </div>
        {photo.taken_at ? (
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Camera01Icon} className="size-3 opacity-60" />
            <span className="tabular-nums">{new Date(photo.taken_at).toLocaleDateString(locale, { year: "numeric", month: "short" })}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PhotoGallery({ stationId, isAdmin }: Props) {
  const { t, i18n } = useTranslation("stationDetails");
  const queryClient = useQueryClient();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<PhotoSortOrder>("desc");

  const { data: photos, isLoading } = useQuery({
    queryKey: ["station-photos", stationId],
    queryFn: () => fetchStationPhotos(stationId),
    staleTime: 1000 * 60 * 5,
  });

  const sortedPhotos = useMemo(() => {
    const direction = sortOrder === "asc" ? 1 : -1;

    return [...(photos ?? [])].sort((a, b) => {
      if (a.is_main !== b.is_main) return a.is_main ? -1 : 1;

      const createdAtComparison = a.createdAt.localeCompare(b.createdAt);
      if (createdAtComparison !== 0) return createdAtComparison * direction;

      return a.id - b.id;
    });
  }, [photos, sortOrder]);

  const setMainMutation = useMutation({
    mutationFn: ({ photoId }: { photoId: number }) =>
      setStationPhotoSelection(
        stationId,
        (photos ?? []).map((p) => p.id),
        photoId,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] }),
  });

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
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

  const prev = () => setLightboxIndex((i) => (i !== null ? (i - 1 + sortedPhotos.length) % sortedPhotos.length : null));
  const next = () => setLightboxIndex((i) => (i !== null ? (i + 1) % sortedPhotos.length : null));
  const sortLabel = sortOrder === "asc" ? t("photos.sortOldestFirst") : t("photos.sortNewestFirst");

  return (
    <>
      <div className="mb-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSortOrder((current) => (current === "asc" ? "desc" : "asc"))}
          className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground"
        >
          <HugeiconsIcon icon={sortOrder === "asc" ? ArrowUp01Icon : ArrowDown01Icon} className="size-3.5" />
          {sortLabel}
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sortedPhotos.map((photo, idx) => (
          <div
            key={`${photo.id}-${photo.is_main ? "main" : sortOrder}`}
            className="relative group rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none"
            style={{ animationDelay: `${Math.min(idx * 50, 400)}ms`, animationFillMode: "both" }}
          >
            <button
              type="button"
              aria-label={t("photos.openPhoto", { number: idx + 1 })}
              aria-haspopup="dialog"
              onClick={() => setLightboxIndex(idx)}
              className="block w-full cursor-zoom-in text-left"
            >
              <PhotoWithFallback
                src={`/uploads/${photo.attachment_uuid}.webp`}
                alt={t("photos.photoAlt", { number: idx + 1 })}
                loading="lazy"
                decoding="async"
                className="block w-full aspect-square object-cover transition-[transform,opacity] duration-200 group-hover:scale-[1.03] group-hover:opacity-90"
                fallbackClassName="group-hover:scale-100 group-hover:opacity-100"
              />
            </button>
            <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1.5">
              {photo.is_main ? (
                <span className="bg-black/60 text-yellow-400 rounded-full p-1">
                  <HugeiconsIcon icon={StarIcon} className="size-3" />
                </span>
              ) : null}
              {isRecentPhoto(photo.createdAt) ? (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium text-white" title={t("main:photos.recent")}>
                  {t("main:photos.recent")}
                </span>
              ) : null}
            </span>
            {photo.note ? (
              <span
                className={cn(
                  "absolute top-1.5 right-1.5 bg-black/60 text-white/80 rounded-full p-1 transition-opacity",
                  isAdmin && !photo.is_main ? "group-hover:opacity-0" : "",
                )}
                title={photo.note}
              >
                <HugeiconsIcon icon={Note02Icon} className="size-3" />
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2 py-1.5 rounded-b-lg bg-linear-to-t from-black/70 to-transparent text-white text-[11px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <PhotoMeta photo={photo} locale={i18n.language} />
            </div>
            {isAdmin && !photo.is_main ? (
              <button
                type="button"
                onClick={() => setMainMutation.mutate({ photoId: photo.id })}
                disabled={setMainMutation.isPending}
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white rounded-md px-2 py-0.5 text-xs font-medium"
              >
                {t("photos.setAsMain")}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <Lightbox photos={sortedPhotos} index={lightboxIndex} onClose={closeLightbox} onPrev={prev} onNext={next} />
    </>
  );
}
