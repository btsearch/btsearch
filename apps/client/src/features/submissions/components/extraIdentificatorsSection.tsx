import { Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXTRA_IDENTIFICATORS_MNCS, MNO_NAME_ONLY_MNCS, getMnoBrand } from "@/lib/operatorUtils";

import type { SearchStation } from "../api";

export interface ExtraIdentificatorsSectionProps {
  selectedStation: SearchStation | null;
  networksId: number | null;
  networksName: string;
  mnoName: string;
  onNetworksIdChange: (value: number | null) => void;
  onNetworksNameChange: (value: string) => void;
  onMnoNameChange: (value: string) => void;
}

export function ExtraIdentificatorsSection({
  selectedStation,
  networksId,
  networksName,
  mnoName,
  onNetworksIdChange,
  onNetworksNameChange,
  onMnoNameChange,
}: ExtraIdentificatorsSectionProps) {
  const { t } = useTranslation(["submissions", "common"]);

  if (!selectedStation) return null;

  const operatorMnc = selectedStation.operator?.mnc;
  const showExtraIdFields = !!operatorMnc && EXTRA_IDENTIFICATORS_MNCS.includes(operatorMnc);
  const showMnoNameOnly = !!operatorMnc && MNO_NAME_ONLY_MNCS.includes(operatorMnc);

  if (!showExtraIdFields && !showMnoNameOnly) return null;

  return (
    <div className="border rounded-xl px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={Globe02Icon} className="size-4 text-muted-foreground" />
        <span className="font-semibold text-sm">Extra Identificators</span>
      </div>
      {showExtraIdFields && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="existing_networks_id" className="text-xs">
              {t("common:labels.networksId", "N! ID")}
            </Label>
            <Input
              id="existing_networks_id"
              type="number"
              placeholder="e.g. 12345"
              value={networksId ?? ""}
              onChange={(e) => onNetworksIdChange(e.target.value ? Number(e.target.value) : null)}
              className="h-8 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="existing_networks_name" className="text-xs">
              {t("common:labels.networksName", "MNO name")}
            </Label>
            <Input
              id="existing_networks_name"
              placeholder={t("common:placeholder.optional", "Optional")}
              value={networksName}
              maxLength={50}
              onChange={(e) => onNetworksNameChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="existing_mno_name" className="text-xs">
          {t("common:labels.mnoName", { brand: getMnoBrand(operatorMnc) })}
        </Label>
        <Input
          id="existing_mno_name"
          placeholder={t("common:placeholder.optional", "Optional")}
          value={mnoName}
          maxLength={50}
          onChange={(e) => onMnoNameChange(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}
