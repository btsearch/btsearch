import { InformationCircleIcon, Tick02Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Operator, StationStatus } from "@openbts/shared/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EDITOR_STATION_SEARCH } from "../editorStationSearch";
import { useCreateStationMutation, useSaveStationMutation } from "../mutations";
import { DeleteStationDialog } from "./deleteStationDialog";
import { EditorTopBar, type RevealField } from "./editorTopBar";
import { StationCommentsSection } from "./stationCommentsSection";
import { StationPhotoSelector } from "./StationPhotoSelector";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { moderatedStationCommentsQueryOptions } from "@/features/admin/comments/queries";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { locationRecordQueryOptions, stationPhotoRecordsQueryOptions } from "@/features/station-details/station/api";
import { HostedStationBadge } from "@/features/station-details/station/components/panel/hostedStationBadge";
import type { StationRecord } from "@/features/station-details/station/types";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { findHostStation, getStationCountryCode, toV1StationStatus } from "@/features/station-details/station/utils/stations";
import { CellsPanel } from "@/features/station-editing/components/cells/cellsPanel";
import { EditPage, type EditPageCard } from "@/features/station-editing/components/frame/editPage";
import {
  EditPageHead,
  EditPageHeadId,
  EditPageHeadLocation,
  EditPageHeadSeparator,
  EditPageHeadStationLinks,
  EditPageHeadTimestamp,
} from "@/features/station-editing/components/frame/editPageHead";
import { HistoryCard } from "@/features/station-editing/components/frame/historyCard";
import { StatusStrip } from "@/features/station-editing/components/frame/statusStrip";
import { LocationCard } from "@/features/station-editing/components/location/locationCard";
import { AzimuthsCard } from "@/features/station-editing/components/sectors/azimuthsCard";
import { AzimuthSummary } from "@/features/station-editing/components/sectors/azimuthSummary";
import { StationCard } from "@/features/station-editing/components/station/stationCard";
import { type EditLookups, retryEditLookups } from "@/features/station-editing/data/lookups";
import { type StationDraftApi, useBlockedSaves, useEditText, useStationDraft } from "@/features/station-editing/hooks/useStationDraft";
import { buildStationCreate, buildStationUpdate } from "@/features/station-editing/model/bodies";
import { buildPhotoChanges, countDraftCells } from "@/features/station-editing/model/changes";
import type { SessionInput } from "@/features/station-editing/model/draftReducer";
import { RAT_FIELDS } from "@/features/station-editing/model/ratFields";
import { REGISTER_PREFILL_RULES, listRegisterStationActions } from "@/features/station-editing/model/registerPrefill";
import { type BuiltKeys, isServerRefusal, toEditErrors } from "@/features/station-editing/model/serverRefusals";
import { toStationSnapshot } from "@/features/station-editing/model/snapshots";
import type { EditError, EditSession, Rat, StationSnapshot } from "@/features/station-editing/model/types";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { PhotoUploadSection } from "@/features/submissions/components/photoUploadSection";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import type { UkeStation } from "@/types/station";

type SavedStationEditorProps = {
  record: StationRecord;
};

type NewStationEditorProps = {
  prefill?: StationSnapshot;
};

type SavedStationHeadProps = {
  record: StationRecord;
  operatorId: number | null;
  lookups: EditLookups;
};

type StatusStripsProps = {
  status: StationStatus;
  restoreAction: ReactNode;
};

type RestoreButtonProps = {
  isDisabled: boolean;
  hasUnsavedChanges: boolean;
  onRestore: () => void;
};

type EditorCellsProps = {
  edit: StationDraftApi;
};

const ADMIN_ROLE = "admin";
const CELL_CARD_SKELETONS = [0, 1];
const PAGE_HOLDER_CLASS = "flex min-h-0 flex-1 flex-col";

function createSavedStationInput(record: StationRecord): SessionInput {
  return { kind: "editor", action: "update", countryCode: getStationCountryCode(record), live: toStationSnapshot(record), proposed: null };
}

function createNewStationInput(prefill: StationSnapshot | undefined): SessionInput {
  const input: SessionInput = { kind: "editor", action: "create", countryCode: null, live: null, proposed: null };
  if (prefill !== undefined) input.initialDraft = prefill;
  return input;
}

function findHeadOperator(operatorId: number | null, lookups: EditLookups, savedOperator: Operator | null) {
  if (operatorId === null) return null;

  const operator = lookups.operatorsById.get(operatorId) ?? (savedOperator?.id === operatorId ? savedOperator : null);
  return operator === null ? null : { name: operator.name, brand: getOperatorBrand(operator, lookups.brands) };
}

function findOnlyTable(errors: readonly EditError[]): Rat | null {
  const firstRat = errors.at(0)?.target.rat ?? null;
  return errors.every((refusal) => (refusal.target.rat ?? null) === firstRat) ? firstRat : null;
}

function useSaveFeedback(edit: StationDraftApi) {
  const { t } = useTranslation("stations");
  const text = useEditText();
  const { blockedSaves, countBlockedSave, reportBlockedSave } = useBlockedSaves(edit.dispatch);

  function reportFailedSave(error: unknown, built: BuiltKeys, session: EditSession, reveal: RevealField) {
    if (!isServerRefusal(error)) {
      showApiError(error);
      return;
    }

    const errors = toEditErrors(error, built, session);
    const placedErrors = errors.filter((refusal) => refusal.target.scope !== "general");
    const [firstError] = errors;
    const [firstPlacedError] = placedErrors;
    const title = t("edit.editor.saveRefused.title");

    edit.setServerErrors(errors);
    countBlockedSave();
    if (firstPlacedError === undefined) {
      toast.error(title, { description: firstError === undefined ? undefined : text.formatError(firstError) });
      return;
    }

    const table = findOnlyTable(placedErrors);
    toast.error(title, {
      description:
        table === null
          ? t("edit.editor.saveRefused.fields", { count: placedErrors.length })
          : t("edit.editor.saveRefused.fieldsInTable", { count: placedErrors.length, table: RAT_FIELDS[table].name }),
      action: { label: t("edit.editor.saveRefused.show"), onClick: () => reveal(firstPlacedError.target) },
    });
  }

  return { blockedSaves, reportBlockedSave, reportFailedSave };
}

function EditorCells({ edit }: EditorCellsProps) {
  const queryClient = useQueryClient();
  const { data: authSession } = authClient.useSession();
  const { lookups } = edit;

  if (lookups.hasFailed) return <InlineError onRetry={() => retryEditLookups(queryClient, lookups.countryCode)} />;
  if (!lookups.isReady) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {CELL_CARD_SKELETONS.map((card) => (
          <Skeleton key={card} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  return <CellsPanel edit={edit} canConfirm isNewCellConfirmed={authSession?.user?.role === ADMIN_ROLE} />;
}

function RestoreButton({ isDisabled, hasUnsavedChanges, onRestore }: RestoreButtonProps) {
  const { t } = useTranslation("stations");

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="shrink-0" />}>
        <Button type="button" variant="outline" size="sm" className="cursor-pointer text-foreground" disabled={isDisabled} onClick={onRestore}>
          <HugeiconsIcon icon={Undo02Icon} className="size-3.5" aria-hidden="true" />
          {t("edit.editor.restore")}
        </Button>
      </TooltipTrigger>
      {hasUnsavedChanges ? <TooltipContent>{t("edit.editor.saveFirst")}</TooltipContent> : null}
    </Tooltip>
  );
}

function StatusStrips({ status, restoreAction }: StatusStripsProps) {
  const { t } = useTranslation("stations");

  if (status === "inactive") {
    return (
      <StatusStrip tone="danger" title={t("inactiveBanner.title")} action={restoreAction}>
        {t("edit.editor.inactiveStrip.description")}
      </StatusStrip>
    );
  }
  if (status === "awaitingCells") {
    return (
      <StatusStrip tone="warning" icon={InformationCircleIcon} title={t("edit.editor.awaitingStrip.title")}>
        {t("edit.editor.awaitingStrip.description")}
      </StatusStrip>
    );
  }
  return null;
}

function SavedStationHead({ record, operatorId, lookups }: SavedStationHeadProps) {
  const { t } = useTranslation("common");
  const { openStationDialog } = useFloatingDialogStack();
  const { data: place, isLoading: isPlaceLoading } = useQuery(locationRecordQueryOptions(record.location?.id));
  const { location } = record;
  const hostStation = findHostStation(record, place?.stations);
  const statusBadge = <StationStatusBadge status={toV1StationStatus(record.status)} statusChangedAt={record.statusChangedAt} />;

  return (
    <EditPageHead
      operator={findHeadOperator(operatorId, lookups, record.operator)}
      siteId={record.siteId}
      badges={
        <>
          {record.hostStationId === null ? null : (
            <HostedStationBadge
              hostStation={hostStation}
              hostBrand={getOperatorBrand(hostStation?.operator, lookups.brands)}
              isHostLoading={isPlaceLoading}
              onOpenStation={(stationId) => openStationDialog(stationId, "internal")}
            />
          )}
          {record.isConfirmed ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t("labels.confirmed")}</span>
            </span>
          ) : null}
          {statusBadge}
        </>
      }
      compactBadges={statusBadge}
      subtitle={
        location === null ? null : (
          <EditPageHeadLocation locationId={location.id} city={location.city || `#${location.id}`} address={location.address} />
        )
      }
      meta={
        <>
          <EditPageHeadTimestamp label={t("labels.created")} value={record.createdAt} />
          <EditPageHeadSeparator />
          <EditPageHeadTimestamp label={t("labels.updated")} value={record.updatedAt} />
          <EditPageHeadSeparator />
          <EditPageHeadId value={String(record.id)} />
        </>
      }
      links={<EditPageHeadStationLinks stationId={record.id} place={location} />}
    />
  );
}

export function SavedStationEditor({ record }: SavedStationEditorProps) {
  const { t } = useTranslation(["stations", "common", "submissions"]);
  const { data: authSession } = authClient.useSession();
  const [sessionInput] = useState(() => createSavedStationInput(record));
  const edit = useStationDraft({ ...sessionInput, canEdit: true });
  const feedback = useSaveFeedback(edit);
  const saveMutation = useSaveStationMutation();
  const statusMutation = useSaveStationMutation();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const stationId = record.id;
  const locationId = record.location?.id ?? null;
  const hasComments = edit.lookups.features?.comments === true;
  const { data: shownPhotos } = useQuery({ ...stationPhotoRecordsQueryOptions(stationId), enabled: locationId !== null });
  const { data: comments } = useQuery({ ...moderatedStationCommentsQueryOptions(stationId, authSession?.user?.id), enabled: hasComments });

  useBeforeUnloadGuard(edit.changes.length > 0);

  const hasChanges = edit.changes.length > 0;
  const isSaving = saveMutation.isPending;
  const isBusy = isSaving || statusMutation.isPending;

  function ignoreInputWhileSaving(event: SyntheticEvent) {
    if (!isSaving) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function saveStation(reveal: RevealField) {
    if (edit.hasErrors) {
      feedback.reportBlockedSave();
      return;
    }

    const { session } = edit;
    const built = buildStationUpdate(session);
    if (built.body === null) return;

    saveMutation.mutate(
      { stationId, body: built.body, previousLocationId: locationId },
      {
        onSuccess: (savedStation) => {
          edit.dispatch({ type: "rebase", live: toStationSnapshot(savedStation), proposed: null });
          toast.success(t("toast.saved"));
        },
        onError: (error) => feedback.reportFailedSave(error, built, session, reveal),
      },
    );
  }

  function changeStatus(status: StationStatus, doneText: string) {
    statusMutation.mutate(
      { stationId, body: { station: { status } }, previousLocationId: locationId },
      {
        onSuccess: (savedStation) => {
          edit.dispatch({ type: "rebase", live: toStationSnapshot(savedStation), proposed: null });
          setIsDeleteOpen(false);
          toast.success(doneText);
        },
        onError: showApiError,
      },
    );
  }

  const photosCard = locationId === null ? null : <StationPhotoSelector stationId={stationId} locationId={locationId} />;
  const commentsCard = hasComments ? <StationCommentsSection stationId={stationId} /> : null;
  const historyCard = <HistoryCard station={{ id: stationId, siteId: record.siteId, operator: record.operator }} />;
  const cards: EditPageCard[] = [
    { id: "station", label: t("common:labels.station"), scopes: ["station"], node: <StationCard edit={edit} stationId={stationId} /> },
    { id: "place", label: t("common:labels.location"), scopes: ["place"], node: <LocationCard edit={edit} stationId={stationId} /> },
    {
      id: "sectors",
      label: t("common:labels.azimuths"),
      count: edit.session.draft.sectors.length,
      scopes: ["sector"],
      node: <AzimuthsCard edit={edit} stationId={stationId} />,
    },
  ];
  if (photosCard !== null) {
    cards.push({ id: "photos", label: t("submissions:photos.label"), count: shownPhotos?.length, scopes: ["photos"], node: photosCard });
  }
  if (commentsCard !== null) cards.push({ id: "comments", label: t("common:labels.comments"), count: comments?.length, node: commentsCard });
  cards.push({ id: "history", label: t("edit.historyCard.title"), node: historyCard });

  return (
    <>
      <div
        inert={statusMutation.isPending}
        aria-busy={isSaving}
        onKeyDownCapture={ignoreInputWhileSaving}
        onBeforeInputCapture={ignoreInputWhileSaving}
        onPasteCapture={ignoreInputWhileSaving}
        onDropCapture={ignoreInputWhileSaving}
        className={cn(PAGE_HOLDER_CLASS, isSaving ? "pointer-events-none" : null)}
      >
        <EditPage
          kind="editor"
          actions={
            <EditorTopBar
              edit={edit}
              changes={edit.changes}
              blockedSaves={feedback.blockedSaves}
              isNewStation={false}
              isSaving={isSaving}
              isLocked={isBusy}
              onSave={saveStation}
              onRevert={() => edit.dispatch({ type: "reset" })}
              onDeleteRequest={record.status === "inactive" ? undefined : () => setIsDeleteOpen(true)}
            />
          }
          head={<SavedStationHead record={record} operatorId={edit.session.draft.station.operatorId} lookups={edit.lookups} />}
          strips={
            <StatusStrips
              status={record.status}
              restoreAction={
                <RestoreButton
                  isDisabled={isBusy || hasChanges}
                  hasUnsavedChanges={hasChanges}
                  onRestore={() => changeStatus(record.cells.length > 0 ? "active" : "awaitingCells", t("edit.editor.toast.restored"))}
                />
              }
            />
          }
          cards={cards}
          cells={<EditorCells edit={edit} />}
          cellCount={countDraftCells(edit.counters)}
          cellsLead={<AzimuthSummary edit={edit} />}
        />
      </div>
      <DeleteStationDialog
        isOpen={isDeleteOpen}
        isPending={statusMutation.isPending}
        onOpenChange={setIsDeleteOpen}
        onConfirm={() => changeStatus("inactive", t("edit.editor.toast.deactivated"))}
      />
    </>
  );
}

export function NewStationEditor({ prefill }: NewStationEditorProps) {
  const { t } = useTranslation(["stations", "common", "submissions"]);
  const navigate = useNavigate();
  const createMutation = useCreateStationMutation();
  const isBusy = createMutation.isPending || createMutation.isSuccess;
  const [sessionInput] = useState(() => createNewStationInput(prefill));
  const edit = useStationDraft({ ...sessionInput, canEdit: !isBusy });
  const feedback = useSaveFeedback(edit);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoNotes, setPhotoNotes] = useState<string[]>([]);
  const [photoTakenAts, setPhotoTakenAts] = useState<(Date | null)[]>([]);

  useBeforeUnloadGuard((edit.changes.length > 0 || photos.length > 0) && !createMutation.isSuccess);

  function createStationFromDraft(reveal: RevealField) {
    const { session } = edit;
    const built = buildStationCreate(session);
    if (edit.hasErrors || built.body === null) {
      feedback.reportBlockedSave();
      return;
    }

    createMutation.mutate(
      { body: built.body, photos: { files: photos, notes: photoNotes, takenAts: photoTakenAts } },
      {
        onSuccess: (createdStation) => {
          toast.success(t("toast.created"));
          void navigate({
            to: "/admin/stations/$id",
            params: { id: String(createdStation.id) },
            search: EDITOR_STATION_SEARCH,
            replace: true,
            ignoreBlocker: true,
          });
        },
        onError: (error) => feedback.reportFailedSave(error, built, session, reveal),
      },
    );
  }

  function clearDraft() {
    edit.dispatch({ type: "rebase", live: null, proposed: null });
    edit.dispatch({ type: "setEnabledRats", rats: [] });
    setPhotos([]);
    setPhotoNotes([]);
    setPhotoTakenAts([]);
  }

  function applyRegisterStation(station: UkeStation) {
    for (const action of listRegisterStationActions(station, edit.lookups, REGISTER_PREFILL_RULES.editor)) edit.dispatch(action);
  }

  const photoChanges = buildPhotoChanges({ addedCount: photos.length, shownCount: 0, hiddenCount: 0, hasNewMainPhoto: false });
  const changes = [...edit.changes, ...photoChanges];
  const cards: EditPageCard[] = [
    { id: "station", label: t("common:labels.station"), scopes: ["station"], node: <StationCard edit={edit} stationId={null} /> },
    {
      id: "place",
      label: t("common:labels.location"),
      scopes: ["place"],
      node: <LocationCard edit={edit} onRegisterStationPick={applyRegisterStation} />,
    },
    {
      id: "sectors",
      label: t("common:labels.azimuths"),
      count: edit.session.draft.sectors.length,
      scopes: ["sector"],
      node: <AzimuthsCard edit={edit} stationId={null} />,
    },
    {
      id: "photos",
      label: t("submissions:photos.label"),
      count: photos.length,
      scopes: ["photos"],
      node: (
        <PhotoUploadSection
          photos={photos}
          onPhotosChange={setPhotos}
          notes={photoNotes}
          onNotesChange={setPhotoNotes}
          takenAts={photoTakenAts}
          onTakenAtsChange={setPhotoTakenAts}
          isLocked={isBusy}
        />
      ),
    },
  ];

  return (
    <EditPage
      kind="editor"
      actions={
        <EditorTopBar
          edit={edit}
          changes={changes}
          blockedSaves={feedback.blockedSaves}
          isNewStation
          isSaving={isBusy}
          isLocked={isBusy}
          onSave={createStationFromDraft}
          onRevert={clearDraft}
        />
      }
      head={<EditPageHead operator={findHeadOperator(edit.session.draft.station.operatorId, edit.lookups, null)} />}
      cards={cards}
      cells={<EditorCells edit={edit} />}
      cellCount={countDraftCells(edit.counters)}
      cellsLead={<AzimuthSummary edit={edit} />}
    />
  );
}
