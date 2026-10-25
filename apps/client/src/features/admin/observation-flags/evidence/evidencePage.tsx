import { Link04Icon, PlusSignIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservedSite, ObservedSiteEvidence, ObservedSiteUpdate } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { flagQueryOptions } from "../api/flags";
import { invalidateSiteQueries, siteEvidenceQueryOptions, siteGroupQueryOptions, updateObservedSite } from "../api/sites";
import { ConflictStrip } from "../components/conflictStrip";
import { IgnoreSiteDialog } from "../components/dialogs/ignoreSiteDialog";
import { LinkSiteDialog, type StationChoice, toStationChoice } from "../components/dialogs/linkSiteDialog";
import { type FlagsAccess, FlagsAccessState, MeasurementsOffNotice, useFlagsAccess } from "../components/flagsAccess";
import { showUndoToast } from "../components/undoToast";
import { type QueueConflict, isForbidden, reportQueueError } from "../model/conflicts";
import { formatSiteLabel, formatStationLabel, listOtherSiteNames } from "../model/format";
import { EvidenceHeader } from "./evidenceHeader";
import { EvidenceMap } from "./evidenceMap";
import { EvidencePanel } from "./evidencePanel";
import { EVIDENCE_PAGE_CLASS, EvidenceSkeleton, EvidenceStatePage, MissingSite } from "./evidenceStates";
import { type EvidenceTextContext, describeSiteForDialog, listEvidenceFacts, summarizePlace } from "./evidenceText";
import { type PlaceChoice, listPlaceChoices, pickDefaultChoiceKey } from "./placeChoices";
import { SiteStatusStrip } from "./siteStatusStrip";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useCrowdAccess } from "@/features/map/crowd/access/useCrowdAccess";
import { observedSiteQueryOptions } from "@/features/map/crowd/api/observedQueries";
import { useMapLookups } from "@/features/map/data/mapLookups";
import { stationRecordQueryOptions } from "@/features/station-details/station/api";
import { useNavMode, usePreferences } from "@/hooks/usePreferences";
import { isNotFound } from "@/lib/api";
import { cn } from "@/lib/utils";

type EvidencePageProps = {
  observedSiteId: number | null;
  flagId: number | null;
};

type EvidenceViewProps = {
  observedSiteId: number;
  flagId: number | null;
  access: Extract<FlagsAccess, { state: "ready" }>;
};

type LoadedEvidenceProps = EvidenceViewProps & {
  site: ObservedSite;
  evidence: ObservedSiteEvidence;
  onRefresh: () => void;
};

type SiteDialog = "ignore" | "link" | null;

const OPEN_SITE_STATUSES = new Set<ObservedSite["status"]>(["unmatched", "suggested"]);
const NO_GROUP: ObservedSite[] = [];

function readLinkedStationId(site: ObservedSite): number | null {
  if (site.status === "suggested") return site.suggestedStationId;
  if (site.status === "matched") return site.matchedStationId;
  return null;
}

function listGroupIds(site: ObservedSite, evidence: ObservedSiteEvidence): number[] {
  if (site.groupId === null) return [];
  const ids = new Set([site.id]);
  for (const cell of evidence.cells) if (cell.observedSiteId !== null) ids.add(cell.observedSiteId);
  return [...ids];
}

function LoadedEvidence({ observedSiteId, flagId, access, site, evidence, onRefresh }: LoadedEvidenceProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const navMode = useNavMode();
  const { preferences } = usePreferences();
  const { lookups } = useMapLookups();
  const { isStaff } = useCrowdAccess();
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<SiteDialog>(null);
  const [conflict, setConflict] = useState<QueueConflict | null>(null);
  const linkedStationId = readLinkedStationId(site);
  const flagQuery = useQuery(flagQueryOptions(flagId));
  const groupQuery = useQuery(siteGroupQueryOptions(listGroupIds(site, evidence)));
  const linkedStationQuery = useQuery({ ...stationRecordQueryOptions(linkedStationId ?? 0), enabled: linkedStationId !== null });
  const restoreMutation = useMutation({
    mutationFn: (change: ObservedSiteUpdate) => updateObservedSite(observedSiteId, change),
    onMutate: () => setConflict(null),
    onSuccess: (_, change) => {
      const key = "ignore" in change ? "observationFlags.evidence.toasts.restored" : "observationFlags.evidence.toasts.unlinked";
      toast.success(t(key, { name: formatSiteLabel(site, lookups) }));
      void invalidateSiteQueries(queryClient);
    },
    onError: (error) => reportQueueError(error, setConflict),
  });

  const ctx: EvidenceTextContext = { t, language: i18n.language, lookups, gpsFormat: preferences.gpsFormat };
  const siteName = formatSiteLabel(site, lookups);
  const groupNames = listOtherSiteNames(site.id, groupQuery.data ?? NO_GROUP);
  const choices = listPlaceChoices(evidence, ctx);
  const shownKey = choices.some((choice) => choice.key === chosenKey) ? chosenKey : pickDefaultChoiceKey(evidence, choices);
  const chosen: PlaceChoice | null = choices.find((choice) => choice.key === shownKey) ?? null;
  const summary = summarizePlace(evidence, ctx);
  const linkedStation = linkedStationQuery.data;
  const linkedStationLabel = linkedStation === undefined ? `#${linkedStationId ?? ""}` : formatStationLabel(linkedStation);
  const suggestedStation: StationChoice | null = site.status === "suggested" && linkedStation !== undefined ? toStationChoice(linkedStation) : null;
  const isPrimary = site.copyOfObservedSiteId === null && site.node !== "station";
  const canDecide = isPrimary && OPEN_SITE_STATUSES.has(site.status);
  const isCreating = canDecide && site.status === "unmatched";
  const createChoice = isCreating ? chosen : null;

  function goBackToQueue() {
    void navigate({ to: "/admin/observation-flags", search: flagId === null ? {} : { flag: flagId } });
  }

  function finishDecision(message: string, undo: ObservedSiteUpdate, undoneMessage: string) {
    setDialog(null);
    void invalidateSiteQueries(queryClient);
    showUndoToast(
      message,
      t("observationFlags.actions.undo"),
      () => updateObservedSite(observedSiteId, undo).finally(() => void invalidateSiteQueries(queryClient)),
      () => toast.success(undoneMessage),
    );
    goBackToQueue();
  }

  function handleIgnored() {
    const restored = t("observationFlags.evidence.toasts.restored", { name: siteName });
    finishDecision(t("observationFlags.evidence.toasts.ignored", { name: siteName }), { ignore: null }, restored);
  }

  function handleLinked(_: ObservedSite, station: StationChoice) {
    const unlinked = t("observationFlags.evidence.toasts.unlinked", { name: siteName });
    finishDecision(t("observationFlags.evidence.toasts.linked", { name: siteName, station: station.label }), { handLink: null }, unlinked);
  }

  function handleDialogConflict(found: QueueConflict) {
    setDialog(null);
    setConflict(found);
  }

  function createStation(choice: PlaceChoice) {
    void navigate({
      to: "/admin/observation-flags/sites/$id/station",
      params: { id: String(observedSiteId) },
      search: { flag: flagId ?? undefined, latitude: choice.latitude, longitude: choice.longitude },
    });
  }

  const footer = canDecide ? (
    <>
      {createChoice === null ? null : (
        <Button type="button" className="w-full cursor-pointer" onClick={() => createStation(createChoice)}>
          <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" aria-hidden="true" />
          <span className="truncate">{createChoice.createLabel}</span>
        </Button>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="min-w-0 flex-1 cursor-pointer" onClick={() => setDialog("ignore")}>
          <HugeiconsIcon icon={ViewOffSlashIcon} data-icon="inline-start" aria-hidden="true" />
          {t("observationFlags.actions.ignore")}
        </Button>
        <Button type="button" variant="outline" className="min-w-0 flex-1 cursor-pointer" onClick={() => setDialog("link")}>
          <HugeiconsIcon icon={Link04Icon} data-icon="inline-start" aria-hidden="true" />
          {t("observationFlags.actions.link")}
        </Button>
      </div>
    </>
  ) : null;

  return (
    <div className={EVIDENCE_PAGE_CLASS}>
      <EvidenceHeader site={site} flagId={flagId} flag={flagQuery.data} groupNames={groupNames} isAmbiguous={summary.isAmbiguous} />
      {access.isSwitchedOff ? (
        <div className="shrink-0 border-b px-3 py-2">
          <MeasurementsOffNotice />
        </div>
      ) : null}
      {conflict === null ? null : (
        <ConflictStrip
          conflict={conflict}
          place="review"
          onRefresh={() => {
            setConflict(null);
            onRefresh();
          }}
          onPickAnother={() => {
            setConflict(null);
            setDialog("link");
          }}
        />
      )}
      <SiteStatusStrip
        site={site}
        linkedStationId={linkedStationId}
        linkedStationLabel={linkedStationLabel}
        isRestoring={restoreMutation.isPending}
        onRestore={(change) => restoreMutation.mutate(change)}
      />
      <div className={cn("flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto", navMode === "floating" ? "max-md:pb-32" : null)}>
        <EvidenceMap
          evidence={evidence}
          choices={choices}
          chosenKey={shownKey}
          fallbackPoint={site.latitude === null || site.longitude === null ? null : { latitude: site.latitude, longitude: site.longitude }}
          isStaff={isStaff}
          isAdmin={access.isAdmin}
          onChoose={setChosenKey}
        />
        <EvidencePanel
          summary={summary}
          showsNotPublic={summary.isAmbiguous && !site.isPublic}
          choices={choices}
          chosenKey={shownKey}
          facts={listEvidenceFacts(site, ctx)}
          isChoosing={isCreating}
          footer={footer}
          onChoose={setChosenKey}
        />
      </div>
      {canDecide ? (
        <>
          <IgnoreSiteDialog
            site={site}
            details={describeSiteForDialog(site, groupNames, evidence.cells.length, ctx)}
            isGroup={groupNames.length > 0}
            open={dialog === "ignore"}
            onOpenChange={(open) => setDialog(open ? "ignore" : null)}
            onIgnored={handleIgnored}
            onConflict={handleDialogConflict}
          />
          <LinkSiteDialog
            site={site}
            suggestedStation={suggestedStation}
            open={dialog === "link"}
            onOpenChange={(open) => setDialog(open ? "link" : null)}
            onLinked={handleLinked}
            onConflict={handleDialogConflict}
          />
        </>
      ) : null}
    </div>
  );
}

function EvidenceView({ observedSiteId, flagId, access }: EvidenceViewProps) {
  const siteQuery = useQuery(observedSiteQueryOptions(observedSiteId));
  const evidenceQuery = useQuery(siteEvidenceQueryOptions(observedSiteId));
  const site = siteQuery.data;
  const evidence = evidenceQuery.data;
  const error = siteQuery.error ?? evidenceQuery.error;

  function refresh() {
    void siteQuery.refetch();
    void evidenceQuery.refetch();
  }

  if (site !== undefined && evidence !== undefined) {
    return <LoadedEvidence observedSiteId={observedSiteId} flagId={flagId} access={access} site={site} evidence={evidence} onRefresh={refresh} />;
  }
  if (error === null) return <EvidenceSkeleton />;
  if (isNotFound(error) || isForbidden(error)) return <MissingSite flagId={flagId} />;
  return (
    <EvidenceStatePage flagId={flagId}>
      <ErrorState className="min-h-0 flex-1" onRetry={refresh} isRetrying={siteQuery.isFetching || evidenceQuery.isFetching} />
    </EvidenceStatePage>
  );
}

export function EvidencePage({ observedSiteId, flagId }: EvidencePageProps) {
  const access = useFlagsAccess();

  if (access.state !== "ready") {
    return (
      <EvidenceStatePage flagId={flagId}>
        <FlagsAccessState access={access} className="min-h-0 flex-1 rounded-xl" />
      </EvidenceStatePage>
    );
  }
  if (observedSiteId === null) return <MissingSite flagId={flagId} />;
  return <EvidenceView key={observedSiteId} observedSiteId={observedSiteId} flagId={flagId} access={access} />;
}
