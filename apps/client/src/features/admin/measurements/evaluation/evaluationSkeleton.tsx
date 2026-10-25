import { Skeleton } from "@/components/ui/skeleton";
import { CardLoading } from "@/features/admin/dashboard/cards/dashboardCard";

const NIGHT_ROWS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"] as const;
const BREAKDOWN_CARDS = ["rats", "coverage", "grouping", "snapping"] as const;

function DetailBlocks() {
  return (
    <>
      <Skeleton className="h-80 w-full rounded-xl" />
      <div className="grid gap-3 xl:grid-cols-2">
        {BREAKDOWN_CARDS.map((card) => (
          <Skeleton key={card} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    </>
  );
}

export function NightDetailSkeleton() {
  return (
    <CardLoading className="flex min-w-0 flex-col gap-3">
      <DetailBlocks />
    </CardLoading>
  );
}

export function EvaluationSkeleton() {
  return (
    <CardLoading className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex h-[41px] items-center border-b bg-muted/50 px-4">
          <Skeleton className="h-4 w-16" />
        </div>
        {NIGHT_ROWS.map((row) => (
          <div key={row} className="flex items-center gap-3 border-b px-4 py-[9px] last:border-b-0">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="ml-auto h-4 w-12" />
              <Skeleton className="ml-auto h-3 w-8" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <DetailBlocks />
      </div>
    </CardLoading>
  );
}
