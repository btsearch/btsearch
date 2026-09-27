import { useTranslation } from "react-i18next";

import { useLightbox } from "@/components/lightbox";
import { photoThumbUrl } from "@/components/photos/photoFiles";
import { PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import { type LightboxPhoto, PhotoLightbox } from "@/components/photos/photoLightbox";

type PhotoStripPhoto = LightboxPhoto & { id: number };

export function PhotoStrip({ photos }: { photos: PhotoStripPhoto[] }) {
  const { t } = useTranslation("stationDetails");
  const lightbox = useLightbox();

  if (photos.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto custom-scrollbar">
        {photos.map((photo, idx) => (
          <button
            key={photo.id}
            type="button"
            {...lightbox.getTriggerProps(idx)}
            aria-label={t("photos.openPhoto", { number: idx + 1 })}
            className="group shrink-0 cursor-pointer overflow-hidden rounded-lg border"
          >
            <PhotoWithFallback
              src={photoThumbUrl(photo)}
              alt={photo.note?.trim() || t("photos.photoAlt", { number: idx + 1 })}
              loading="lazy"
              decoding="async"
              className="size-16 object-cover transition-[transform,opacity] duration-200 group-hover:scale-[1.03] group-hover:opacity-90 sm:size-20"
              fallbackClassName="group-hover:scale-100 group-hover:opacity-100 [&_svg]:size-5"
              fallbackLabelClassName="sr-only"
            />
          </button>
        ))}
      </div>
      <PhotoLightbox photos={photos} {...lightbox.lightboxProps} />
    </>
  );
}
