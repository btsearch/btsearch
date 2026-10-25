import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type CollapseButtonProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

type SwitchRowProps = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
};

export const CARD_SECTION_TITLE_CLASS = "text-xs leading-4 font-medium tracking-wider text-muted-foreground uppercase";
export const CARD_NOTE_CLASS = "mt-2 text-[11px] leading-4 text-muted-foreground";

export function CollapseButton({ isCollapsed, onToggle }: CollapseButtonProps) {
  const { t } = useTranslation("main");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-expanded={!isCollapsed}
      aria-label={isCollapsed ? t("crowd.expandLegend") : t("crowd.collapseLegend")}
      onClick={onToggle}
      className="cursor-pointer text-muted-foreground md:hidden"
    >
      <HugeiconsIcon icon={ArrowDown01Icon} className={cn("transition-transform duration-200", isCollapsed && "rotate-180")} />
    </Button>
  );
}

export function SwitchRow({ label, checked, onCheckedChange, className }: SwitchRowProps) {
  return (
    <label
      className={cn("flex cursor-pointer items-center gap-1.5 rounded-md text-xs leading-4 font-medium transition-colors hover:bg-muted", className)}
    >
      <span>{label}</span>
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
