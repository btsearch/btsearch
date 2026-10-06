import { ArrowLeft01Icon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ForbiddenState } from "@/components/auth/requireRole";
import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { NewStationEditor, SavedStationEditor } from "@/features/admin/stations/components/stationEditorPage";
import { registerStationPermitsQueryOptions } from "@/features/admin/stations/queries";
import { groupPermitsByStation } from "@/features/map/utils";
import { stationRecordQueryOptions } from "@/features/station-details/station/api";
import { retryEditLookups, useEditReference } from "@/features/station-editing/data/lookups";
import { pickFreshData } from "@/features/station-editing/hooks/useStationDraft";
import { REGISTER_PREFILL_RULES, toRegisterStationDraft } from "@/features/station-editing/model/registerPrefill";
import { canEditPlace, getStationEditPlace, useEditorArea } from "@/features/stations/list/data/editorArea";
import { isNotFound } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

type SavedStationRouteProps = {
  id: string;
};

type NewStationRouteProps = {
  registerStationId?: string;
};

type StationLoadFailureProps = {
  isMissing: boolean;
  isRetrying: boolean;
  onRetry: () => void;
};

const NEW_STATION_ID = "new";

function EditorSkeleton() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 border-b bg-background">
        <div className="px-4 py-2">
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
        <div className="flex items-center gap-3 border-t border-border/50 px-4 py-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-5 w-56 max-w-full rounded-md" />
            <Skeleton className="h-4 w-96 max-w-full rounded-md" />
          </div>
          <Skeleton className="h-6 w-40 rounded-md max-md:w-14" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="w-full lg:flex-2">
            <Skeleton className="h-52 w-full rounded-xl" />
          </div>
          <div className="w-full lg:flex-3 space-y-3">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StationLoadFailure({ isMissing, isRetrying, onRetry }: StationLoadFailureProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const backButton = (
    <Button variant={isMissing ? "default" : "outline"} nativeButton={false} render={<Link to="/admin/stations" />}>
      <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
      {t("common:actions.back")}
    </Button>
  );

  if (isMissing) {
    return (
      <PageErrorState
        tone="neutral"
        icon={SearchRemoveIcon}
        title={t("page.stationNotFoundTitle")}
        description={t("page.stationNotFoundDescription")}
        action={backButton}
      />
    );
  }
  return (
    <PageErrorState
      title={t("page.stationUnavailableTitle")}
      description={t("common:error.tryLater")}
      onRetry={onRetry}
      isRetrying={isRetrying}
      action={backButton}
    />
  );
}

function SavedStationRoute({ id }: SavedStationRouteProps) {
  const [openedAt] = useState(Date.now);
  const stationId = Number(id);
  const hasStationId = Number.isSafeInteger(stationId) && stationId > 0;
  const { area, isError: hasAreaFailed, isRetrying: isRetryingArea, retry: retryArea } = useEditorArea();
  const {
    data: record,
    dataUpdatedAt,
    error,
    isFetching,
    isFetchedAfterMount,
    refetch,
  } = useQuery({ ...stationRecordQueryOptions(stationId), enabled: hasStationId, staleTime: 0 });
  const freshRecord = pickFreshData(record, dataUpdatedAt, openedAt);

  if (hasAreaFailed) return <PageErrorState onRetry={retryArea} isRetrying={isRetryingArea} />;
  if (hasStationId && (area === undefined || (freshRecord === null && !isFetchedAfterMount))) return <EditorSkeleton />;
  if (freshRecord === null || area === undefined) {
    return <StationLoadFailure isMissing={!hasStationId || isNotFound(error)} isRetrying={isFetching} onRetry={() => void refetch()} />;
  }
  if (!canEditPlace(area, getStationEditPlace(freshRecord))) return <ForbiddenState />;

  return <SavedStationEditor key={freshRecord.id} record={freshRecord} />;
}

function NewStationRoute({ registerStationId }: NewStationRouteProps) {
  const reference = useEditReference();
  const { data: permits, isLoading: isLoadingPermits } = useQuery(registerStationPermitsQueryOptions(registerStationId));
  const isLoadingPrefill = isLoadingPermits || (permits !== undefined && !reference.isReady && !reference.hasFailed);

  function retryPermits() {
    return queryClient.refetchQueries({ queryKey: registerStationPermitsQueryOptions(registerStationId).queryKey, exact: true });
  }

  if (isLoadingPrefill) return <EditorSkeleton />;
  if (registerStationId !== undefined && permits === undefined) return <PageErrorState onRetry={retryPermits} />;
  if (permits !== undefined && reference.hasFailed) return <PageErrorState onRetry={() => retryEditLookups(queryClient, null)} />;

  const registerStation = permits === undefined ? undefined : groupPermitsByStation(permits).at(0);
  const prefill = registerStation === undefined ? undefined : toRegisterStationDraft(registerStation, reference, REGISTER_PREFILL_RULES.editor);
  return <NewStationEditor key={registerStationId ?? NEW_STATION_ID} prefill={prefill} />;
}

function StationEditorRoute() {
  const { id } = Route.useParams();
  const { uke } = Route.useSearch();

  if (id === NEW_STATION_ID) return <NewStationRoute registerStationId={uke} />;
  return <SavedStationRoute key={id} id={id} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/stations/$id")({
  component: StationEditorRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    uke: typeof search.uke === "string" || typeof search.uke === "number" ? String(search.uke) : undefined,
  }),
  staticData: {
    mainClassName: "overflow-hidden max-md:pb-0",
    titleKey: "breadcrumbs.editStation",
    i18nNamespace: "admin",
    breadcrumbs: [
      { titleKey: "sections.admin", path: "/admin/stations", i18nNamespace: "nav" },
      { titleKey: "items.stations", path: "/admin/stations", i18nNamespace: "nav" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
