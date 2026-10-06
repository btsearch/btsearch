import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { StationAction } from "../types";
import { RatSelector } from "./ratSelector";
import { SentState } from "./sentState";
import { SubmissionPhotosPanel } from "./submissionPhotosPanel";
import { SendButton, SubmitSection } from "./submitSection";
import { type TargetActionChoice, TargetCard, type TargetControls } from "./targetCard";
import { type SubmissionSeed, useSubmissionForm } from "./useSubmissionForm";
import { EmptyPanel } from "@/components/content/emptyPanel";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { CellsPanel } from "@/features/station-editing/components/cells/cellsPanel";
import { EditPage, type EditPageCard } from "@/features/station-editing/components/frame/editPage";
import { ErrorsChip } from "@/features/station-editing/components/frame/errorsChip";
import { StatusStrip } from "@/features/station-editing/components/frame/statusStrip";
import { TopBarActions, useTopBarPlacement } from "@/features/station-editing/components/frame/topBarActions";
import { LocationCard } from "@/features/station-editing/components/location/locationCard";
import { AzimuthsCard } from "@/features/station-editing/components/sectors/azimuthsCard";
import { AzimuthSummary } from "@/features/station-editing/components/sectors/azimuthSummary";
import { StationCard } from "@/features/station-editing/components/station/stationCard";
import { retryEditLookups } from "@/features/station-editing/data/lookups";
import { type StationDraftApi, useEditText } from "@/features/station-editing/hooks/useStationDraft";
import { countDraftCells } from "@/features/station-editing/model/changes";
import { REGISTER_PREFILL_RULES, listRegisterStationActions } from "@/features/station-editing/model/registerPrefill";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { useIsMobile } from "@/hooks/useMobile";
import { useSaveShortcut } from "@/hooks/useSaveShortcut";
import type { UkeStation } from "@/types/station";

type SubmissionFormPageProps = {
  seed: SubmissionSeed;
  controls: TargetControls | null;
  focusesModeSwitch?: boolean;
  onNoteChange?: (note: string) => void;
  onAgain: (() => void) | null;
};

type SubmissionPendingPageProps = {
  target: ReactNode;
  cells: ReactNode;
};

type CellsAreaProps = {
  edit: StationDraftApi;
};

const BAR_SEND_CLASS = "bg-primary disabled:text-primary-foreground/50 disabled:opacity-100";
const BAR_DELETE_CLASS = "bg-background disabled:text-destructive/50 disabled:opacity-100 dark:bg-background";

export function LoadingPanel() {
  const { t } = useTranslation("common");

  return (
    <EmptyPanel>
      <Spinner aria-label={t("actions.loading")} />
    </EmptyPanel>
  );
}

export function SubmissionPendingPage({ target, cells }: SubmissionPendingPageProps) {
  const { t } = useTranslation("common");

  return <EditPage kind="form" cards={[{ id: "target", label: t("actions.selectStation"), isBeforeCells: true, node: target }]} cells={cells} />;
}

function CellsArea({ edit }: CellsAreaProps) {
  const { t } = useTranslation("submissions");
  const queryClient = useQueryClient();
  const [hasBeenReady, setHasBeenReady] = useState(false);
  const { lookups, session } = edit;

  if (lookups.isReady && !hasBeenReady) setHasBeenReady(true);

  function retryLookups() {
    return retryEditLookups(queryClient, lookups.countryCode);
  }

  if (session.action === "delete") return <EmptyPanel>{t("deleteStation.warning")}</EmptyPanel>;
  if (!hasBeenReady && !lookups.isReady) return lookups.hasFailed ? <ErrorState onRetry={retryLookups} /> : <LoadingPanel />;

  return (
    <>
      {lookups.hasFailed ? <InlineError className="mb-2" onRetry={retryLookups} /> : null}
      <CellsPanel edit={edit} canConfirm={false} isNewCellConfirmed={false} />
    </>
  );
}

export function SubmissionFormPage({ seed, controls, focusesModeSwitch = false, onNoteChange, onAgain }: SubmissionFormPageProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const text = useEditText();
  const isPhone = useIsMobile();
  const placement = useTopBarPlacement();
  const form = useSubmissionForm(seed);
  useBeforeUnloadGuard(form.isDirty);
  useSaveShortcut({ canSave: form.canSend, onSave: form.send });

  const { edit, photoDraft, stored } = form;
  const { session, lookups } = edit;
  const { station } = seed;
  const stationId = station?.id ?? null;
  const isNewStation = session.live === null;
  const isDelete = session.action === "delete";
  const isStored = stored !== null;
  const hasPhotos = lookups.features?.photoUploads === true && !isDelete;
  const hasBarButton = isPhone && placement === "floating" && !form.isSent && !form.isReadOnly;
  const noteError = form.errors.find((error) => error.target.scope === "general" && error.target.field === "note");
  const actionChoice: TargetActionChoice | null =
    station === null
      ? null
      : { action: isDelete ? "delete" : "update", onActionChange: (action: StationAction) => edit.dispatch({ type: "setAction", action }) };

  function pickRegisterStation(registerStation: UkeStation) {
    for (const action of listRegisterStationActions(registerStation, lookups, REGISTER_PREFILL_RULES.form)) edit.dispatch(action);
  }

  function changeNote(note: string) {
    form.setNote(note);
    onNoteChange?.(note);
  }

  const cards: EditPageCard[] = [
    {
      id: "target",
      label: t("common:actions.selectStation"),
      isBeforeCells: true,
      node: (
        <TargetCard
          mode={isNewStation ? "new" : "existing"}
          station={station}
          controls={controls}
          actionChoice={actionChoice}
          editedSubmissionId={stored?.id}
          isBusy={!edit.canEdit}
          focusesModeSwitch={focusesModeSwitch}
        />
      ),
    },
  ];
  if (!isDelete) {
    cards.push(
      {
        id: "place",
        label: t("common:labels.location"),
        scopes: ["place"],
        node: <LocationCard edit={edit} stationId={stationId} onRegisterStationPick={isNewStation && !isStored ? pickRegisterStation : undefined} />,
      },
      { id: "station", label: t("common:labels.station"), scopes: ["station"], node: <StationCard edit={edit} stationId={stationId} /> },
      {
        id: "sectors",
        label: t("common:labels.azimuths"),
        count: session.draft.sectors.length,
        scopes: ["sector"],
        node: <AzimuthsCard edit={edit} stationId={stationId} />,
      },
    );
  }
  if (hasPhotos) {
    cards.push({
      id: "photos",
      label: t("photos.label"),
      count: photoDraft.photos.length + photoDraft.locationPhotoIds.length,
      scopes: ["photos"],
      node: (
        <SubmissionPhotosPanel
          draft={photoDraft}
          stationId={stationId}
          locationId={station?.location?.id ?? null}
          submissionId={stored?.id ?? null}
          isNewStation={isNewStation}
          canEdit={edit.canEdit}
          errors={form.errors}
        />
      ),
    });
  }
  if (!isDelete) cards.push({ id: "technologies", label: t("ratSelector.title"), tab: "target", node: <RatSelector edit={edit} /> });

  let footer: ReactNode = null;
  if (form.isSent) footer = <SentState onAgain={onAgain} />;
  else if (!form.isReadOnly) {
    footer = (
      <SubmitSection
        note={form.note}
        noteError={noteError === undefined ? null : text.formatError(noteError)}
        pendingCount={form.pendingCount}
        isDelete={isDelete}
        isStored={isStored}
        isSending={form.isSending}
        canSend={form.canSend}
        hasSendButton={!hasBarButton}
        onNoteChange={changeNote}
        onSend={form.send}
      />
    );
  }

  return (
    <EditPage
      kind="form"
      actions={
        <TopBarActions>
          <ErrorsChip edit={edit} errors={form.errors} openRequest={form.blockedSends} />
          {hasBarButton ? (
            <SendButton
              size="sm"
              isDelete={isDelete}
              isStored={isStored}
              isSending={form.isSending}
              canSend={form.canSend}
              onSend={form.send}
              className={isDelete ? BAR_DELETE_CLASS : BAR_SEND_CLASS}
            />
          ) : null}
        </TopBarActions>
      }
      strips={form.isReadOnly ? <StatusStrip tone="warning" title={t("detail.readOnly")} /> : null}
      cards={cards}
      cells={<CellsArea edit={edit} />}
      cellCount={countDraftCells(edit.counters)}
      cellsLead={isDelete ? null : <AzimuthSummary edit={edit} />}
      leftFooter={footer}
    />
  );
}
