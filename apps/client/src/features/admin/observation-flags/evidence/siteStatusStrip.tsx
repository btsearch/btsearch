import type { ObservedSite, ObservedSiteUpdate } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { ConflictStrip } from "../components/conflictStrip";
import { Button } from "@/components/ui/button";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { StatusStrip } from "@/features/station-editing/components/frame/statusStrip";

type SiteStatusStripProps = {
  site: ObservedSite;
  linkedStationId: number | null;
  linkedStationLabel: string;
  isRestoring: boolean;
  onRestore: (change: ObservedSiteUpdate) => void;
};

const ACTION_CLASS = "shrink-0 cursor-pointer";

export function SiteStatusStrip({ site, linkedStationId, linkedStationLabel, isRestoring, onRestore }: SiteStatusStripProps) {
  const { t } = useTranslation("admin");
  const { openStationDialog } = useFloatingDialogStack();

  if (site.copyOfObservedSiteId !== null) {
    return <ConflictStrip conflict={{ kind: "copy", observedSiteId: site.copyOfObservedSiteId }} place="review" />;
  }
  if (site.node === "station") return <ConflictStrip conflict={{ kind: "stationSite", stationId: site.stationId }} place="review" />;
  if (site.status === "replaced") {
    return <ConflictStrip conflict={{ kind: "replaced", replacedByObservedSiteIds: site.replacedByObservedSiteIds }} place="review" />;
  }
  if (site.status === "ignored") {
    return (
      <StatusStrip
        tone="neutral"
        title={t("observationFlags.evidence.strips.ignored")}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ACTION_CLASS}
            disabled={isRestoring}
            onClick={() => onRestore({ ignore: null })}
          >
            {t("observationFlags.evidence.strips.restore")}
          </Button>
        }
      >
        {site.ignore?.reason}
      </StatusStrip>
    );
  }
  if (site.status !== "matched" || linkedStationId === null) return null;

  if (site.handLink !== null) {
    return (
      <StatusStrip
        tone="neutral"
        title={t("observationFlags.evidence.strips.handLinked", { station: linkedStationLabel })}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ACTION_CLASS}
            disabled={isRestoring}
            onClick={() => onRestore({ handLink: null })}
          >
            {t("observationFlags.evidence.strips.unlink")}
          </Button>
        }
      />
    );
  }
  return (
    <StatusStrip
      tone="neutral"
      title={t("observationFlags.evidence.strips.matched", { station: linkedStationLabel })}
      action={
        <Button type="button" variant="outline" size="sm" className={ACTION_CLASS} onClick={() => openStationDialog(linkedStationId, "internal")}>
          {t("observationFlags.conflicts.openStation")}
        </Button>
      }
    />
  );
}
