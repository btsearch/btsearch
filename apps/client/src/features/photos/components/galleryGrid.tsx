import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type GalleryLayout, getGroupLayout } from "../galleryLayout";
import type { Gallery } from "../galleryTiles";
import { GalleryGroupHeader } from "./galleryGroupHeader";
import { GalleryPhotoTile, type GalleryPhotoTileLabels } from "./galleryPhotoTile";
import type { MapLookups } from "@/features/map/data/mapLookups";
import { getLocationLabel } from "@/features/station-details/station/utils/stations";
import { cn } from "@/lib/utils";

type GalleryGridProps = {
  gallery: Gallery;
  layout: GalleryLayout;
  lookups: MapLookups | undefined;
  hasCountryTiles: boolean;
  onPhotoOpen: (slideIndex: number, tileIndex: number) => void;
};

export function GalleryGrid({ gallery, layout, lookups, hasCountryTiles, onPhotoOpen }: GalleryGridProps) {
  const { t, i18n } = useTranslation(["main", "common"]);
  const labels = useMemo<GalleryPhotoTileLabels>(
    () => ({
      mainPhoto: t("main:photos.mainPhoto"),
      openPhoto: t("common:actions.openPhoto"),
      recent: t("common:labels.new"),
      taken: t("common:photos.taken"),
      unknownAuthor: t("common:labels.unknown"),
      uploaded: t("common:photos.uploaded"),
    }),
    [t],
  );

  return (
    <div className={cn("grid gap-y-7", layout.columns === 2 ? "grid-cols-2 gap-x-6" : "grid-cols-1")}>
      {gallery.groups.map(({ station, location, tiles }) => {
        const compact = tiles.length <= 2;
        const { fullRow, tracks } = getGroupLayout(tiles.length, layout);
        const operator = station.operatorId === null ? undefined : lookups?.operatorsById.get(station.operatorId);
        const locationLabel = getLocationLabel(location) ?? t("main:photos.locationNumber", { id: location.id });

        return (
          <section
            key={station.id}
            className={cn("min-w-0 scroll-mt-6 [content-visibility:auto] [contain-intrinsic-size:auto_360px]", fullRow ? "col-span-2" : null)}
          >
            <GalleryGroupHeader
              station={station}
              location={location}
              photoCount={tiles.length}
              operator={operator}
              locationLabel={locationLabel}
              compact={compact}
              hasCountryTile={hasCountryTiles}
            />
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${tracks}, minmax(0, 1fr))` }}>
              {tiles.map((tile) => (
                <GalleryPhotoTile
                  key={tile.key}
                  photo={tile.photo}
                  siteId={tile.station.siteId}
                  isMain={tile.isMain}
                  slideIndex={tile.slideIndex}
                  tileIndex={tile.tileIndex}
                  locationLabel={locationLabel}
                  locale={i18n.language}
                  labels={labels}
                  compact={compact}
                  onOpen={onPhotoOpen}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
