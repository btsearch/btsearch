import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { formatMhz, formatShortWidth } from "../format";
import type { CountrySpectrum, OperatorTotal } from "../model";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { EmptyValue } from "@/components/ui/emptyValue";
import { cn } from "@/lib/utils";

type SpectrumSummaryProps = {
  spectrum: CountrySpectrum;
  highlightedOperatorId: number | null;
  onHighlightChange: (operatorId: number | null) => void;
};

const HEAD_CELL_CLASS = "h-10 px-3 text-xs font-medium whitespace-nowrap text-muted-foreground";
const BODY_CELL_CLASS = "h-13 px-3 border-t border-border";

function totalKhz(total: OperatorTotal): number {
  return total.pairedKhz * 2 + total.unpairedKhz;
}

function TotalBreakdown({ total }: { total: OperatorTotal }) {
  const { t } = useTranslation("spectrum");
  const paired = formatMhz(total.pairedKhz);
  const unpaired = formatMhz(total.unpairedKhz);

  if (total.pairedKhz > 0 && total.unpairedKhz > 0) return t("summary.breakdown", { paired, unpaired });
  return total.pairedKhz > 0 ? t("width.pairedShort", { width: paired }) : unpaired;
}

export function SpectrumSummary({ spectrum, highlightedOperatorId, onHighlightChange }: SpectrumSummaryProps) {
  const { t } = useTranslation("spectrum");
  const largestKhz = Math.max(...spectrum.totals.map(totalKhz));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t("summary.table")}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(HEAD_CELL_CLASS, "sticky left-0 z-10 bg-card text-left")}>
                {t("summary.operator")}
              </th>
              {spectrum.sections.map((section) => (
                <th key={section.key} scope="col" className={cn(HEAD_CELL_CLASS, "text-center")}>
                  {section.showsDuplex ? `${section.labelMhz} ${section.duplex.toUpperCase()}` : section.labelMhz}
                </th>
              ))}
              <th scope="col" className={cn(HEAD_CELL_CLASS, "text-right")}>
                {t("summary.total")}
              </th>
              <th scope="col" className={cn(HEAD_CELL_CLASS, "w-[18%] max-sm:hidden")}>
                <span className="sr-only">{t("summary.share")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {spectrum.totals.map((total) => {
              const { operator } = total;
              const isHighlighted = highlightedOperatorId === operator.id;
              const rowClass = isHighlighted ? "bg-primary/5" : "bg-card";
              return (
                <tr key={operator.id}>
                  <th scope="row" className={cn(BODY_CELL_CLASS, "sticky left-0 z-10 text-left", rowClass)}>
                    <button
                      type="button"
                      aria-pressed={isHighlighted}
                      title={isHighlighted ? t("summary.showAll") : t("summary.highlight", { name: operator.name })}
                      onClick={() => onHighlightChange(isHighlighted ? null : operator.id)}
                      className={cn(
                        "-ml-1.5 inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 font-semibold whitespace-nowrap outline-none",
                        "transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        isHighlighted ? "bg-primary/10 text-primary hover:bg-primary/15" : "hover:bg-muted",
                      )}
                    >
                      <BrandMark brand={operator.brand} />
                      {operator.name}
                    </button>
                  </th>
                  {spectrum.sections.map((section) => {
                    const khz = total.khzBySection.get(section.key);
                    return (
                      <td
                        key={section.key}
                        className={cn(BODY_CELL_CLASS, "text-center font-mono text-[0.8125rem] tabular-nums whitespace-nowrap", rowClass)}
                      >
                        {khz === undefined ? <EmptyValue /> : formatShortWidth(t, khz, section.uplinkKhz !== null)}
                      </td>
                    );
                  })}
                  <td className={cn(BODY_CELL_CLASS, "text-right whitespace-nowrap", rowClass)}>
                    <span className="block font-bold tabular-nums">{t("width.mhz", { width: formatMhz(totalKhz(total)) })}</span>
                    <span className="block font-mono text-[11px] leading-3.5 text-muted-foreground tabular-nums">
                      <TotalBreakdown total={total} />
                    </span>
                  </td>
                  <td className={cn(BODY_CELL_CLASS, "max-sm:hidden", rowClass)}>
                    <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(totalKhz(total) / largestKhz) * 100}%`, backgroundColor: operator.color }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-muted px-4 py-1.5">
        <p className="text-xs text-muted-foreground">{t("summary.note")}</p>
        {highlightedOperatorId === null ? null : (
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onHighlightChange(null)}>
            <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" />
            {t("summary.showAll")}
          </Button>
        )}
      </div>
    </div>
  );
}
