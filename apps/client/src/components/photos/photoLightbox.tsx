import { Camera01Icon, StarIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type PhotoAuthor, type PhotoView, hasFullPhotoVersion, hasPhotoThumbnail, photoDownloadName, photoSize } from "./photoFiles";
import { Lightbox, LightboxDetailRow } from "@/components/lightbox";
import type { LightboxProps, LightboxSlide } from "@/components/lightbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserLink } from "@/features/user-profile/components/userLink";
import { formatFullDate, formatMonthYear, formatShortDate, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

const UNKNOWN_AUTHOR_INITIAL = "?";
const NO_SLIDES: LightboxSlide[] = [];

export type LightboxPhoto = PhotoView & {
  isMain?: boolean;
  extra?: ReactNode;
};

export function getAuthorUsername(author: PhotoAuthor | null): string | null {
  return author?.username?.trim() || null;
}

export function getAuthorName(author: PhotoAuthor | null): string | null {
  return author?.name?.trim() || null;
}

function AuthorAvatar({ author, large = false }: { author: PhotoAuthor | null; large?: boolean }) {
  const initial = (getAuthorUsername(author) ?? getAuthorName(author) ?? UNKNOWN_AUTHOR_INITIAL).charAt(0);

  return (
    <Avatar aria-hidden="true" className={cn("after:hidden", large ? "size-8" : "size-5")}>
      <AvatarImage src={resolveAvatarUrl(author?.image)} alt="" />
      <AvatarFallback className={cn("bg-white/15 font-medium text-white/90 uppercase", large ? "text-xs" : "text-[10px]")}>{initial}</AvatarFallback>
    </Avatar>
  );
}

type PhotoLightboxProps = Omit<LightboxProps, "slides"> & { photos: LightboxPhoto[] };

export function PhotoLightbox({ photos, ...props }: PhotoLightboxProps) {
  const { t } = useTranslation("stationDetails");
  const slides = props.index === null ? NO_SLIDES : photoSlides(photos, t, props.onClose);

  return <Lightbox slides={slides} {...props} />;
}

export function photoSlides(photos: LightboxPhoto[], t: TFunction<"stationDetails">, onAuthorNavigate?: () => void): LightboxSlide[] {
  return photos.map((photo, index) => ({
    key: photo.id,
    src: photo.urls.display,
    thumbSrc: hasPhotoThumbnail(photo) ? photo.urls.thumb : undefined,
    fullSrc: hasFullPhotoVersion(photo) ? photo.urls.full : undefined,
    size: photoSize(photo),
    downloadName: photoDownloadName(photo),
    alt: photo.note?.trim() || t("photos.photoAlt", { number: index + 1 }),
    caption: <PhotoCaption photo={photo} onAuthorNavigate={onAuthorNavigate} />,
    details: <PhotoDetails photo={photo} onAuthorNavigate={onAuthorNavigate} />,
  }));
}

type PhotoTextProps = {
  photo: LightboxPhoto;
  onAuthorNavigate?: () => void;
};

function PhotoCaption({ photo, onAuthorNavigate }: PhotoTextProps) {
  const { t, i18n } = useTranslation("stationDetails");
  const note = photo.note?.trim();
  const username = getAuthorUsername(photo.author);
  const authorLabel = username === null ? (getAuthorName(photo.author) ?? t("common:labels.unknown")) : `@${username}`;

  return (
    <div className="flex flex-col gap-1.5 md:items-center">
      {note ? <p className="line-clamp-2 text-sm leading-snug text-white/90 md:text-[15px]">{note}</p> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60 md:justify-center">
        <span className="flex items-center gap-1.5 font-medium text-white/80">
          <AuthorAvatar author={photo.author} />
          <UserLink user={photo.author} onNavigate={onAuthorNavigate}>
            {authorLabel}
          </UserLink>
        </span>
        <span aria-hidden="true">·</span>
        {photo.takenAt ? (
          <span className="flex items-center gap-1 tabular-nums">
            <HugeiconsIcon icon={Camera01Icon} className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("common:photos.taken")}: </span>
            <time dateTime={photo.takenAt}>{formatMonthYear(photo.takenAt, i18n.language, "short")}</time>
          </span>
        ) : (
          <span className="flex items-center gap-1 tabular-nums">
            <HugeiconsIcon icon={Upload04Icon} className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("common:photos.uploaded")}: </span>
            <time dateTime={photo.createdAt}>{formatShortDate(photo.createdAt, i18n.language)}</time>
          </span>
        )}
        {photo.isMain ? (
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

function PhotoDetails({ photo, onAuthorNavigate }: PhotoTextProps) {
  const { t, i18n } = useTranslation("stationDetails");
  const note = photo.note?.trim();
  const username = getAuthorUsername(photo.author);
  const name = getAuthorName(photo.author);
  const displayName = name === username ? null : name;

  return (
    <>
      {note ? <p className="text-[15px] leading-snug text-white">{note}</p> : null}
      <LightboxDetailRow label={t("common:labels.author")}>
        {username === null && displayName === null ? (
          t("common:labels.unknown")
        ) : (
          <span className="flex items-center gap-2">
            <AuthorAvatar author={photo.author} large />
            <UserLink user={photo.author} onNavigate={onAuthorNavigate}>
              {displayName === null ? null : <span>{displayName} </span>}
              {username === null ? null : <span className={displayName === null ? undefined : "text-white/60"}>@{username}</span>}
            </UserLink>
          </span>
        )}
      </LightboxDetailRow>
      <LightboxDetailRow label={t("common:photos.uploaded")}>
        <time dateTime={photo.createdAt}>{formatFullDate(photo.createdAt, i18n.language)}</time>
      </LightboxDetailRow>
      {photo.takenAt ? (
        <LightboxDetailRow label={t("common:photos.taken")}>
          <time dateTime={photo.takenAt}>{formatMonthYear(photo.takenAt, i18n.language, "long")}</time>
        </LightboxDetailRow>
      ) : null}
      {photo.extra ? <div className="text-sm text-white/80">{photo.extra}</div> : null}
    </>
  );
}
