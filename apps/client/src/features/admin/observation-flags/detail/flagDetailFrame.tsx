import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

type FlagDetailFrameProps = {
  label?: string;
  head: ReactNode;
  children: ReactNode;
};

export function FlagDetailFrame({ label, head, children }: FlagDetailFrameProps) {
  return (
    <section aria-label={label} className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex min-h-[41px] shrink-0 items-center justify-between gap-2 border-b bg-muted/40 py-1.5 pr-2 pl-4">{head}</header>
      {children}
    </section>
  );
}

export function FlagDetailSkeleton() {
  return (
    <FlagDetailFrame head={<Skeleton className="h-3 w-56" />}>
      <div role="status" aria-busy="true" className="flex flex-col gap-4 p-4">
        <span className="flex items-center gap-2">
          <Skeleton className="size-5" />
          <Skeleton className="h-3.5 w-40" />
        </span>
        <Skeleton className="h-3 w-[86%]" />
        <Skeleton className="h-3 w-[64%]" />
        <span className="flex gap-3">
          <Skeleton className="h-16 w-36 rounded-lg" />
          <Skeleton className="h-16 w-36 rounded-lg" />
        </span>
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    </FlagDetailFrame>
  );
}
