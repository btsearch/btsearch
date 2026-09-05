import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { TOP4_MNCS } from "@/lib/cellular/operators";
import type { Operator } from "@/types/station";

type OperatorSelectProps = {
  operators: Operator[];
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  className?: string;
};

export function OperatorSelect({ operators, value, onChange, disabled, className }: OperatorSelectProps) {
  const { t } = useTranslation("common");

  const operatorById = useMemo(() => new Map(operators.map((o) => [o.id, o])), [operators]);
  const selectedOperator = value !== null ? operatorById.get(value) : undefined;

  const { topOperators, restOperators } = useMemo(() => {
    const primaryOperators: Operator[] = [];
    const otherOperators: Operator[] = [];

    for (const operator of operators) {
      if (TOP4_MNCS.includes(operator.mnc)) primaryOperators.push(operator);
      else otherOperators.push(operator);
    }

    return {
      topOperators: [...primaryOperators].sort((first, second) => TOP4_MNCS.indexOf(first.mnc) - TOP4_MNCS.indexOf(second.mnc)),
      restOperators: otherOperators,
    };
  }, [operators]);

  return (
    <Select value={value !== null ? value.toString() : ""} onValueChange={(v) => onChange(v ? Number.parseInt(v, 10) : null)} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue>
          {selectedOperator ? (
            <DialogOperatorName name={selectedOperator.name} mnc={selectedOperator.mnc ?? 0} compact labelClassName="text-sm leading-5 font-normal" />
          ) : (
            t("placeholder.selectOperator")
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {topOperators.map((op) => (
          <SelectItem key={op.id} value={op.id.toString()}>
            <DialogOperatorName name={op.name} mnc={op.mnc ?? 0} compact labelClassName="text-sm leading-5 font-normal" />
          </SelectItem>
        ))}
        {topOperators.length > 0 && restOperators.length > 0 ? <SelectSeparator /> : null}
        {restOperators.map((op) => (
          <SelectItem key={op.id} value={op.id.toString()}>
            <DialogOperatorName name={op.name} mnc={op.mnc ?? 0} compact labelClassName="text-sm leading-5 font-normal" />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
