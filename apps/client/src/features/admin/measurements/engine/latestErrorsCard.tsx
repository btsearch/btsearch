import type { EngineState } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { formatDayTime, shortId } from "../utils/format";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";
import { UploadStatusBadge } from "@/features/settings/components/measurements/uploadStatus";
import { formatTime, isSameDay } from "@/lib/format";

type LatestError = EngineState["latestErrors"][number];

function LatestErrorRow({ error, today }: { error: LatestError; today: string }) {
  const { t, i18n } = useTranslation("admin");
  const isWaiting = error.status === "received" || error.status === "processing";
  const receivedAt = isSameDay(error.receivedAt, today)
    ? formatTime(error.receivedAt, i18n.language)
    : formatDayTime(error.receivedAt, i18n.language);

  return (
    <li className="border-t px-4 py-[9px] first:border-t-0">
      <div className="flex items-center gap-2 text-xs leading-4">
        <span className="font-mono font-medium" title={error.uploadId}>
          {shortId(error.uploadId)}
        </span>
        <UploadStatusBadge status={error.status} />
        <span className="text-muted-foreground">
          {isWaiting
            ? t("measurements.engine.errors.attempt", { number: error.attempts })
            : t("measurements.engine.errors.attempts", { count: error.attempts })}
        </span>
        <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{receivedAt}</span>
      </div>
      <p className="mt-1 truncate font-mono text-xs leading-4 text-muted-foreground" title={error.error}>
        {error.error}
      </p>
    </li>
  );
}

export function LatestErrorsCard({ errors, now }: { errors: EngineState["latestErrors"]; now: number }) {
  const { t } = useTranslation("admin");
  const today = new Date(now).toISOString();

  return (
    <DashboardCard title={t("measurements.engine.errors.title")} count={errors.length}>
      {errors.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("measurements.engine.errors.empty")}</p>
      ) : (
        <ul>
          {errors.map((error) => (
            <LatestErrorRow key={error.uploadId} error={error} today={today} />
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
