import { Alert02Icon, InformationCircleIcon, TaskDaily01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { StationHistoryItem, Submission } from "@openbts/shared/contract";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { useRelativeTime } from "@/components/ui/relative-time";
import { SubmissionStoredChanges } from "@/features/account/components/submissionChangesSheet";
import type { ReviewFacts, SharedPlaceEffect } from "@/features/admin/submissions/reviewNotices";
import { resolveDisplayName } from "@/features/admin/users/utils/identity";
import { OwnerNameDialog } from "@/features/shared/location/ownerNameDialog";
import { getPartTitleKey } from "@/features/station-details/station/history/entries";
import { ChangesList } from "@/features/station-editing/components/frame/changesList";
import { EditCard } from "@/features/station-editing/components/frame/editCard";
import { type StationDraftApi, useEditText } from "@/features/station-editing/hooks/useStationDraft";
import type { ChangeItem } from "@/features/station-editing/model/types";
import { cn } from "@/lib/utils";

type SubmissionChangesCardProps = {
  edit: StationDraftApi;
  submission: Submission;
  changes: readonly ChangeItem[];
  facts: ReviewFacts;
  partnerLabel: string | null;
  showsStoredContent: boolean;
  onShowHistory: (() => void) | null;
};

type NoticeTone = "warning" | "info";

type ReviewNoticeProps = {
  tone: NoticeTone;
  sentences: readonly string[];
  actionLabel?: string;
  onAction?: () => void;
};

type StationChangeNoticeProps = Pick<ReviewNoticeProps, "actionLabel" | "onAction"> & {
  latest: StationHistoryItem;
  changeCount: number;
};

const NOTICE_CLASSES: Record<NoticeTone, string> = {
  warning: "border-amber-500/30 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
  info: "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
};
const NOTICE_ICONS: Record<NoticeTone, IconSvgElement> = { warning: Alert02Icon, info: InformationCircleIcon };
const SOURCE_LABEL_KEYS: Record<StationHistoryItem["source"], string | null> = {
  api: null,
  import: "stationDetails:history.sources.import",
  system: "stationDetails:history.sources.system",
};
const SENTENCE_END = ".";
const DETAIL_BREAK = ", ";
const ACTION_CLASS = cn(
  "cursor-pointer rounded-sm font-semibold underline underline-offset-2 outline-none",
  "focus-visible:ring-3 focus-visible:ring-ring/50",
);
const CORRECTION_MARK_CLASS = "size-2.5 shrink-0 rounded-[3px] border border-primary bg-primary/10";

function joinSentences(sentences: readonly string[], isFollowed: boolean): string {
  const lastPosition = sentences.length - 1;
  const closed = sentences.map((sentence, position) => {
    const isOpenEnd = position === lastPosition && !isFollowed;
    return isOpenEnd || sentence.endsWith(SENTENCE_END) ? sentence : `${sentence}${SENTENCE_END}`;
  });
  return closed.join(" ");
}

function ReviewNotice({ tone, sentences, actionLabel, onAction }: ReviewNoticeProps) {
  const hasAction = actionLabel !== undefined && onAction !== undefined;

  return (
    <div className={cn("flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-xs leading-[17px]", NOTICE_CLASSES[tone])}>
      <HugeiconsIcon icon={NOTICE_ICONS[tone]} aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <p className="min-w-0 flex-1 wrap-anywhere">
        {joinSentences(sentences, hasAction)}
        {hasAction ? (
          <>
            {" "}
            <button type="button" onClick={onAction} className={ACTION_CLASS}>
              {actionLabel}
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

function StationChangeNotice({ latest, changeCount, actionLabel, onAction }: StationChangeNoticeProps) {
  const { t } = useTranslation(["submissions", "stations", "stationDetails"]);
  const when = useRelativeTime(latest.createdAt);

  function describeAuthor(): string {
    if (latest.author !== null) return resolveDisplayName(latest.author);

    const sourceKey = SOURCE_LABEL_KEYS[latest.source];
    return sourceKey === null ? "" : t(sourceKey);
  }

  function describeParts(): string {
    if (latest.isRevert) return t("stationDetails:history.operations.revert");
    return [...new Set(latest.changes.map((part) => t(getPartTitleKey(part))))].join(DETAIL_BREAK);
  }

  const lead =
    changeCount === 1
      ? [describeParts(), when]
      : [t("stations:edit.frame.changeCount", { count: changeCount }), t("review.notices.latestChange", { when })];
  const summary = [...lead, describeAuthor()].filter((part) => part !== "").join(DETAIL_BREAK);

  return <ReviewNotice tone="warning" sentences={[t("review.notices.stationChanged", { summary })]} actionLabel={actionLabel} onAction={onAction} />;
}

export function SubmissionChangesCard({
  edit,
  submission,
  changes,
  facts,
  partnerLabel,
  showsStoredContent,
  onShowHistory,
}: SubmissionChangesCardProps) {
  const { t, i18n } = useTranslation(["submissions", "stations", "stationDetails"]);
  const text = useEditText();
  const [isRenamingOwner, setIsRenamingOwner] = useState(false);
  const { canEdit, dispatch } = edit;
  const isPending = submission.status === "pending";
  const isDeletion = submission.action === "delete";
  const { proposedOwner, sharedPlace, newerHistory } = facts;
  const similarOwner = proposedOwner?.similarOwner ?? null;
  const correctionCount = edit.corrections.length;

  function joinFieldLabels(labels: readonly string[]): string {
    const { language } = i18n;
    const words = labels.map((label, position) => (position === 0 ? label : label.toLocaleLowerCase(language)));
    return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(words);
  }

  function describeSharedPlace(effect: SharedPlaceEffect): string[] {
    const labels = effect.fields.map((field) => text.formatParts(field.label));
    const count = effect.stationCount;
    const sentences: string[] = [];

    if (labels.length === 1) sentences.push(t("review.notices.placeField", { field: joinFieldLabels(labels), count }));
    if (labels.length > 1) sentences.push(t("review.notices.placeFields", { fields: joinFieldLabels(labels), count }));
    if (effect.movesWholePlace) sentences.push(t("review.notices.placeMoved", { count }));
    return sentences;
  }

  const placeSentences = sharedPlace === null ? [] : describeSharedPlace(sharedPlace);
  const sideEffects = partnerLabel === null ? placeSentences : [...placeSentences, t("review.partnerAzimuths", { station: partnerLabel })];
  const isStationChanged = isPending && (facts.isStationNewer || newerHistory.length > 0);
  const notices: ReactNode[] = [];

  if (isStationChanged) {
    const latestChange = newerHistory.at(0);
    const historyActionLabel = onShowHistory === null ? undefined : t("review.notices.showInHistory");
    const showHistory = onShowHistory ?? undefined;

    notices.push(
      latestChange === undefined ? (
        <ReviewNotice
          key="station"
          tone="warning"
          sentences={[t("review.notices.stationChangedPlain")]}
          actionLabel={historyActionLabel}
          onAction={showHistory}
        />
      ) : (
        <StationChangeNotice
          key="station"
          latest={latestChange}
          changeCount={newerHistory.length}
          actionLabel={historyActionLabel}
          onAction={showHistory}
        />
      ),
    );
  }
  if (isPending && sideEffects.length > 0) notices.push(<ReviewNotice key="effects" tone="info" sentences={sideEffects} />);
  if (isPending && proposedOwner !== null && similarOwner === null) {
    notices.push(
      <ReviewNotice
        key="owner"
        tone="info"
        sentences={[t("review.notices.proposedOwner", { name: proposedOwner.name }), t("review.notices.ownerCreatedOnApproval")]}
        actionLabel={canEdit ? t("review.notices.renameOwner") : undefined}
        onAction={() => setIsRenamingOwner(true)}
      />,
    );
  }
  if (isPending && proposedOwner !== null && similarOwner !== null) {
    notices.push(
      <ReviewNotice
        key="owner"
        tone="warning"
        sentences={[t("review.notices.proposedOwner", { name: proposedOwner.name }), t("review.notices.similarOwner", { name: similarOwner.name })]}
        actionLabel={canEdit ? t("review.notices.useExistingOwner") : undefined}
        onAction={() => dispatch({ type: "setOwner", owner: { kind: "listed", ownerId: similarOwner.id } })}
      />,
    );
  }
  if (isPending && facts.orphanCellCount > 0) {
    notices.push(<ReviewNotice key="cells" tone="warning" sentences={[t("review.notices.orphanCells", { count: facts.orphanCellCount })]} />);
  }
  if (isPending && facts.orphanSectorCount > 0) {
    notices.push(<ReviewNotice key="sectors" tone="warning" sentences={[t("review.notices.orphanSectors", { count: facts.orphanSectorCount })]} />);
  }
  if (showsStoredContent) notices.push(<ReviewNotice key="applied" tone="info" sentences={[t("review.changes.applied")]} />);

  const showsCorrections = isPending && correctionCount > 0;
  const hasLead = notices.length > 0 || showsCorrections;
  const showsList = !showsStoredContent && !isDeletion;

  return (
    <>
      <EditCard title={t("changesSheet.title")} icon={TaskDaily01Icon} count={showsList ? `(${changes.length})` : undefined} className="bg-card">
        {hasLead ? (
          <div className="flex flex-col gap-2.5 px-4 pt-3 pb-2.5">
            {notices.length > 0 ? <div className="flex flex-col gap-2">{notices}</div> : null}
            {showsCorrections ? (
              <p className="flex items-center gap-1.5 text-xs text-primary">
                <span aria-hidden="true" className={CORRECTION_MARK_CLASS} />
                <span className="min-w-0 flex-1">{t("review.changes.corrections", { count: correctionCount })}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        {showsStoredContent ? (
          <div className="flex flex-col gap-3 px-3 pb-3">
            <SubmissionStoredChanges submission={submission} operators={edit.lookups.operators} />
          </div>
        ) : null}
        {isDeletion && !showsStoredContent ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            {t("deletionBanner", { stationId: submission.station?.siteId ?? submission.stationId })}
          </p>
        ) : null}
        {showsList && changes.length > 0 ? (
          <ChangesList
            changes={changes}
            marksCorrections
            ariaLabel={t("changesSheet.title")}
            className={cn("px-2 pb-1.5", hasLead ? null : "-mt-px")}
          />
        ) : null}
        {showsList && changes.length === 0 ? (
          <p className={cn("px-4 pb-3 text-sm text-muted-foreground", hasLead ? null : "pt-3")}>{t("review.changes.empty")}</p>
        ) : null}
      </EditCard>
      <OwnerNameDialog
        open={isRenamingOwner}
        onOpenChange={setIsRenamingOwner}
        initialName={proposedOwner?.name ?? ""}
        title={t("review.ownerName.title")}
        description={t("review.ownerName.description")}
        submitLabel={t("review.ownerName.submit")}
        onSubmit={(name) => dispatch({ type: "setOwner", owner: { kind: "proposed", name } })}
      />
    </>
  );
}
