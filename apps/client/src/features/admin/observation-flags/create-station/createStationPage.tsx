import { ArrowLeft01Icon, InformationCircleIcon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservationFlag, ObservedSite, StationCreate } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { flagQueryOptions } from "../api/flags";
import { createStationFromSite, invalidateSiteQueries, siteGroupQueryOptions } from "../api/sites";
import { ConflictStrip } from "../components/conflictStrip";
import { type FlagsAccess, FlagsAccessState, MeasurementsOffNotice, useFlagsAccess } from "../components/flagsAccess";
import { type QueueConflict, isForbidden, readQueueConflict } from "../model/conflicts";
import { EstimateOverlay } from "./estimateOverlay";
import { toSuggestionSnapshot } from "./suggestionDraft";
import { ForbiddenState } from "@/components/auth/requireRole";
import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { EditorCells } from "@/features/admin/stations/components/editorCells";
import { EditorTopBar, type RevealField } from "@/features/admin/stations/components/editorTopBar";
import { EDITOR_STATION_SEARCH } from "@/features/admin/stations/editorStationSearch";
import { useSaveFeedback } from "@/features/admin/stations/hooks/useSaveFeedback";
import { createConservativeStationImpact, invalidateStationUpdateQueries } from "@/features/admin/stations/queries";
import { observedSiteQueryOptions } from "@/features/map/crowd/api/observedQueries";
import { getEstimatedSiteName } from "@/features/map/crowd/sites/estimatedSites";
import { stationRecordQueryOptions } from "@/features/station-details/station/api";
import type { StationRecord } from "@/features/station-details/station/types";
import { EditPage, type EditPageCard } from "@/features/station-editing/components/frame/editPage";
import { EditPageHead, findHeadOperator } from "@/features/station-editing/components/frame/editPageHead";
import { LocationCard } from "@/features/station-editing/components/location/locationCard";
import { AzimuthsCard } from "@/features/station-editing/components/sectors/azimuthsCard";
import { AzimuthSummary } from "@/features/station-editing/components/sectors/azimuthSummary";
import { StationCard } from "@/features/station-editing/components/station/stationCard";
import { type EditReference, retryEditLookups, useEditReference } from "@/features/station-editing/data/lookups";
import { useStationDraft } from "@/features/station-editing/hooks/useStationDraft";
import { buildStationCreate } from "@/features/station-editing/model/bodies";
import { countDraftCells, findNodeName } from "@/features/station-editing/model/changes";
import type { SessionInput } from "@/features/station-editing/model/draftReducer";
import type { StationSnapshot } from "@/features/station-editing/model/types";
import { findDraftOwner } from "@/features/station-editing/model/validate";
import { canEditPlace } from "@/features/stations/list/data/editorArea";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { isNotFound } from "@/lib/api";
import type { PlacePoint } from "@/lib/geo/geocoding";

type CreateStationPageProps = {
  observedSiteId: number | null;
  flagId: number | null;
  pickedPoint: PlacePoint | null;
};

type ReadyAccess = Extract<FlagsAccess, { state: "ready" }>;

type SiteLoaderProps = Omit<CreateStationPageProps, "observedSiteId"> & {
  observedSiteId: number;
  access: ReadyAccess;
};

type SiteStationEditorProps = {
  site: ObservedSite;
  flag: ObservationFlag | null;
  prefill: StationSnapshot;
  suggestion: StationCreate | null;
  isSwitchedOff: boolean;
};

type MissingSiteProps = {
  flagId: number | null;
};

type StationRequest = {
  body: StationCreate;
  idempotencyKey: string;
};

type RequestKey = {
  key: string;
  bodyText: string;
};

const CELL_CARD_SKELETONS = [0, 1];
const NOTE_CLASS = "flex items-start gap-1.5 text-xs text-muted-foreground";

function PageSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden" aria-busy="true">
      <div className="shrink-0 border-b bg-background">
        <div className="px-4 py-2">
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
        <div className="space-y-1.5 border-t border-border/50 px-4 py-2.5">
          <Skeleton className="h-5 w-72 max-w-full rounded-md" />
          <Skeleton className="h-4 w-96 max-w-full rounded-md" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
        <div className="flex w-full flex-col gap-3 lg:flex-2">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
        <div className="flex w-full flex-col gap-3 lg:flex-3">
          {CELL_CARD_SKELETONS.map((card) => (
            <Skeleton key={card} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function MissingSite({ flagId }: MissingSiteProps) {
  const { t } = useTranslation(["admin", "common"]);

  return (
    <PageErrorState
      tone="neutral"
      icon={SearchRemoveIcon}
      title={t("observationFlags.createStation.missing.title")}
      description={t("observationFlags.createStation.missing.description")}
      action={
        <Button variant="outline" nativeButton={false} render={<Link to="/admin/observation-flags" search={{ flag: flagId ?? undefined }} />}>
          <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("common:actions.back")}
        </Button>
      }
    />
  );
}

function readSiteConflict(site: ObservedSite): QueueConflict | null {
  if (site.status === "replaced") return { kind: "replaced", replacedByObservedSiteIds: site.replacedByObservedSiteIds };
  if (site.copyOfObservedSiteId !== null) return { kind: "copy", observedSiteId: site.copyOfObservedSiteId };
  if (site.node === "station") return { kind: "stationSite", stationId: site.stationId };
  return null;
}

function readSuggestion(flag: ObservationFlag | null): StationCreate | null {
  return flag?.kind === "unmatchedSite" ? flag.suggestion : null;
}

function listGroupIds(site: ObservedSite, flag: ObservationFlag | null): number[] {
  if (flag?.kind === "unmatchedSite" || flag?.kind === "positionShifts") return flag.evidence.observedSiteIds;
  return [site.id];
}

function buildPrefill(site: ObservedSite, suggestion: StationCreate | null, pickedPoint: PlacePoint | null, reference: EditReference) {
  const sitePoint = site.latitude === null || site.longitude === null ? null : { latitude: site.latitude, longitude: site.longitude };
  return toSuggestionSnapshot({ suggestion, operatorId: site.operatorId, sitePoint, pickedPoint }, reference);
}

function createSessionInput(prefill: StationSnapshot): SessionInput {
  return { kind: "editor", action: "create", countryCode: null, live: null, proposed: null, initialDraft: prefill };
}

function useGroupNames(site: ObservedSite, flag: ObservationFlag | null): string[] {
  const groupIds = listGroupIds(site, flag);
  const { data: members } = useQuery(siteGroupQueryOptions(groupIds));
  const sites = members === undefined || members.length === 0 ? [site] : members;
  return [...sites].sort((left, right) => left.id - right.id).map(getEstimatedSiteName);
}

function SiteStationEditor({ site, flag, prefill, suggestion, isSwitchedOff }: SiteStationEditorProps) {
  const { t, i18n } = useTranslation(["admin", "stations", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sessionInput] = useState(() => createSessionInput(prefill));
  const [conflict, setConflict] = useState<QueueConflict | null>(() => readSiteConflict(site));
  const requestKeyRef = useRef<RequestKey | null>(null);
  const createMutation = useMutation({
    mutationFn: ({ body, idempotencyKey }: StationRequest) => createStationFromSite(site.id, body, idempotencyKey),
    onSuccess: (station: StationRecord) => {
      queryClient.setQueryData(stationRecordQueryOptions(station.id).queryKey, station);
      invalidateStationUpdateQueries(queryClient, {
        ...createConservativeStationImpact(station.id),
        oldLocationId: null,
        newLocationId: station.location?.id ?? null,
      });
      void invalidateSiteQueries(queryClient);
    },
  });
  const isBusy = createMutation.isPending || createMutation.isSuccess;
  const edit = useStationDraft({ ...sessionInput, stationId: null, canEdit: !isBusy });
  const feedback = useSaveFeedback(edit);
  const groupNames = useGroupNames(site, flag);
  const siteName = getEstimatedSiteName(site);
  const names = new Intl.ListFormat(i18n.language, { style: "long", type: "conjunction" }).format(groupNames);
  const { draft } = edit.session;
  const nodeName = findNodeName(draft);
  const radiusMeters = site.placement?.kind === "fit" ? site.placement.radiusMeters : null;

  useBeforeUnloadGuard(edit.changes.length > 0 && !createMutation.isSuccess);

  function takeIdempotencyKey(body: StationCreate): string {
    const bodyText = JSON.stringify(body);
    const known = requestKeyRef.current;
    if (known !== null && known.bodyText === bodyText) return known.key;

    const key = nanoid();
    requestKeyRef.current = { key, bodyText };
    return key;
  }

  function leaveAfterCreate(station: StationRecord) {
    if (flag === null) {
      toast.success(t("stations:toast.created"));
      void navigate({
        to: "/admin/stations/$id",
        params: { id: String(station.id) },
        search: EDITOR_STATION_SEARCH,
        replace: true,
        ignoreBlocker: true,
      });
      return;
    }
    toast.success(t("observationFlags.createStation.created", { id: flag.id }));
    void navigate({ to: "/admin/observation-flags", search: { flag: flag.id }, replace: true, ignoreBlocker: true });
  }

  function createStation(reveal: RevealField) {
    const { session } = edit;
    const built = buildStationCreate(session, findDraftOwner(session.draft, edit.lookups.operatorsById));
    if (edit.hasErrors || built.body === null) {
      feedback.reportBlockedSave();
      return;
    }

    const body = built.body;
    createMutation.mutate(
      { body, idempotencyKey: takeIdempotencyKey(body) },
      {
        onSuccess: leaveAfterCreate,
        onError: (error) => {
          const found = readQueueConflict(error);
          if (found === null) feedback.reportFailedSave(error, built, session, reveal);
          else setConflict(found);
        },
      },
    );
  }

  function goBack() {
    void navigate({ to: "/admin/observation-flags/sites/$id", params: { id: String(site.id) }, search: { flag: flag?.id } });
  }

  let siteIdHint: string | null = null;
  if (draft.station.siteId.trim() !== "") siteIdHint = t("observationFlags.createStation.siteIdHint.withId");
  else if (nodeName !== null) siteIdHint = t("observationFlags.createStation.siteIdHint.withoutId", { name: nodeName });

  const subtitleKey = flag === null ? "observationFlags.createStation.linksSites" : "observationFlags.createStation.closesFlagAndLinksSites";
  const hasSuggestedCells = (suggestion?.cells?.length ?? 0) > 0;
  const azimuthsText =
    prefill.sectors.length > 0 ? t("observationFlags.createStation.azimuthsMeasured") : t("observationFlags.createStation.azimuthsNone");
  const estimatePoint = site.latitude === null || site.longitude === null ? null : { latitude: site.latitude, longitude: site.longitude };

  const cards: EditPageCard[] = [
    {
      id: "station",
      label: t("common:labels.station"),
      scopes: ["station"],
      node: (
        <StationCard
          edit={edit}
          stationId={null}
          siteIdHint={
            siteIdHint === null ? undefined : (
              <p className={NOTE_CLASS}>
                <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{siteIdHint}</span>
              </p>
            )
          }
        />
      ),
    },
    {
      id: "place",
      label: t("common:labels.location"),
      scopes: ["place"],
      node: (
        <LocationCard
          edit={edit}
          mapOverlay={
            estimatePoint === null ? null : (
              <EstimateOverlay latitude={estimatePoint.latitude} longitude={estimatePoint.longitude} radiusMeters={radiusMeters} />
            )
          }
        />
      ),
    },
    {
      id: "sectors",
      label: t("common:labels.azimuths"),
      count: draft.sectors.length,
      scopes: ["sector"],
      node: <AzimuthsCard edit={edit} stationId={null} />,
    },
  ];

  return (
    <EditPage
      kind="editor"
      actions={
        <EditorTopBar
          edit={edit}
          changes={edit.changes}
          blockedSaves={feedback.blockedSaves}
          isNewStation
          isSaving={isBusy}
          isLocked={isBusy || conflict !== null}
          onSave={createStation}
          onRevert={() => edit.dispatch({ type: "reset" })}
        />
      }
      head={
        <EditPageHead
          operator={findHeadOperator(draft.station.operatorId, edit.lookups, null)}
          badges={
            <span className="inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground">
              {t("observationFlags.createStation.fromSite", { name: siteName })}
            </span>
          }
          subtitle={t(subtitleKey, { count: groupNames.length, names, id: flag?.id })}
          onBack={goBack}
        />
      }
      strips={
        <>
          {isSwitchedOff ? (
            <div className="shrink-0 border-b px-4 py-2">
              <MeasurementsOffNotice />
            </div>
          ) : null}
          {conflict === null ? null : <ConflictStrip conflict={conflict} place="station" />}
        </>
      }
      cards={cards}
      cells={
        <div className="flex flex-col gap-2">
          <EditorCells edit={edit} />
          {hasSuggestedCells ? (
            <p className={NOTE_CLASS}>
              <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                {t("observationFlags.createStation.cellsSource", { count: groupNames.length, names })}. {azimuthsText}
              </span>
            </p>
          ) : null}
        </div>
      }
      cellCount={countDraftCells(edit.counters)}
      cellsLead={<AzimuthSummary edit={edit} />}
    />
  );
}

function SiteLoader({ observedSiteId, flagId, pickedPoint, access }: SiteLoaderProps) {
  const queryClient = useQueryClient();
  const reference = useEditReference();
  const siteQuery = useQuery(observedSiteQueryOptions(observedSiteId));
  const flagQuery = useQuery(flagQueryOptions(flagId));
  const site = siteQuery.data;
  const isFlagGone = flagQuery.isError && (isNotFound(flagQuery.error) || isForbidden(flagQuery.error));
  const flag = isFlagGone ? null : (flagQuery.data ?? null);
  const isFlagLoading = flagId !== null && flagQuery.isPending && !isFlagGone;

  if (siteQuery.isError && site === undefined) {
    if (isNotFound(siteQuery.error) || isForbidden(siteQuery.error)) return <MissingSite flagId={flagId} />;
    return <PageErrorState onRetry={() => void siteQuery.refetch()} isRetrying={siteQuery.isFetching} />;
  }
  if (flagQuery.isError && !isFlagGone && flagQuery.data === undefined) {
    return <PageErrorState onRetry={() => void flagQuery.refetch()} isRetrying={flagQuery.isFetching} />;
  }
  if (reference.hasFailed) return <PageErrorState onRetry={() => void retryEditLookups(queryClient, null, reference)} />;
  if (site === undefined || isFlagLoading || !reference.isReady) return <PageSkeleton />;
  if (!canEditPlace(access.area, { countryCode: site.countryCode, regionId: site.regionId })) return <ForbiddenState />;

  const suggestion = readSuggestion(flag);
  return (
    <SiteStationEditor
      key={`${site.id}-${flag?.id ?? "site"}`}
      site={site}
      flag={flag}
      prefill={buildPrefill(site, suggestion, pickedPoint, reference)}
      suggestion={suggestion}
      isSwitchedOff={access.isSwitchedOff}
    />
  );
}

export function CreateStationPage({ observedSiteId, flagId, pickedPoint }: CreateStationPageProps) {
  const access = useFlagsAccess();

  if (access.state === "loading") return <PageSkeleton />;
  if (access.state !== "ready") return <FlagsAccessState access={access} className="m-3 flex-1" />;
  if (observedSiteId === null) return <MissingSite flagId={flagId} />;
  return <SiteLoader observedSiteId={observedSiteId} flagId={flagId} pickedPoint={pickedPoint} access={access} />;
}
