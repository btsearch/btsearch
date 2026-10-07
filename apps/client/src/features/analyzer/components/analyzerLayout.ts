import { cn } from "@/lib/utils";

export type DescriptionColumn = "shown" | "none";

const GRID_CLASS = "grid gap-x-3 px-3";

export const ANALYZER_TABLE_CLASSES: Record<DescriptionColumn, string> = {
  shown: "@container min-w-[862px]",
  none: "@container min-w-[826px]",
};
export const ANALYZER_GRID_CLASSES: Record<DescriptionColumn, string> = {
  shown: cn(
    GRID_CLASS,
    "grid-cols-[36px_minmax(126px,170px)_minmax(262px,1fr)_minmax(180px,1.1fr)_minmax(150px,240px)_24px]",
    "@min-[938px]:grid-cols-[36px_minmax(126px,170px)_minmax(262px,1fr)_minmax(180px,1.1fr)_minmax(150px,240px)_minmax(100px,180px)]",
  ),
  none: cn(GRID_CLASS, "grid-cols-[36px_minmax(126px,170px)_minmax(262px,1fr)_minmax(180px,1.1fr)_minmax(150px,240px)]"),
};
export const ANALYZER_NARROWEST_TABLE_WIDTHS: Record<DescriptionColumn, number> = { shown: 864, none: 828 };
export const ANALYZER_DESCRIPTION_TEXT_CLASS = "hidden @min-[938px]:block";
export const ANALYZER_DESCRIPTION_ICON_CLASS = "flex justify-center @min-[938px]:hidden";
export const ANALYZER_REGION_CLASS = "hidden @min-[1098px]:block";
export const ANALYZER_FRAME_CLASS = "@container/analyzer flex min-h-0 flex-1 flex-col gap-2.5";
export const ANALYZER_COMPACT_SORT_TRIGGER_CLASS = cn(
  "@max-[939px]/analyzer:w-8 @max-[939px]/analyzer:justify-center @max-[939px]/analyzer:px-0",
  "@max-[939px]/analyzer:[&>svg:last-child]:hidden",
);
export const ANALYZER_COMPACT_SORT_LABEL_CLASS = "@max-[939px]/analyzer:sr-only";
export const ANALYZER_SECOND_LINE_CLASS = "text-xs leading-4 text-muted-foreground";
export const ANALYZER_CARD_HEIGHT = 103;
export const ANALYZER_PHONE_PAGE_SIZE = 25;
