import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatisticsCardProps = {
  id: string;
  title: string;
  note?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  isBusy?: boolean;
  children: ReactNode;
};

type BlockHeaderProps = {
  title: string;
  description?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
};

export const BLOCK_DESCRIPTION_CLASS = "mt-0.5 text-[0.8125rem] leading-[1.125rem] text-muted-foreground";
export const BLOCK_PADDING_CLASS = "p-4 sm:p-5";
export const CARD_BLOCK_CLASS = cn("min-w-0 border-t", BLOCK_PADDING_CLASS);

export function StatisticsCard({ id, title, note, description, actions, isBusy = false, children }: StatisticsCardProps) {
  const titleId = `${id}-title`;

  return (
    <section id={id} aria-labelledby={titleId} aria-busy={isBusy || undefined} className="scroll-mt-4">
      <Card className="@container gap-0 py-0">
        <header
          className={cn(
            "flex flex-wrap justify-between gap-x-4 px-4 py-3.5 sm:px-5 sm:py-4",
            actions === undefined ? "items-baseline gap-y-1" : "items-start gap-y-2.5",
          )}
        >
          <div className="min-w-0">
            <h2 id={titleId} className="text-base leading-6 font-semibold">
              {title}
            </h2>
            {description}
          </div>
          {note === undefined ? null : <div className="text-xs leading-4 text-muted-foreground">{note}</div>}
          {actions === undefined ? null : <div className="flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
        </header>
        {children}
      </Card>
    </section>
  );
}

export function CardBlock({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(CARD_BLOCK_CLASS, className)}>{children}</div>;
}

export function SplitBlock({ children }: { children: ReactNode }) {
  return <div className="grid divide-y border-t @4xl:grid-cols-2 @4xl:divide-x @4xl:divide-y-0 *:min-w-0">{children}</div>;
}

export function DividedGrid({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden border-t">
      <div className="-mr-px -mb-px grid grid-cols-[repeat(auto-fill,minmax(min(100%,max(26.25rem,33.333%)),1fr))] *:min-w-0 *:border-r *:border-b">
        {children}
      </div>
    </div>
  );
}

export function BlockHeader({ title, description, note, actions }: BlockHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-[1_1_13.75rem]">
        <h3 className="text-sm leading-5 font-semibold">{title}</h3>
        {description === undefined ? null : <p className={BLOCK_DESCRIPTION_CLASS}>{description}</p>}
      </div>
      {note === undefined ? null : <p className="text-xs leading-5 text-muted-foreground tabular-nums">{note}</p>}
      {actions === undefined ? null : <div className="flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
    </div>
  );
}

export function EmptyBlock({ title, description }: { title?: string; description?: string }) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-sm font-semibold">{title ?? t("empty.data")}</p>
      {description === undefined ? null : <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function StatisticsCardSkeleton({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <StatisticsCard id={id} title={title} note={<Skeleton className="h-3 w-40" />} isBusy>
      {children ?? (
        <CardBlock>
          <Skeleton className="h-64 w-full" />
        </CardBlock>
      )}
    </StatisticsCard>
  );
}
