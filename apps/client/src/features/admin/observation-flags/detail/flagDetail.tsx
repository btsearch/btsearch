import { MapsLocation01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CellApplyChange, ObservationFlag, ObservedSite } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { stationFlagsQueryOptions } from "../api/flags";
import { siteGroupQueryOptions } from "../api/sites";
import { ConflictStrip } from "../components/conflictStrip";
import { DismissFlagDialog } from "../components/dialogs/dismissFlagDialog";
import { IgnoreSiteDialog } from "../components/dialogs/ignoreSiteDialog";
import { LinkSiteDialog, type StationChoice, toStationChoice } from "../components/dialogs/linkSiteDialog";
import { ReadingBlockDialog } from "../components/dialogs/readingBlockDialog";
import { type FieldEdits, applyEdits, hasInvalidEdit, listRatTables, toCellApply } from "../model/cellChanges";
import type { QueueConflict } from "../model/conflicts";
import { getFlagCompare, getFlagFacts } from "../model/flagFacts";
import { getFlagLead } from "../model/flagLead";
import { type FlagTextContext, getFlagSummary, getFlagTitle, getStationSubject } from "../model/flagText";
import { formatBand, listOtherSiteNames } from "../model/format";
import { getApplyRoute, getKindLabel, isAboutSite, isCellChangeFlag, showsEstimateMap } from "../model/kinds";
import { CellChangeTable } from "./cellChangeTable";
import { ChangeBox, buildChangeBox, getChangeTitle, getNoneText } from "./changeSection";
import { ClosedStrip } from "./closedStrip";
import { type ApplyCopy, describeReadingBlock, getApplyLabel, getCellsApplyCopy, listCellNotes } from "./detailText";
import { EstimateMiniMap } from "./estimateMiniMap";
import { FlagDetailFrame } from "./flagDetailFrame";
import { FlagSubjectBand, FlagTitleBar } from "./flagDetailHead";
import { FactsGrid, ValueCompare } from "./flagEvidence";
import { FlagFooter } from "./flagFooter";
import { type FlagOutcome, useFlagActions } from "./useFlagActions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMapLookups } from "@/features/map/data/mapLookups";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { stationRecordQueryOptions } from "@/features/station-details/station/api";

type FlagDetailProps = {
  flag: ObservationFlag;
  conflict: QueueConflict | null;
  onConflict: (conflict: QueueConflict | null) => void;
  onClose: () => void;
  onOutcome: (outcome: FlagOutcome) => void;
  onShowFlag: (flagId: number) => void;
  onRefresh: () => void;
};

type OpenDialog = "dismiss" | "ignore" | "link" | "cells" | "allCells" | "siteId" | "band" | "readingBlock";

type CellsBatch = { items: CellApplyChange[]; flagIds: number[] };

const MOST_FLAGS_PER_APPLY = 20;
const NO_FLAGS: ObservationFlag[] = [];
const NO_SITES: ObservedSite[] = [];
const NO_ITEMS: CellApplyChange[] = [];
const NO_GROUP_IDS: number[] = [];

function readSuggestedCells(flag: ObservationFlag): readonly CellApplyChange[] {
  if (!isCellChangeFlag(flag) || flag.suggestion === null) return NO_ITEMS;
  return flag.suggestion.cells;
}

function listGroupIds(flag: ObservationFlag): readonly number[] {
  if (flag.kind === "unmatchedSite" || flag.kind === "positionShifts") return flag.evidence.observedSiteIds;
  return NO_GROUP_IDS;
}

export function FlagDetail({ flag, conflict, onConflict, onClose, onOutcome, onShowFlag, onRefresh }: FlagDetailProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const { lookups } = useMapLookups();
  const [edits, setEdits] = useState<FieldEdits>({});
  const [openDialog, setOpenDialog] = useState<OpenDialog | null>(null);
  const isOpen = flag.status === "open";
  const needsStation = isCellChangeFlag(flag) && isOpen && flag.stationId !== null;
  const recordQuery = useQuery({ ...stationRecordQueryOptions(flag.stationId ?? 0), enabled: needsStation });
  const siblingsQuery = useQuery(stationFlagsQueryOptions(needsStation ? flag.stationId : null, flag.kind));
  const groupQuery = useQuery(siteGroupQueryOptions(listGroupIds(flag)));
  const actions = useFlagActions({ onOutcome: showOutcome, onConflict: showConflict });

  const ctx: FlagTextContext = { t, language: i18n.language, lookups };
  const items = readSuggestedCells(flag);
  const tables = listRatTables(items, recordQuery.data, edits);
  const editedItems = applyEdits(items, edits);
  const others = (siblingsQuery.data ?? NO_FLAGS).filter((other) => other.id !== flag.id && readSuggestedCells(other).length > 0);
  const batchedOthers = others.slice(0, MOST_FLAGS_PER_APPLY - 1);
  const groupNames = listOtherSiteNames(flag.observedSiteId, groupQuery.data ?? NO_SITES);
  const title = getFlagTitle(flag, ctx);
  const compare = getFlagCompare(flag, ctx);
  const box = buildChangeBox(flag, ctx);
  const noneText = tables.length > 0 || box !== null ? null : getNoneText(flag, t);
  const applyRoute = getApplyRoute(flag);
  const site = flag.observedSite ?? null;
  const stationLabel = getStationSubject(flag).text;
  const suggestedBand = flag.kind === "bandNotInPlan" ? (formatBand(flag.suggestion?.bandId, lookups, i18n.language) ?? "") : "";
  const isBusy = actions.isPending;
  const isTableLoading = needsStation && items.length > 0 && recordQuery.isLoading;
  const canApplyCells = applyRoute === "cells" && tables.length > 0 && !hasInvalidEdit(tables) && flag.stationId !== null;

  function showOutcome(outcome: FlagOutcome) {
    setOpenDialog(null);
    onOutcome(outcome);
  }

  function showConflict(next: QueueConflict) {
    setOpenDialog(null);
    onConflict(next);
  }

  function changeEdit(key: string, value: string) {
    setEdits((current) => ({ ...current, [key]: value }));
  }

  function listCellsBatch(includesOthers: boolean): CellsBatch {
    const otherFlags = includesOthers ? batchedOthers : NO_FLAGS;
    return {
      items: [...editedItems, ...otherFlags.flatMap(readSuggestedCells)],
      flagIds: [flag.id, ...otherFlags.map((other) => other.id)],
    };
  }

  function getApplyCopy(): ApplyCopy | null {
    if (openDialog === "cells" || openDialog === "allCells") {
      const { items: cells, flagIds } = listCellsBatch(openDialog === "allCells");
      return getCellsApplyCopy(cells.length, flagIds.length, stationLabel, t);
    }
    if (openDialog === "siteId" && flag.kind === "siteIdKnown") {
      return {
        title: t("observationFlags.apply.siteId.title"),
        description: t("observationFlags.apply.siteId.description", { siteId: flag.suggestion?.siteId ?? "" }),
        confirm: t("observationFlags.apply.siteId.confirm"),
      };
    }
    if (openDialog === "band" && flag.kind === "bandNotInPlan") {
      return {
        title: t("observationFlags.apply.band.title"),
        description: t("observationFlags.apply.band.description", { band: suggestedBand }),
        confirm: t("observationFlags.apply.band.confirm"),
      };
    }
    return null;
  }

  function confirmApply() {
    if ((openDialog === "cells" || openDialog === "allCells") && flag.stationId !== null) {
      const { items: cells, flagIds } = listCellsBatch(openDialog === "allCells");
      actions.applyCells(toCellApply(flag.stationId, cells, flagIds));
    } else if (openDialog === "siteId" && flag.kind === "siteIdKnown") {
      actions.applySiteId(flag);
    } else if (openDialog === "band" && flag.kind === "bandNotInPlan") {
      actions.applyBand(flag, suggestedBand);
    }
  }

  function openApply() {
    if (applyRoute !== null && applyRoute !== "station") setOpenDialog(applyRoute);
  }

  function handleLinked(linkedSite: ObservedSite, station: StationChoice) {
    setOpenDialog(null);
    actions.afterLink(flag, linkedSite, station.label);
  }

  let strip: ReactNode = null;
  if (conflict !== null) {
    strip = (
      <ConflictStrip
        conflict={conflict}
        place="review"
        onRefresh={() => {
          onConflict(null);
          onRefresh();
        }}
        onShowFlag={(flagId) => {
          onConflict(null);
          onShowFlag(flagId);
        }}
      />
    );
  } else if (!isOpen) {
    strip = <ClosedStrip flag={flag} isPending={isBusy} onReopen={() => actions.reopen(flag)} />;
  }

  const applyCopy = getApplyCopy();
  const lastTableIndex = tables.length - 1;

  return (
    <FlagDetailFrame label={title} head={<FlagTitleBar flag={flag} title={title} onClose={onClose} />}>
      {strip}
      <FlagSubjectBand flag={flag} groupNames={groupNames} ctx={ctx} />

      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <p className="text-sm leading-relaxed">{getFlagLead(flag, ctx)}</p>
        {compare === null ? null : <ValueCompare compare={compare} />}
        <FactsGrid
          title={t(isAboutSite(flag) ? "observationFlags.facts.titleSite" : "observationFlags.facts.title")}
          facts={getFlagFacts(flag, ctx)}
        />

        {showsEstimateMap(flag) && site !== null ? (
          <EstimateMiniMap
            flag={flag}
            site={site}
            ctx={ctx}
            action={
              <Link
                to="/admin/observation-flags/sites/$id"
                params={{ id: String(site.id) }}
                search={{ flag: flag.id }}
                className={buttonVariants({ variant: "outline", size: "sm", className: "bg-background" })}
              >
                <HugeiconsIcon icon={MapsLocation01Icon} data-icon="inline-start" aria-hidden="true" />
                {t("observationFlags.actions.evidenceOnMap")}
              </Link>
            }
          />
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{getChangeTitle(flag, t)}</h3>
          {isTableLoading ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : (
            tables.map((table, position) => (
              <CellChangeTable
                key={table.rat}
                table={table}
                stationLabel={stationLabel}
                showsNetworks={flag.kind === "networkMissing" || flag.kind === "networkNotSeen"}
                isReadOnly={!isOpen || isBusy}
                notes={position === lastTableIndex ? listCellNotes(flag, items, ctx) : []}
                onEdit={changeEdit}
              />
            ))
          )}
          {box === null ? null : <ChangeBox box={box} ctx={ctx} />}
          {noneText === null ? null : <p className="rounded-lg border border-dashed px-3.5 py-3 text-sm text-muted-foreground">{noneText}</p>}
        </section>

        {isOpen && others.length > 0 && applyRoute === "cells" ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{t("observationFlags.others.title", { count: others.length })}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={!canApplyCells || isBusy}
                onClick={() => setOpenDialog("allCells")}
              >
                <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" aria-hidden="true" />
                {t("observationFlags.others.applyAll", { count: batchedOthers.length + 1 })}
              </Button>
            </div>
            <ul className="overflow-hidden rounded-lg border">
              {others.map((other) => (
                <li key={other.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() => onShowFlag(other.id)}
                  >
                    <span className="font-mono text-xs text-muted-foreground">#{other.id}</span>
                    <span className="font-semibold text-foreground/80">{getKindLabel(other.kind, t)}</span>
                    <span className="min-w-0 truncate text-muted-foreground">{getFlagSummary(other, ctx)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <FlagFooter
        flag={flag}
        hasSite={site !== null}
        applyLabel={getApplyLabel(flag, editedItems.length, t)}
        isBusy={isBusy}
        isApplyDisabled={isBusy || isTableLoading || (applyRoute === "cells" && !canApplyCells)}
        onOpenDialog={setOpenDialog}
        onApply={openApply}
      />

      <DismissFlagDialog
        flagId={flag.id}
        open={openDialog === "dismiss"}
        onOpenChange={(open) => setOpenDialog(open ? "dismiss" : null)}
        onDismissed={(dismissedFlag) => {
          setOpenDialog(null);
          actions.afterDismiss(dismissedFlag);
        }}
        onConflict={showConflict}
      />
      {site === null ? null : (
        <>
          <IgnoreSiteDialog
            site={site}
            details={getFlagSummary(flag, ctx)}
            isGroup={site.groupId !== null}
            open={openDialog === "ignore"}
            onOpenChange={(open) => setOpenDialog(open ? "ignore" : null)}
            onIgnored={(ignoredSite) => {
              setOpenDialog(null);
              actions.afterIgnore(flag, ignoredSite);
            }}
            onConflict={showConflict}
          />
          <LinkSiteDialog
            site={site}
            suggestedStation={
              flag.kind === "suggestedSite" && flag.station !== null && flag.station !== undefined ? toStationChoice(flag.station) : null
            }
            open={openDialog === "link"}
            onOpenChange={(open) => setOpenDialog(open ? "link" : null)}
            onLinked={handleLinked}
            onConflict={showConflict}
          />
        </>
      )}
      <ConfirmDialog
        open={applyCopy !== null}
        onOpenChange={(open) => {
          if (!open && !isBusy) setOpenDialog(null);
        }}
        title={applyCopy?.title ?? ""}
        description={applyCopy?.description ?? ""}
        confirmLabel={applyCopy?.confirm ?? ""}
        pending={isBusy}
        destructive={false}
        onConfirm={confirmApply}
      />
      {flag.kind === "readerQuirk" ? (
        <ReadingBlockDialog
          open={openDialog === "readingBlock"}
          description={describeReadingBlock(flag, t)}
          isPending={isBusy}
          onOpenChange={(open) => setOpenDialog(open ? "readingBlock" : null)}
          onConfirm={(reason) => actions.addReadingBlock(flag, reason)}
        />
      ) : null}
    </FlagDetailFrame>
  );
}
