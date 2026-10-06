import { Delete02Icon, Image01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SubmissionChanges } from "@openbts/shared/contract";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import { preloadLightbox, useLightbox } from "@/components/lightbox";
import { PhotoMeta, PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import { type LightboxPhoto, PhotoLightbox } from "@/components/photos/photoLightbox";
import { cn } from "@/lib/utils";

type PhotoPicks = SubmissionChanges["photos"];

type Props = {
  photos: PhotoPicks["selected"];
  removalPhotos: PhotoPicks["removed"];
};

export function SubmissionLocationPhotoSelectionsSection({ photos, removalPhotos }: Props) {
  const { t, i18n } = useTranslation("submissions");
  const lightbox = useLightbox();
  const removalLightbox = useLightbox();

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
                ref={lightbox.triggerRef(idx)}
                photo={photo}
                locale={i18n.language}
                onOpen={() => lightbox.open(idx)}
                mainTitle={t("common:photos.setAsMain")}
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
                ref={removalLightbox.triggerRef(idx)}
                photo={photo}
                locale={i18n.language}
                onOpen={() => removalLightbox.open(idx)}
                className="border-red-200 dark:border-red-900/60 opacity-75"
              />
            ))}
          </div>
        </div>
      ) : null}

      <PhotoLightbox photos={photos} {...lightbox.lightboxProps} />
      <PhotoLightbox photos={removalPhotos} {...removalLightbox.lightboxProps} />
    </>
  );
}

function PhotoSelectionTile({
  className,
  locale,
  mainTitle,
  onOpen,
  photo,
  ref,
}: {
  className?: string;
  locale: string;
  mainTitle?: string;
  onOpen: () => void;
  photo: LightboxPhoto;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div className={cn("rounded-lg overflow-hidden border bg-muted", className)}>
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        className="relative h-36 cursor-zoom-in"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;

          event.preventDefault();
          onOpen();
        }}
        onPointerEnter={preloadLightbox}
        onFocus={preloadLightbox}
        aria-haspopup="dialog"
      >
        <PhotoWithFallback src={photo.urls.thumb} alt={photo.note ?? ""} className="w-full h-full object-cover" loading="lazy" />
        {photo.isMain ? (
          <span className="absolute top-1 left-1 bg-amber-500 text-white rounded-full p-0.5" title={mainTitle}>
            <HugeiconsIcon icon={StarIcon} className="size-3" />
          </span>
        ) : null}
      </div>
      <PhotoMeta photo={photo} locale={locale} className="text-[10px]" />
    </div>
  );
}
