import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { locationPhotoRecordsQueryOptions, locationRecordQueryOptions, stationPhotoRecordsQueryOptions } from "../../api";
import type { StationRecord } from "../../types";
import { listOtherLocationPhotos } from "./otherPhotos";
import { useLightbox } from "@/components/lightbox";
import { PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import { PhotoLightbox } from "@/components/photos/photoLightbox";
import { PhotoStationsInfo } from "@/components/photos/photoStationsInfo";
import { cn } from "@/lib/utils";

const TILE_STAGGER_MS = 50;
const TILE_MAX_DELAY_MS = 400;
const TILE_CLASS = cn(
  "group relative overflow-hidden rounded-lg",
  "animate-in fade-in zoom-in-95 animation-duration-300 fill-mode-both motion-reduce:animate-none",
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:content-['']",
  "has-[:focus-visible]:after:ring-3 has-[:focus-visible]:after:ring-ring has-[:focus-visible]:after:ring-inset",
);
const TILE_IMAGE_CLASS = cn(
  "block aspect-square w-full object-cover transition-[scale,opacity] duration-200 motion-reduce:transition-none",
  "group-hover:scale-[1.03] group-hover:opacity-90",
);
const TILE_CAPTION_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 text-[11px] leading-3.5 text-white";

type OtherLocationPhotosProps = {
  station: StationRecord;
};

export function OtherLocationPhotos({ station }: OtherLocationPhotosProps) {
  const { t } = useTranslation("stationDetails");
  const headingId = useId();
  const lightbox = useLightbox();
  const { data: locationPhotos } = useQuery(locationPhotoRecordsQueryOptions(station.locationId));
  const { data: location } = useQuery(locationRecordQueryOptions(station.locationId));
  const { data: stationPhotos } = useQuery(stationPhotoRecordsQueryOptions(station.id));

  const otherPhotos = listOtherLocationPhotos(locationPhotos, station.id, stationPhotos, location?.stations);
  if (otherPhotos.length === 0) return null;

  const viewerPhotos = otherPhotos.map(({ photo, selections }) => ({
    ...photo,
    isMain: selections.length > 0 && selections.every((selection) => selection.isMain),
    extra: location === undefined || selections.length === 0 ? undefined : <PhotoStationsInfo places={[{ location, selections }]} />,
  }));

  return (
    <section aria-labelledby={headingId} className="mt-6 sm:mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("photos.otherAtLocation")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("photos.otherAtLocationHint")}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {otherPhotos.map(({ photo, stationNames }, index) => (
          <div key={photo.id} className={TILE_CLASS} style={{ animationDelay: `${Math.min(index * TILE_STAGGER_MS, TILE_MAX_DELAY_MS)}ms` }}>
            <button
              type="button"
              aria-label={t("photos.openPhoto", { number: index + 1 })}
              {...lightbox.getTriggerProps(index)}
              className="block w-full cursor-zoom-in text-left outline-none"
            >
              <PhotoWithFallback
                src={photo.urls.thumb}
                alt={t("photos.photoAlt", { number: index + 1 })}
                loading="lazy"
                decoding="async"
                className={TILE_IMAGE_CLASS}
                fallbackClassName="group-hover:scale-100 group-hover:opacity-100"
              />
            </button>
            {stationNames === "" ? null : <p className={TILE_CAPTION_CLASS}>{stationNames}</p>}
          </div>
        ))}
      </div>
      <PhotoLightbox photos={viewerPhotos} {...lightbox.lightboxProps} />
    </section>
  );
}
