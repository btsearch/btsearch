import { STRETCHED_TWO_COLUMN_CLASS } from "./classNames";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminSettingsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-10 sm:gap-12">
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <div className={STRETCHED_TWO_COLUMN_CLASS}>
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <div className={STRETCHED_TWO_COLUMN_CLASS}>
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}
