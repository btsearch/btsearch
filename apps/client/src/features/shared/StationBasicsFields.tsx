import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { OperatorSelect } from "@/components/cellular/operator-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Operator } from "@/types/station";

type StationBasicsFieldsProps = {
  stationId: string;
  operatorId: number | null;
  notes: string;
  operators: Operator[];
  disabled?: boolean;
  onStationIdChange: (value: string) => void;
  onStationIdFocus?: () => void;
  onStationIdBlur?: () => void;
  onOperatorIdChange: (value: number | null) => void;
  onNotesChange: (value: string) => void;
  stationIdMeta?: ReactNode;
  operatorMeta?: ReactNode;
  operatorAccessory?: ReactNode;
  notesMeta?: ReactNode;
  extraFields?: ReactNode;
};

export function StationBasicsFields({
  stationId,
  operatorId,
  notes,
  operators,
  disabled,
  onStationIdChange,
  onStationIdFocus,
  onStationIdBlur,
  onOperatorIdChange,
  onNotesChange,
  stationIdMeta,
  operatorMeta,
  operatorAccessory,
  notesMeta,
  extraFields,
}: StationBasicsFieldsProps) {
  const { t } = useTranslation("common");

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("labels.stationId")}</Label>
          <Input
            value={stationId}
            onChange={(e) => onStationIdChange(e.target.value)}
            onFocus={onStationIdFocus}
            onBlur={onStationIdBlur}
            maxLength={16}
            disabled={disabled}
          />
          {stationIdMeta}
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="space-y-2">
            <Label>{t("labels.operator")}</Label>
            <OperatorSelect operators={operators} value={operatorId} onChange={onOperatorIdChange} disabled={disabled} />
            {operatorMeta}
          </div>
          {operatorAccessory}
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("labels.notes")}</Label>
        <Textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={3} disabled={disabled} />
        {notesMeta}
      </div>
      {extraFields}
    </>
  );
}
