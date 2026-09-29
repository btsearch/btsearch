import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps, ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type CloseButtonProps = Omit<ComponentProps<typeof TooltipTrigger>, "render" | "className" | "children"> & {
  size?: "xs" | "sm";
  className?: string;
  render?: ReactElement;
};

export function CloseButton({ size = "sm", className, render, ...props }: CloseButtonProps) {
  const { t } = useTranslation("common");
  const label = t("actions.close");

  return (
    <Tooltip>
      <TooltipTrigger
        {...props}
        aria-label={label}
        render={
          <Button
            type="button"
            variant="ghost"
            size={size === "xs" ? "icon-xs" : "icon-sm"}
            render={render}
            className={cn("cursor-pointer text-muted-foreground", className)}
          />
        }
      >
        <HugeiconsIcon icon={Cancel01Icon} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
