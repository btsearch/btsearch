import { ArrowUpRight01Icon, Link02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { StationLink } from "./stationLink";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { getOperatorColor, getOperatorTintGradient } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";
import type { Station } from "@/types/station";

const RAN_SHARING_ARTICLE_URL = "https://biuroprasowe.orange.pl/blog/gdy-dwoch-operatorow-korzysta-z-jednej-anteny-i-nie-tylko/";

function RanSharingLink({ children }: { children?: ReactNode }) {
  return (
    <a
      href={RAN_SHARING_ARTICLE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group/ran-sharing inline-flex items-center gap-0.5 font-medium text-popover-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:decoration-foreground"
    >
      {children}
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className="size-3 shrink-0 -translate-x-1 opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/ran-sharing:translate-x-0 group-hover/ran-sharing:opacity-100 group-focus-visible/ran-sharing:translate-x-0 group-focus-visible/ran-sharing:opacity-100 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </a>
  );
}

type VirtualStationBadgeProps = {
  station: Pick<Station, "physicalStation">;
  onOpenStation: (id: number) => void;
  compact?: boolean;
};

export function VirtualStationBadge({ station, onOpenStation, compact = false }: VirtualStationBadgeProps) {
  const { t } = useTranslation("stationDetails");
  const [open, setOpen] = useState(false);
  const physicalStation = station.physicalStation;
  if (!physicalStation) return null;

  const operatorTint = getOperatorTintGradient(getOperatorColor(physicalStation.operator.mnc));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        delay={compact ? 150 : 300}
        nativeButton={!compact}
        render={compact ? <span /> : undefined}
        tabIndex={compact ? -1 : undefined}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex shrink-0 cursor-help items-center gap-1 text-[11px] outline-none transition-colors",
          compact
            ? "font-mono text-foreground/70 hover:text-foreground data-popup-open:text-foreground"
            : "rounded-md bg-amber-500/12 px-1.5 py-0.5 font-semibold leading-none text-amber-800 hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-amber-500/20 dark:bg-amber-400/12 dark:text-amber-300 dark:hover:bg-amber-400/20 dark:data-popup-open:bg-amber-400/20",
        )}
      >
        <HugeiconsIcon icon={Link02Icon} className="size-3" aria-hidden="true" />
        {t("dialog.virtualStation")}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 gap-2 p-2.5">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Link02Icon} className="size-3.5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
          <PopoverTitle className="text-xs font-semibold">{t("dialog.virtualStationTitle")}</PopoverTitle>
        </div>
        <PopoverDescription className="text-[11px] leading-snug">
          <Trans t={t} i18nKey="dialog.virtualStationPhysical" components={{ ranSharingLink: <RanSharingLink /> }} />
        </PopoverDescription>
        <StationLink
          station={physicalStation}
          onOpen={(id) => {
            setOpen(false);
            onOpenStation(id);
          }}
          className="flex rounded-md border border-border/60 px-2 py-1.5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
          stationIdClassName="text-xs"
          style={{ backgroundImage: operatorTint }}
        />
      </PopoverContent>
    </Popover>
  );
}
