import type { MeasurementUpload } from "@openbts/shared/contract";
import { MEASUREMENT_DROP_REASONS } from "@openbts/shared/contract/constants";
import { useTranslation } from "react-i18next";

import { SETTINGS_DESCRIPTION_CLASS } from "../settingsPrimitives";
import { formatDateTime, formatTime, isSameDay } from "@/lib/format";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

export type UploadResult = NonNullable<MeasurementUpload["result"]>;
type UploadDrop = { reason: (typeof MEASUREMENT_DROP_REASONS)[number]; count: number };

const SMALL_TEXT_CLASS = "text-[0.8125rem] leading-[1.125rem]";
const LABEL_ROW_CLASS = "flex items-baseline justify-between gap-2 text-xs leading-4 text-muted-foreground";

export function listUploadDrops(result: UploadResult): UploadDrop[] {
  return MEASUREMENT_DROP_REASONS.flatMap((reason) => {
    const count = result.samples.dropped[reason];
    return count === undefined ? [] : [{ reason, count }];
  }).sort((left, right) => right.count - left.count);
}

export function countDroppedReadings(result: UploadResult): number {
  return listUploadDrops(result).reduce((total, drop) => total + drop.count, 0);
}

function Discovery({ count, label }: { count: number; label: string }) {
  const { i18n } = useTranslation();

  return (
    <p>
      <span className="text-lg leading-7 font-semibold tabular-nums">{count.toLocaleString(i18n.language)}</span>{" "}
      <span className={SETTINGS_DESCRIPTION_CLASS}>{label}</span>
    </p>
  );
}

export function UploadKeptReadings({ samples }: { samples: UploadResult["samples"] }) {
  const { t } = useTranslation("settings");
  const keptPercent = samples.total > 0 ? (samples.kept / samples.total) * 100 : 0;

  return (
    <>
      <div className={LABEL_ROW_CLASS}>
        <span>{t("measurements.uploads.details.kept")}</span>
        <span className="text-foreground tabular-nums">
          {t("measurements.uploads.details.keptValue", { kept: samples.kept, total: samples.total })}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${keptPercent}%` }} />
      </div>
      {samples.distanceOnly > 0 ? (
        <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs leading-4">
          <span className="tabular-nums">{t("measurements.uploads.details.distanceOnly", { readings: samples.distanceOnly })}</span>
          <span className="text-muted-foreground">{t("measurements.uploads.details.distanceOnlyHint")}</span>
        </p>
      ) : null}
    </>
  );
}

export function UploadDrops({ result, className }: { result: UploadResult; className?: string }) {
  const { t, i18n } = useTranslation("settings");
  const drops = listUploadDrops(result);
  const { closedCountryCodes } = result.samples;

  if (drops.length === 0) return <p className={cn(SETTINGS_DESCRIPTION_CLASS, className)}>{t("measurements.uploads.details.noDrops")}</p>;

  const closedCountriesHint =
    closedCountryCodes.length === 0
      ? t("measurements.uploads.dropReasons.closedCountry.hint")
      : t("measurements.uploads.details.closedCountries", {
          count: closedCountryCodes.length,
          countries: new Intl.ListFormat(i18n.language, { style: "long", type: "conjunction" }).format(
            closedCountryCodes.map((code) => getCountryName(code, i18n.language)),
          ),
        });

  return (
    <div className={className}>
      <div className={cn(LABEL_ROW_CLASS, "pb-1.5")}>
        <span>{t("measurements.uploads.details.dropped")}</span>
        <span className="text-foreground tabular-nums">{countDroppedReadings(result).toLocaleString(i18n.language)}</span>
      </div>
      <ul>
        {drops.map(({ reason, count }) => (
          <li key={reason} className={cn("flex items-baseline gap-3 border-t py-1.5", SMALL_TEXT_CLASS)}>
            <p className="flex min-w-0 flex-1 flex-wrap gap-x-2">
              <span className="font-medium">{t(`measurements.uploads.dropReasons.${reason}.label`)}</span>
              <span className="text-muted-foreground">
                {reason === "closedCountry" ? closedCountriesHint : t(`measurements.uploads.dropReasons.${reason}.hint`)}
              </span>
            </p>
            <span className="shrink-0 tabular-nums">{count.toLocaleString(i18n.language)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UploadDiscoveries({ discoveries }: { discoveries: UploadResult["discoveries"] }) {
  const { t } = useTranslation("settings");
  const { squares, cells, sites } = discoveries;

  return (
    <div className="min-w-0">
      <p className="text-xs leading-4 text-muted-foreground">{t("measurements.uploads.details.new")}</p>
      {squares > 0 || cells > 0 || sites > 0 ? (
        <>
          <div className="mt-0.5 flex flex-wrap gap-x-6">
            {squares > 0 ? <Discovery count={squares} label={t("measurements.uploads.details.squares", { count: squares })} /> : null}
            {cells > 0 ? <Discovery count={cells} label={t("measurements.uploads.details.cells", { count: cells })} /> : null}
            {sites > 0 ? <Discovery count={sites} label={t("measurements.uploads.details.sites", { count: sites })} /> : null}
          </div>
          <p className="text-xs leading-4 text-muted-foreground">
            {cells > 0 || sites > 0 ? t("measurements.uploads.details.newCellsHint") : t("measurements.uploads.details.newSquaresHint")}
          </p>
        </>
      ) : (
        <p className={cn("mt-1", SMALL_TEXT_CLASS)}>{t("measurements.uploads.details.nothingNew")}</p>
      )}
    </div>
  );
}

export function UploadTimes({ result, className }: { result: UploadResult; className?: string }) {
  const { t, i18n } = useTranslation("settings");
  const { startedAt, endedAt } = result;

  return (
    <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1", SMALL_TEXT_CLASS, className)}>
      {startedAt === null || endedAt === null ? null : (
        <>
          <dt className="text-muted-foreground">{t("measurements.uploads.details.span")}</dt>
          <dd className="tabular-nums">
            {t("measurements.uploads.details.spanValue", {
              start: formatDateTime(startedAt, i18n.language),
              end: isSameDay(startedAt, endedAt) ? formatTime(endedAt, i18n.language) : formatDateTime(endedAt, i18n.language),
            })}
          </dd>
        </>
      )}
      <dt className="text-muted-foreground">{t("measurements.uploads.details.processedAt")}</dt>
      <dd className="tabular-nums">{formatDateTime(result.processedAt, i18n.language)}</dd>
    </dl>
  );
}
