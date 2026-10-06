import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getLocationMapHash } from "@/features/map/mapLinks";
import { cn } from "@/lib/utils";

export type ListRowActionPlacement = "row" | "card";

type ListRowActionsProps = {
  placement: ListRowActionPlacement;
  children: ReactNode;
};

type ListRowActionButtonProps = {
  placement: ListRowActionPlacement;
  label: string;
  icon: IconSvgElement;
  iconClassName?: string;
  onClick: () => void;
};

type ListRowMapLinkProps = {
  placement: ListRowActionPlacement;
  locationId: number;
  latitude: number;
  longitude: number;
};

const ACTION_SIZES: Record<ListRowActionPlacement, "icon-sm" | "icon-xs"> = { row: "icon-sm", card: "icon-xs" };
const ROW_OVERLAY_CLASS = cn(
  "absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-lg border bg-card p-0.5 opacity-0 shadow-md transition-opacity",
  "group-focus-within/row:opacity-100 group-hover/row:opacity-100 motion-reduce:transition-none",
);
const ROW_TOUCH_COLUMN_CLASS = cn(
  "pointer-coarse:static pointer-coarse:col-end-[-1] pointer-coarse:row-start-1 pointer-coarse:translate-y-0",
  "pointer-coarse:border-0 pointer-coarse:bg-transparent pointer-coarse:p-0 pointer-coarse:opacity-100 pointer-coarse:shadow-none",
);
const PLACEMENT_CLASSES: Record<ListRowActionPlacement, string> = {
  row: cn(ROW_OVERLAY_CLASS, ROW_TOUCH_COLUMN_CLASS),
  card: "pointer-events-auto relative z-10 shrink-0",
};

export function ListRowActions({ placement, children }: ListRowActionsProps) {
  return (
    <div role={placement === "row" ? "cell" : undefined} className={cn("flex items-center gap-0.5", PLACEMENT_CLASSES[placement])}>
      {children}
    </div>
  );
}

export function ListRowActionButton({ placement, label, icon, iconClassName, onClick }: ListRowActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        onClick={onClick}
        render={<Button type="button" variant="ghost" size={ACTION_SIZES[placement]} className="cursor-pointer" />}
      >
        <HugeiconsIcon icon={icon} className={iconClassName} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ListRowMapLink({ placement, locationId, latitude, longitude }: ListRowMapLinkProps) {
  const { t } = useTranslation("common");
  const label = t("actions.showOnMap");

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        render={
          <Link
            to="/"
            hash={getLocationMapHash({ id: locationId, latitude, longitude })}
            className={buttonVariants({ variant: "ghost", size: ACTION_SIZES[placement], className: "cursor-pointer" })}
          />
        }
      >
        <HugeiconsIcon icon={MapsLocation01Icon} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
