import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SKELETON_GROUPS = [
  { id: 0, photoCount: 1 },
  { id: 1, photoCount: 2 },
  { id: 2, photoCount: 6 },
];

export function GallerySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-y-7 lg:grid-cols-2 lg:gap-x-6">
      {SKELETON_GROUPS.map((group) => (
        <section key={group.id} className={cn(group.photoCount > 2 && "lg:col-span-2")}>
          <div className="mb-3 flex items-center gap-3">
            <Skeleton className="h-5 w-36 rounded-md" />
            <div className="h-px min-w-6 flex-1 bg-border" />
            <Skeleton className="h-4 w-16 rounded-md" />
          </div>
          <div
            className={cn(
              "grid gap-3",
              group.photoCount === 1 && "grid-cols-1 sm:max-w-55",
              group.photoCount === 2 && "grid-cols-2 sm:max-w-116 sm:grid-cols-[repeat(2,minmax(190px,220px))]",
              group.photoCount > 2 && "grid-cols-[repeat(auto-fill,minmax(190px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]",
            )}
          >
            {Array.from({ length: group.photoCount }, (_, item) => (
              <Skeleton key={item} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
