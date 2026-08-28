import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { stationDialogHeaderIconActionClassName } from "./stationDialogHeaderStyles";

type StationDialogActionBarProps = {
  children: ReactNode;
};

export const stationDialogInlineActionClassName = cn(
  stationDialogHeaderIconActionClassName,
  "inline-flex h-6 w-6 items-center justify-center gap-1 rounded-md bg-muted/40 p-0 text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:hover:bg-muted/60 md:w-auto md:px-1.5 md:[&_svg]:size-3.5",
);

export const stationDialogInlineActionLabelClassName = "hidden whitespace-nowrap text-xs font-medium leading-none md:inline";

export function StationDialogActionBar({ children }: StationDialogActionBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <div className="flex flex-wrap items-center gap-1 md:-ml-1.5">{children}</div>
    </div>
  );
}
