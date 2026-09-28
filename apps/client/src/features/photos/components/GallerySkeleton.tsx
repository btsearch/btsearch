import { type GalleryLayout, getGroupLayout } from "../galleryLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SKELETON_GROUPS = [
  { id: 0, photoCount: 1 },
  { id: 1, photoCount: 2 },
  { id: 2, photoCount: 6 },
];

export function GallerySkeleton({ layout }: { layout: GalleryLayout }) {
  return (
    <div className={cn("grid gap-y-7", layout.columns === 2 ? "grid-cols-2 gap-x-6" : "grid-cols-1")}>
      {SKELETON_GROUPS.map((group) => {
        const { fullRow, tracks } = getGroupLayout(group.photoCount, layout);

        return (
          <section key={group.id} className={cn(fullRow && "col-span-2")}>
            <div className="mb-3 flex items-center gap-3">
              <Skeleton className="h-5 w-36 rounded-md" />
              <div className="h-px min-w-6 flex-1 bg-border" />
              <Skeleton className="h-4 w-16 rounded-md" />
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${tracks}, minmax(0, 1fr))` }}>
              {Array.from({ length: group.photoCount }, (_, item) => (
                <Skeleton key={item} className="aspect-square w-full rounded-lg" />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
