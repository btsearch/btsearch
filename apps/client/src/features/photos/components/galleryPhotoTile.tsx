import { Camera01Icon, StarIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useReducedMotion } from "motion/react";
import { memo } from "react";

import type { GalleryPhoto } from "../galleryRequests";
import { preloadLightbox } from "@/components/lightbox";
import { PhotoWithFallback, isRecentPhoto } from "@/components/photos/photoGridPrimitives";
import { getAuthorName, getAuthorUsername } from "@/components/photos/photoLightbox";
import { UserLink } from "@/features/user-profile/components/userLink";
import { formatMonthYear, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type GalleryPhotoTileLabels = {
  mainPhoto: string;
  openPhoto: string;
  recent: string;
  taken: string;
  unknownAuthor: string;
  uploaded: string;
};

type GalleryPhotoTileProps = {
  photo: GalleryPhoto;
  siteId: string;
  isMain: boolean;
  slideIndex: number;
  tileIndex: number;
  locationLabel: string;
  locale: string;
  labels: GalleryPhotoTileLabels;
  compact: boolean;
  onOpen: (slideIndex: number, tileIndex: number) => void;
};

const PHOTO_BUTTON_CLASS = cn(
  "relative block aspect-square w-full cursor-zoom-in overflow-hidden bg-muted text-left",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);
const CAPTION_CLASS = cn(
  "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1",
  "bg-linear-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-2.5 pt-12 text-white",
);
const AUTHOR_CLASS = "truncate text-[11px] font-medium text-white/90";
const AUTHOR_LINK_CLASS = cn(AUTHOR_CLASS, "pointer-events-auto max-w-full self-start");

function GalleryPhotoTileInner({
  photo,
  siteId,
  isMain,
  slideIndex,
  tileIndex,
  locationLabel,
  locale,
  labels,
  compact,
  onOpen,
}: GalleryPhotoTileProps) {
  const reduceMotion = useReducedMotion();
  const recent = isRecentPhoto(photo.createdAt);
  const username = getAuthorUsername(photo.author);
  const uploadedDate = formatShortDate(photo.createdAt, locale);
  const takenDate = photo.takenAt ? formatMonthYear(photo.takenAt, locale, "short") : null;
  const alt = [siteId, locationLabel, photo.note].filter(Boolean).join(" - ");
  const accessibleState = [isMain ? labels.mainPhoto : null, recent ? labels.recent : null].filter(Boolean).join(", ");
  const accessibleLabel = [`${labels.openPhoto}: ${siteId}`, accessibleState].filter(Boolean).join(", ");

  return (
    <motion.article
      className="group relative overflow-hidden rounded-lg bg-muted"
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <button
        type="button"
        data-tile-index={tileIndex}
        className={PHOTO_BUTTON_CLASS}
        aria-label={accessibleLabel}
        aria-haspopup="dialog"
        onClick={() => onOpen(slideIndex, tileIndex)}
        onPointerEnter={preloadLightbox}
        onFocus={preloadLightbox}
      >
        <PhotoWithFallback
          src={photo.urls.thumb}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:opacity-95 motion-reduce:transition-none"
          fallbackClassName="group-hover:scale-100 group-hover:opacity-100"
        />
      </button>
      <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
        {isMain ? (
          <span className="rounded-full bg-black/70 p-1 text-yellow-300" title={labels.mainPhoto}>
            <HugeiconsIcon icon={StarIcon} className="size-3.5" />
          </span>
        ) : null}
        {recent ? (
          <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium text-white" title={labels.recent}>
            {labels.recent}
          </span>
        ) : null}
      </span>
      <span className={CAPTION_CLASS}>
        {username === null ? (
          <span className={AUTHOR_CLASS}>{getAuthorName(photo.author) ?? labels.unknownAuthor}</span>
        ) : (
          <UserLink user={photo.author} className={AUTHOR_LINK_CLASS}>
            @{username}
          </UserLink>
        )}
        <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/82", compact ? "max-sm:hidden" : null)}>
          <span className="inline-flex items-center gap-1" title={labels.uploaded}>
            <HugeiconsIcon icon={Upload04Icon} className="size-3 opacity-70" />
            <span className="tabular-nums">{uploadedDate}</span>
          </span>
          {takenDate ? (
            <span className="inline-flex items-center gap-1" title={labels.taken}>
              <HugeiconsIcon icon={Camera01Icon} className="size-3 opacity-70" />
              <span className="tabular-nums">{takenDate}</span>
            </span>
          ) : null}
        </span>
        {photo.note ? <span className={cn("truncate text-[11px] italic text-white/70", compact ? "max-sm:hidden" : null)}>{photo.note}</span> : null}
      </span>
    </motion.article>
  );
}

export const GalleryPhotoTile = memo(GalleryPhotoTileInner);
