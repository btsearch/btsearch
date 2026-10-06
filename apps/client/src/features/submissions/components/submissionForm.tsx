import { ArrowLeft01Icon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SubmissionMode } from "../types";
import type { TargetStation } from "./stationSelector";
import { LoadingPanel, SubmissionFormPage, SubmissionPendingPage } from "./submissionFormPage";
import { TargetCard, type TargetControls } from "./targetCard";
import type { SubmissionSeed } from "./useSubmissionForm";
import { EmptyPanel } from "@/components/content/emptyPanel";
import { Button } from "@/components/ui/button";
import { ErrorState, InlineError, PageErrorState } from "@/components/ui/error-state";
import { registerStationPermitsQueryOptions } from "@/features/admin/stations/queries";
import { groupPermitsByStation } from "@/features/map/utils";
import { stationRecordQueryOptions } from "@/features/station-details/station/api";
import { retryEditLookups, useEditReference } from "@/features/station-editing/data/lookups";
import { submissionQueryOptions } from "@/features/station-editing/data/submissions";
import { pickFreshData } from "@/features/station-editing/hooks/useStationDraft";
import { REGISTER_PREFILL_RULES, toRegisterStationDraft } from "@/features/station-editing/model/registerPrefill";
import { isNotFound } from "@/lib/api";

type SubmissionFormProps = {
  stationId: number | null;
  submissionId: string | null;
  registerStationId: string | null;
};

type FreshSubmissionFormProps = Pick<SubmissionFormProps, "stationId" | "registerStationId">;

type StoredSubmissionFormProps = {
  submissionId: string;
};

type FormTarget = {
  mode: SubmissionMode;
  stationId: number | null;
  summary: TargetStation | null;
  note: string;
  round: number;
};

type TargetFormProps = {
  controls: TargetControls;
  onAgain: () => void;
};

type RegisterStationFormProps = TargetFormProps & {
  registerStationId: string;
};

type ExistingStationFormProps = TargetFormProps & {
  stationId: number;
  summary: TargetStation | null;
  note: string;
  focusesModeSwitch: boolean;
  onNoteChange: (note: string) => void;
};

const NO_STATION_ID = 0;
const INACTIVE_STATUS = "inactive";
const EMPTY_SEED: SubmissionSeed = { station: null, submission: null, prefill: null, note: "" };

function useFirstLoaded<Value>(value: Value | null): Value | null {
  const [firstValue, setFirstValue] = useState(value);

  if (firstValue === null && value !== null) setFirstValue(value);
  return firstValue ?? value;
}

function RegisterStationForm({ registerStationId, controls, onAgain }: RegisterStationFormProps) {
  const queryClient = useQueryClient();
  const reference = useEditReference();
  const { data: permits, isLoadingError, isFetching, refetch } = useQuery(registerStationPermitsQueryOptions(registerStationId));
  const target = <TargetCard mode="new" station={null} controls={controls} />;

  if (isLoadingError) return <SubmissionPendingPage target={target} cells={<ErrorState onRetry={() => refetch()} isRetrying={isFetching} />} />;
  if (reference.hasFailed) {
    return <SubmissionPendingPage target={target} cells={<ErrorState onRetry={() => retryEditLookups(queryClient, null)} />} />;
  }
  if (permits === undefined || !reference.isReady) return <SubmissionPendingPage target={target} cells={<LoadingPanel />} />;

  const registerStation = groupPermitsByStation(permits).at(0);
  const prefill = registerStation === undefined ? null : toRegisterStationDraft(registerStation, reference, REGISTER_PREFILL_RULES.form);
  return <SubmissionFormPage seed={{ ...EMPTY_SEED, prefill }} controls={controls} onAgain={onAgain} />;
}

function ExistingStationForm({ stationId, summary, note, controls, focusesModeSwitch, onNoteChange, onAgain }: ExistingStationFormProps) {
  const { t } = useTranslation(["stations", "stationDetails", "common"]);
  const [openedAt] = useState(Date.now);
  const { data, dataUpdatedAt, error, isFetching, isFetchedAfterMount, refetch } = useQuery({
    ...stationRecordQueryOptions(stationId),
    staleTime: 0,
  });
  const record = pickFreshData(data, dataUpdatedAt, openedAt);
  const station = useFirstLoaded(record !== null && record.status !== INACTIVE_STATUS ? record : null);

  if (station !== null) {
    const seed: SubmissionSeed = { station, submission: null, prefill: null, note };
    return <SubmissionFormPage seed={seed} controls={controls} focusesModeSwitch={focusesModeSwitch} onNoteChange={onNoteChange} onAgain={onAgain} />;
  }

  const isLoading = record === null && !isFetchedAfterMount;
  const isGone = record !== null || isNotFound(error);
  const clearButton = (
    <Button type="button" variant="ghost" size="sm" onClick={controls.onStationClear} className="cursor-pointer">
      {t("common:actions.clear")}
    </Button>
  );
  const loadError = isGone ? (
    <InlineError title={t("edit.refusals.stationGone")} action={clearButton} />
  ) : (
    <InlineError title={t("stationDetails:page.stationUnavailableTitle")} onRetry={() => refetch()} isRetrying={isFetching} action={clearButton} />
  );

  return (
    <SubmissionPendingPage
      target={
        <TargetCard
          mode="existing"
          station={summary}
          controls={controls}
          isStationLoading={isLoading}
          stationError={isLoading ? null : loadError}
          focusesModeSwitch={focusesModeSwitch}
        />
      }
      cells={isLoading ? <LoadingPanel /> : <EmptyPanel>{t("common:actions.selectStation")}</EmptyPanel>}
    />
  );
}

function FreshSubmissionForm({ stationId, registerStationId }: FreshSubmissionFormProps) {
  const { t } = useTranslation("common");
  const typedNote = useRef("");
  const [target, setTarget] = useState<FormTarget>({ mode: stationId === null ? "new" : "existing", stationId, summary: null, note: "", round: 0 });

  function openTarget(mode: SubmissionMode, station: TargetStation | null, note: string) {
    typedNote.current = note;
    setTarget((current) => ({ mode, stationId: station?.id ?? null, summary: station, note, round: current.round + 1 }));
  }

  function keepTypedNote(note: string) {
    typedNote.current = note;
  }

  function startAgain() {
    openTarget("new", null, "");
  }

  const controls: TargetControls = {
    onModeChange: (mode) => {
      if (mode !== target.mode) openTarget(mode, null, "");
    },
    onStationPick: (station) => openTarget("existing", station, typedNote.current),
    onStationClear: () => openTarget("existing", null, typedNote.current),
  };
  const focusesModeSwitch = target.round > 0;

  if (target.mode === "new" && target.round === 0 && registerStationId !== null) {
    return <RegisterStationForm registerStationId={registerStationId} controls={controls} onAgain={startAgain} />;
  }
  if (target.mode === "new") {
    return <SubmissionFormPage key={target.round} seed={EMPTY_SEED} controls={controls} focusesModeSwitch={focusesModeSwitch} onAgain={startAgain} />;
  }
  if (target.stationId === null) {
    return (
      <SubmissionPendingPage
        target={<TargetCard mode="existing" station={null} controls={controls} focusesModeSwitch={focusesModeSwitch} />}
        cells={<EmptyPanel>{t("actions.selectStation")}</EmptyPanel>}
      />
    );
  }
  return (
    <ExistingStationForm
      key={`${target.stationId}:${target.round}`}
      stationId={target.stationId}
      summary={target.summary}
      note={target.note}
      controls={controls}
      focusesModeSwitch={focusesModeSwitch}
      onNoteChange={keepTypedNote}
      onAgain={startAgain}
    />
  );
}

function StoredSubmissionForm({ submissionId }: StoredSubmissionFormProps) {
  const { t } = useTranslation(["submissions", "stationDetails", "nav"]);
  const [openedAt] = useState(Date.now);
  const submissionQuery = useQuery({ ...submissionQueryOptions(submissionId), staleTime: 0 });
  const knownSubmission = submissionQuery.data;
  const submission = pickFreshData(knownSubmission, submissionQuery.dataUpdatedAt, openedAt);
  const stationId = knownSubmission === undefined || knownSubmission.action === "create" ? null : knownSubmission.stationId;
  const stationQuery = useQuery({ ...stationRecordQueryOptions(stationId ?? NO_STATION_ID), enabled: stationId !== null, staleTime: 0 });
  const station = pickFreshData(stationQuery.data, stationQuery.dataUpdatedAt, openedAt);
  const loadedSeed: SubmissionSeed | null =
    submission !== null && (stationId === null || station !== null) ? { station, submission, prefill: null, note: "" } : null;
  const seed = useFirstLoaded(loadedSeed);

  if (seed !== null) return <SubmissionFormPage seed={seed} controls={null} onAgain={null} />;

  const hasSubmissionFailed = submission === null && submissionQuery.isFetchedAfterMount;
  const hasStationFailed = submission !== null && stationQuery.isFetchedAfterMount;
  const backButton = (
    <Button variant="outline" nativeButton={false} render={<Link to="/account/submissions" />}>
      <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
      {t("nav:items.mySubmissions")}
    </Button>
  );

  if (hasSubmissionFailed && isNotFound(submissionQuery.error)) {
    return (
      <PageErrorState
        tone="neutral"
        icon={SearchRemoveIcon}
        title={t("detail.notFoundTitle")}
        description={t("detail.notFoundDescription")}
        action={backButton}
      />
    );
  }
  if (hasSubmissionFailed) {
    return <PageErrorState onRetry={() => submissionQuery.refetch()} isRetrying={submissionQuery.isFetching} action={backButton} />;
  }
  if (hasStationFailed && isNotFound(stationQuery.error)) {
    return (
      <PageErrorState
        tone="neutral"
        icon={SearchRemoveIcon}
        title={t("stationDetails:page.stationNotFoundTitle")}
        description={t("stationDetails:page.stationNotFoundDescription")}
        action={backButton}
      />
    );
  }
  if (hasStationFailed) {
    return (
      <PageErrorState
        title={t("stationDetails:page.stationUnavailableTitle")}
        onRetry={() => stationQuery.refetch()}
        isRetrying={stationQuery.isFetching}
        action={backButton}
      />
    );
  }

  return (
    <SubmissionPendingPage
      target={
        <TargetCard
          mode={knownSubmission?.action === "create" ? "new" : "existing"}
          station={null}
          controls={null}
          editedSubmissionId={submissionId}
          isStationLoading
        />
      }
      cells={<LoadingPanel />}
    />
  );
}

export function SubmissionForm({ stationId, submissionId, registerStationId }: SubmissionFormProps) {
  useEditReference();

  if (submissionId !== null) return <StoredSubmissionForm submissionId={submissionId} />;
  return <FreshSubmissionForm stationId={stationId} registerStationId={registerStationId} />;
}
