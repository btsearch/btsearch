import type { ObservationStatistics } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { toPercent } from "../../lib/format";
import { BlockHeader } from "../card/statisticsCard";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ReadingsMonth = ObservationStatistics["months"][number];

const TICK_COUNT = 4;
const LARGEST_STEP = 10;
const NICE_STEPS = [1, 2, 2.5, 5, LARGEST_STEP];
const JANUARY = 0;
const FEW_PEOPLE_MARK = "<3";

function findTickStep(maxValue: number): number {
  if (maxValue <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(maxValue / TICK_COUNT));
  const factor = NICE_STEPS.find((candidate) => candidate * magnitude * TICK_COUNT >= maxValue) ?? LARGEST_STEP;
  return factor * magnitude;
}

function formatMonth(day: string, language: string): string {
  return new Date(day).toLocaleDateString(language, { month: "long", year: "numeric", timeZone: "UTC" });
}

function ReadingsColumn({ month, scaleMax }: { month: ReadingsMonth; scaleMax: number }) {
  const { t, i18n } = useTranslation("statistics");
  const isHidden = month.samples === null;
  const height = month.samples === null ? 0 : toPercent(month.samples, scaleMax);
  const monthLabel = formatMonth(month.startsOn, i18n.language);

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={0}
        nativeButton={false}
        render={<div />}
        aria-label={monthLabel}
        className={cn(
          "relative flex min-w-0 flex-1 items-end justify-center rounded-[4px] outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted/50",
          isHidden && "bg-[repeating-linear-gradient(135deg,var(--muted)_0_2px,transparent_2px_7px)]",
        )}
      >
        {isHidden ? (
          <span className="absolute inset-x-0 bottom-2 text-center text-[11px] leading-3.5 font-semibold text-muted-foreground">
            {FEW_PEOPLE_MARK}
          </span>
        ) : (
          <span className="w-[62%] max-w-7 rounded-[2px] bg-chart-1" style={{ height: `${height}%` }} />
        )}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-fit max-w-xs gap-0.5 p-2.5 text-xs">
        <PopoverTitle className="capitalize">{monthLabel}</PopoverTitle>
        {month.samples === null || month.people === null ? (
          <p>{t("measurements.fewPeople")}</p>
        ) : (
          <>
            <p>
              {t("settings:measurements.summary.samples")}:{" "}
              <span className="font-medium tabular-nums">{month.samples.toLocaleString(i18n.language)}</span>
            </p>
            <p>
              {t("measurements.people")}: <span className="font-medium tabular-nums">{month.people.toLocaleString(i18n.language)}</span>
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ReadingsChart({ months }: { months: readonly ReadingsMonth[] }) {
  const { t, i18n } = useTranslation("statistics");
  const maxSamples = Math.max(0, ...months.map((month) => month.samples ?? 0));
  const step = findTickStep(maxSamples);
  const scaleMax = step * TICK_COUNT;
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, index) => index * step);
  const compactFormat = new Intl.NumberFormat(i18n.language, { notation: "compact", maximumFractionDigits: 1 });

  return (
    <div>
      <BlockHeader title={t("measurements.readingsTitle")} description={t("measurements.readingsDescription")} />
      <div className="mt-4">
        <div role="group" aria-label={t("measurements.readingsTitle")} className="relative ml-12 h-50 @4xl:h-75">
          {ticks.map((tick) => (
            <div key={tick} className="absolute right-0 -left-12 flex h-0 items-center gap-2" style={{ bottom: `${toPercent(tick, scaleMax)}%` }}>
              <span className="w-10 shrink-0 text-right text-[11px] leading-3.5 text-muted-foreground tabular-nums">
                {compactFormat.format(tick)}
              </span>
              <span className={cn("flex-1 border-t border-dashed", tick === 0 ? "border-border" : "border-border/60")} />
            </div>
          ))}
          <div className="absolute inset-0 flex gap-1">
            {months.map((month) => (
              <ReadingsColumn key={month.startsOn} month={month} scaleMax={scaleMax} />
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="mt-2 ml-12 flex gap-1">
          {months.map((month) => {
            const date = new Date(month.startsOn);
            return (
              <div key={month.startsOn} className="min-w-0 flex-1 text-center text-[11px] leading-3.5 whitespace-nowrap text-muted-foreground">
                {date.toLocaleDateString(i18n.language, { month: "short", timeZone: "UTC" })}
                <span className="block h-3.5 font-semibold">{date.getUTCMonth() === JANUARY ? date.getUTCFullYear() : null}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex items-center border-t border-border/60 pt-1.5">
          <span className="w-12 shrink-0 text-[11px] leading-3.5 text-muted-foreground">{t("measurements.people")}</span>
          <div className="flex min-w-0 flex-1 gap-1">
            {months.map((month) => (
              <span
                key={month.startsOn}
                className={cn(
                  "min-w-0 flex-1 text-center text-[11px] leading-3.5 whitespace-nowrap tabular-nums",
                  month.people === null ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {month.people === null ? FEW_PEOPLE_MARK : month.people.toLocaleString(i18n.language)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
