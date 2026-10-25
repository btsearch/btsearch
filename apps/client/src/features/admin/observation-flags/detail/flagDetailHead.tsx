import type { ObservationFlag } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { EstimatedLabel, FlagSubjectMark } from "../components/flagSubjectMark";
import { getFlagCellLine, getFlagPlace } from "../model/flagHeader";
import { type FlagTextContext, getFlagSubject } from "../model/flagText";
import { isAboutSite } from "../model/kinds";
import { CloseButton } from "@/components/ui/close-button";
import { SubmissionTimestamp } from "@/features/admin/submissions/components/submissionListParts";
import { getOperatorLook } from "@/features/map/data/mapLookups";
import { EditPageHeadStationLinks } from "@/features/station-editing/components/frame/editPageHead";
import { UserLink } from "@/features/user-profile/components/userLink";
import { getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

type FlagTitleBarProps = {
  flag: ObservationFlag;
  title: string;
  onClose: () => void;
};

type FlagSubjectBandProps = {
  flag: ObservationFlag;
  groupNames: readonly string[];
  ctx: FlagTextContext;
};

const STATUS_CHIP_CLASSES: Record<ObservationFlag["status"], string> = {
  open: "text-foreground",
  resolved: "text-emerald-700 dark:text-emerald-400",
  dismissed: "text-muted-foreground",
};

export function FlagTitleBar({ flag, title, onClose }: FlagTitleBarProps) {
  const { t } = useTranslation("admin");

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">{title}</h2>
        <span
          className={cn("inline-flex h-[22px] shrink-0 items-center rounded-md border px-2 text-xs font-medium", STATUS_CHIP_CLASSES[flag.status])}
        >
          {t(`observationFlags.status.${flag.status}`)}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">#{flag.id}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <SubmissionTimestamp value={flag.createdAt} />
        <CloseButton onClick={onClose} />
      </div>
    </>
  );
}

export function FlagSubjectBand({ flag, groupNames, ctx }: FlagSubjectBandProps) {
  const subject = getFlagSubject(flag, ctx);
  const { operator, brand, color } = getOperatorLook(ctx.lookups, subject.operatorId);
  const cellLine = getFlagCellLine(flag, ctx);
  const linkedStationId = isAboutSite(flag) || operator === null ? null : flag.stationId;

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-2.5"
      style={{ backgroundImage: operator === null ? undefined : getOperatorHeaderTintGradient(color) }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <FlagSubjectMark subject={subject} operator={operator} brand={brand} size={20} />
          {operator === null ? null : <span className="text-base font-semibold tracking-tight">{operator.name}</span>}
          <span
            className={cn(
              "tabular-nums",
              operator === null ? "text-base font-semibold" : "text-sm font-medium text-muted-foreground",
              subject.isMono ? "font-mono" : null,
            )}
          >
            {flag.kind === "untrustedContributor" ? <UserLink user={flag.evidence.user}>{subject.text}</UserLink> : subject.text}
          </span>
          {subject.isEstimated ? <EstimatedLabel /> : null}
        </div>
        <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{getFlagPlace(flag, groupNames, ctx)}</span>
          {cellLine === null ? null : (
            <span className="inline-flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="shrink-0 rounded-sm bg-foreground/10 px-1 font-mono text-[11px] font-semibold text-foreground">
                {cellLine.generation}
              </span>
              <span className="font-semibold text-foreground/80">{cellLine.band}</span>
              <span className="truncate font-mono tabular-nums">{cellLine.ids}</span>
            </span>
          )}
        </div>
      </div>
      {linkedStationId === null ? null : (
        <div className="flex shrink-0 items-center gap-1 max-sm:hidden">
          <EditPageHeadStationLinks stationId={linkedStationId} place={flag.station?.location ?? null} />
        </div>
      )}
    </div>
  );
}
