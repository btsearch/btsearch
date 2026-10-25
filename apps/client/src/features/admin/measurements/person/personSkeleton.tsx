import { Skeleton } from "@/components/ui/skeleton";
import { USER_DETAIL_TWO_COLUMN_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";

export function PersonSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-10 sm:gap-12">
      <div className="overflow-hidden rounded-2xl border border-border/70">
        <div className="flex items-center gap-3.5 px-4 py-4 sm:gap-5 sm:px-7 sm:py-6">
          <Skeleton className="size-12 shrink-0 rounded-full sm:size-18" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-6 w-44 max-w-full sm:h-7" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="hidden h-8 w-40 shrink-0 rounded-lg sm:block" />
        </div>
        <div className="flex gap-1.5 border-t border-border/60 px-4 py-3 sm:px-7">
          <Skeleton className="h-7 w-24 rounded-lg" />
          <Skeleton className="h-7 w-52 max-w-full rounded-lg" />
          <Skeleton className="h-7 w-36 max-w-full rounded-lg" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <div className={USER_DETAIL_TWO_COLUMN_CLASS}>
          <Skeleton className="h-80 w-full rounded-xl" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-38 w-full rounded-xl" />
            <Skeleton className="h-38 w-full rounded-xl" />
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
