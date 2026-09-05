import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<string, string> = {
  permits: "permits.sourcePermits",
  device_registry: "permits.sourceDeviceRegistry",
  radiolines: "permits.sourceRadiolines",
};

const SOURCE_STYLES: Record<string, string> = {
  device_registry: "ring-1 ring-blue-500/30",
  radiolines: "ring-1 ring-purple-500/30",
};

type UKESourceBadgeProps = {
  source: "permits" | "device_registry" | "radiolines";
  className?: string;
};

export function UKESourceBadge({ source, className }: UKESourceBadgeProps) {
  const { t } = useTranslation("stationDetails");

  return (
    <Badge
      variant="secondary"
      className={cn("text-[10px] px-1.5 py-0 font-semibold whitespace-nowrap bg-muted text-muted-foreground", SOURCE_STYLES[source], className)}
    >
      {t(SOURCE_LABELS[source] ?? source)}
    </Badge>
  );
}
