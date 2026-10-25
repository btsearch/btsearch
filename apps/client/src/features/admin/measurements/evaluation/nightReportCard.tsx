import type { ObservationEvaluationDetail } from "@openbts/shared/contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { findCandidateVersion, findScore, listVersions, readPublishChecks, readShownVersion } from "./evaluationScores";
import { PublishChecks } from "./publishChecks";
import { isNoEstimateRefusal, usePublishVersion } from "./usePublishVersion";
import { VersionsTable } from "./versionsTable";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { formatDateTime, formatShortDate } from "@/lib/format";

type NightReportCardProps = {
  evaluation: ObservationEvaluationDetail;
  publishedVersion: number | undefined;
};

type PublishDialogState = {
  version: number;
  published: number;
  isOpen: boolean;
};

type ReportFooterProps = {
  text: string;
  candidate: number | undefined;
  onPublish: () => void;
};

function ReportFooter({ text, candidate, onPublish }: ReportFooterProps) {
  const { t } = useTranslation("admin");

  return (
    <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t bg-muted/50 px-4 py-2.5">
      <span className="text-[13px] leading-[18px] text-muted-foreground">{text}</span>
      {candidate === undefined ? null : (
        <Button type="button" className="cursor-pointer" onClick={onPublish}>
          {t("measurements.evaluation.publish.action", { version: candidate })}
        </Button>
      )}
    </div>
  );
}

export function NightReportCard({ evaluation, publishedVersion }: NightReportCardProps) {
  const { t, i18n } = useTranslation("admin");
  const [dialog, setDialog] = useState<PublishDialogState | null>(null);
  const publish = usePublishVersion();

  const versions = listVersions(evaluation.overall);
  const shownVersion = readShownVersion(evaluation, publishedVersion);
  const shownScore = shownVersion === undefined ? undefined : findScore(evaluation.overall, shownVersion);
  const publishedScore = publishedVersion === undefined ? undefined : findScore(evaluation.overall, publishedVersion);
  const candidate = publishedVersion === undefined ? undefined : findCandidateVersion(versions, publishedVersion);
  const candidateScore = candidate === undefined ? undefined : findScore(evaluation.overall, candidate);
  const checks = candidateScore === undefined || publishedScore === undefined ? null : readPublishChecks(evaluation, candidateScore, publishedScore);
  const failedVersion = isNoEstimateRefusal(publish.error) ? publish.variables : undefined;

  let footerText: string | null = null;
  if (checks !== null) {
    footerText = checks.every((check) => check.isMet)
      ? t("measurements.evaluation.footer.allMet", { version: candidate })
      : t("measurements.evaluation.footer.notAllMet", { version: candidate });
  } else if (candidate !== undefined) {
    footerText = t("measurements.evaluation.footer.publishedMissing", { version: publishedVersion });
  } else if (publishedVersion !== undefined && versions.length === 1) {
    footerText = t("measurements.evaluation.footer.onlyVersion", { version: versions[0] });
  }

  function openDialog() {
    if (candidate !== undefined && publishedVersion !== undefined) setDialog({ version: candidate, published: publishedVersion, isOpen: true });
  }

  function closeDialog() {
    setDialog((current) => (current === null ? null : { ...current, isOpen: false }));
  }

  function publishVersion(version: number) {
    publish.mutate(version, { onSettled: closeDialog });
  }

  return (
    <DashboardCard
      title={t("measurements.evaluation.report.title", { date: formatShortDate(evaluation.runAt, i18n.language) })}
      headEnd={
        <span className="text-xs text-muted-foreground">
          {t("measurements.evaluation.report.runAt", { date: formatDateTime(evaluation.runAt, i18n.language) })}
        </span>
      }
      footer={footerText === null ? null : <ReportFooter text={footerText} candidate={candidate} onPublish={openDialog} />}
    >
      <p className="border-b px-4 py-2.5 text-[13px] leading-[18px] text-muted-foreground">
        {t(evaluation.gnbLengths.length > 0 ? "measurements.evaluation.report.metaWithGnbTest" : "measurements.evaluation.report.meta", {
          count: evaluation.groundTruthStations,
          half: t(`measurements.evaluation.report.half.${evaluation.scoredHalf}`),
          sites: shownScore?.sites ?? 0,
        })}
      </p>
      <VersionsTable overall={evaluation.overall} versions={versions} publishedVersion={publishedVersion} />
      {checks === null || candidate === undefined || publishedVersion === undefined ? null : (
        <PublishChecks checks={checks} candidate={candidate} published={publishedVersion} />
      )}
      {failedVersion === undefined ? null : (
        <div className="border-t px-4 py-3">
          <InlineError
            title={t("measurements.evaluation.publish.failedTitle", { version: failedVersion })}
            description={t("measurements.evaluation.publish.noEstimate")}
          />
        </div>
      )}
      {dialog === null ? null : (
        <ConfirmDialog
          open={dialog.isOpen}
          onOpenChange={closeDialog}
          title={t("measurements.evaluation.publish.confirmTitle", { version: dialog.version })}
          description={t("measurements.evaluation.publish.confirmDescription", { version: dialog.version, published: dialog.published })}
          confirmLabel={t("measurements.evaluation.publish.confirmAction")}
          onConfirm={() => publishVersion(dialog.version)}
          pending={publish.isPending}
          destructive={false}
        />
      )}
    </DashboardCard>
  );
}
