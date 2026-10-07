import { cn } from "@/lib/utils";

type QueueSwitchOption<TValue extends string> = {
  value: TValue;
  label: string;
  count?: string | null;
};

type QueueSwitchProps<TValue extends string> = {
  label: string;
  value: TValue;
  options: readonly QueueSwitchOption<TValue>[];
  onChange: (value: TValue) => void;
  className?: string;
};

const QUEUE_BUTTON_CLASS = cn(
  "inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-xs font-medium whitespace-nowrap transition-colors",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);

export function QueueSwitch<TValue extends string>({ label, value, options, onChange, className }: QueueSwitchProps<TValue>) {
  return (
    <div role="group" aria-label={label} className={cn("flex items-center gap-1", className)}>
      {options.map((option) => {
        const isShown = option.value === value;
        const hasCount = option.count !== null && option.count !== undefined;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isShown}
            className={cn(
              QUEUE_BUTTON_CLASS,
              isShown ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {hasCount ? <span className={cn("ml-1.5 tabular-nums", isShown ? "opacity-70" : null)}>{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
