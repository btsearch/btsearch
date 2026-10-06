import { Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DataTableSortButtonProps = {
  label: string;
  isActive: boolean;
  isAscending: boolean;
  align?: "start" | "end";
  onClick: () => void;
};

export const SORT_ASCENDING_ICON_STYLE = { transform: "scaleY(-1)" };

export function DataTableSortButton({ label, isActive, isAscending, align = "start", onClick }: DataTableSortButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={cn("cursor-pointer px-1 text-sm", align === "start" ? "-ml-1.25" : "-mr-1.25")}
      onClick={onClick}
    >
      {label}
      <HugeiconsIcon
        icon={Sorting05Icon}
        aria-hidden="true"
        className={cn("size-3.5", isActive ? "text-foreground" : "text-muted-foreground")}
        style={isActive && isAscending ? SORT_ASCENDING_ICON_STYLE : undefined}
      />
    </Button>
  );
}
