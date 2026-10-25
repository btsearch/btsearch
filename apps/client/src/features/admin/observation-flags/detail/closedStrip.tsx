import { CheckmarkCircle02Icon, InformationCircleIcon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservationFlag } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { getResolvedTitle, getResolverName, getStationSubject, isStationCreated } from "../model/flagText";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { StatusStrip } from "@/features/station-editing/components/frame/statusStrip";

type ClosedStripProps = {
  flag: ObservationFlag;
  isPending: boolean;
  onReopen: () => void;
};

export function ClosedStrip({ flag, isPending, onReopen }: ClosedStripProps) {
  const { t } = useTranslation(["admin", "common"]);
  const resolver = getResolverName(flag);
  const byLine = (
    <>
      {resolver === null ? null : `${resolver}, `}
      {flag.resolvedAt === null ? null : <RelativeTime date={flag.resolvedAt} />}
    </>
  );

  if (flag.status === "dismissed") {
    const title =
      flag.dismissedReason === null ? t("observationFlags.status.dismissed") : t(`observationFlags.closed.dismissed.${flag.dismissedReason}`);
    return (
      <StatusStrip
        tone="neutral"
        icon={InformationCircleIcon}
        title={title}
        action={
          <Button type="button" variant="outline" size="sm" className="shrink-0 cursor-pointer" disabled={isPending} onClick={onReopen}>
            <HugeiconsIcon icon={Undo02Icon} data-icon="inline-start" aria-hidden="true" />
            {t("observationFlags.actions.reopen")}
          </Button>
        }
      >
        {byLine}
        {flag.note === null ? null : (
          <span className="mt-0.5 block text-[13px] text-foreground/80">{t("observationFlags.closed.note", { note: flag.note })}</span>
        )}
      </StatusStrip>
    );
  }

  return (
    <StatusStrip tone="success" icon={CheckmarkCircle02Icon} title={getResolvedTitle(flag, t)}>
      {isStationCreated(flag) ? `${t("observationFlags.closed.stationCreated", { station: getStationSubject(flag).text })} · ` : null}
      {byLine}
    </StatusStrip>
  );
}
