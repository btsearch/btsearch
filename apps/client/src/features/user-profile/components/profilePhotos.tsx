import type { PhotoSelection } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { PROFILE_PHOTO_LIMIT, isUserPhotosUnavailable, userPhotosQueryOptions } from "../queries";
import { PROFILE_SECTION_IDS, ProfileSectionBadge } from "./profileSections";
import { PhotoLightbox } from "@/components/photos/photoLightbox";
import { PhotoStationsInfo } from "@/components/photos/photoStationsInfo";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { GalleryPhotoTile, type GalleryPhotoTileLabels } from "@/features/photos/components/galleryPhotoTile";
import { SettingsSection } from "@/features/settings/components/settingsPrimitives";
import { getLocationLabel, getStationNumber } from "@/features/station-details/station/utils/stations";

const PHOTO_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3";

function isMainOnEveryStation(selections: readonly PhotoSelection[]): boolean {
  return selections.length > 0 && selections.every((selection) => selection.isMain);
}

export function ProfilePhotos({ username, viewerId, photoCount }: { username: string; viewerId: string | null; photoCount: number }) {
  const { t, i18n } = useTranslation("main");
  const { t: tCommon } = useTranslation("common");
  const gridRef = useRef<HTMLDivElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { data: photos, error, isPending, isFetching, refetch } = useQuery(userPhotosQueryOptions(username, viewerId));

  const labels = useMemo<GalleryPhotoTileLabels>(
    () => ({
      mainPhoto: t("photos.mainPhoto"),
      openPhoto: tCommon("actions.openPhoto"),
      recent: tCommon("labels.new"),
      taken: tCommon("photos.taken"),
      unknownAuthor: tCommon("labels.unknown"),
      uploaded: tCommon("photos.uploaded"),
    }),
    [t, tCommon],
  );
  const lightboxPhotos = useMemo(
    () =>
      (photos ?? []).map((photo) => ({
        ...photo,
        isMain: isMainOnEveryStation(photo.selections),
        extra: <PhotoStationsInfo places={[{ location: photo.location, selections: photo.selections }]} />,
      })),
    [photos],
  );
  const openPhoto = useCallback((slideIndex: number) => setLightboxIndex(slideIndex), []);
  if (isUserPhotosUnavailable(error) || photos?.length === 0) return null;

  const getTrigger = (slideIndex: number) => gridRef.current?.querySelector<HTMLElement>(`[data-tile-index="${slideIndex}"]`) ?? null;

  let content: ReactNode;
  if (isPending)
    content = (
      <div aria-busy="true" className={PHOTO_GRID_CLASS}>
        {Array.from({ length: Math.min(photoCount, PROFILE_PHOTO_LIMIT) }, (_, index) => (
          <Skeleton key={index} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    );
  else if (photos === undefined) content = <InlineError title={tCommon("photos.loadError")} onRetry={() => void refetch()} isRetrying={isFetching} />;
  else
    content = (
      <div ref={gridRef} className={PHOTO_GRID_CLASS}>
        {photos.map((photo, index) => {
          const firstSelection = photo.selections[0];
          const locationLabel = getLocationLabel(photo.location) ?? t("photos.locationNumber", { id: photo.locationId });
          return (
            <GalleryPhotoTile
              key={photo.id}
              photo={photo}
              siteId={firstSelection === undefined ? locationLabel : getStationNumber(firstSelection.station)}
              isMain={isMainOnEveryStation(photo.selections)}
              slideIndex={index}
              tileIndex={index}
              locationLabel={locationLabel}
              locale={i18n.language}
              labels={labels}
              compact={false}
              hideAuthor
              onOpen={openPhoto}
            />
          );
        })}
      </div>
    );

  return (
    <SettingsSection id={PROFILE_SECTION_IDS.photos} title={tCommon("labels.photos")} badge={<ProfileSectionBadge count={photoCount} />}>
      {content}
      <PhotoLightbox photos={lightboxPhotos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} getTrigger={getTrigger} />
    </SettingsSection>
  );
}
