import type { ReactNode } from "react";

import { isInteractiveTarget } from "@/lib/dom/keyboard";
import { cn } from "@/lib/utils";

type ListTableRowProps = {
  href: string;
  className: string;
  onOpen: () => void;
  children: ReactNode;
};

const MIDDLE_BUTTON = 1;
const NEW_TAB = "_blank";
const ROW_HIGHLIGHT_CLASS = "transition-colors hover:bg-muted/50 has-[:focus-visible]:bg-muted/50";

export const LIST_ROW_HEIGHT = 53;
export const LIST_HEAD_HEIGHT = 41;
export const LIST_SORT_BAR_HEIGHT = 40;
export const LIST_PAGER_HEIGHT = 50;
export const LIST_BOX_BORDER_WIDTH = 1;
export const LIST_ROW_CLASS = cn(
  "relative h-13.25 grid-rows-[minmax(0,1fr)] content-center items-center overflow-hidden",
  "border-t border-border/60 py-2 first:border-t-0",
);
export const LIST_ROW_LINK_CLASS = "rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";
export const LIST_HEAD_ROW_CLASS = "h-10.25 items-center border-b text-sm font-medium whitespace-nowrap text-foreground";
export const LIST_HEAD_GROUP_CLASS = "sticky top-0 z-20 bg-card";
export const LIST_SORT_BAR_CLASS = "flex h-10 shrink-0 items-center gap-1 border-b bg-muted/20 px-2";
export const LIST_PAGER_HEIGHT_CLASS = "h-12.5";
export const LIST_BOX_CLASS = "flex min-h-0 flex-1 flex-col overflow-hidden border bg-card";
export const LIST_CARD_CLASS = cn(
  "group/card relative flex flex-col justify-center overflow-hidden border-t border-border/60 first:border-t-0",
  ROW_HIGHLIGHT_CLASS,
);
export const LIST_CARD_LINK_CLASS = "absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";
export const LIST_CARD_BODY_CLASS = "pointer-events-none relative px-3 py-2.5";
export const LIST_CARD_DETAIL_LINE_CLASS = "flex min-h-4 min-w-0 items-center gap-2 text-xs leading-4 text-muted-foreground";
export const LIST_SKELETON_CARD_CLASS = "space-y-2 overflow-hidden border-t border-border/60 px-3 py-2.5 first:border-t-0";
export const LIST_FILLED_TABLE_CLASS = "flex min-h-0 flex-1 flex-col";
export const LIST_FILLED_ROWS_CLASS = "flex min-h-0 flex-1 flex-col *:min-h-10 *:grow";
export const LIST_FILLED_CARDS_CLASS = "flex min-h-0 flex-1 flex-col *:shrink-0 *:grow";

export function ListTableRow({ href, className, onOpen, children }: ListTableRowProps) {
  return (
    <div
      role="row"
      className={cn(LIST_ROW_CLASS, "group/row cursor-pointer", ROW_HIGHLIGHT_CLASS, className)}
      onClick={(event) => {
        if (isInteractiveTarget(event.target, event.currentTarget)) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey) window.open(href, NEW_TAB);
        else onOpen();
      }}
      onMouseDown={(event) => {
        if (event.button === MIDDLE_BUTTON && !isInteractiveTarget(event.target, event.currentTarget)) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button === MIDDLE_BUTTON && !isInteractiveTarget(event.target, event.currentTarget)) window.open(href, NEW_TAB);
      }}
    >
      {children}
    </div>
  );
}
