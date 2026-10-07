import { Delete02Icon, Edit01Icon, MoreHorizontalCircle01Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { Comment } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useCommentAuthorName } from "../commentAuthor";
import { ApproveCommentButton } from "../components/approveCommentButton";
import { CommentThumbnails } from "../components/commentThumbnails";
import { commentRowProps, isCommentWritePending } from "../mutations";
import { useAdminCommentActions } from "./adminCommentActions";
import { UserAvatar } from "@/components/app/userAvatar";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RelativeTime } from "@/components/ui/relative-time";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EDITOR_STATION_SEARCH } from "@/features/admin/stations/editorStationSearch";
import { getPickerUserHandle, toPickerAvatarUser } from "@/features/admin/users/picker/pickerUser";
import { getOperatorLook } from "@/features/map/data/mapLookups";
import { UserLink } from "@/features/user-profile/components/userLink";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type CommentIconActionProps = {
  label: string;
  icon: IconSvgElement;
  isBusy: boolean;
  isDisabled: boolean;
  isDestructive?: boolean;
  onClick: () => void;
};

const AUTHOR_AVATAR_CLASS = "size-7 *:data-[slot=avatar-fallback]:text-[10px]";
const MENU_BUTTON_CLASS = cn(
  buttonVariants({ variant: "ghost", size: "icon-sm" }),
  "cursor-pointer disabled:pointer-events-auto disabled:cursor-default",
);
const MENU_ITEM_CLASS = "cursor-pointer";
const ICON_ACTION_CLASS = "cursor-pointer text-muted-foreground data-disabled:cursor-default data-disabled:opacity-50";
const WHITESPACE_RUN = /\s+/g;

export function CommentAuthor({ author }: { author: Comment["author"] }) {
  const name = useCommentAuthorName(author);
  const handle = getPickerUserHandle(author);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar user={toPickerAvatarUser(author)} className={AUTHOR_AVATAR_CLASS} />
      <div className="min-w-0">
        <UserLink user={author} className="block w-fit max-w-full truncate text-sm font-medium">
          {name}
        </UserLink>
        {handle === null ? null : <p className="truncate text-xs text-muted-foreground">{handle}</p>}
      </div>
    </div>
  );
}

export function CommentStationLink({ comment }: { comment: Comment }) {
  const { lookups } = useAdminCommentActions();
  const { station } = comment;
  if (station === undefined) return <span className="text-muted-foreground">-</span>;

  const { operator, brand } = getOperatorLook(lookups, station.operatorId);

  return (
    <Link to="/admin/stations/$id" params={{ id: String(station.id) }} search={EDITOR_STATION_SEARCH} className="group block min-w-0">
      {operator === null ? (
        <span className="block truncate text-sm font-medium text-muted-foreground group-hover:underline">-</span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <BrandMark brand={brand} />
          <span className="min-w-0 truncate text-xs font-medium text-foreground group-hover:underline">{operator.name}</span>
        </span>
      )}
      <span className={cn("block truncate font-mono text-xs text-muted-foreground", operator === null ? null : "pl-5.5")}>{station.siteId}</span>
    </Link>
  );
}

export function CommentTextPreview({ content }: { content: string }) {
  return <p className="line-clamp-2 max-h-10 text-sm wrap-anywhere">{content.replace(WHITESPACE_RUN, " ").trim()}</p>;
}

export function CommentAttachments({ comment }: { comment: Comment }) {
  if (comment.attachments.length === 0) return <span className="text-xs text-muted-foreground">-</span>;
  return <CommentThumbnails comment={comment} size="sm" limit={3} className="flex-nowrap" />;
}

export function CommentCreated({ createdAt }: { createdAt: string }) {
  const { i18n } = useTranslation("common");

  return (
    <Tooltip>
      <TooltipTrigger render={<time dateTime={createdAt} className="whitespace-nowrap text-muted-foreground" />}>
        <RelativeTime date={createdAt} />
      </TooltipTrigger>
      <TooltipContent>{formatFullDate(createdAt, i18n.language)}</TooltipContent>
    </Tooltip>
  );
}

function CommentIconAction({ label, icon, isBusy, isDisabled, isDestructive = false, onClick }: CommentIconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(ICON_ACTION_CLASS, isDestructive ? "hover:text-destructive" : "hover:text-foreground")}
            disabled={isDisabled}
            focusableWhenDisabled
          />
        }
        onClick={onClick}
      >
        {isBusy ? <Spinner /> : <HugeiconsIcon icon={icon} aria-hidden="true" />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function CommentRowActions({ comment }: { comment: Comment }) {
  const { t } = useTranslation(["admin", "common"]);
  const { pendingWrite, onApprove, onSendBack, onEdit, onDelete } = useAdminCommentActions();
  const isLocked = pendingWrite !== null;

  return (
    <div {...commentRowProps(comment)} className="flex items-center justify-end gap-1 pr-2">
      {comment.status === "pending" ? (
        <ApproveCommentButton
          onApprove={() => onApprove(comment)}
          isBusy={isCommentWritePending(pendingWrite, comment, "approve")}
          disabled={isLocked}
        />
      ) : (
        <CommentIconAction
          label={t("admin:comments.sendBack")}
          icon={Undo02Icon}
          isBusy={isCommentWritePending(pendingWrite, comment, "sendBack")}
          isDisabled={isLocked}
          onClick={() => onSendBack(comment)}
        />
      )}
      <CommentIconAction
        label={t("common:actions.edit")}
        icon={Edit01Icon}
        isBusy={isCommentWritePending(pendingWrite, comment, "edit")}
        isDisabled={isLocked}
        onClick={() => onEdit(comment)}
      />
      <CommentIconAction
        label={t("common:actions.delete")}
        icon={Delete02Icon}
        isBusy={isCommentWritePending(pendingWrite, comment, "delete")}
        isDisabled={isLocked}
        isDestructive
        onClick={() => onDelete(comment)}
      />
    </div>
  );
}

export function CommentCardMenu({ comment }: { comment: Comment }) {
  const { t } = useTranslation(["admin", "common"]);
  const { pendingWrite, onEdit, onDelete } = useAdminCommentActions();
  const label = t("admin:comments.options");

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger aria-label={label} className={MENU_BUTTON_CLASS} disabled={pendingWrite !== null} />}>
          <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={() => onEdit(comment)}>
          <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} aria-hidden="true" />
          {t("common:actions.edit")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className={MENU_ITEM_CLASS} onClick={() => onDelete(comment)}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} aria-hidden="true" />
          {t("common:actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
