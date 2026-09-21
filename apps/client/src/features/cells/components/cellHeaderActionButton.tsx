import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type CellHeaderActionButtonProps = {
  children: ReactNode;
  className?: string;
  label: string;
  onClick: () => void;
};

export function CellHeaderActionButton({ children, className, label, onClick }: CellHeaderActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClick}
            aria-label={label}
            className={cn("h-7 w-7 px-0 text-xs @4xl/cells:w-auto @4xl/cells:px-2.5", className)}
          />
        }
      >
        {children}
        <span className="hidden @4xl/cells:inline">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
