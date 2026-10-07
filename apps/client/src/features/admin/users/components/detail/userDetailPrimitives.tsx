import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SETTINGS_DESCRIPTION_CLASS, SETTINGS_TWO_COLUMN_CLASS, SettingsIconTile } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

export const USER_DETAIL_TWO_COLUMN_CLASS = cn(SETTINGS_TWO_COLUMN_CLASS, "items-stretch");
export const TINTED_BUTTON_CLASS = "bg-primary/10 font-semibold text-primary hover:bg-primary/20 hover:text-primary dark:hover:bg-primary/20";
export const META_USER_LINK_CLASS = "font-medium text-foreground";

type RowIconButtonProps = {
  label: string;
  icon: IconSvgElement;
  onClick: () => void;
  destructive?: boolean;
};

type CenteredCardStateProps = {
  icon: IconSvgElement;
  iconClassName?: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function RowIconButton({ label, icon, onClick, destructive = false }: RowIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={cn(
              "cursor-pointer text-muted-foreground",
              destructive && "hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15",
            )}
          />
        }
      >
        <HugeiconsIcon icon={icon} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function CenteredCardState({ icon, iconClassName, title, description, action }: CenteredCardStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center border-t px-6 py-7 text-center">
      <SettingsIconTile icon={icon} className={iconClassName} />
      <p className="mt-3 text-sm leading-5 font-medium">{title}</p>
      <p className={cn("mt-0.5 max-w-xs", SETTINGS_DESCRIPTION_CLASS)}>{description}</p>
      {action ? <div className="mt-3.5">{action}</div> : null}
    </div>
  );
}

export function DialogNote({ children }: { children: ReactNode }) {
  return (
    <p className={cn("flex items-start gap-2", SETTINGS_DESCRIPTION_CLASS)}>
      <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}
