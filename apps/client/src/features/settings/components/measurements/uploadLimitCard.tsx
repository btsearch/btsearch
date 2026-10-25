import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { measurementUploadsLimitQueryOptions } from "../../measurementQueries";
import { SettingsCard, SettingsCardHeader, SettingsCardNote, SettingsRowError, SettingsRowSkeleton, UsageMeter } from "../settingsPrimitives";
import { formatFileSize, formatTime } from "@/lib/format";

export function UploadLimitCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation("settings");
  const { data: limit, isPending, isFetching, refetch } = useQuery(measurementUploadsLimitQueryOptions(userId));

  if (limit === null) return null;

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("measurements.limit.title")} description={t("measurements.limit.description")} />
      <div className="border-t">
        {isPending ? (
          <SettingsRowSkeleton />
        ) : limit === undefined ? (
          <SettingsRowError title={t("measurements.limit.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : (
          <div className="flex min-w-0 gap-4 px-4 py-3.5 sm:px-5">
            <UsageMeter
              label={t("measurements.limit.uploads")}
              usage={{ used: limit.uploads.limit - limit.uploads.remaining, max: limit.uploads.limit }}
              format={String}
            />
            <UsageMeter
              label={t("measurements.limit.bytes")}
              usage={{ used: limit.bytes.limit - limit.bytes.remaining, max: limit.bytes.limit }}
              format={formatFileSize}
            />
          </div>
        )}
      </div>
      {limit !== undefined && limit.resetsAt !== null ? (
        <SettingsCardNote>{t("measurements.limit.resetsAt", { time: formatTime(limit.resetsAt, i18n.language) })}</SettingsCardNote>
      ) : null}
    </SettingsCard>
  );
}
