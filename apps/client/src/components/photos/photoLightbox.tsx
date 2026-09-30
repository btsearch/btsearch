import { Camera01Icon, StarIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type PhotoFile, photoDownloadName, photoFullUrl, photoSize, photoThumbUrl, photoUrl } from "./photoFiles";
import { Lightbox, LightboxDetailRow } from "@/components/lightbox";
import type { LightboxProps, LightboxSlide } from "@/components/lightbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatFullDate, formatMonthYear, formatShortDate, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LightboxPhoto = PhotoFile & {
  note: string | null;
  taken_at?: string | null;
  createdAt: string;
  author: { username: string; name?: string | null; image?: string | null } | null;
  is_main?: boolean;
  extra?: ReactNode;
};

function AuthorAvatar({ author, large = false }: { author: LightboxPhoto["author"]; large?: boolean }) {
  const initial = author?.username.trim().charAt(0) || "?";

  return (
    <Avatar aria-hidden="true" className={cn("after:hidden", large ? "size-8" : "size-5")}>
      <AvatarImage src={resolveAvatarUrl(author?.image)} alt="" />
      <AvatarFallback className={cn("bg-white/15 font-medium text-white/90 uppercase", large ? "text-xs" : "text-[10px]")}>{initial}</AvatarFallback>
    </Avatar>
  );
}

export function photoSlides(photos: LightboxPhoto[], t: TFunction<"stationDetails">): LightboxSlide[] {
  return photos.map((photo, index) => ({
    key: photo.attachment_uuid,
    src: photoUrl(photo.attachment_uuid),
    thumbSrc: photo.has_thumb ? photoThumbUrl(photo) : undefined,
    fullSrc: photoFullUrl(photo),
    size: photoSize(photo),
    downloadName: photoDownloadName(photo),
    alt: photo.note?.trim() || t("photos.photoAlt", { number: index + 1 }),
    caption: <PhotoCaption photo={photo} />,
    details: <PhotoDetails photo={photo} />,
  }));
}

type PhotoLightboxProps = Omit<LightboxProps, "slides"> & { photos: LightboxPhoto[] };

export function PhotoLightbox({ photos, ...props }: PhotoLightboxProps) {
  const { t } = useTranslation("stationDetails");
  const slides = useMemo(() => photoSlides(photos, t), [photos, t]);

  return <Lightbox slides={slides} {...props} />;
}

function PhotoCaption({ photo }: { photo: LightboxPhoto }) {
  const { t, i18n } = useTranslation("stationDetails");
  const note = photo.note?.trim();
  const username = photo.author?.username.trim();

  return (
    <div className="flex flex-col gap-1.5 md:items-center">
      {note ? <p className="line-clamp-2 text-sm leading-snug text-white/90 md:text-[15px]">{note}</p> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60 md:justify-center">
        <span className="flex items-center gap-1.5 font-medium text-white/80">
          <AuthorAvatar author={photo.author} />
          {username ? `@${username}` : t("common:labels.unknown")}
        </span>
        <span aria-hidden="true">·</span>
        {photo.taken_at ? (
          <span className="flex items-center gap-1 tabular-nums">
            <HugeiconsIcon icon={Camera01Icon} className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("common:photos.taken")}: </span>
            <time dateTime={photo.taken_at}>{formatMonthYear(photo.taken_at, i18n.language, "short")}</time>
          </span>
        ) : (
          <span className="flex items-center gap-1 tabular-nums">
            <HugeiconsIcon icon={Upload04Icon} className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("common:photos.uploaded")}: </span>
            <time dateTime={photo.createdAt}>{formatShortDate(photo.createdAt, i18n.language)}</time>
          </span>
        )}
        {photo.is_main ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 text-white/80">
              <HugeiconsIcon icon={StarIcon} className="size-3.5 text-yellow-400" aria-hidden="true" />
              {t("photos.main")}
            </span>
          </>
        ) : null}
      </div>
      {photo.extra ? <div className="text-xs text-white/60">{photo.extra}</div> : null}
    </div>
  );
}

function PhotoDetails({ photo }: { photo: LightboxPhoto }) {
  const { t, i18n } = useTranslation("stationDetails");
  const note = photo.note?.trim();
  const username = photo.author?.username.trim();
  const name = photo.author?.name?.trim();
  const displayName = name && name !== username ? name : undefined;

  return (
    <>
      {note ? <p className="text-[15px] leading-snug text-white">{note}</p> : null}
      <LightboxDetailRow label={t("common:labels.author")}>
        {username ? (
          <span className="flex items-center gap-2">
            <AuthorAvatar author={photo.author} large />
            <span>
              {displayName ? <span>{displayName} </span> : null}
              <span className={displayName ? "text-white/60" : undefined}>@{username}</span>
            </span>
          </span>
        ) : (
          t("common:labels.unknown")
        )}
      </LightboxDetailRow>
      <LightboxDetailRow label={t("common:photos.uploaded")}>
        <time dateTime={photo.createdAt}>{formatFullDate(photo.createdAt, i18n.language)}</time>
      </LightboxDetailRow>
      {photo.taken_at ? (
        <LightboxDetailRow label={t("common:photos.taken")}>
          <time dateTime={photo.taken_at}>{formatMonthYear(photo.taken_at, i18n.language, "long")}</time>
        </LightboxDetailRow>
      ) : null}
      {photo.extra ? <div className="text-sm text-white/80">{photo.extra}</div> : null}
    </>
  );
}
