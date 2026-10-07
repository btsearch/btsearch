import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type RouteChipProps = {
  entry: string;
  isLocked: boolean;
  onRemove: (entry: string) => void;
};

export function RouteChip({ entry, isLocked, onRemove }: RouteChipProps) {
  const { t } = useTranslation("admin");
  const removeLabel = t("settings.routes.remove", { route: entry });

  return (
    <li className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-md bg-muted pr-0.5 pl-2 font-mono text-xs">
      <span title={entry} className="min-w-0 truncate">
        {entry}
      </span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={removeLabel}
              disabled={isLocked}
              onClick={() => onRemove(entry)}
              className="size-5 cursor-pointer text-muted-foreground"
            />
          }
        >
          <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{removeLabel}</TooltipContent>
      </Tooltip>
    </li>
  );
}
