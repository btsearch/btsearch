import { Camera01Icon, Image01Icon, StarIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { isRecentPhoto } from "@/components/photoGridPrimitives";

import type { GalleryPhoto } from "../api";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short" };

type PhotoTileLabels = {
  mainPhoto: string;
  openPhoto: string;
  recent: string;
  taken: string;
  unknownOperator: string;
  unknownUser: string;
  uploaded: string;
  viewStation: string;
  imageUnavailable: string;
};

type Props = {
  photo: GalleryPhoto;
  index: number;
  locale: string;
  labels: PhotoTileLabels;
  onOpen: (index: number) => void;
};

export function PhotoTile({ photo, index, locale, labels, onOpen }: Props) {
  const reduceMotion = useReducedMotion();
  const [imageFailed, setImageFailed] = useState(false);
  const recent = isRecentPhoto(photo.createdAt);
  const author = photo.author?.username ?? labels.unknownUser;
  const uploadedDate = new Date(photo.createdAt).toLocaleDateString(locale, DATE_FORMAT);
  const takenDate = photo.taken_at ? new Date(photo.taken_at).toLocaleDateString(locale, MONTH_FORMAT) : null;
  const alt = [photo.station.station_id, photo.location.label, photo.note].filter(Boolean).join(" - ");

  return (
    <motion.article
      className="group relative overflow-hidden rounded-lg bg-muted"
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <button
        type="button"
        className="relative block aspect-square w-full cursor-zoom-in overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={labels.openPhoto}
        onClick={() => onOpen(index)}
      >
        {imageFailed ? (
          <span className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Image01Icon} className="size-7 opacity-55" />
            {labels.imageUnavailable}
          </span>
        ) : (
          <img
            src={`/uploads/${photo.attachment_uuid}.webp`}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:opacity-95 motion-reduce:transition-none"
            onError={() => setImageFailed(true)}
          />
        )}
        <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
          {photo.is_main ? (
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
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-2.5 pt-12 text-white">
          <span className="truncate text-[11px] font-medium text-white/90">@{author}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/82">
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
          {photo.note ? <span className="truncate text-[11px] italic text-white/70">{photo.note}</span> : null}
        </span>
      </button>
    </motion.article>
  );
}
