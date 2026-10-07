import { type ReactNode, useId } from "react";

import { REFERENCE_FILTER_LABEL_CLASS } from "./searchField";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FacetValue = string | number;

export type FacetOption<T extends FacetValue> = {
  value: T;
  label: string;
  lead?: ReactNode;
};

type FacetTogglesProps<T extends FacetValue> = {
  label: string;
  options: readonly FacetOption<T>[];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
  layout?: "row" | "list";
  showLabel?: boolean;
};

export const PRESSED_TOGGLE_CLASS = "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:hover:bg-primary/15";

export function FacetToggles<T extends FacetValue>({ label, options, selected, onChange, layout = "row", showLabel = true }: FacetTogglesProps<T>) {
  const labelId = useId();
  const isList = layout === "list";

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {showLabel ? (
        <span id={labelId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {label}
        </span>
      ) : null}
      <div
        role="group"
        aria-label={showLabel ? undefined : label}
        aria-labelledby={showLabel ? labelId : undefined}
        className={isList ? "grid gap-1" : "flex flex-wrap gap-1"}
      >
        {options.map((option) => {
          const isPressed = selected.includes(option.value);

          return (
            <Button
              key={option.value}
              type="button"
              variant={isPressed || isList ? "ghost" : "outline"}
              aria-pressed={isPressed}
              className={cn("cursor-pointer", isList && "w-full justify-start px-2 font-normal", isPressed && PRESSED_TOGGLE_CLASS)}
              onClick={() => onChange(isPressed ? selected.filter((value) => value !== option.value) : [...selected, option.value])}
            >
              {option.lead}
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
