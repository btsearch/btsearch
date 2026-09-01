import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Lightbox, type LightboxPhoto } from "@/components/lightbox";

type PhotoStripPhoto = LightboxPhoto & { id: number };

export function PhotoStrip({ photos }: { photos: PhotoStripPhoto[] }) {
  const { t } = useTranslation("stationDetails");
  const [index, setIndex] = useState<number | null>(null);
  const close = useCallback(() => setIndex(null), []);
  const prev = useCallback(() => setIndex((i) => (i !== null ? (i - 1 + photos.length) % photos.length : null)), [photos.length]);
  const next = useCallback(() => setIndex((i) => (i !== null ? (i + 1) % photos.length : null)), [photos.length]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto custom-scrollbar">
        {photos.map((photo, idx) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setIndex(idx)}
            aria-label={t("photos.openPhoto", { number: idx + 1 })}
            aria-haspopup="dialog"
            className="group shrink-0 cursor-pointer overflow-hidden rounded-lg border"
          >
            <img
              src={`/uploads/${photo.attachment_uuid}.webp`}
              alt={photo.note?.trim() || t("photos.photoAlt", { number: idx + 1 })}
              loading="lazy"
              decoding="async"
              className="size-16 object-cover transition-[transform,opacity] duration-200 group-hover:scale-[1.03] group-hover:opacity-90 sm:size-20"
            />
          </button>
        ))}
      </div>
      <Lightbox photos={photos} index={index} onClose={close} onPrev={prev} onNext={next} />
    </>
  );
}
