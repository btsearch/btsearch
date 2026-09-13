import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { CELL_TYPE_I18N_KEY } from "./cellTypes";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type CellTypeInfoPopoverProps = {
  className?: string;
  align?: "start" | "center" | "end";
};

export function CellTypeInfoPopover({ className, align = "start" }: CellTypeInfoPopoverProps) {
  const { t } = useTranslation("stations");

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={0}
        type="button"
        aria-label={t("cells.cellTypeInfo.label")}
        className={cn(
          "-my-1 inline-flex size-6 shrink-0 cursor-help items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side="top" align={align} className="w-[min(19rem,calc(100vw-1rem))] gap-1.5 p-2.5 text-left normal-case tracking-normal">
        <PopoverTitle className="text-xs font-semibold">{t("cells.cellTypeInfo.title")}</PopoverTitle>
        <dl className="space-y-1 text-[11px] leading-snug whitespace-normal">
          {Object.entries(CELL_TYPE_I18N_KEY).map(([cellType, labelKey]) => (
            <div key={cellType} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-2">
              <dt className="font-medium text-popover-foreground">{t(`cells.${labelKey}`)}</dt>
              <dd className="text-muted-foreground">{t(`cells.cellTypeInfo.${cellType.toLowerCase()}`)}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
