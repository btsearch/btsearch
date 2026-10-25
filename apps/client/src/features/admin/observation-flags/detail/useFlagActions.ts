import type { CellApply, MeasurementReadingBlockCreate, ObservationFlag, ObservedSite } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { updateFlag } from "../api/flags";
import { invalidateFlagQueries, observationFlagKeys } from "../api/keys";
import { invalidateSiteQueries, updateObservedSite } from "../api/sites";
import { type QueueConflict, reportQueueError } from "../model/conflicts";
import type { FlagOfKind } from "../model/kinds";
import { invalidateReadingBlockQueries } from "@/features/admin/measurements/api/keys";
import { createReadingBlock } from "@/features/admin/measurements/api/readingBlocks";
import { addBandToPlan } from "@/features/admin/reference/api/bandPlan";
import { invalidateBandPlan } from "@/features/admin/reference/api/queryKeys";
import { useSaveStationMutation } from "@/features/admin/stations/mutations";
import { createConservativeStationImpact, invalidateStationUpdateQueries } from "@/features/admin/stations/queries";
import { applyAnalyzerChanges } from "@/features/analyzer/batch/data/requests";
import { createAuditOperationHandle } from "@/lib/api";

export type FlagOutcome = {
  flagIds: readonly number[];
  message: string;
  undo: (() => Promise<unknown>) | null;
};

type FlagActionsArgs = {
  onOutcome: (outcome: FlagOutcome) => void;
  onConflict: (conflict: QueueConflict) => void;
};

type BandApply = { flagId: number; countryCode: string; bandId: number; band: string };
type BlockApply = { flagId: number; block: MeasurementReadingBlockCreate };

export function useFlagActions({ onOutcome, onConflict }: FlagActionsArgs) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const saveStation = useSaveStationMutation();

  function fail(error: unknown): void {
    reportQueueError(error, onConflict);
  }

  function closeFlags(flagIds: readonly number[], message: string): void {
    void invalidateFlagQueries(queryClient, flagIds);
    onOutcome({ flagIds, message, undo: null });
  }

  const cellsMutation = useMutation({
    mutationFn: (body: CellApply[]) => applyAnalyzerChanges(body, createAuditOperationHandle()),
    onSuccess: (answer, body) => {
      for (const item of body) invalidateStationUpdateQueries(queryClient, createConservativeStationImpact(item.stationId));
      void queryClient.invalidateQueries({ queryKey: observationFlagKeys.lists(), refetchType: "none" });
      const flagIds = answer.data.flatMap((item) => item.closedObservationFlagIds);
      const message = flagIds.length > 1 ? t("observationFlags.toasts.appliedMany", { count: flagIds.length }) : t("observationFlags.toasts.applied");
      onOutcome({ flagIds, message, undo: null });
    },
    onError: fail,
  });

  const bandMutation = useMutation({
    mutationFn: ({ countryCode, bandId }: BandApply) => addBandToPlan(countryCode, bandId, createAuditOperationHandle()),
    onSuccess: (_result, { countryCode, band, flagId }) => {
      void invalidateBandPlan(queryClient, countryCode);
      closeFlags([flagId], t("observationFlags.toasts.bandAdded", { band }));
    },
    onError: fail,
  });

  const blockMutation = useMutation({
    mutationFn: ({ block }: BlockApply) => createReadingBlock(block),
    onSuccess: (_block, { flagId }) => {
      void invalidateReadingBlockQueries(queryClient);
      closeFlags([flagId], t("observationFlags.toasts.blockAdded"));
    },
    onError: fail,
  });

  const reopenMutation = useMutation({
    mutationFn: (flag: ObservationFlag) => updateFlag(flag.id, { status: "open" }),
    onSuccess: (flag) => closeFlags([flag.id], t("observationFlags.toasts.reopened")),
    onError: fail,
  });

  function applySiteId(flag: FlagOfKind<"siteIdKnown">): void {
    if (flag.stationId === null || flag.suggestion === null) return;
    saveStation.mutate(
      { stationId: flag.stationId, body: { station: { siteId: flag.suggestion.siteId } }, previousLocationId: flag.station?.location?.id ?? null },
      {
        onSuccess: () => closeFlags([flag.id], t("observationFlags.toasts.siteIdSaved")),
        onError: fail,
      },
    );
  }

  function applyBand(flag: FlagOfKind<"bandNotInPlan">, band: string): void {
    if (flag.countryCode === null || flag.suggestion === null) return;
    bandMutation.mutate({ flagId: flag.id, countryCode: flag.countryCode, bandId: flag.suggestion.bandId, band });
  }

  function addReadingBlock(flag: FlagOfKind<"readerQuirk">, reason: string): void {
    if (flag.suggestion === null) return;
    blockMutation.mutate({ flagId: flag.id, block: { ...flag.suggestion.readingBlock, reason, refold: false } });
  }

  function afterDismiss(flag: ObservationFlag): void {
    void invalidateFlagQueries(queryClient, [flag.id]);
    onOutcome({
      flagIds: [flag.id],
      message: t("observationFlags.toasts.dismissed"),
      undo: async () => {
        await updateFlag(flag.id, { status: "open" });
        await invalidateFlagQueries(queryClient, [flag.id]);
      },
    });
  }

  function afterSiteChange(flag: ObservationFlag, message: string, undoChange: () => Promise<unknown>): void {
    void invalidateSiteQueries(queryClient);
    onOutcome({
      flagIds: [flag.id],
      message,
      undo: async () => {
        await undoChange();
        await invalidateSiteQueries(queryClient);
      },
    });
  }

  function afterIgnore(flag: ObservationFlag, site: ObservedSite): void {
    afterSiteChange(flag, t("observationFlags.toasts.ignored"), () => updateObservedSite(site.id, { ignore: null }));
  }

  function afterLink(flag: ObservationFlag, site: ObservedSite, stationLabel: string): void {
    afterSiteChange(flag, t("observationFlags.toasts.linked", { station: stationLabel }), () => updateObservedSite(site.id, { handLink: null }));
  }

  return {
    applyCells: (body: CellApply[]) => cellsMutation.mutate(body),
    applySiteId,
    applyBand,
    addReadingBlock,
    reopen: (flag: ObservationFlag) => reopenMutation.mutate(flag),
    afterDismiss,
    afterIgnore,
    afterLink,
    isPending: cellsMutation.isPending || bandMutation.isPending || blockMutation.isPending || saveStation.isPending || reopenMutation.isPending,
  };
}
