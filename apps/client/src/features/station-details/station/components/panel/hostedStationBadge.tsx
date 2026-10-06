import { Link02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { RanSharingLink } from "../../../components/ranSharingLink";
import type { Brand, LocationStationRecord } from "../../types";
import { HostStationLink } from "./hostStationLink";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

type HostedStationBadgeProps = {
  hostStation: LocationStationRecord | null;
  hostBrand: Brand | null;
  isHostLoading: boolean;
  onOpenStation: (stationId: number) => void;
};

export function HostedStationBadge({ hostStation, hostBrand, isHostLoading, onOpenStation }: HostedStationBadgeProps) {
  const { t } = useTranslation("stationDetails");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        delay={300}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex shrink-0 cursor-help items-center gap-1 text-[11px] outline-none transition-colors rounded-md bg-amber-500/12 px-1.5 py-0.5 font-semibold leading-none text-amber-800 hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-amber-500/20 dark:bg-amber-400/12 dark:text-amber-300 dark:hover:bg-amber-400/20 dark:data-popup-open:bg-amber-400/20"
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
        {hostStation !== null ? (
          <HostStationLink
            station={hostStation}
            brand={hostBrand}
            onOpen={(stationId) => {
              setOpen(false);
              onOpenStation(stationId);
            }}
          />
        ) : null}
        {hostStation === null && isHostLoading ? (
          <output className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1.5" aria-label={t("common:actions.loading")}>
            <Skeleton className="size-4 rounded-[3px]" />
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-3 w-10 rounded" />
          </output>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
