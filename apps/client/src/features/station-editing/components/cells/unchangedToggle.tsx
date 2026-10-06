import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UnchangedToggleProps = {
  count: number;
  isShown: boolean;
  onToggle: () => void;
};

export function UnchangedToggle({ count, isShown, onToggle }: UnchangedToggleProps) {
  const { t } = useTranslation();

  return (
    <div className="flex justify-center py-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={onToggle} className="cursor-pointer text-muted-foreground">
        {isShown ? t("stations:edit.cells.unchanged.hide") : t("stations:edit.cells.unchanged.show", { count })}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          aria-hidden="true"
          className={cn("transition-transform motion-reduce:transition-none", isShown && "rotate-180")}
        />
      </Button>
    </div>
  );
}
