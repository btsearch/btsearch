import { Delete02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReviewDecision, Submission, SubmissionUpdate } from "@openbts/shared/contract";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AdminReviewCard } from "./adminReviewCard";
import { ApproveDialog } from "./approveDialog";
import { RejectDialog } from "./rejectDialog";
import { ReviewTopBar } from "./reviewTopBar";
import { SubmissionChangesCard } from "./submissionChangesCard";
import { SubmissionDetailHeader } from "./submissionDetailHeader";
import { SubmissionLocationPhotoSelectionsSection } from "./submissionLocationPhotoSelectionsSection";
import { SubmissionPhotosSection } from "./submissionPhotosSection";
import { SubmitterCard } from "./submitterCard";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useReviewSubmissionMutation, useSaveSubmissionMutation } from "@/features/admin/submissions/mutations";
import { buildReviewFacts } from "@/features/admin/submissions/reviewNotices";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { stationHistoryQueryOptions } from "@/features/station-details/station/history/api";
import type { StationHistoryItem } from "@/features/station-details/station/history/types";
import type { StationRecord } from "@/features/station-details/station/types";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { getStationCountryCode } from "@/features/station-details/station/utils/stations";
import { CellsPanel } from "@/features/station-editing/components/cells/cellsPanel";
import { EditPage, type EditPageCard } from "@/features/station-editing/components/frame/editPage";
import { HistoryCard } from "@/features/station-editing/components/frame/historyCard";
import { StatusStrip } from "@/features/station-editing/components/frame/statusStrip";
import { LocationCard } from "@/features/station-editing/components/location/locationCard";
import { type PlaceStation, useOwnPlaceStations } from "@/features/station-editing/components/location/placeStations";
import { AzimuthsCard } from "@/features/station-editing/components/sectors/azimuthsCard";
import { AzimuthSummary } from "@/features/station-editing/components/sectors/azimuthSummary";
import { StationCard } from "@/features/station-editing/components/station/stationCard";
import { editingKeys } from "@/features/station-editing/data/keys";
import { retryEditLookups } from "@/features/station-editing/data/lookups";
import { submissionPhotosQueryOptions } from "@/features/station-editing/data/submissionPhotos";
import { type StationDraftApi, useBlockedSaves, useEditText, useStationDraft } from "@/features/station-editing/hooks/useStationDraft";
import { buildSubmissionReview, buildSubmissionUpdate } from "@/features/station-editing/model/bodies";
import { buildPhotoChanges, countDraftCells, formatCoordinatePair } from "@/features/station-editing/model/changes";
import type { SessionInput } from "@/features/station-editing/model/draftReducer";
import { type BuiltKeys, isServerRefusal, toEditErrors } from "@/features/station-editing/model/serverRefusals";
import { findDraftOperator, listProposalOrphans, toProposedSnapshot, toStationSnapshot } from "@/features/station-editing/model/snapshots";
import type { EditError, EditSession, PlaceDraft, ProposalOrphan, StationSnapshot } from "@/features/station-editing/model/types";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { useIsMobile } from "@/hooks/useMobile";
import { useSaveShortcut } from "@/hooks/useSaveShortcut";
import { type AuditOperationHandle, createAuditOperationHandle, showApiError } from "@/lib/api";

export type OpenedReview = {
  turn: number;
  submission: Submission;
  station: StationRecord | null;
};

type SubmissionReviewProps = {
  opened: OpenedReview;
  submission: Submission;
  station: StationRecord | null;
  onReload: () => void;
};

type StoredReview = {
  updatedAt: string;
  reviewNote: string | null;
  proposed: StationSnapshot | null;
};

type SendLock = {
  current: boolean;
};

type ReviewCellsProps = {
  edit: StationDraftApi;
};

const NO_STATION_ID = 0;
const SUBMISSION_TAB = "submission";
const STALE_MESSAGE_KEY = "submissions:detail.staleWarning";
const REVIEWED_MESSAGE_KEY = "stations:edit.refusals.alreadyReviewed";
const NO_STATIONS: PlaceStation[] = [];
const NO_HISTORY: StationHistoryItem[] = [];
const NO_ORPHANS: ProposalOrphan[] = [];

function createDraftInput({ submission, station }: OpenedReview): SessionInput {
  const live = station === null ? null : toStationSnapshot(station);

  return {
    kind: "review",
    action: submission.action,
    countryCode: station === null ? null : getStationCountryCode(station),
    live,
    proposed: submission.status === "accepted" ? null : toProposedSnapshot(live, submission),
  };
}

function isHandledOutsideList(error: EditError): boolean {
  return error.messageKey === STALE_MESSAGE_KEY || error.messageKey === REVIEWED_MESSAGE_KEY;
}

function describeStation(operatorName: string | undefined, siteId: string): string {
  return [operatorName ?? "", siteId].filter((part) => part !== "").join(" ");
}

function describePlace(place: PlaceDraft | null): string {
  if (place === null) return "";

  const address = [place.city.trim(), place.address.trim()].filter((part) => part !== "").join(", ");
  if (address !== "" || place.latitude === null || place.longitude === null) return address;
  return formatCoordinatePair(place.latitude, place.longitude);
}

function buildCorrections(session: EditSession, stored: StoredReview, reviewNote: string | null) {
  const storedSession = session.proposed === stored.proposed ? session : { ...session, proposed: stored.proposed };
  return buildSubmissionUpdate(storedSession, reviewNote === null ? {} : { reviewNote: { value: reviewNote, stored: stored.reviewNote } });
}

async function runExclusive(lock: SendLock, send: () => Promise<void>): Promise<void> {
  if (lock.current) return;

  lock.current = true;
  try {
    await send();
  } finally {
    lock.current = false;
  }
}

function ReviewCells({ edit }: ReviewCellsProps) {
  const queryClient = useQueryClient();
  const { lookups } = edit;

  if (lookups.hasFailed) return <ErrorState onRetry={() => retryEditLookups(queryClient, lookups.countryCode, lookups)} />;
  if (!lookups.isReady) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
    );
  }
  return <CellsPanel edit={edit} canConfirm isNewCellConfirmed={false} />;
}

export function SubmissionReview({ opened, submission, station, onReload }: SubmissionReviewProps) {
  const { t } = useTranslation(["submissions", "stations", "common", "main"]);
  const text = useEditText();
  const queryClient = useQueryClient();
  const isPhone = useIsMobile();
  const { openStationHistoryDialog } = useFloatingDialogStack();
  const [draftInput] = useState(() => createDraftInput(opened));
  const [stored, setStored] = useState<StoredReview>(() => ({
    updatedAt: opened.submission.updatedAt,
    reviewNote: opened.submission.reviewNote,
    proposed: draftInput.proposed,
  }));
  const [reviewNote, setReviewNote] = useState(opened.submission.reviewNote ?? "");
  const [openDialog, setOpenDialog] = useState<ReviewDecision | null>(null);
  const [hasStaleRefusal, setHasStaleRefusal] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const isPending = submission.status === "pending";
  const isStale = isPending && hasStaleRefusal;
  const edit = useStationDraft({ ...draftInput, canEdit: isPending && !isStale && submission.action !== "delete" });
  const { blockedSaves, countBlockedSave, reportBlockedSave } = useBlockedSaves(edit.dispatch);
  const saveMutation = useSaveSubmissionMutation();
  const reviewMutation = useReviewSubmissionMutation();
  const editedStationId = opened.station?.id ?? null;
  const shownStationId = station?.id ?? null;
  const placeStations = useOwnPlaceStations(edit.session.live?.place?.locationId ?? null, editedStationId);
  const { data: uploadedPhotos } = useQuery(submissionPhotosQueryOptions(submission.id));
  const { data: historyPages } = useInfiniteQuery({
    ...stationHistoryQueryOptions(shownStationId ?? NO_STATION_ID),
    enabled: shownStationId !== null,
  });

  const { session } = edit;
  const latestDraftRef = useRef(session.draft);
  const isSendingRef = useRef(false);

  useLayoutEffect(() => {
    latestDraftRef.current = session.draft;
  }, [session.draft]);

  const isBusy = saveMutation.isPending || reviewMutation.isPending;
  const isDirty = isPending && buildCorrections(session, stored, reviewNote).body !== null;
  const canAct = isPending && !isBusy && !isStale;
  const canSave = canAct && isDirty;
  const clearsStoredNote = reviewNote.trim() === "" && (stored.reviewNote ?? "").trim() !== "";

  function applyRefusal(error: unknown, built: BuiltKeys | null, opensList: boolean): EditError[] | null {
    if (!isServerRefusal(error)) {
      showApiError(error);
      return null;
    }

    const errors = toEditErrors(error, built, session);
    const listed = errors.filter((entry) => !isHandledOutsideList(entry));
    for (const entry of errors) {
      if (entry.messageKey === STALE_MESSAGE_KEY) setHasStaleRefusal(true);
      if (entry.messageKey === REVIEWED_MESSAGE_KEY) toast.error(text.formatError(entry));
    }
    edit.setServerErrors(listed);
    if (opensList && listed.length > 0) countBlockedSave();
    void queryClient.invalidateQueries({ queryKey: editingKeys.submission(submission.id) });
    return listed;
  }

  async function sendCorrections(body: SubmissionUpdate, auditOperation?: AuditOperationHandle): Promise<Submission> {
    const answer = await saveMutation.mutateAsync({ submissionId: submission.id, body, auditOperation });
    const proposed = toProposedSnapshot(session.live, answer);
    if (latestDraftRef.current === session.draft) edit.dispatch({ type: "rebase", live: session.live, proposed });
    else if (session.serverErrors.length > 0) edit.setServerErrors([]);
    setStored({ updatedAt: answer.updatedAt, reviewNote: answer.reviewNote, proposed });
    return answer;
  }

  async function saveCorrections() {
    if (edit.hasErrors) {
      reportBlockedSave();
      return;
    }

    const built = buildCorrections(session, stored, reviewNote);
    if (built.body === null) return;
    try {
      await sendCorrections(built.body);
      toast.success(t("toast.saved"));
    } catch (error) {
      applyRefusal(error, built, true);
    }
  }

  function showDecisionRefusal(error: unknown, built: BuiltKeys | null) {
    const listed = applyRefusal(error, built, false);
    if (listed === null) return;

    const firstError = listed.at(0);
    if (firstError === undefined) setOpenDialog(null);
    else setDecisionError(text.formatError(firstError));
  }

  async function clearStoredNote(auditOperation: AuditOperationHandle): Promise<string | null> {
    try {
      const answer = await saveMutation.mutateAsync({ submissionId: submission.id, body: { reviewNote: null }, auditOperation });
      setStored((known) => ({ ...known, updatedAt: answer.updatedAt, reviewNote: answer.reviewNote }));
      return answer.updatedAt;
    } catch (error) {
      showDecisionRefusal(error, null);
      return null;
    }
  }

  async function saveBeforeApproval(auditOperation: AuditOperationHandle): Promise<string | null> {
    if (edit.hasErrors) {
      setOpenDialog(null);
      reportBlockedSave();
      return null;
    }

    const built = buildCorrections(session, stored, clearsStoredNote ? reviewNote : null);
    if (built.body === null) return stored.updatedAt;
    try {
      const answer = await sendCorrections(built.body, auditOperation);
      return answer.updatedAt;
    } catch (error) {
      showDecisionRefusal(error, built);
      return null;
    }
  }

  async function decide(decision: ReviewDecision) {
    setDecisionError(null);
    const auditOperation = createAuditOperationHandle();
    let expectedUpdatedAt: string | null = stored.updatedAt;
    if (decision === "approve") expectedUpdatedAt = await saveBeforeApproval(auditOperation);
    else if (clearsStoredNote) expectedUpdatedAt = await clearStoredNote(auditOperation);
    if (expectedUpdatedAt === null) return;

    const review = buildSubmissionReview({ decision, note: reviewNote, expectedUpdatedAt });
    const createsOwner = session.draft.place?.structure.owner.kind === "proposed";
    const doneText = decision === "approve" ? t("toast.approved") : t("toast.rejected");
    try {
      await reviewMutation.mutateAsync({ submissionId: submission.id, review, createsOwner, auditOperation });
      setOpenDialog(null);
      toast.success(doneText);
    } catch (error) {
      showDecisionRefusal(error, null);
    }
  }

  function askApproval() {
    if (edit.hasErrors) {
      reportBlockedSave();
      return;
    }
    setDecisionError(null);
    setOpenDialog("approve");
  }

  function askRejection() {
    setDecisionError(null);
    setOpenDialog("reject");
  }

  function closeDialog(isOpen: boolean) {
    if (!isOpen) setOpenDialog(null);
  }

  function showHistory(shownStation: StationRecord) {
    openStationHistoryDialog({
      stationId: shownStation.id,
      stationCode: shownStation.siteId,
      operatorName: shownStation.operator?.name ?? t("main:unknownOperator"),
      operatorBrandId: shownStation.operator?.brandId ?? null,
    });
  }

  function requestSave() {
    void runExclusive(isSendingRef, saveCorrections);
  }

  function requestDecision(decision: ReviewDecision) {
    void runExclusive(isSendingRef, () => decide(decision));
  }

  useSaveShortcut({ canSave, onSave: requestSave });
  useBeforeUnloadGuard(isDirty);

  const { draft } = session;
  const { operatorsById, brands } = edit.lookups;
  const draftOperator = findDraftOperator(draft, operatorsById);
  const headOperator = draftOperator ?? station?.operator ?? null;
  const stationLabel = describeStation(draftOperator?.name, draft.station.siteId.trim());
  const photoPicks = submission.changes.photos;
  const uploadedCount = uploadedPhotos?.length ?? photoPicks.uploadedCount;
  const missingPhotoCount = Math.max(photoPicks.announcedCount - uploadedCount, 0);
  const hasNewMainPhoto = photoPicks.selected.some((photo) => photo.isMain) || (uploadedPhotos ?? []).some((photo) => photo.isMain);
  const changes = [
    ...edit.changes,
    ...buildPhotoChanges({
      addedCount: uploadedCount,
      shownCount: photoPicks.selected.length,
      hiddenCount: photoPicks.removed.length,
      hasNewMainPhoto,
    }),
  ];
  const facts = buildReviewFacts({
    session,
    changes: edit.changes,
    orphans: isPending ? listProposalOrphans(session.live, submission) : NO_ORPHANS,
    placeStations: placeStations ?? NO_STATIONS,
    operators: edit.lookups.operators,
    owners: edit.lookups.countryOwners,
    history: historyPages?.pages.flatMap((page) => page.data) ?? NO_HISTORY,
    sentAt: submission.createdAt,
    stationUpdatedAt: opened.station?.updatedAt ?? null,
  });
  const { partnerStation } = facts;
  const partnerOperator = partnerStation === null || partnerStation.operatorId === null ? null : operatorsById.get(partnerStation.operatorId);
  const partnerLabel = partnerStation === null ? null : describeStation(partnerOperator?.name, partnerStation.siteId);
  const submissionTabLabel = t("review.tabs.submission");
  const hasPhotos = uploadedCount > 0 || missingPhotoCount > 0 || photoPicks.selected.length > 0 || photoPicks.removed.length > 0;

  const cards: EditPageCard[] = [
    {
      id: "submitter",
      label: submissionTabLabel,
      tab: SUBMISSION_TAB,
      isBeforeCells: isPhone,
      node: <SubmitterCard submission={submission} />,
    },
    {
      id: "reviewer",
      label: submissionTabLabel,
      tab: SUBMISSION_TAB,
      node: <AdminReviewCard submission={submission} reviewNote={reviewNote} onReviewNoteChange={setReviewNote} isReadOnly={!isPending} />,
    },
    {
      id: "changes",
      label: submissionTabLabel,
      tab: SUBMISSION_TAB,
      node: (
        <SubmissionChangesCard
          edit={edit}
          submission={submission}
          changes={changes}
          facts={facts}
          partnerLabel={partnerLabel}
          showsStoredContent={opened.submission.status === "accepted"}
          onShowHistory={station === null ? null : () => showHistory(station)}
        />
      ),
    },
    { id: "station", label: t("common:labels.station"), scopes: ["station"], node: <StationCard edit={edit} stationId={editedStationId} /> },
    { id: "place", label: t("common:labels.location"), scopes: ["place"], node: <LocationCard edit={edit} stationId={editedStationId} /> },
    {
      id: "sectors",
      label: t("common:labels.azimuths"),
      count: draft.sectors.length,
      scopes: ["sector"],
      node: <AzimuthsCard edit={edit} stationId={editedStationId} />,
    },
  ];
  if (hasPhotos) {
    cards.push({
      id: "photos",
      label: t("photos.label"),
      count: uploadedCount + photoPicks.selected.length,
      scopes: ["photos"],
      node: (
        <div className="flex flex-col gap-2">
          <SubmissionLocationPhotoSelectionsSection photos={photoPicks.selected} removalPhotos={photoPicks.removed} />
          <SubmissionPhotosSection submissionId={submission.id} canEdit={isPending} showsDetails missingCount={missingPhotoCount} />
        </div>
      ),
    });
  }
  if (station !== null) {
    cards.push({
      id: "history",
      label: t("stations:edit.historyCard.title"),
      node: (
        <HistoryCard
          station={{ id: station.id, siteId: station.siteId, operator: station.operator }}
          markedSince={isPending ? submission.createdAt : null}
        />
      ),
    });
  }

  return (
    <>
      <EditPage
        kind="review"
        actions={
          <ReviewTopBar
            edit={edit}
            errorsOpenRequest={blockedSaves}
            isDecided={!isPending}
            isBusy={isBusy}
            canDecide={canAct}
            canSave={canSave}
            onReject={askRejection}
            onApprove={askApproval}
            onSave={requestSave}
          />
        }
        head={
          <SubmissionDetailHeader
            submission={submission}
            station={station}
            operator={headOperator === null ? null : { name: headOperator.name, brand: getOperatorBrand(headOperator, brands) }}
          />
        }
        strips={
          <>
            {isStale ? (
              <StatusStrip
                tone="warning"
                title={t("detail.staleWarning")}
                action={
                  <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={onReload}>
                    <HugeiconsIcon icon={RefreshIcon} />
                    {t("review.reload")}
                  </Button>
                }
              />
            ) : null}
            {submission.action === "delete" ? (
              <StatusStrip tone="danger" icon={Delete02Icon} title={t("common:submissionType.delete")}>
                {t("deletionBanner", { stationId: station?.siteId ?? submission.stationId })}
              </StatusStrip>
            ) : null}
          </>
        }
        cards={cards}
        cells={<ReviewCells edit={edit} />}
        cellCount={countDraftCells(edit.counters)}
        cellsLead={<AzimuthSummary edit={edit} />}
      />
      <ApproveDialog
        open={openDialog === "approve"}
        onOpenChange={closeDialog}
        action={submission.action}
        stationLabel={stationLabel === "" ? t("common:labels.newStation") : stationLabel}
        placeLabel={describePlace(draft.place)}
        partnerLabel={partnerLabel}
        changeCount={changes.length}
        correctionCount={edit.corrections.length}
        uploadedPhotoCount={uploadedCount}
        facts={facts}
        note={reviewNote}
        onNoteChange={setReviewNote}
        error={decisionError}
        isBusy={isBusy}
        onConfirm={() => requestDecision("approve")}
      />
      <RejectDialog
        open={openDialog === "reject"}
        onOpenChange={closeDialog}
        note={reviewNote}
        onNoteChange={setReviewNote}
        error={decisionError}
        isBusy={isBusy}
        onConfirm={() => requestDecision("reject")}
      />
    </>
  );
}
