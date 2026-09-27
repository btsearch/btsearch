import { Camera01Icon, StarIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type PhotoFile, photoFullUrl, photoSize, photoThumbUrl, photoUrl } from "./photoFiles";
import { Lightbox, LightboxDetailRow } from "@/components/lightbox";
import type { LightboxProps, LightboxSlide } from "@/components/lightbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" };
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short" };
const LONG_MONTH_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "long" };

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

export function photoSlideSources(photo: PhotoFile): Pick<LightboxSlide, "src" | "thumbSrc" | "fullSrc" | "size" | "downloadName"> {
  return {
    src: photoUrl(photo.attachment_uuid),
    thumbSrc: photo.has_thumb ? photoThumbUrl(photo) : undefined,
    fullSrc: photoFullUrl(photo),
    size: photoSize(photo),
    downloadName: `btsearch-${photo.attachment_uuid}.${photo.has_full ? "avif" : "webp"}`,
  };
}

function formatDate(value: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleDateString(locale, options);
}

type PhotoLightboxProps = Omit<LightboxProps, "slides"> & { photos: LightboxPhoto[] };

export function PhotoLightbox({ photos, ...props }: PhotoLightboxProps) {
  const { t } = useTranslation("stationDetails");
  const slides = useMemo(
    () =>
      photos.map((photo, index): LightboxSlide => ({
        key: photo.attachment_uuid,
        ...photoSlideSources(photo),
        alt: photo.note?.trim() || t("photos.photoAlt", { number: index + 1 }),
        caption: <PhotoCaption photo={photo} />,
        details: <PhotoDetails photo={photo} />,
      })),
    [photos, t],
  );

  return <Lightbox slides={slides} {...props} />;
}

export function PhotoCaption({ photo }: { photo: LightboxPhoto }) {
  const { t, i18n } = useTranslation("stationDetails");
  const note = photo.note?.trim();
  const username = photo.author?.username.trim();

  return (
    <div className="flex flex-col gap-1.5 md:items-center">
      {note ? <p className="line-clamp-2 text-sm leading-snug text-white/90 md:text-[15px]">{note}</p> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60 md:justify-center">
        <span className="flex items-center gap-1.5 font-medium text-white/80">
          <AuthorAvatar author={photo.author} />
          {username ? `@${username}` : t("photos.unknownUser")}
        </span>
        <span aria-hidden="true">·</span>
        {photo.taken_at ? (
          <span className="flex items-center gap-1 tabular-nums">
            <HugeiconsIcon icon={Camera01Icon} className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("photos.takenAt")}: </span>
            <time dateTime={photo.taken_at}>{formatDate(photo.taken_at, i18n.language, MONTH_FORMAT)}</time>
          </span>
        ) : (
          <span className="flex items-center gap-1 tabular-nums">
            <HugeiconsIcon icon={Upload04Icon} className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("photos.uploadedAt")}: </span>
            <time dateTime={photo.createdAt}>{formatDate(photo.createdAt, i18n.language, DATE_FORMAT)}</time>
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

export function PhotoDetails({ photo }: { photo: LightboxPhoto }) {
  const { t, i18n } = useTranslation("stationDetails");
  const note = photo.note?.trim();
  const username = photo.author?.username.trim();
  const name = photo.author?.name?.trim();

  return (
    <>
      {note ? <p className="text-[15px] leading-snug text-white">{note}</p> : null}
      <LightboxDetailRow label={t("photos.author")}>
        {username ? (
          <span className="flex items-center gap-2">
            <AuthorAvatar author={photo.author} large />
            <span>
              {name && name !== username ? <span>{name} </span> : null}
              <span className={name && name !== username ? "text-white/60" : undefined}>@{username}</span>
            </span>
          </span>
        ) : (
          t("photos.unknownUser")
        )}
      </LightboxDetailRow>
      <LightboxDetailRow label={t("photos.uploadedAt")}>
        <time dateTime={photo.createdAt}>{formatDate(photo.createdAt, i18n.language, DATE_TIME_FORMAT)}</time>
      </LightboxDetailRow>
      {photo.taken_at ? (
        <LightboxDetailRow label={t("photos.takenAt")}>
          <time dateTime={photo.taken_at}>{formatDate(photo.taken_at, i18n.language, LONG_MONTH_FORMAT)}</time>
        </LightboxDetailRow>
      ) : null}
      {photo.extra ? <div className="text-sm text-white/80">{photo.extra}</div> : null}
    </>
  );
}
