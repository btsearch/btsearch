import { cn } from "@/lib/utils";

export const BODY_COLUMNS_CLASS = "grid @min-[848px]:grid-cols-[232px_minmax(0,1fr)]";
export const BODY_STACK_CLASS = "flex flex-col";
export const OVERVIEW_CLASS = cn(
  "flex items-start gap-5 border-b px-4 pt-2 pb-2.5",
  "@min-[848px]:flex-col @min-[848px]:items-stretch @min-[848px]:gap-3.5 @min-[848px]:border-b-0 @min-[848px]:p-3",
);
export const OVERVIEW_PHONE_CLASS = "flex flex-col items-center gap-0.5 border-b px-3 pt-1 pb-2.5";
export const OVERVIEW_DETAIL_CLASS = "min-w-0 flex-1 pt-3.5 @min-[848px]:flex-none @min-[848px]:pt-0";
export const LIST_COLUMN_CLASS = "flex min-w-0 flex-col @min-[848px]:border-l";
export const LIST_STACK_CLASS = "flex min-w-0 flex-col";
export const TABLE_ROW_GRID_CLASS = "grid grid-cols-[56px_minmax(104px,1fr)_minmax(88px,172px)_36px_112px_78px] gap-x-3";
export const STACKED_LINES_GRID_CLASS = "grid grid-cols-[minmax(0,1fr)_36px_112px] gap-x-2 gap-y-px";
export const GROUP_BOX_CLASS = "overflow-hidden rounded-xl border border-border/70";
export const ROW_DIVIDER_CLASS = "border-t border-border/60";
export const CHANGE_TONE_CLASS = "text-amber-800 dark:text-amber-300";
export const CHANGE_NOTE_CLASS = cn("text-[11px] leading-[14px]", CHANGE_TONE_CLASS);
