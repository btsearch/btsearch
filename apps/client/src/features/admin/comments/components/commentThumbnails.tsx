import type { Comment } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { useLightbox } from "@/components/lightbox";
import { PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import { type LightboxPhoto, PhotoLightbox } from "@/components/photos/photoLightbox";
import { cn } from "@/lib/utils";

export type CommentThumbnailSize = "sm" | "md";

type CommentThumbnailsProps = {
  comment: Comment;
  size?: CommentThumbnailSize;
  limit?: number;
  className?: string;
};

const LIST_CLASSES: Record<CommentThumbnailSize, string> = { sm: "gap-1", md: "gap-2" };
const TILE_CLASSES: Record<CommentThumbnailSize, string> = { sm: "size-10 rounded", md: "size-16 rounded-md" };

function toLightboxPhotos(comment: Comment, stationLabel: string): LightboxPhoto[] {
  const extra = comment.station === undefined ? undefined : `${stationLabel}: ${comment.station.siteId}`;

  return comment.attachments.map((attachment) => ({
    id: attachment.id,
    urls: { thumb: attachment.url, display: attachment.url, full: attachment.url },
    width: null,
    height: null,
    note: null,
    takenAt: null,
    createdAt: comment.createdAt,
    author: comment.author,
    extra,
  }));
}

export function CommentThumbnails({ comment, size = "md", limit, className }: CommentThumbnailsProps) {
  const { t } = useTranslation(["admin", "common", "stationDetails"]);
  const lightbox = useLightbox();
  const { attachments } = comment;

  if (attachments.length === 0) return null;

  const shownAttachments = limit === undefined ? attachments : attachments.slice(0, limit);
  const hiddenCount = attachments.length - shownAttachments.length;
  const photos = toLightboxPhotos(comment, t("common:labels.station"));

  return (
    <div className={cn("flex flex-wrap items-center", LIST_CLASSES[size], className)}>
      {shownAttachments.map((attachment, index) => (
        <button
          key={attachment.id}
          type="button"
          {...lightbox.getTriggerProps(index)}
          className={cn(
            "relative shrink-0 cursor-pointer overflow-hidden border bg-muted transition-opacity hover:opacity-80",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            TILE_CLASSES[size],
          )}
          aria-label={t("stationDetails:photos.openPhoto", { number: index + 1 })}
        >
          <PhotoWithFallback
            src={attachment.url}
            alt=""
            className="size-full object-cover"
            fallbackClassName="[&_svg]:size-4"
            fallbackLabelClassName="sr-only"
            loading="lazy"
          />
        </button>
      ))}
      {hiddenCount > 0 ? (
        <span className="ml-0.5 text-xs font-medium tabular-nums text-muted-foreground" title={t("comments.morePhotos", { number: hiddenCount })}>
          +{hiddenCount}
        </span>
      ) : null}
      <PhotoLightbox photos={photos} {...lightbox.lightboxProps} loop={false} />
    </div>
  );
}
