import type { CSSProperties, ReactNode } from "react";

import { roleWashClassName } from "@/components/app/roleTone";
import { cn } from "@/lib/utils";

type ReferenceHeroProps = {
  lead: ReactNode;
  title: string;
  titleId: string;
  badges?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  stats?: ReactNode;
  washColor?: string;
};

type HeroStatProps = {
  value: ReactNode;
  label: string;
};

const NEUTRAL_WASH_CLASS = roleWashClassName(null);
const TINTED_WASH_CLASS = "bg-linear-115 from-(--reference-hero-wash)/16 via-(--reference-hero-wash)/6 via-34% to-transparent to-70%";

export function ReferenceHero({ lead, title, titleId, badges, meta, action, stats, washColor }: ReferenceHeroProps) {
  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-2xl border border-border/70 bg-background">
      <div
        style={washColor === undefined ? undefined : ({ "--reference-hero-wash": washColor } as CSSProperties)}
        className={cn(
          "flex flex-wrap items-center gap-x-5 gap-y-3.5 px-4 py-4 sm:flex-nowrap sm:px-7 sm:py-6",
          washColor === undefined ? NEUTRAL_WASH_CLASS : TINTED_WASH_CLASS,
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3.5 max-sm:basis-full sm:items-center sm:gap-5">
          {lead}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 id={titleId} className="min-w-0 text-lg leading-7 font-bold tracking-tight wrap-break-word sm:text-2xl sm:leading-8">
                {title}
              </h1>
              {badges}
            </div>
            {meta ? <div className="mt-0.5 text-sm text-muted-foreground">{meta}</div> : null}
          </div>
        </div>
        {action ? <div className="grid shrink-0 auto-cols-fr grid-flow-col gap-2 max-sm:w-full sm:flex sm:items-center">{action}</div> : null}
      </div>
      {stats ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 px-4 py-3 text-sm sm:gap-x-5 sm:gap-y-2 sm:px-7">
          {stats}
        </div>
      ) : null}
    </section>
  );
}

export function HeroStat({ value, label }: HeroStatProps) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}
