import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const NETWORKS_ROW_CLASS = "flex min-h-14 items-center gap-3.5 px-4 py-2.5 sm:px-5";
export const NETWORKS_ROW_ITEM_CLASS = "border-t first:border-t-0";
export const NETWORKS_ROW_LINK_CLASS = cn(
  "cursor-pointer transition-colors hover:bg-muted/50",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
);

export function NetworksTileSkeleton() {
  return <Skeleton aria-hidden="true" className="size-8 shrink-0 rounded-lg" />;
}
