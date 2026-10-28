import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type MenuOperator = { name: string; brand: BrandLook | null };

type OperatorCheckboxItemProps = MenuOperator & {
  checked: boolean;
  onToggle: () => void;
};

type OperatorFilterLabelProps = {
  tickedCount: number;
  tickedOperators: readonly MenuOperator[];
  isLoading?: boolean;
};

const NAME_SEPARATOR = ", ";
const TRIGGER_CLASS = "h-8 w-full cursor-pointer justify-between font-normal";

export function FilterMenuTrigger({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className={TRIGGER_CLASS} />}>
      {children}
      <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0 opacity-50" aria-hidden="true" />
    </DropdownMenuTrigger>
  );
}

function OperatorName({ name, brand }: MenuOperator) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <BrandMark brand={brand} size={16} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function OperatorCheckboxItem({ name, brand, checked, onToggle }: OperatorCheckboxItemProps) {
  return (
    <DropdownMenuCheckboxItem checked={checked} closeOnClick={false} className="cursor-pointer" onCheckedChange={onToggle}>
      <OperatorName name={name} brand={brand} />
    </DropdownMenuCheckboxItem>
  );
}

export function OperatorFilterLabel({ tickedCount, tickedOperators, isLoading = false }: OperatorFilterLabelProps) {
  const { t } = useTranslation("common");

  let content = <span className="truncate">{tickedOperators.map((operator) => operator.name).join(NAME_SEPARATOR)}</span>;
  if (tickedCount === 0) content = <span className="truncate">{t("labels.allOperators")}</span>;
  else if (isLoading) content = <span className="truncate">{t("actions.loading")}</span>;
  else if (tickedOperators.length === 1) content = <OperatorName name={tickedOperators[0].name} brand={tickedOperators[0].brand} />;

  return <span className="flex min-w-0 items-center">{content}</span>;
}
