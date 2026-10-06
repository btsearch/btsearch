import type { Submission } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { QueueNav } from "./queueNav";
import type { BrandLook } from "@/components/cellular/brandMark";
import { Badge } from "@/components/ui/badge";
import { toV1SubmissionStatus, toV1SubmissionType } from "@/features/admin/submissions/api";
import type { StationRecord } from "@/features/station-details/station/types";
import {
  EditPageHead,
  EditPageHeadId,
  EditPageHeadLocation,
  EditPageHeadSeparator,
  EditPageHeadStationLinks,
  EditPageHeadTimestamp,
} from "@/features/station-editing/components/frame/editPageHead";
import { SubmissionStatusBadge } from "@/features/submissions/components/submissionStatusBadge";
import { SubmissionTypeBadge } from "@/features/submissions/components/submissionTypeBadge";

type SubmissionDetailHeaderProps = {
  submission: Submission;
  station: StationRecord | null;
  operator: { name: string; brand: BrandLook | null } | null;
};

const SHORT_ID_LENGTH = 8;

export function SubmissionDetailHeader({ submission, station, operator }: SubmissionDetailHeaderProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const status = toV1SubmissionStatus(submission.status);
  const place = station?.location ?? null;
  const proposedPlace = submission.changes.location;
  const city = place === null ? proposedPlace?.city : place.city;
  const address = place === null ? proposedPlace?.address : place.address;

  return (
    <EditPageHead
      operator={operator}
      siteId={station?.siteId ?? submission.changes.station?.siteId}
      badges={
        <>
          <SubmissionTypeBadge type={toV1SubmissionType(submission.action)} />
          {submission.origin === "analyzer" ? (
            <Badge variant="outline" className="h-6 rounded-md px-2 text-xs font-medium text-muted-foreground">
              {t("review.origin.analyzer")}
            </Badge>
          ) : null}
          <SubmissionStatusBadge status={status} />
        </>
      }
      compactBadges={<SubmissionStatusBadge status={status} compact />}
      subtitle={city || address ? <EditPageHeadLocation locationId={place?.id} city={city} address={address} /> : null}
      meta={
        <>
          <EditPageHeadTimestamp label={t("common:labels.submitted")} value={submission.createdAt} />
          {submission.reviewedAt === null ? null : (
            <>
              <EditPageHeadSeparator />
              <EditPageHeadTimestamp label={t("common:labels.reviewed")} value={submission.reviewedAt} />
            </>
          )}
          <EditPageHeadSeparator />
          <EditPageHeadId value={submission.id} displayValue={submission.id.slice(0, SHORT_ID_LENGTH)} />
        </>
      }
      links={station === null ? null : <EditPageHeadStationLinks stationId={station.id} place={station.location} />}
      queue={<QueueNav submission={submission} />}
    />
  );
}
