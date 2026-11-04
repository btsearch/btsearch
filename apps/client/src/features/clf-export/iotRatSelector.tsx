import type { IotRat } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { Checkbox } from "@/components/ui/checkbox";
import { IOT_RAT_OPTIONS } from "@/features/shared/rat";
import { cn, toggleValue } from "@/lib/utils";

type ClfIotRatSelectorProps = {
  value: IotRat[];
  onChange: (iotRats: IotRat[]) => void;
};

export function ClfIotRatSelector({ value, onChange }: ClfIotRatSelectorProps) {
  const { t } = useTranslation("main");

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="px-2 text-xs text-muted-foreground">{t("filters.iotRat")}</span>
      {IOT_RAT_OPTIONS.map((option) => (
        <label
          htmlFor={`iot-rat-${option.value}`}
          key={option.value}
          className={cn(
            "flex min-h-8 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
            value.includes(option.value) ? "bg-primary/10" : "hover:bg-muted",
          )}
        >
          <Checkbox
            id={`iot-rat-${option.value}`}
            checked={value.includes(option.value)}
            onCheckedChange={() => onChange(toggleValue(value, option.value))}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
