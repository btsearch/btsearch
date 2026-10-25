import { CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import type { ObservationFlag } from "@openbts/shared/contract";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { flagListQueryOptions } from "../api/flags";
import { invalidateFlagQueries } from "../api/keys";
import { type FlagsAccess, FlagsAccessState, FlagsAreaLine, MeasurementsOffNotice, useFlagsAccess } from "../components/flagsAccess";
import { showUndoToast } from "../components/undoToast";
import type { FlagOutcome } from "../detail/useFlagActions";
import type { QueueConflict } from "../model/conflicts";
import type { FlagTextContext } from "../model/flagText";
import { getKindLabel } from "../model/kinds";
import { DetailPane } from "./detailPane";
import { FlagList, type FlagListEmpty, type FlagListView } from "./flagList";
import { type QueueFiltersProps, QueueMobileRail, QueueStatusSwitch, QueueToolbar } from "./queueFilters";
import { type FlagsQueueCriteria, toFlagListParams } from "./queueSearch";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { Button } from "@/components/ui/button";
import { useNavActionTarget } from "@/contexts/navActions";
import { useUserSearchText } from "@/features/admin/users/components/list/useUserSearchText";
import { MobileFilterRailFloating, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { useListPanelScope } from "@/features/stations/list/data/listPanel";
import { useIsMobile } from "@/hooks/useMobile";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type FlagsQueuePageProps = {
  criteria: FlagsQueueCriteria;
  onCriteriaChange: (changes: Partial<FlagsQueueCriteria>) => void;
};

type FlagsQueueProps = FlagsQueuePageProps & {
  access: Extract<FlagsAccess, { state: "ready" }>;
};

type FlagConflict = { flagId: number; conflict: QueueConflict };

type PageHeaderProps = {
  access: FlagsAccess;
  aside?: ReactNode;
};

const NO_FLAGS: ObservationFlag[] = [];
const FILTER_SEPARATOR = " · ";

function countActiveFilters(criteria: FlagsQueueCriteria): number {
  const isStationFiltered = criteria.station !== "" || criteria.stationIds.length > 0;
  return (
    [criteria.kinds, criteria.countryCodes, criteria.regionIds, criteria.operatorIds].filter((values) => values.length > 0).length +
    Number(isStationFiltered)
  );
}

function describeFilters(criteria: FlagsQueueCriteria, ctx: FlagTextContext): string {
  const { t, language, lookups } = ctx;
  const parts: string[] = [];
  if (criteria.kinds.length > 0) {
    parts.push(`${t("observationFlags.filters.kind")}: ${criteria.kinds.map((kind) => getKindLabel(kind, t)).join(", ")}`);
  }
  if (criteria.countryCodes.length > 0) {
    parts.push(`${t("main:filters.country")}: ${criteria.countryCodes.map((code) => getCountryName(code, language)).join(", ")}`);
  }
  if (criteria.regionIds.length > 0) {
    const names = criteria.regionIds.map((regionId) => lookups?.regionsById.get(regionId)?.name ?? String(regionId));
    parts.push(`${t("common:labels.region")}: ${names.join(", ")}`);
  }
  if (criteria.operatorIds.length > 0) {
    const names = criteria.operatorIds.map((operatorId) => lookups?.operatorsById.get(operatorId)?.operator?.name ?? String(operatorId));
    parts.push(`${t("common:labels.operator")}: ${names.join(", ")}`);
  }
  if (criteria.station !== "") {
    parts.push(`${t("common:labels.station")}: ${criteria.station}`);
  } else if (criteria.stationIds.length > 0) {
    parts.push(`${t("common:labels.station")}: ${criteria.stationIds.map((stationId) => `#${stationId}`).join(", ")}`);
  }
  return parts.join(FILTER_SEPARATOR);
}

function PageHeader({ access, aside }: PageHeaderProps) {
  const { t } = useTranslation("nav");

  return (
    <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{t("items.observationFlags")}</h1>
        <FlagsAreaLine access={access} />
      </div>
      {aside}
    </header>
  );
}

function FlagsQueue({ access, criteria, onCriteriaChange }: FlagsQueueProps) {
  const { t, i18n } = useTranslation(["admin", "common", "main"]);
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const navActionTarget = useNavActionTarget();
  const scope = useListPanelScope(criteria.countryCodes, true);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<number>>(() => new Set());
  const [flagConflict, setFlagConflict] = useState<FlagConflict | null>(null);
  const {
    text: stationText,
    changeText: changeStationText,
    clearText: clearStationText,
  } = useUserSearchText(criteria.station, (station) => onCriteriaChange({ station, stationIds: [], flagId: null }));
  const listQuery = useInfiniteQuery(flagListQueryOptions(toFlagListParams(criteria)));

  const ctx: FlagTextContext = { t, language: i18n.language, lookups: scope.lookups };
  const pages = listQuery.data?.pages ?? [];
  const loadedFlags = pages.flatMap((page) => page.data);
  const flags = loadedFlags.length === 0 ? NO_FLAGS : loadedFlags.filter((flag) => !hiddenIds.has(flag.id));
  const counts = pages[0]?.counts;
  const hiddenCount = loadedFlags.length - flags.length;
  const statusTotal = counts?.statuses[criteria.status];
  const openTotal = counts?.statuses.open;
  const openCount = openTotal === undefined ? null : Math.max(0, openTotal - (criteria.status === "open" ? hiddenCount : 0));
  const total = statusTotal === undefined ? null : Math.max(0, statusTotal - hiddenCount);
  const hasRows = flags.length > 0;
  const listedFlag = criteria.flagId === null ? undefined : flags.find((flag) => flag.id === criteria.flagId);
  const activeFilterCount = countActiveFilters(criteria);
  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isDetailShownAlone = isMobile && criteria.flagId !== null;

  let view: FlagListView = "rows";
  if (listQuery.isLoading) view = "loading";
  else if (listQuery.isError && !hasRows) view = "error";
  else if (!hasRows) view = "empty";

  function clearFilters() {
    clearStationText();
    onCriteriaChange({ kinds: [], countryCodes: [], regionIds: [], operatorIds: [], station: "", stationIds: [], flagId: null });
  }

  function getEmpty(): FlagListEmpty {
    if (activeFilterCount > 0) {
      return {
        title: t("observationFlags.list.filteredEmpty"),
        description: describeFilters(criteria, ctx),
        icon: InformationCircleIcon,
        action: (
          <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={clearFilters}>
            {t("common:actions.clearAll")}
          </Button>
        ),
      };
    }
    if (criteria.status !== "open") {
      return { title: t(`observationFlags.list.empty.${criteria.status}`), description: null, icon: InformationCircleIcon, action: null };
    }
    return {
      title: t("admin:dashboard.queueClear"),
      description: t(access.area.coversEverything ? "observationFlags.list.emptyEverywhere" : "observationFlags.list.emptyArea"),
      icon: CheckmarkCircle02Icon,
      action: null,
    };
  }

  function selectFlag(flagId: number | null) {
    setFlagConflict(null);
    onCriteriaChange({ flagId });
  }

  function refresh() {
    void invalidateFlagQueries(queryClient, criteria.flagId === null ? [] : [criteria.flagId]);
  }

  function showAgain(flagIds: readonly number[]) {
    setHiddenIds((current) => new Set([...current].filter((flagId) => !flagIds.includes(flagId))));
    const [firstId] = flagIds;
    if (firstId !== undefined) selectFlag(firstId);
  }

  function handleOutcome({ flagIds, message, undo }: FlagOutcome) {
    const nextHidden = new Set([...hiddenIds, ...flagIds]);
    const position = flags.findIndex((flag) => flag.id === criteria.flagId);
    const next = flags.slice(position + 1).find((flag) => !nextHidden.has(flag.id)) ?? flags.find((flag) => !nextHidden.has(flag.id)) ?? null;
    setHiddenIds(nextHidden);
    selectFlag(isMobile || next === null ? null : next.id);
    if (undo === null) toast.success(message);
    else showUndoToast(message, t("observationFlags.actions.undo"), undo, () => showAgain(flagIds));
  }

  const filterProps: QueueFiltersProps = {
    criteria,
    kindCounts: counts?.kinds,
    isAdmin: access.isAdmin,
    stationText,
    activeFilterCount,
    scope,
    onCriteriaChange,
    onStationTextChange: changeStationText,
    onClearFilters: clearFilters,
  };
  const mobileRail = isMobile ? <QueueMobileRail {...filterProps} openCount={openCount} /> : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 pt-3 pb-3 max-md:pb-0">
      <PageHeader
        access={access}
        aside={isMobile ? null : <QueueStatusSwitch criteria={criteria} openCount={openCount} onCriteriaChange={onCriteriaChange} />}
      />
      {access.isAdmin && access.isSwitchedOff ? <MeasurementsOffNotice /> : null}
      {isMobile ? null : <QueueToolbar {...filterProps} />}
      {isMobile && !hasFloatingMobileFilters && !isDetailShownAlone ? <MobileFilterRailInline>{mobileRail}</MobileFilterRailInline> : null}

      <div className={cn("flex min-h-0 flex-1 gap-3", hasFloatingMobileFilters && !isDetailShownAlone ? "max-md:mb-10" : null)}>
        {isDetailShownAlone ? null : (
          <FlagList
            status={criteria.status}
            flags={flags}
            total={total}
            view={view}
            empty={getEmpty()}
            selectedFlagId={criteria.flagId}
            sort={criteria.sort}
            hasStaleRows={listQuery.isError && hasRows}
            isFetching={listQuery.isFetching}
            hasMore={listQuery.hasNextPage}
            isFetchingMore={listQuery.isFetchingNextPage}
            ctx={ctx}
            className={isMobile ? "flex-1" : "w-[440px] shrink-0"}
            onSortChange={(sort) => onCriteriaChange({ sort })}
            onSelect={selectFlag}
            onShowMore={() => void listQuery.fetchNextPage()}
            onRetry={() => void listQuery.refetch()}
          />
        )}
        {isMobile && !isDetailShownAlone ? null : (
          <div className="relative min-w-0 flex-1">
            <DetailPane
              flagId={criteria.flagId}
              listedFlag={listedFlag}
              conflict={flagConflict !== null && flagConflict.flagId === criteria.flagId ? flagConflict.conflict : null}
              onConflict={(conflict) => setFlagConflict(conflict === null || criteria.flagId === null ? null : { flagId: criteria.flagId, conflict })}
              onClose={() => selectFlag(null)}
              onOutcome={handleOutcome}
              onShowFlag={selectFlag}
              onRefresh={refresh}
            />
          </div>
        )}
      </div>

      {hasFloatingMobileFilters && navActionTarget && !isDetailShownAlone ? (
        <MobileFilterRailFloating target={navActionTarget}>{mobileRail}</MobileFilterRailFloating>
      ) : null}
    </div>
  );
}

export function FlagsQueuePage({ criteria, onCriteriaChange }: FlagsQueuePageProps) {
  const access = useFlagsAccess();

  if (access.state === "ready") return <FlagsQueue access={access} criteria={criteria} onCriteriaChange={onCriteriaChange} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <PageHeader access={access} />
      <FlagsAccessState access={access} className="min-h-0 flex-1 rounded-xl" />
    </div>
  );
}
