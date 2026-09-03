import { Delete02Icon, Image01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Lightbox } from "@/components/lightbox";
import { PhotoMeta, PhotoWithFallback } from "@/components/photoGridPrimitives";
import type { SubmissionLocationPhoto } from "@/features/admin/submissions/types";
import type { LocationPhoto } from "@/features/station-details/api";
import { cn } from "@/lib/utils";

type Props = {
  photos: SubmissionLocationPhoto[];
  removalPhotos: LocationPhoto[];
};

export function SubmissionLocationPhotoSelectionsSection({ photos, removalPhotos }: Props) {
  const { t, i18n } = useTranslation("submissions");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [removalLightboxIndex, setRemovalLightboxIndex] = useState<number | null>(null);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prev = useCallback(() => setLightboxIndex((i) => (i !== null ? (i - 1 + photos.length) % photos.length : null)), [photos.length]);
  const next = useCallback(() => setLightboxIndex((i) => (i !== null ? (i + 1) % photos.length : null)), [photos.length]);
  const closeRemovalLightbox = useCallback(() => setRemovalLightboxIndex(null), []);
  const prevRemoval = useCallback(
    () => setRemovalLightboxIndex((i) => (i !== null ? (i - 1 + removalPhotos.length) % removalPhotos.length : null)),
    [removalPhotos.length],
  );
  const nextRemoval = useCallback(() => setRemovalLightboxIndex((i) => (i !== null ? (i + 1) % removalPhotos.length : null)), [removalPhotos.length]);

  if (photos.length === 0 && removalPhotos.length === 0) return null;

  return (
    <>
      {photos.length > 0 ? (
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
            <HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{t("photos.selectedLocationPhotos")}</span>
            <span className="text-xs text-muted-foreground">({photos.length})</span>
          </div>
          <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {photos.map((photo, idx) => (
              <PhotoSelectionTile
                key={photo.id}
                photo={photo}
                locale={i18n.language}
                onOpen={() => setLightboxIndex(idx)}
                mainTitle={t("photos.setAsMain")}
              />
            ))}
          </div>
        </div>
      ) : null}

      {removalPhotos.length > 0 ? (
        <div className="border border-red-200 dark:border-red-900/60 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/60 flex items-center gap-2">
            <HugeiconsIcon icon={Delete02Icon} className="size-4 text-red-500 dark:text-red-400" />
            <span className="font-semibold text-sm text-red-700 dark:text-red-300">{t("photos.removalSelections")}</span>
            <span className="text-xs text-red-500 dark:text-red-400">({removalPhotos.length})</span>
          </div>
          <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {removalPhotos.map((photo, idx) => (
              <PhotoSelectionTile
                key={photo.id}
                photo={photo}
                locale={i18n.language}
                onOpen={() => setRemovalLightboxIndex(idx)}
                className="border-red-200 dark:border-red-900/60 opacity-75"
              />
            ))}
          </div>
        </div>
      ) : null}

      <Lightbox photos={photos} index={lightboxIndex} onClose={closeLightbox} onPrev={prev} onNext={next} />
      <Lightbox photos={removalPhotos} index={removalLightboxIndex} onClose={closeRemovalLightbox} onPrev={prevRemoval} onNext={nextRemoval} />
    </>
  );
}

function PhotoSelectionTile({
  className,
  locale,
  mainTitle,
  onOpen,
  photo,
}: {
  className?: string;
  locale: string;
  mainTitle?: string;
  onOpen: () => void;
  photo: LocationPhoto & { is_main?: boolean };
}) {
  return (
    <div className={cn("rounded-lg overflow-hidden border bg-muted", className)}>
      <div
        role="button"
        tabIndex={0}
        className="relative h-36 cursor-zoom-in"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onOpen();
        }}
      >
        <PhotoWithFallback
          src={`/uploads/${photo.attachment_uuid}.webp`}
          alt={photo.note ?? ""}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {photo.is_main ? (
          <span className="absolute top-1 left-1 bg-amber-500 text-white rounded-full p-0.5" title={mainTitle}>
            <HugeiconsIcon icon={StarIcon} className="size-3" />
          </span>
        ) : null}
      </div>
      <PhotoMeta photo={photo} locale={locale} className="text-[10px]" />
    </div>
  );
}
