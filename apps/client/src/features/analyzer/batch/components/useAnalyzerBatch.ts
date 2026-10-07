import type { CellApplyAnswer, Country, Station, SubmissionCreate } from "@openbts/shared/contract";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { refreshAnalyzerAllowance, useAnalyzerAllowance } from "../../data/allowance";
import { clearAnalyzerDraft } from "../../data/draftStore";
import { analyzerSession } from "../../data/session";
import type { AnalyzerDraft } from "../../model/draft";
import type { Allowance } from "../../model/selection";
import { BatchSendError, MOST_ITEMS_PER_REQUEST, applyAnalyzerChanges, batchStationQueryOptions, sendAnalyzerSubmissions } from "../data/requests";
import { listBatchStations } from "../model/batchRows";
import { type BatchView, type StationPlace, type StationRead, type StationView, buildBatchView } from "../model/batchView";
import { type BuiltStation, buildApplyBody, buildSubmissionItems, listSentRowIndexes } from "../model/bodies";
import { type BatchRefusal, toBatchRefusals } from "../model/refusals";
import { type BatchAction, type BatchReview, EMPTY_BATCH_REVIEW, batchReducer } from "../model/reviewState";
import { createConservativeStationImpact, invalidateStationUpdateQueriesBatch } from "@/features/admin/stations/queries";
import { countriesQueryOptions } from "@/features/shared/lookups";
import type { EditReference } from "@/features/station-editing/data/lookups";
import { invalidateSubmissionQueries } from "@/features/station-editing/data/submissions";
import { isServerRefusal } from "@/features/station-editing/model/serverRefusals";
import { canEditPlace, useEditorArea } from "@/features/stations/list/data/editorArea";
import { useSettledSession } from "@/hooks/useSettledSession";
import { type AuditOperationHandle, RateLimitError, createAuditOperationHandle, isNotFound, showApiError } from "@/lib/api";
import { useEditorMe } from "@/lib/auth/me";
import { type QueryLoadState, hasFailedLoad } from "@/lib/queryLoadState";

export type BrakeNotice = { limit: number; waitSeconds: number | null };

type BatchBusy = "send" | "apply" | null;
type SendBlock = "busy" | "problems" | "nothing" | "closedCountry" | "allowanceUsedUp" | "overAllowance" | null;
type ApplyBlock = "busy" | "problems" | "nothing" | "outsideArea" | "overStationCap" | null;
type BatchLoadStatus = "loading" | "failed" | "ready";

type AppliedBatch = {
  sources: BuiltStation[];
  stations: readonly StationView[];
  stationCount: number;
  changeCount: number;
  canOpenAudit: boolean;
};

export type WrittenResult = AppliedBatch & { answer: CellApplyAnswer };

export type AnalyzerBatch = {
  view: BatchView;
  review: BatchReview;
  changeReview: (action: BatchAction) => void;
  note: string;
  setNote: (note: string) => void;
  allowance: Allowance;
  refusals: readonly BatchRefusal[];
  errorsOpenRequest: number;
  brake: BrakeNotice | null;
  busy: BatchBusy;
  sendBlock: SendBlock;
  applyBlock: ApplyBlock;
  send: () => void;
  apply: () => void;
  written: WrittenResult | null;
  loadStatus: BatchLoadStatus;
  isRetryingLoad: boolean;
  retryLoad: () => void;
};

type AnalyzerBatchInput = {
  draft: AnalyzerDraft;
  reference: EditReference;
  stationReads: StationReads;
  isStaff: boolean;
  isAdmin: boolean;
};

type StationQuery = QueryLoadState & {
  data: Station | undefined;
  error: unknown;
  refetch: () => unknown;
};

type ReadSlot = StationRead | { status: "loading" } | { status: "failed" };

export type StationReads = {
  slots: ReadSlot[];
  isRetrying: boolean;
  refetchFailed: StationQuery["refetch"][];
};

type SendPlan = {
  items: SubmissionCreate[];
  sources: BuiltStation[];
  auditOperation: AuditOperationHandle;
};

type ApplyPlan = {
  applied: AppliedBatch;
  auditOperation: AuditOperationHandle;
};

export const APPLY_STATION_CAP = 50;

const NO_REFUSALS: readonly BatchRefusal[] = [];
const NO_CLOSED_COUNTRIES: ReadonlySet<string> = new Set();
const MS_PER_SECOND = 1000;

function toReadSlot(query: StationQuery): ReadSlot {
  if (query.data !== undefined) return { status: "ready", station: query.data };
  if (isNotFound(query.error)) return { status: "gone" };
  return hasFailedLoad(query) ? { status: "failed" } : { status: "loading" };
}

function collectStationReads(queries: readonly StationQuery[]): StationReads {
  const failedQueries = queries.filter((query) => hasFailedLoad(query) && !isNotFound(query.error));

  return {
    slots: queries.map(toReadSlot),
    isRetrying: failedQueries.some((query) => query.isFetching),
    refetchFailed: failedQueries.map((query) => query.refetch),
  };
}

function listClosedCountryCodes(countries: readonly Country[]): ReadonlySet<string> {
  return new Set(countries.flatMap((country) => (country.contributions === "closed" ? [country.code] : [])));
}

function getSendBlock(view: BatchView, allowance: Allowance, busy: BatchBusy): SendBlock {
  if (busy !== null) return "busy";
  if (view.problems.length > 0) return "problems";
  if (view.submit.itemCount === 0) return "nothing";
  if (view.submit.isCountryClosed) return "closedCountry";
  if (allowance.status !== "limited") return null;
  if (allowance.remaining <= 0) return "allowanceUsedUp";
  return view.submit.itemCount > allowance.remaining ? "overAllowance" : null;
}

function getApplyBlock(view: BatchView, busy: BatchBusy): ApplyBlock {
  if (busy !== null) return "busy";
  if (view.problems.length > 0) return "problems";
  if (view.apply.stations.length === 0) return "nothing";
  if (view.apply.stations.length > APPLY_STATION_CAP) return "overStationCap";
  return view.apply.isOutsideArea ? "outsideArea" : null;
}

function getBusy(isSending: boolean, isApplying: boolean): BatchBusy {
  if (isSending) return "send";
  return isApplying ? "apply" : null;
}

function getWaitSeconds(resetsAt: string | null, now: number): number | null {
  if (resetsAt === null) return null;
  return Math.max(0, Math.ceil((Date.parse(resetsAt) - now) / MS_PER_SECOND));
}

export function useBatchStationReads(draft: AnalyzerDraft, isEnabled: boolean): StationReads {
  return useQueries({
    queries: draft.stations.map((station) => batchStationQueryOptions(station.id, isEnabled)),
    combine: collectStationReads,
  });
}

export function useAnalyzerBatch({ draft, reference, stationReads, isStaff, isAdmin }: AnalyzerBatchInput): AnalyzerBatch {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: session } = useSettledSession();
  const userId = session?.user?.id;
  const editorArea = useEditorArea(isStaff);
  const allowance = useAnalyzerAllowance(userId);
  const countriesQuery = useQuery(countriesQueryOptions());
  const meQuery = useEditorMe(userId, isStaff && !isAdmin);
  const [review, dispatch] = useReducer(batchReducer, EMPTY_BATCH_REVIEW);
  const [note, setNote] = useState("");
  const [refusals, setRefusals] = useState(NO_REFUSALS);
  const [errorsOpenRequest, setErrorsOpenRequest] = useState(0);
  const [sentBrake, setSentBrake] = useState<BrakeNotice | null>(null);
  const [written, setWritten] = useState<WrittenResult | null>(null);
  const [openedAt] = useState(Date.now);
  const isSendStarted = useRef(false);

  const { slots } = stationReads;
  const { area } = editorArea;
  const countries = countriesQuery.data;
  const grants = meQuery.data?.grants;
  const stations = useMemo(() => listBatchStations(draft), [draft]);
  const view = useMemo(() => {
    const reads = new Map<number, StationRead>();
    for (const [position, station] of draft.stations.entries()) {
      const slot = slots[position];
      if (slot !== undefined && (slot.status === "ready" || slot.status === "gone")) reads.set(station.id, slot);
    }

    return buildBatchView({
      stations,
      review,
      reads,
      operatorCountryCodes: new Map(reference.operators.map((operator) => [operator.id, operator.countryCode])),
      closedCountryCodes: countries === undefined ? NO_CLOSED_COUNTRIES : listClosedCountryCodes(countries),
      canApplyAt: isStaff && area !== undefined ? (place: StationPlace) => canEditPlace(area, place) : null,
    });
  }, [draft.stations, stations, review, slots, reference.operators, countries, isStaff, area]);

  function releaseSend() {
    isSendStarted.current = false;
  }

  function showRefusals(nextRefusals: readonly BatchRefusal[]) {
    setRefusals(nextRefusals);
    setErrorsOpenRequest((count) => count + 1);
  }

  async function showBrake(error: RateLimitError, sentCount: number): Promise<void> {
    if (userId === undefined) return;

    const fresh = await refreshAnalyzerAllowance(queryClient, userId);
    if (fresh.status !== "limited" || fresh.remaining >= sentCount) return;
    setSentBrake({ limit: fresh.limit, waitSeconds: error.retryAfterSeconds ?? getWaitSeconds(fresh.resetsAt, Date.now()) });
  }

  const sendMutation = useMutation({
    mutationFn: (plan: SendPlan) => sendAnalyzerSubmissions(plan.items, plan.auditOperation),
    onSuccess: (_created, plan) => {
      clearAnalyzerDraft(draft.id);
      analyzerSession.forgetRows(listSentRowIndexes(plan.sources));
      void invalidateSubmissionQueries(queryClient);
      if (userId !== undefined) void refreshAnalyzerAllowance(queryClient, userId);
      toast.success(t("submissions:batch.submitSuccess"));
    },
    onError: (error, plan) => {
      const cause: unknown = error instanceof BatchSendError ? error.cause : error;
      const firstItemIndex = error instanceof BatchSendError ? error.firstItemIndex : 0;

      releaseSend();
      if (cause instanceof RateLimitError) {
        void showBrake(cause, Math.min(MOST_ITEMS_PER_REQUEST, plan.items.length - firstItemIndex));
        return;
      }

      if (userId !== undefined) void refreshAnalyzerAllowance(queryClient, userId);
      if (isServerRefusal(cause)) showRefusals(toBatchRefusals(cause, plan.sources.slice(firstItemIndex)));
      else showApiError(cause);
    },
  });

  const applyMutation = useMutation({
    mutationFn: (plan: ApplyPlan) => applyAnalyzerChanges(buildApplyBody(plan.applied.sources), plan.auditOperation),
    onSuccess: (answer, { applied }) => {
      clearAnalyzerDraft(draft.id);
      analyzerSession.forgetRows(listSentRowIndexes(applied.sources));
      invalidateStationUpdateQueriesBatch(
        queryClient,
        applied.sources.map((source) => createConservativeStationImpact(source.stationId)),
      );
      setWritten({ ...applied, answer });
    },
    onError: (error, { applied }) => {
      releaseSend();
      if (isServerRefusal(error)) showRefusals(toBatchRefusals(error, applied.sources));
      else showApiError(error);
    },
  });

  const busy = getBusy(sendMutation.isPending, applyMutation.isPending);
  const sendBlock = getSendBlock(view, allowance, busy);
  const applyBlock = getApplyBlock(view, busy);
  const arrivalBrake: BrakeNotice | null =
    allowance.status === "limited" && allowance.remaining <= 0
      ? { limit: allowance.limit, waitSeconds: getWaitSeconds(allowance.resetsAt, openedAt) }
      : null;
  const hasFailedRead = slots.some((slot) => slot.status === "failed");
  const isLoading = slots.some((slot) => slot.status === "loading") || (isStaff && area === undefined) || countriesQuery.isPending;

  function changeReview(action: BatchAction) {
    if (isSendStarted.current) return;
    dispatch(action);
    setRefusals(NO_REFUSALS);
  }

  function startRequest(): boolean {
    if (isSendStarted.current) return false;

    isSendStarted.current = true;
    setRefusals(NO_REFUSALS);
    setSentBrake(null);
    return true;
  }

  function send() {
    if (sendBlock !== null || !startRequest()) return;

    const { items, sources } = buildSubmissionItems(view.submit.stations, note);
    sendMutation.mutate(
      { items, sources, auditOperation: createAuditOperationHandle() },
      { onSuccess: () => void navigate({ to: "/account/submissions" }) },
    );
  }

  function canOpenAudit(appliedStations: readonly StationView[]): boolean {
    if (isAdmin) return true;
    if (grants === undefined) return false;
    return appliedStations.every((station) => grants.some((grant) => grant.role === "maintainer" && grant.countryCode === station.countryCode));
  }

  function apply() {
    if (applyBlock !== null || !startRequest()) return;

    const sources = view.apply.stations;
    const appliedIds = new Set(sources.map((source) => source.stationId));
    const appliedStations = view.stations.filter((station) => appliedIds.has(station.station.id));
    applyMutation.mutate({
      applied: {
        sources,
        stations: appliedStations,
        stationCount: view.stationCount,
        changeCount: view.changeCount,
        canOpenAudit: canOpenAudit(appliedStations),
      },
      auditOperation: createAuditOperationHandle(),
    });
  }

  function retryLoad() {
    for (const refetch of stationReads.refetchFailed) void refetch();
    if (editorArea.isError) editorArea.retry();
  }

  let loadStatus: BatchLoadStatus = "ready";
  if (hasFailedRead || editorArea.isError) loadStatus = "failed";
  else if (isLoading) loadStatus = "loading";

  return {
    view,
    review,
    changeReview,
    note,
    setNote,
    allowance,
    refusals,
    errorsOpenRequest,
    brake: sentBrake ?? arrivalBrake,
    busy,
    sendBlock,
    applyBlock,
    send,
    apply,
    written,
    loadStatus,
    isRetryingLoad: stationReads.isRetrying || editorArea.isRetrying,
    retryLoad,
  };
}
