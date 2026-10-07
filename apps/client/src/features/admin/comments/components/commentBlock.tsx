import { Calendar03Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Comment } from "@openbts/shared/contract";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useCommentAuthorName } from "../commentAuthor";
import { type CommentThumbnailSize, CommentThumbnails } from "./commentThumbnails";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ClampedText } from "@/components/ui/clamped-text";
import { getPickerUserHandle } from "@/features/admin/users/picker/pickerUser";
import { UserLink } from "@/features/user-profile/components/userLink";
import { formatFullDate, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

type CommentClampLines = 4 | 6;

type CommentBlockProps = {
  comment: Comment;
  clampLines?: CommentClampLines;
  canExpand?: boolean;
  thumbnailSize?: CommentThumbnailSize;
  body?: ReactNode;
  station?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  headActions?: ReactNode;
  className?: string;
};

const TEXT_CLASS = "mt-1 text-sm whitespace-pre-wrap wrap-anywhere!";
const EXPAND_TOGGLE_CLASS = "mt-1 text-xs font-medium";
const EDIT_MARK_MIN_GAP_MS = 1000;

function isShown(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false;
}

function wasEdited(comment: Comment): boolean {
  return Date.parse(comment.updatedAt) - Date.parse(comment.createdAt) > EDIT_MARK_MIN_GAP_MS;
}

export function CommentBlock({
  comment,
  clampLines,
  canExpand = true,
  thumbnailSize = "md",
  body,
  station,
  status,
  actions,
  headActions,
  className,
}: CommentBlockProps) {
  const { t, i18n } = useTranslation("admin");
  const { author } = comment;
  const authorName = useCommentAuthorName(author);
  const authorHandle = getPickerUserHandle(author);

  let text = body;
  if (!isShown(body)) {
    text =
      clampLines === undefined ? (
        <p className={TEXT_CLASS}>{comment.content}</p>
      ) : (
        <ClampedText
          text={comment.content}
          lines={clampLines}
          canExpand={canExpand}
          expandLabel={t("comments.showFullText")}
          className={TEXT_CLASS}
          toggleClassName={EXPAND_TOGGLE_CLASS}
        />
      );
  }

  return (
    <div className={cn("flex gap-3", className)}>
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={resolveAvatarUrl(author.image)} alt="" />
        <AvatarFallback>
          <HugeiconsIcon icon={UserIcon} className="size-4" aria-hidden="true" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <UserLink user={author} className="font-semibold text-sm">
              {authorName}
            </UserLink>
            {authorHandle === null ? null : <span className="text-xs text-muted-foreground">{authorHandle}</span>}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Calendar03Icon} className="size-3" aria-hidden="true" />
              <time dateTime={comment.createdAt} title={formatFullDate(comment.createdAt, i18n.language)}>
                {new Date(comment.createdAt).toLocaleDateString(i18n.language)}
              </time>
            </span>
            {wasEdited(comment) ? (
              <time dateTime={comment.updatedAt} title={formatFullDate(comment.updatedAt, i18n.language)} className="text-xs text-muted-foreground">
                {t("comments.edited", { date: new Date(comment.updatedAt).toLocaleDateString(i18n.language) })}
              </time>
            ) : null}
          </div>
          {isShown(headActions) ? <div className="flex shrink-0 items-center gap-1">{headActions}</div> : null}
        </div>

        {isShown(station) ? <div className="mt-0.5">{station}</div> : null}
        {text}
        <CommentThumbnails comment={comment} size={thumbnailSize} className="mt-2" />
        {isShown(status) || isShown(actions) ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {status}
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
