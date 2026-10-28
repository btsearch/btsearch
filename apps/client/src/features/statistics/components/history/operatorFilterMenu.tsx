import { useTranslation } from "react-i18next";

import type { StatisticsOperator } from "../../lib/operators";
import { ToolbarField } from "../controls/toolbarSelect";
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FilterMenuTrigger, OperatorCheckboxItem, OperatorFilterLabel } from "@/features/shared/filterMenu";

type OperatorFilterMenuProps = {
  operators: readonly StatisticsOperator[];
  selectedIds: readonly number[];
  isLoading: boolean;
  onToggle: (operatorId: number) => void;
};

export function OperatorFilterMenu({ operators, selectedIds, isLoading, onToggle }: OperatorFilterMenuProps) {
  const { t } = useTranslation("common");
  const mainOperators = operators.filter((operator) => operator.sortPriority !== null);
  const minorOperators = operators.filter((operator) => operator.sortPriority === null);
  const tickedOperators = operators.filter((operator) => selectedIds.includes(operator.id));

  function renderItems(group: readonly StatisticsOperator[]) {
    return group.map((operator) => (
      <OperatorCheckboxItem
        key={operator.id}
        name={operator.name}
        brand={operator.brand}
        checked={selectedIds.includes(operator.id)}
        onToggle={() => onToggle(operator.id)}
      />
    ));
  }

  return (
    <ToolbarField label={t("labels.operator")} showLabel>
      <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
        <DropdownMenu>
          <FilterMenuTrigger>
            <OperatorFilterLabel tickedCount={selectedIds.length} tickedOperators={tickedOperators} isLoading={isLoading} />
          </FilterMenuTrigger>
          <DropdownMenuContent align="start">
            {renderItems(mainOperators)}
            {mainOperators.length > 0 && minorOperators.length > 0 ? <DropdownMenuSeparator /> : null}
            {renderItems(minorOperators)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ToolbarField>
  );
}
