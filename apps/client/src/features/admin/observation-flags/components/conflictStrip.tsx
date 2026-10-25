import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { QueueConflict } from "../model/conflicts";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { StatusStrip } from "@/features/station-editing/components/frame/statusStrip";

type ConflictPlace = "review" | "station";

type ConflictStripProps = {
  conflict: QueueConflict;
  place: ConflictPlace;
  onRefresh?: () => void;
  onShowFlag?: (flagId: number) => void;
  onPickAnother?: () => void;
};

type StripText = { title: string; text: string };

type StripAction = { label: string; onClick: () => void } | { label: string; observedSiteId: number };

const ACTION_CLASS = "shrink-0 cursor-pointer";

function getStripText(conflict: QueueConflict, place: ConflictPlace, t: TFunction): StripText {
  const title = t(`observationFlags.conflicts.${conflict.kind}.title`);
  switch (conflict.kind) {
    case "flagClosed":
      return { title, text: t(`observationFlags.conflicts.flagClosed.${conflict.closedReason}`) };
    case "copy":
    case "stationSite":
      return { title, text: t(`observationFlags.conflicts.${conflict.kind}.${place === "station" ? "station" : "text"}`) };
    case "replaced":
      return { title, text: t("observationFlags.conflicts.replaced.text", { count: conflict.replacedByObservedSiteIds.length }) };
    case "openFlag":
      return { title, text: t("observationFlags.conflicts.openFlag.text", { id: conflict.observationFlagId }) };
    default:
      return { title, text: t(`observationFlags.conflicts.${conflict.kind}.text`) };
  }
}

export function ConflictStrip({ conflict, place, onRefresh, onShowFlag, onPickAnother }: ConflictStripProps) {
  const { t } = useTranslation("admin");
  const { openStationDialog } = useFloatingDialogStack();
  const { title, text } = getStripText(conflict, place, t);

  let action: StripAction | null = null;
  switch (conflict.kind) {
    case "flagClosed":
      if (onRefresh !== undefined) action = { label: t("observationFlags.conflicts.refresh"), onClick: onRefresh };
      break;
    case "resolved":
      if (onRefresh !== undefined) action = { label: t("observationFlags.conflicts.showFlag"), onClick: onRefresh };
      break;
    case "openFlag": {
      const { observationFlagId } = conflict;
      if (onShowFlag !== undefined) {
        action = { label: t("observationFlags.conflicts.showFlagId", { id: observationFlagId }), onClick: () => onShowFlag(observationFlagId) };
      }
      break;
    }
    case "madeFromSite":
    case "matched":
    case "stationSite": {
      const { stationId } = conflict;
      action = { label: t("observationFlags.conflicts.openStation"), onClick: () => openStationDialog(stationId, "internal") };
      break;
    }
    case "copy":
      action = { label: t("observationFlags.conflicts.copy.action"), observedSiteId: conflict.observedSiteId };
      break;
    case "replaced": {
      const [firstSiteId] = conflict.replacedByObservedSiteIds;
      if (firstSiteId !== undefined) action = { label: t("observationFlags.conflicts.replaced.action"), observedSiteId: firstSiteId };
      break;
    }
    case "linkForbidden":
      if (onPickAnother !== undefined) action = { label: t("observationFlags.conflicts.linkForbidden.action"), onClick: onPickAnother };
      break;
  }

  let actionNode: ReactNode = null;
  if (action !== null && "observedSiteId" in action) {
    actionNode = (
      <Link
        to="/admin/observation-flags/sites/$id"
        params={{ id: String(action.observedSiteId) }}
        className={buttonVariants({ variant: "outline", size: "sm", className: ACTION_CLASS })}
      >
        {action.label}
      </Link>
    );
  } else if (action !== null) {
    actionNode = (
      <Button type="button" variant="outline" size="sm" className={ACTION_CLASS} onClick={action.onClick}>
        {action.label}
      </Button>
    );
  }

  return (
    <StatusStrip tone="danger" title={title} action={actionNode}>
      {text}
    </StatusStrip>
  );
}
