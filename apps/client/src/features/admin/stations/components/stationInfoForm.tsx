import { AirportTowerIcon, Globe02Icon, MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { OperatorSelect } from "@/components/operator-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LocationPicker } from "@/features/submissions/components/locationPicker";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { EXTRA_IDENTIFICATORS_MNCS, MNO_NAME_ONLY_MNCS, getMnoBrand } from "@/lib/operatorUtils";
import type { Location, LocationWithStations, Operator, UkeStation } from "@/types/station";

type StationInfoFormProps = {
  stationDbId?: number;
  stationId: string;
  onStationIdChange: (value: string) => void;
  operatorId: number | null;
  onOperatorIdChange: (value: number | null) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  extraAddress: string;
  onExtraAddressChange: (value: string) => void;
  isConfirmed: boolean;
  onIsConfirmedChange: (checked: boolean) => void;
  location: ProposedLocationForm;
  onLocationChange: (patch: Partial<ProposedLocationForm>) => void;
  onExistingLocationSelect?: (location: LocationWithStations) => void;
  operators: Operator[];
  selectedOperator?: Operator;
  onUkeStationSelect?: (station: UkeStation) => void;
  networksId?: number | null;
  onNetworksIdChange?: (value: number | null) => void;
  networksName?: string;
  onNetworksNameChange?: (value: string) => void;
  mnoName?: string;
  onMnoNameChange?: (value: string) => void;
  currentLocation?: Location | null;
  showEditLocationLink?: boolean;
};

export function StationInfoForm({
  stationDbId,
  stationId,
  onStationIdChange,
  operatorId,
  onOperatorIdChange,
  notes,
  onNotesChange,
  extraAddress,
  onExtraAddressChange,
  isConfirmed,
  onIsConfirmedChange,
  location,
  onLocationChange,
  onExistingLocationSelect,
  operators,
  selectedOperator,
  onUkeStationSelect,
  networksId,
  onNetworksIdChange,
  networksName,
  onNetworksNameChange,
  mnoName,
  onMnoNameChange,
  currentLocation,
  showEditLocationLink,
}: StationInfoFormProps) {
  const { t } = useTranslation(["submissions", "common"]);

  const showExtraIdsFields = selectedOperator ? EXTRA_IDENTIFICATORS_MNCS.includes(selectedOperator.mnc) : !!networksId;
  const showMnoNameOnly = selectedOperator ? MNO_NAME_ONLY_MNCS.includes(selectedOperator.mnc) : !networksId && !!mnoName;
  const showSection = showExtraIdsFields || showMnoNameOnly;

  return (
    <div className="space-y-3">
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
          <HugeiconsIcon icon={AirportTowerIcon} className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{t("stationInfo.title")}</span>
          {stationDbId && (
            <Link
              to="/"
              hash={`map=16/${location.latitude}/${location.longitude}~f~S${stationDbId}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <HugeiconsIcon icon={MapsLocation01Icon} className="size-3" />
              {t("dialog.showOnMap", { ns: "stationDetails" })}
            </Link>
          )}
        </div>
        <div className="px-4 py-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("common:labels.stationId")}</Label>
              <Input value={stationId} onChange={(e) => onStationIdChange(e.target.value)} maxLength={16} />
            </div>
            <div className="space-y-2">
              <Label>{t("common:labels.operator")}</Label>
              <OperatorSelect operators={operators} value={operatorId} onChange={onOperatorIdChange} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("common:labels.notes")}</Label>
            <Textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>{t("common:labels.extraAddress")}</Label>
            <Input value={extraAddress} onChange={(e) => onExtraAddressChange(e.target.value)} placeholder={t("common:labels.address")} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={isConfirmed} onCheckedChange={(checked) => onIsConfirmedChange(checked === true)} />
            <Label>{t("common:labels.confirmed")}</Label>
          </div>
        </div>
      </div>

      {showSection && (
        <div className="border rounded-xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Globe02Icon} className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Extra Identificators</span>
          </div>
          {showExtraIdsFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("common:labels.networksId")}</Label>
                <Input
                  type="number"
                  value={networksId ?? ""}
                  placeholder="e.g. 12345"
                  onChange={(e) => onNetworksIdChange?.(e.target.value ? Number(e.target.value) : null)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("common:labels.networksName")}</Label>
                <Input
                  value={networksName ?? ""}
                  maxLength={50}
                  placeholder={t("common:placeholder.optional")}
                  onChange={(e) => onNetworksNameChange?.(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("common:labels.mnoName", { brand: getMnoBrand(selectedOperator?.mnc) })}</Label>
            <Input
              value={mnoName ?? ""}
              maxLength={50}
              placeholder={t("common:placeholder.optional")}
              onChange={(e) => onMnoNameChange?.(e.target.value)}
            />
          </div>
        </div>
      )}

      <LocationPicker
        location={location}
        onLocationChange={onLocationChange}
        onExistingLocationSelect={onExistingLocationSelect}
        onUkeStationSelect={onUkeStationSelect}
        currentLocation={currentLocation}
        showEditLocationLink={showEditLocationLink}
      />
    </div>
  );
}
