import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { ChangeItem } from "../../model/types";
import { ChangesList } from "./changesList";
import { CHIP_LIST_CLASS, CHIP_POPOVER_CLASS, CHIP_TITLE_CLASS } from "./errorsChip";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ChangesChipProps = {
  changes: readonly ChangeItem[];
};

const TINT_BUTTON_CLASS = cn(
  "cursor-pointer bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary dark:hover:bg-primary/15",
  "aria-expanded:bg-primary/15 aria-expanded:text-primary",
);

export function ChangesChip({ changes }: ChangesChipProps) {
  const { t } = useTranslation("stations");

  if (changes.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" className={TINT_BUTTON_CLASS} />}>
        {t("edit.frame.changeCount", { count: changes.length })}
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className={CHIP_POPOVER_CLASS}>
        <PopoverTitle className={CHIP_TITLE_CLASS}>{t("edit.frame.changesTitle")}</PopoverTitle>
        <ChangesList changes={changes} className={CHIP_LIST_CLASS} />
      </PopoverContent>
    </Popover>
  );
}
