import { useTranslation } from "react-i18next";

import type { FlagCompare, FlagFact } from "../model/flagFacts";
import { cn } from "@/lib/utils";

type ValueCompareProps = {
  compare: FlagCompare;
};

type FactsGridProps = {
  title: string;
  facts: readonly FlagFact[];
};

export function ValueCompare({ compare }: ValueCompareProps) {
  const { t } = useTranslation("admin");

  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <div className="flex min-w-36 flex-col gap-0.5 rounded-lg border px-3.5 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">{t("observationFlags.compare.stored", { label: compare.label })}</span>
        <span className="font-mono text-xl font-semibold tabular-nums">{compare.stored}</span>
      </div>
      <div className="flex min-w-36 flex-col gap-0.5 rounded-lg border border-amber-500/55 bg-amber-500/8 px-3.5 py-2.5">
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
          {t("observationFlags.compare.observed", { label: compare.label })}
        </span>
        <span className="font-mono text-xl font-semibold tabular-nums">{compare.observed}</span>
      </div>
    </div>
  );
}

export function FactsGrid({ title, facts }: FactsGridProps) {
  if (facts.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="flex min-w-0 flex-col gap-0.5 bg-card px-3 py-2">
            <dt className="truncate text-xs text-muted-foreground">{fact.label}</dt>
            <dd className={cn("truncate text-sm font-medium tabular-nums", fact.isMono ? "font-mono" : null)}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
