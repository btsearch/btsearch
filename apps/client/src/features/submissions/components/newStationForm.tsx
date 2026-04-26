import { Building02Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { OperatorSelect } from "@/components/operator-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { operatorsQueryOptions } from "@/features/shared/queries";
import { EXTRA_IDENTIFICATORS_MNCS, MNO_NAME_ONLY_MNCS, getMnoBrand } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";

import type { ProposedStationForm } from "../types";
import type { StationErrors } from "../utils/validation";

type NewStationFormProps = {
  station: ProposedStationForm;
  errors?: StationErrors;
  onStationChange: (station: ProposedStationForm) => void;
};

export function NewStationForm({ station, errors, onStationChange }: NewStationFormProps) {
  const { t } = useTranslation("submissions");

  const { data: operators = [] } = useQuery(operatorsQueryOptions());

  const selectedOperator = operators.find((o) => o.id === station.operator_id);
  const showExtraIdFields = selectedOperator ? EXTRA_IDENTIFICATORS_MNCS.includes(selectedOperator.mnc) : false;
  const showMnoNameOnly = selectedOperator ? MNO_NAME_ONLY_MNCS.includes(selectedOperator.mnc) : false;
  const showSection = showExtraIdFields || showMnoNameOnly;

  return (
    <>
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
          <HugeiconsIcon icon={Building02Icon} className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{t("stationInfo.title")}</span>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="station_id" className="text-xs">
                {t("common:labels.stationId")}
              </Label>
              <Input
                id="station_id"
                placeholder="WWW12345"
                value={station.station_id}
                maxLength={16}
                onChange={(e) => onStationChange({ ...station, station_id: e.target.value })}
                className={cn("h-8 font-mono text-sm", errors?.station_id && "border-destructive")}
              />
              {errors?.station_id ? (
                <p className="text-xs text-destructive">{t(errors.station_id)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("stationInfo.stationIdHint")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="operator" className="text-xs">
                {t("common:labels.operator")}
              </Label>
              <OperatorSelect
                operators={operators}
                value={station.operator_id}
                onChange={(value) => onStationChange({ ...station, operator_id: value })}
                className={cn("h-8 text-sm", errors?.operator_id && "border-destructive")}
              />
              {errors?.operator_id && <p className="text-xs text-destructive">{t(errors.operator_id)}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs">
              {t("common:labels.notes")}
            </Label>
            <Textarea
              id="notes"
              placeholder={t("common:placeholder.notes")}
              value={station.notes ?? ""}
              rows={2}
              onChange={(e) => onStationChange({ ...station, notes: e.target.value })}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {showSection && (
        <div className="border rounded-xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Globe02Icon} className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Extra Identificators</span>
          </div>
          {showExtraIdFields && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="networks_id" className="text-xs">
                  {t("common:labels.networksId")}
                </Label>
                <Input
                  id="networks_id"
                  type="number"
                  placeholder="e.g. 12345"
                  value={station.networks_id ?? ""}
                  onChange={(e) => onStationChange({ ...station, networks_id: e.target.value ? Number(e.target.value) : undefined })}
                  className="h-8 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="networks_name" className="text-xs">
                  {t("common:labels.networksName")}
                </Label>
                <Input
                  id="networks_name"
                  placeholder={t("common:placeholder.optional")}
                  value={station.networks_name ?? ""}
                  maxLength={50}
                  onChange={(e) => onStationChange({ ...station, networks_name: e.target.value || undefined })}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mno_name" className="text-xs">
              {t("common:labels.mnoName", { brand: getMnoBrand(selectedOperator?.mnc) })}
            </Label>
            <Input
              id="mno_name"
              placeholder={t("common:placeholder.optional")}
              value={station.mno_name ?? ""}
              maxLength={50}
              onChange={(e) => onStationChange({ ...station, mno_name: e.target.value || undefined })}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </>
  );
}
