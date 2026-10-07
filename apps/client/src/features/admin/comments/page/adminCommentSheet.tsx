import { Delete02Icon, Edit01Icon, Tick02Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { Comment } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import { Fragment, type RefObject, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { COMMENT_TEXT_MAX_LENGTH } from "../api";
import { CommentBlock } from "../components/commentBlock";
import { CommentStatusBadge } from "../components/commentStatusBadge";
import { isCommentWritePending } from "../mutations";
import { useAdminCommentActions } from "./adminCommentActions";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";
import { EDITOR_STATION_SEARCH } from "@/features/admin/stations/editorStationSearch";
import { getOperatorLook } from "@/features/map/data/mapLookups";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { formatFullDate } from "@/lib/format";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type AdminCommentSheetProps = {
  comment: Comment | null;
  open: boolean;
  startsEditing: boolean;
  isMobile: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveText: (comment: Comment, content: string, onSaved: () => void) => void;
  onStationOpen: (comment: Comment) => void;
};

type CommentSheetBodyProps = Pick<AdminCommentSheetProps, "startsEditing" | "onSaveText" | "onStationOpen"> & {
  comment: Comment;
  popupRef: RefObject<HTMLDivElement | null>;
  textRef: RefObject<HTMLTextAreaElement | null>;
};

type SheetActionProps = {
  label: string;
  icon?: IconSvgElement;
  variant?: "default" | "outline" | "destructive";
  isBusy?: boolean;
  isDisabled: boolean;
  onClick: () => void;
};

const SECTION_TITLE_CLASS = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SHEET_ACTION_CLASS = "cursor-pointer data-disabled:pointer-events-none data-disabled:opacity-50";

function isFilledText(text: string | null | undefined): text is string {
  return typeof text === "string" && text !== "";
}

function keepFocusInSheet(popup: HTMLElement | null) {
  const focused = document.activeElement;
  if (popup !== null && (focused === null || focused === document.body || popup.contains(focused))) popup.focus();
}

function SheetAction({ label, icon, variant = "outline", isBusy = false, isDisabled, onClick }: SheetActionProps) {
  let lead = icon === undefined ? null : <HugeiconsIcon icon={icon} data-icon="inline-start" aria-hidden="true" />;
  if (isBusy) lead = <Spinner data-icon="inline-start" className="text-current" />;

  return (
    <Button type="button" variant={variant} className={SHEET_ACTION_CLASS} disabled={isDisabled} focusableWhenDisabled onClick={onClick}>
      {lead}
      {label}
    </Button>
  );
}

function CommentStationSummary({ comment, onStationOpen }: { comment: Comment; onStationOpen: (comment: Comment) => void }) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const { lookups } = useAdminCommentActions();
  const { station } = comment;
  const { operator, brand } = getOperatorLook(lookups, station?.operatorId);
  const location = station?.location ?? null;
  const placeParts =
    location === null
      ? []
      : [location.city, lookups?.regionsById.get(location.regionId)?.name, getCountryName(location.countryCode, i18n.language)].filter(isFilledText);

  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_TITLE_CLASS}>{t("common:labels.station")}</h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-lg border bg-muted/30 p-3">
        {station === undefined ? null : (
          <div className="min-w-0 flex-[1_1_200px]">
            <p className="flex min-w-0 items-center gap-1.5">
              <BrandMark brand={brand} />
              {operator === null ? null : <span className="text-sm font-medium whitespace-nowrap">{operator.name}</span>}
              <span className="min-w-0 truncate font-mono text-[13px] leading-5 text-muted-foreground">{station.siteId}</span>
            </p>
            {placeParts.length === 0 ? null : (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                {placeParts.map((part, index) => (
                  <Fragment key={index}>
                    {index === 0 ? null : <span aria-hidden="true">·</span>}
                    <span>{part}</span>
                  </Fragment>
                ))}
              </p>
            )}
          </div>
        )}
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" className="cursor-pointer" aria-haspopup="dialog" onClick={() => onStationOpen(comment)}>
            {t("admin:comments.openStation")}
          </Button>
          <Link
            to="/admin/stations/$id"
            params={{ id: String(comment.stationId) }}
            search={EDITOR_STATION_SEARCH}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("admin:breadcrumbs.editStation")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function CommentSheetBody({ comment, startsEditing, popupRef, textRef, onSaveText, onStationOpen }: CommentSheetBodyProps) {
  const { t } = useTranslation(["admin", "common"]);
  const { pendingWrite, onApprove, onSendBack, onDelete } = useAdminCommentActions();
  const [draft, setDraft] = useState<string | null>(startsEditing ? comment.content : null);
  const isLocked = pendingWrite !== null;
  const editLabel = t("common:actions.edit");

  function startEditing() {
    setDraft(comment.content);
  }

  function stopEditing() {
    setDraft(null);
    keepFocusInSheet(popupRef.current);
  }

  if (draft !== null) {
    const typedText = draft.trim();
    const canSave = typedText !== "" && typedText !== comment.content.trim() && !isLocked;

    return (
      <>
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <CommentBlock
            comment={comment}
            body={
              <div className="mt-1.5">
                <Textarea
                  {...NO_AUTOFILL_PROPS}
                  ref={textRef}
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  maxLength={COMMENT_TEXT_MAX_LENGTH}
                  readOnly={isLocked}
                  aria-label={t("admin:comments.sheet.textLabel")}
                  className="min-h-32 resize-none"
                />
                <div className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
                  {draft.length} / {COMMENT_TEXT_MAX_LENGTH}
                </div>
              </div>
            }
          />
          <CommentStationSummary comment={comment} onStationOpen={onStationOpen} />
        </div>
        <SheetFooter className="flex-row items-center justify-end border-t bg-muted/50">
          <SheetAction key="cancel" label={t("common:actions.cancel")} isDisabled={isLocked} onClick={stopEditing} />
          <SheetAction
            key="save"
            label={t("common:actions.save")}
            variant="default"
            isBusy={isCommentWritePending(pendingWrite, comment, "edit")}
            isDisabled={!canSave}
            onClick={() => onSaveText(comment, draft, stopEditing)}
          />
        </SheetFooter>
      </>
    );
  }

  return (
    <>
      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
        <CommentBlock comment={comment} />
        <CommentStationSummary comment={comment} onStationOpen={onStationOpen} />
      </div>
      <SheetFooter className="flex-row flex-wrap items-center border-t bg-muted/50">
        <SheetAction
          key="delete"
          label={t("common:actions.delete")}
          icon={Delete02Icon}
          variant="destructive"
          isBusy={isCommentWritePending(pendingWrite, comment, "delete")}
          isDisabled={isLocked}
          onClick={() => onDelete(comment)}
        />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {comment.status === "pending" ? (
            <>
              <SheetAction label={editLabel} icon={Edit01Icon} isDisabled={isLocked} onClick={startEditing} />
              <SheetAction
                label={t("common:actions.approve")}
                icon={Tick02Icon}
                variant="default"
                isBusy={isCommentWritePending(pendingWrite, comment, "approve")}
                isDisabled={isLocked}
                onClick={() => onApprove(comment)}
              />
            </>
          ) : (
            <>
              <SheetAction
                label={t("admin:comments.sendBack")}
                icon={Undo02Icon}
                isBusy={isCommentWritePending(pendingWrite, comment, "sendBack")}
                isDisabled={isLocked}
                onClick={() => onSendBack(comment)}
              />
              <SheetAction label={editLabel} icon={Edit01Icon} isDisabled={isLocked} onClick={startEditing} />
            </>
          )}
        </div>
      </SheetFooter>
    </>
  );
}

export function AdminCommentSheet({ comment, open, startsEditing, isMobile, onOpenChange, onSaveText, onStationOpen }: AdminCommentSheetProps) {
  const { t, i18n } = useTranslation("admin");
  const popupRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const openingCount = useOpeningCount(open);

  return (
    <Sheet open={open && comment !== null} onOpenChange={onOpenChange}>
      <SheetContent
        ref={popupRef}
        initialFocus={startsEditing ? textRef : popupRef}
        side={isMobile ? "bottom" : "right"}
        className={cn("overflow-hidden outline-none", isMobile ? "max-h-[85dvh]" : "w-full! max-w-xl!")}
      >
        {comment === null ? null : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle>{t("admin:comments.sheet.title")}</SheetTitle>
                <CommentStatusBadge status={comment.status} />
              </div>
              <SheetDescription>{formatFullDate(comment.createdAt, i18n.language)}</SheetDescription>
            </SheetHeader>
            <CommentSheetBody
              key={`${openingCount}:${comment.id}`}
              comment={comment}
              startsEditing={startsEditing}
              popupRef={popupRef}
              textRef={textRef}
              onSaveText={onSaveText}
              onStationOpen={onStationOpen}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
