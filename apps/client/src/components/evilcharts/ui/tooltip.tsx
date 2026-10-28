import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { getColorsCount, getPayloadConfigFromPayload, useChart } from "@/components/evilcharts/ui/chart";
import { cn } from "@/lib/utils";

type TooltipRoundness = "sm" | "md" | "lg" | "xl";
type TooltipVariant = "default" | "frosted-glass";

const roundnessMap: Record<TooltipRoundness, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
};

const variantMap: Record<TooltipVariant, string> = {
  default: "bg-background",
  "frosted-glass": "bg-background/70 backdrop-blur-sm",
};

function tooltipKey(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "value";
}

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  nameKey,
  labelKey,
  selected,
  roundness = "lg",
  variant = "default",
  valueFormatter,
  renderIndicator,
  locale,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
    selected?: string | null;
    roundness?: TooltipRoundness;
    variant?: TooltipVariant;
    valueFormatter?: (value: number, dataKey: string, payload: Record<string, unknown>) => React.ReactNode;
    renderIndicator?: (dataKey: string, payload: Record<string, unknown>) => React.ReactNode;
    locale?: string;
  } & Omit<RechartsPrimitive.DefaultTooltipContentProps<ValueType, NameType>, "accessibilityLayer">) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = tooltipKey(labelKey ?? item?.dataKey ?? item?.name);
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value = !labelKey && typeof label === "string" ? (config[label]?.label ?? label) : itemConfig?.label;

    if (labelFormatter) {
      return <div className={cn("font-medium", labelClassName)}>{labelFormatter(value, payload)}</div>;
    }

    if (!value) {
      return null;
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

  if (!active || !payload?.length) {
    // Empty tooltip - to prevent position getting 0.0 so it doesnt animate tooltip every time from 0.0 origin
    return <span className="p-4" />;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div
      className={cn(
        "border-border/50 grid min-w-32 max-w-[min(20rem,calc(100vw-2rem))] items-start gap-1.5 overflow-hidden border px-2.5 py-1.5 text-xs shadow-xl",
        roundnessMap[roundness],
        variantMap[variant],
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => {
            // For pie charts, item.name contains the sector name (e.g., "chrome")
            // For radial charts, the name is in item.payload[nameKey]
            // For other charts, item.name or item.dataKey contains the series name
            const payloadName = nameKey && item.payload ? (item.payload as Record<string, unknown>)[nameKey] : undefined;
            const key = tooltipKey(payloadName ?? item.name ?? item.dataKey);
            const itemConfig = getPayloadConfigFromPayload(config, item, key);

            // Get colors count for this item to determine gradient vs solid
            const colorsCount = itemConfig ? getColorsCount(itemConfig) : 1;
            const customIndicator =
              renderIndicator !== undefined && item.dataKey !== undefined
                ? renderIndicator(String(item.dataKey), item.payload as Record<string, unknown>)
                : null;

            return (
              <div
                key={index}
                className={cn(
                  "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                  indicator === "dot" && "items-center",
                  selected !== null && selected !== undefined && selected !== item.dataKey && "opacity-30",
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      (customIndicator ??
                      (!hideIndicator && (
                        <div
                          className={cn("shrink-0 rounded-[2px]", {
                            "h-2.5 w-2.5": indicator === "dot",
                            "w-1": indicator === "line",
                            "w-0 border-[1.5px] border-dashed bg-transparent!": indicator === "dashed",
                            "my-0.5": nestLabel && indicator === "dashed",
                          })}
                          style={getIndicatorColorStyle(key, colorsCount)}
                        />
                      )))
                    )}
                    <div className={cn("flex min-w-0 flex-1 justify-between gap-4 leading-none", nestLabel ? "items-end" : "items-center")}>
                      <div className="grid min-w-0 gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground truncate">{itemConfig?.label ?? item.name}</span>
                      </div>
                      {item.value !== null && item.value !== undefined && (
                        <span className="text-foreground shrink-0 font-mono font-medium whitespace-nowrap tabular-nums">
                          {valueFormatter && typeof item.value === "number" && item.dataKey
                            ? valueFormatter(item.value, String(item.dataKey), item.payload as Record<string, unknown>)
                            : typeof item.value === "number"
                              ? item.value.toLocaleString(locale)
                              : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function getIndicatorColorStyle(dataKey: string, colorsCount: number): React.CSSProperties {
  if (colorsCount <= 1) {
    return { background: `var(--color-${dataKey}-0)` };
  }

  // Multiple colors: create linear gradient with evenly distributed stops
  const stops = Array.from({ length: colorsCount }, (_, index) => {
    const offset = (index / (colorsCount - 1)) * 100;
    return `var(--color-${dataKey}-${index}) ${offset}%`;
  }).join(", ");

  return { background: `linear-gradient(to right, ${stops})` };
}

const ChartTooltip = ({ animationDuration = 200, ...props }: React.ComponentProps<typeof RechartsPrimitive.Tooltip>) => (
  <RechartsPrimitive.Tooltip animationDuration={animationDuration} {...props} />
);

export { ChartTooltip, ChartTooltipContent };
export type { TooltipRoundness, TooltipVariant };
