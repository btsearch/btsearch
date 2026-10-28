import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { StackedRow } from "../../lib/chartData";
import { ColorBar } from "./colorBar";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type BreakdownHandles = { cursorTooltip: TooltipPrimitive.Handle<StackedRow>; tapPopover: PopoverPrimitive.Handle<StackedRow> };

const BREAKDOWN_CLASS = "w-fit max-w-xs gap-1 p-2.5 text-xs";
const CURSOR_TOOLTIP_CLASS = cn(
  "flex flex-col rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
  BREAKDOWN_CLASS,
);

export function createBreakdownHandles(): BreakdownHandles {
  return { cursorTooltip: TooltipPrimitive.createHandle<StackedRow>(), tapPopover: PopoverPrimitive.createHandle<StackedRow>() };
}

type BreakdownTriggerProps = { row: StackedRow; handles: BreakdownHandles; isCoarsePointer: boolean; className: string; children: ReactNode };

export function BreakdownTrigger({ row, handles, isCoarsePointer, className, children }: BreakdownTriggerProps) {
  if (isCoarsePointer) {
    return (
      <PopoverTrigger handle={handles.tapPopover} payload={row} nativeButton={false} render={<div />} className={className}>
        {children}
      </PopoverTrigger>
    );
  }

  return (
    <TooltipPrimitive.Trigger handle={handles.cursorTooltip} payload={row} delay={0} render={<div tabIndex={0} />} className={className}>
      {children}
    </TooltipPrimitive.Trigger>
  );
}

function RowBreakdown({ row }: { row: StackedRow }) {
  const { i18n } = useTranslation();

  return (
    <>
      <p className="font-medium">{row.name}</p>
      <ul className="space-y-0.5">
        {row.parts.map((part) => (
          <li key={part.operator.id} className="flex items-center gap-1.5">
            <ColorBar color={part.operator.color} className="h-2.5" />
            <span className="min-w-0 flex-1">{part.operator.name}</span>
            <span className="font-medium tabular-nums">{part.value.toLocaleString(i18n.language)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function BreakdownPopup({ handles, isCoarsePointer }: { handles: BreakdownHandles; isCoarsePointer: boolean }) {
  if (isCoarsePointer) {
    return (
      <PopoverPrimitive.Root handle={handles.tapPopover}>
        {({ payload }) =>
          payload === undefined ? null : (
            <PopoverContent side="top" align="start" className={BREAKDOWN_CLASS}>
              <RowBreakdown row={payload} />
            </PopoverContent>
          )
        }
      </PopoverPrimitive.Root>
    );
  }

  return (
    <TooltipPrimitive.Root handle={handles.cursorTooltip} trackCursorAxis="both">
      {({ payload }) =>
        payload === undefined ? null : (
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Positioner side="top" sideOffset={12} className="isolate z-200">
              <TooltipPrimitive.Popup className={CURSOR_TOOLTIP_CLASS}>
                <RowBreakdown row={payload} />
              </TooltipPrimitive.Popup>
            </TooltipPrimitive.Positioner>
          </TooltipPrimitive.Portal>
        )
      }
    </TooltipPrimitive.Root>
  );
}
