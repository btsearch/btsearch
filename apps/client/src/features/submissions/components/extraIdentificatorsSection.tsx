import { Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OrangeIcon from "@/features/station-details/components/logos/orange.svg?react";
import TMobileIcon from "@/features/station-details/components/logos/t-mobile.svg?react";
import { EXTRA_IDENTIFICATORS_MNCS, MNO_NAME_ONLY_MNCS, getMnoBrand, normalizeCityForMNOName } from "@/lib/cellular/operators";

import type { SearchStation } from "../api";
import { fetchSiblingExtraIds } from "../api";

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
  const [isFetchingSibling, setIsFetchingSibling] = useState(false);

  if (!selectedStation) return null;

  const operatorMnc = selectedStation.operator?.mnc;
  const showExtraIdFields = !!operatorMnc && EXTRA_IDENTIFICATORS_MNCS.includes(operatorMnc);
  const showMnoNameOnly = !!operatorMnc && MNO_NAME_ONLY_MNCS.includes(operatorMnc);

  if (!showExtraIdFields && !showMnoNameOnly) return null;

  const siblingBrand = operatorMnc === 26002 ? getMnoBrand(26003) : getMnoBrand(26002);
  const SiblingLogo = operatorMnc === 26002 ? OrangeIcon : TMobileIcon;

  const handleFetchSibling = async () => {
    setIsFetchingSibling(true);
    try {
      const { data } = await fetchSiblingExtraIds(selectedStation.id);
      if (data.networks_id === null && data.networks_name === null && data.mno_name === null) {
        toast.info(t("sibling.notFound"));
        return;
      }
      if (data.networks_id !== null) onNetworksIdChange(data.networks_id);
      if (data.networks_name) onNetworksNameChange(data.networks_name);
      const isCurrentTMPL = operatorMnc === 26002;
      if (isCurrentTMPL) {
        if (!selectedStation.station_id.startsWith("N") && selectedStation.location?.city)
          onMnoNameChange(`${normalizeCityForMNOName(selectedStation.location.city)}_${selectedStation.station_id}`);
      } else {
        if (data.mno_name) onMnoNameChange(data.mno_name);
      }
      toast.success(t("sibling.fetched"));
    } catch {
      toast.error(t("sibling.fetchFailed"));
    } finally {
      setIsFetchingSibling(false);
    }
  };

  return (
    <div className="border rounded-xl px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Globe02Icon} className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Extra Identificators</span>
        </div>
        {showExtraIdFields && (
          <Button type="button" variant="outline" size="sm" onClick={handleFetchSibling} disabled={isFetchingSibling} className="gap-1.5">
            <SiblingLogo className="h-3.5 w-auto shrink-0" />
            {isFetchingSibling ? t("sibling.fetching") : t("sibling.fetchFrom", { brand: siblingBrand })}
          </Button>
        )}
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
