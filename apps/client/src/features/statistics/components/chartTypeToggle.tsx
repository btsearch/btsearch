import { ChartAverageIcon, ChartHistogramIcon, ChartLineData01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { ChartType } from "./chartTypeContext";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

const TYPES: { key: ChartType; icon: typeof ChartAverageIcon }[] = [
  { key: "area", icon: ChartAverageIcon },
  { key: "line", icon: ChartLineData01Icon },
  { key: "bar", icon: ChartHistogramIcon },
];

export function ChartTypeToggle({ value, onValueChange }: { value: ChartType; onValueChange: (type: ChartType) => void }) {
  const { t } = useTranslation("statistics");
  return (
    <ButtonGroup aria-label={t("chartType.label")}>
      {TYPES.map(({ key, icon }) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={value === key ? "default" : "outline"}
          aria-pressed={value === key}
          aria-label={t(`chartType.${key}`)}
          title={t(`chartType.${key}`)}
          onClick={() => onValueChange(key)}
        >
          <HugeiconsIcon icon={icon} className="size-4" />
          <span className="hidden text-xs sm:inline">{t(`chartType.${key}`)}</span>
        </Button>
      ))}
    </ButtonGroup>
  );
}
