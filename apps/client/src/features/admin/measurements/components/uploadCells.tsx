import type { MeasurementUpload } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { SECOND_LINE_CLASS } from "./classNames";
import type { UploadResult } from "@/features/settings/components/measurements/uploadResult";
import { UploadStatusBadge, readUploadStatusReason } from "@/features/settings/components/measurements/uploadStatus";
import { cn } from "@/lib/utils";

export function UploadStatusSummary({ upload }: { upload: MeasurementUpload }) {
  const { t } = useTranslation(["settings", "common"]);
  const reason = readUploadStatusReason(t, upload);

  return (
    <div className="min-w-0">
      <UploadStatusBadge status={upload.status} />
      {reason === null ? null : (
        <span className={cn(SECOND_LINE_CLASS, "mt-0.5")} title={reason}>
          {reason}
        </span>
      )}
    </div>
  );
}

export function UploadDiscoveriesSummary({ discoveries }: { discoveries: UploadResult["discoveries"] }) {
  const { t, i18n } = useTranslation(["admin", "settings", "common"]);
  const { squares, cells, sites } = discoveries;
  const cellsAndSites = [
    cells > 0 ? t("common:labels.cells", { count: cells }) : null,
    sites > 0 ? t("common:labels.stations", { count: sites }) : null,
  ].filter((part) => part !== null);

  return (
    <div className="min-w-0 text-[0.8125rem] leading-[1.125rem]">
      {squares > 0 ? (
        <span className="block tabular-nums">
          {squares.toLocaleString(i18n.language)} {t("settings:measurements.uploads.details.squares", { count: squares })}
        </span>
      ) : (
        <span className="block text-muted-foreground">{t("measurements.uploads.noSquares")}</span>
      )}
      {cellsAndSites.length > 0 ? <span className="block truncate text-muted-foreground">{cellsAndSites.join(", ")}</span> : null}
    </div>
  );
}
