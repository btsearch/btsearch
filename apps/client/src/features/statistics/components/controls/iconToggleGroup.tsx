import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

type IconToggleOption<T extends string> = { value: T; icon: IconSvgElement; label: string };

type IconToggleGroupProps<T extends string> = {
  label: string;
  options: readonly IconToggleOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
};

export function IconToggleGroup<T extends string>({ label, options, value, onValueChange }: IconToggleGroupProps<T>) {
  return (
    <ButtonGroup aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "outline"}
          aria-pressed={value === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => onValueChange(option.value)}
        >
          <HugeiconsIcon icon={option.icon} className="size-4" />
          <span className="hidden text-xs sm:inline">{option.label}</span>
        </Button>
      ))}
    </ButtonGroup>
  );
}
