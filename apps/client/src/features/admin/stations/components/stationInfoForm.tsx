import {
  AirportTowerIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Globe02Icon,
  MapsLocation01Icon,
  SquareArrowExpand01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { fetchSiblingExtraIds, fetchSiblingSectors } from "@/features/admin/stations/api";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { deriveSectorPanelState } from "@/features/shared/sectorPanelState";
import { StationBasicsFields } from "@/features/shared/StationBasicsFields";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import OrangeIcon from "@/features/station-details/components/logos/orange.svg?react";
import TMobileIcon from "@/features/station-details/components/logos/t-mobile.svg?react";
import { LocationPicker } from "@/features/submissions/components/locationPicker";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { EXTRA_IDENTIFICATORS_MNCS, MNO_NAME_ONLY_MNCS, getMnoBrand, normalizeCityForMNOName } from "@/lib/operatorUtils";
import { type Location, type LocationWithStations, type Operator, type SectorDraft, type StationStatus, type UkeStation } from "@/types/station";

import type { CellDraftBase } from "../../cells/cellEditRow";
import { SectorsPanel, ukePermitsToAzimuthSectors } from "./sectorsEditor";
type StationStatusOption = { status: StationStatus; icon: IconSvgElement };

const STATION_STATUS_OPTIONS: StationStatusOption[] = [
  { status: "published", icon: CheckmarkCircle02Icon },
  { status: "pending", icon: Clock01Icon },
  { status: "inactive", icon: Cancel01Icon },
];

type StationInfoFormProps = {
  stationDbId?: number;
  stationId: string;
  onStationIdChange: (value: string) => void;
  operatorId: number | null;
  onOperatorIdChange: (value: number | null) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  extraAddress?: string;
  onExtraAddressChange?: (value: string) => void;
  isConfirmed: boolean;
  onIsConfirmedChange: (checked: boolean) => void;
  status?: StationStatus;
  onStatusChange?: (status: StationStatus) => void;
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
  sectors: SectorDraft[];
  onSectorsChange: (sectors: SectorDraft[]) => void;
  cells: CellDraftBase[];
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
  status,
  onStatusChange,
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
  sectors,
  onSectorsChange,
  cells,
}: StationInfoFormProps) {
  const { t } = useTranslation(["submissions", "common", "stationDetails", "stations"]);
  const { openStationDialog } = useFloatingDialogStack();
  const [isFetchingSibling, setIsFetchingSibling] = useState(false);

  const showExtraIdsFields = selectedOperator ? EXTRA_IDENTIFICATORS_MNCS.includes(selectedOperator.mnc) : !!networksId;
  const showMnoNameOnly = selectedOperator ? MNO_NAME_ONLY_MNCS.includes(selectedOperator.mnc) : !networksId && !!mnoName;
  const showSection = showExtraIdsFields || showMnoNameOnly;

  const siblingBrand = selectedOperator?.mnc === 26002 ? getMnoBrand(26003) : getMnoBrand(26002);
  const SiblingLogo = selectedOperator?.mnc === 26002 ? OrangeIcon : TMobileIcon;

  const { derivedSectorCount, assignedSectorLocalIds } = useMemo(() => deriveSectorPanelState(cells), [cells]);
  const selectedStatusOption = status ? STATION_STATUS_OPTIONS.find((option) => option.status === status) : undefined;

  const siblingSectorsIcon = useMemo(() => <SiblingLogo className="h-3.5 w-auto shrink-0" />, [SiblingLogo]);

  const fetchSiblingAzimuthSectors = useCallback(async () => {
    if (!stationDbId) return [];
    const { data } = await fetchSiblingSectors(stationDbId);
    return data;
  }, [stationDbId]);

  const fetchUkeAzimuthSectors = useCallback(async () => {
    const trimmedStationId = stationId.trim();
    const mnc = selectedOperator?.mnc;
    if (!trimmedStationId || !mnc) return [];
    return ukePermitsToAzimuthSectors(await fetchUkePermitsByStationId(trimmedStationId, mnc));
  }, [selectedOperator?.mnc, stationId]);

  const siblingSectors = useMemo(
    () =>
      stationDbId && showExtraIdsFields
        ? {
            brand: siblingBrand,
            icon: siblingSectorsIcon,
            onFetch: fetchSiblingAzimuthSectors,
          }
        : undefined,
    [fetchSiblingAzimuthSectors, showExtraIdsFields, siblingBrand, siblingSectorsIcon, stationDbId],
  );

  const ukeSectors = useMemo(
    () =>
      stationId.trim() && selectedOperator?.mnc
        ? {
            onFetch: fetchUkeAzimuthSectors,
          }
        : undefined,
    [fetchUkeAzimuthSectors, selectedOperator?.mnc, stationId],
  );

  const handleFetchSibling = useCallback(async () => {
    if (!stationDbId) return;
    setIsFetchingSibling(true);
    try {
      const { data } = await fetchSiblingExtraIds(stationDbId);
      if (data.networks_id === null && data.networks_name === null && data.mno_name === null) {
        toast.info(t("sibling.notFound"));
        return;
      }
      const { networks_id, networks_name, mno_name } = data;
      if (networks_id !== null) onNetworksIdChange?.(networks_id);
      if (networks_name) onNetworksNameChange?.(networks_name);
      const isCurrentTMPL = selectedOperator?.mnc === 26002;
      if (isCurrentTMPL) {
        if (!stationId.startsWith("N") && location.city) onMnoNameChange?.(`${normalizeCityForMNOName(location.city)}_${stationId}`);
      } else {
        if (mno_name) onMnoNameChange?.(mno_name);
      }
      toast.success(t("sibling.fetched"));
    } catch {
      toast.error(t("sibling.fetchFailed"));
    } finally {
      setIsFetchingSibling(false);
    }
  }, [location.city, onMnoNameChange, onNetworksIdChange, onNetworksNameChange, selectedOperator?.mnc, stationDbId, stationId, t]);

  return (
    <div className="space-y-3">
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
          <HugeiconsIcon icon={AirportTowerIcon} className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{t("stationInfo.title")}</span>
          {stationDbId !== undefined ? (
            <Link
              to="/"
              hash={`map=16/${location.latitude}/${location.longitude}~f~S${stationDbId}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              <HugeiconsIcon icon={MapsLocation01Icon} className="size-3" />
              {t("dialog.showOnMap", { ns: "stationDetails" })}
            </Link>
          ) : null}
          {stationDbId !== undefined ? (
            <button
              type="button"
              onClick={() => openStationDialog(stationDbId, "internal")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
            >
              <HugeiconsIcon icon={SquareArrowExpand01Icon} className="size-3.5" />
              {t("common:actions.view")}
            </button>
          ) : null}
        </div>
        <div className="px-4 py-3 space-y-4">
          <StationBasicsFields
            stationId={stationId}
            operatorId={operatorId}
            notes={notes}
            operators={operators}
            onStationIdChange={onStationIdChange}
            onOperatorIdChange={onOperatorIdChange}
            onNotesChange={onNotesChange}
            operatorAccessory={
              status && onStatusChange ? (
                <div className="space-y-2">
                  <Label>{t("common:labels.status")}</Label>
                  <Select value={status} onValueChange={(value) => onStatusChange(value as StationStatus)}>
                    <SelectTrigger className="h-9">
                      <span className="flex min-w-0 items-center gap-2">
                        {selectedStatusOption ? <HugeiconsIcon icon={selectedStatusOption.icon} className="size-3.5 shrink-0" /> : null}
                        <span className="truncate">{t(`stations:status.${status}`)}</span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {STATION_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.status} value={option.status}>
                          <span className="flex items-center gap-2">
                            <HugeiconsIcon icon={option.icon} className="size-3.5 shrink-0" />
                            <span>{t(`stations:status.${option.status}`)}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : undefined
            }
            extraFields={
              extraAddress ? (
                <div className="space-y-2">
                  <Label>{t("common:labels.extraAddress")}</Label>
                  <Input
                    value={extraAddress}
                    onChange={(e) => {
                      if (e.target.value.length < extraAddress.length) onExtraAddressChange?.(e.target.value);
                    }}
                  />
                </div>
              ) : null
            }
          />
          <div className="flex items-center gap-2">
            <Checkbox checked={isConfirmed} onCheckedChange={(checked) => onIsConfirmedChange(checked === true)} />
            <Label>{t("common:labels.confirmed")}</Label>
          </div>
        </div>
      </div>

      {showSection && (
        <div className="border rounded-xl px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Globe02Icon} className="size-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Extra Identificators</span>
            </div>
            {stationDbId && showExtraIdsFields && (
              <Button type="button" variant="outline" size="sm" onClick={handleFetchSibling} disabled={isFetchingSibling} className="gap-1.5">
                <SiblingLogo className="h-3.5 w-auto shrink-0" />
                {isFetchingSibling ? t("sibling.fetching") : t("sibling.fetchFrom", { brand: siblingBrand })}
              </Button>
            )}
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

      <SectorsPanel
        sectors={sectors}
        onChange={onSectorsChange}
        derivedSectorCount={derivedSectorCount}
        assignedSectorLocalIds={assignedSectorLocalIds}
        siblingSectors={siblingSectors}
        ukeSectors={ukeSectors}
      />
    </div>
  );
}
