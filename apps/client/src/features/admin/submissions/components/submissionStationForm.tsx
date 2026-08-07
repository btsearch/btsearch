import { AirportTowerIcon, Globe02Icon, SquareArrowExpand01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchSiblingExtraIds, fetchSiblingSectors } from "@/features/admin/stations/api";
import { SectorsPanel, ukePermitsToAzimuthSectors } from "@/features/admin/stations/components/sectorsEditor";
import type { SubmissionDetail } from "@/features/admin/submissions/types";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { deriveSectorPanelState } from "@/features/shared/sectorPanelState";
import { StationBasicsFields } from "@/features/shared/StationBasicsFields";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import OrangeIcon from "@/features/station-details/components/logos/orange.svg?react";
import TMobileIcon from "@/features/station-details/components/logos/t-mobile.svg?react";
import { LocationPicker } from "@/features/submissions/components/locationPicker";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { EXTRA_IDENTIFICATORS_MNCS, MNO_NAME_ONLY_MNCS, getMnoBrand, normalizeCityForMNOName } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator, SectorDraft, Station } from "@/types/station";

import { ChangeBadge } from "./common";

type ExtraIdentificatorsType = {
  networks_id: number | null;
  networks_name: string;
  mno_name: string;
};

type SubmissionStationFormProps = {
  submission: SubmissionDetail;
  stationForm: {
    station_id: string;
    operator_id: number | null;
    notes: string;
  };
  onStationFormChange: (patch: Partial<{ station_id: string; operator_id: number | null; notes: string }>) => void;
  extraIdsForm: ExtraIdentificatorsType;
  onExtraIdsChange: (patch: Partial<ExtraIdentificatorsType>) => void;
  locationForm: ProposedLocationForm;
  onLocationFormChange: (patch: Partial<ProposedLocationForm>) => void;
  sectors: SectorDraft[];
  onSectorsChange: (sectors: SectorDraft[]) => void;
  cells: Array<{ band_id: number; _sectorLocalId?: string | null }>;
  operators: Operator[];
  selectedOperator?: Operator;
  currentOperator?: Operator | null;
  currentStation: Station | null;
  stationDiffs: { station_id: boolean; operator_id: boolean; notes: boolean } | null;
  locationDiffs: { coords: boolean; city: boolean; address: boolean; region: boolean } | null;
  isFormDisabled: boolean;
  isDeleteSubmission: boolean;
};

export function SubmissionStationForm({
  submission,
  stationForm,
  onStationFormChange,
  extraIdsForm,
  onExtraIdsChange,
  locationForm,
  onLocationFormChange,
  sectors,
  onSectorsChange,
  cells,
  operators,
  selectedOperator,
  currentOperator,
  currentStation,
  stationDiffs,
  locationDiffs,
  isFormDisabled,
  isDeleteSubmission,
}: SubmissionStationFormProps) {
  const { t } = useTranslation(["submissions", "common", "stationDetails"]);
  const { openStationDialog } = useFloatingDialogStack();
  const [isFetchingSibling, setIsFetchingSibling] = useState(false);
  const showExtraIdsFields = selectedOperator ? EXTRA_IDENTIFICATORS_MNCS.includes(selectedOperator.mnc) : !!extraIdsForm.networks_id;
  const showMnoNameOnly = selectedOperator ? MNO_NAME_ONLY_MNCS.includes(selectedOperator.mnc) : !extraIdsForm.networks_id && !!extraIdsForm.mno_name;
  const showSection = showExtraIdsFields || showMnoNameOnly;
  const { derivedSectorCount, assignedSectorLocalIds } = useMemo(() => deriveSectorPanelState(cells), [cells]);
  const previousAzimuthByLocalId = useMemo(() => {
    const currentById = new Map((currentStation?.sectors ?? []).map((sector) => [sector.id, sector.azimuth]));
    const previous = new Map<string, number>();
    for (const sector of sectors) {
      if (sector.id === undefined) continue;
      const currentAzimuth = currentById.get(sector.id);
      if (currentAzimuth !== undefined && currentAzimuth !== sector.azimuth) previous.set(sector._localId, currentAzimuth);
    }
    return previous;
  }, [currentStation?.sectors, sectors]);
  const hasNewSectors = useMemo(() => sectors.some((sector) => sector.id === undefined), [sectors]);

  const siblingBrand = selectedOperator?.mnc === 26002 ? getMnoBrand(26003) : getMnoBrand(26002);
  const SiblingLogo = selectedOperator?.mnc === 26002 ? OrangeIcon : TMobileIcon;
  const currentStationId = currentStation?.id;

  const siblingSectorsIcon = useMemo(() => <SiblingLogo className="h-3.5 w-auto shrink-0" />, [SiblingLogo]);

  const fetchSiblingAzimuthSectors = useCallback(async () => {
    if (!currentStationId) return [];
    const { data } = await fetchSiblingSectors(currentStationId);
    return data;
  }, [currentStationId]);

  const fetchUkeAzimuthSectors = useCallback(async () => {
    const trimmedStationId = stationForm.station_id.trim();
    const mnc = selectedOperator?.mnc;
    if (!trimmedStationId || !mnc) return [];
    return ukePermitsToAzimuthSectors(await fetchUkePermitsByStationId(trimmedStationId, mnc));
  }, [selectedOperator?.mnc, stationForm.station_id]);

  const siblingSectors = useMemo(
    () =>
      currentStationId && showExtraIdsFields
        ? {
            brand: siblingBrand,
            icon: siblingSectorsIcon,
            onFetch: fetchSiblingAzimuthSectors,
          }
        : undefined,
    [currentStationId, fetchSiblingAzimuthSectors, showExtraIdsFields, siblingBrand, siblingSectorsIcon],
  );

  const ukeSectors = useMemo(
    () =>
      stationForm.station_id.trim() && selectedOperator?.mnc
        ? {
            onFetch: fetchUkeAzimuthSectors,
          }
        : undefined,
    [fetchUkeAzimuthSectors, selectedOperator?.mnc, stationForm.station_id],
  );

  const handleFetchSibling = useCallback(async () => {
    if (!currentStationId) return;
    setIsFetchingSibling(true);
    try {
      const { data } = await fetchSiblingExtraIds(currentStationId);
      if (data.networks_id === null && data.networks_name === null && data.mno_name === null) {
        toast.info(t("sibling.notFound"));
        return;
      }
      if (data.networks_id !== null) onExtraIdsChange({ networks_id: data.networks_id });
      if (data.networks_name) onExtraIdsChange({ networks_name: data.networks_name });
      const isCurrentTMPL = selectedOperator?.mnc === 26002;
      if (isCurrentTMPL) {
        if (!stationForm.station_id.startsWith("N") && locationForm.city)
          onExtraIdsChange({ mno_name: `${normalizeCityForMNOName(locationForm.city)}_${stationForm.station_id}` });
      } else {
        if (data.mno_name) onExtraIdsChange({ mno_name: data.mno_name });
      }
      toast.success(t("sibling.fetched"));
    } catch {
      toast.error(t("sibling.fetchFailed"));
    } finally {
      setIsFetchingSibling(false);
    }
  }, [currentStationId, locationForm.city, onExtraIdsChange, selectedOperator?.mnc, stationForm.station_id, t]);

  const renderPreviousAzimuth = useCallback((azimuth: number) => <ChangeBadge label={t("diff.was")} current={`${azimuth}°`} />, [t]);

  return (
    <>
      <div className="border rounded-xl overflow-hidden bg-card">
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={AirportTowerIcon} className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{t("stationInfo.title")}</span>
          </div>
          {currentStation && (
            <button
              type="button"
              onClick={() => openStationDialog(currentStation.id, "internal")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
            >
              <HugeiconsIcon icon={SquareArrowExpand01Icon} className="size-3.5" />
              {t("common:actions.view")}
            </button>
          )}
        </div>
        <div className="px-4 py-3 space-y-4">
          <StationBasicsFields
            stationId={stationForm.station_id}
            operatorId={stationForm.operator_id}
            notes={stationForm.notes}
            operators={operators}
            disabled={isFormDisabled}
            onStationIdChange={(value) => onStationFormChange({ station_id: value })}
            onOperatorIdChange={(value) => onStationFormChange({ operator_id: value })}
            onNotesChange={(value) => onStationFormChange({ notes: value })}
            stationIdMeta={stationDiffs?.station_id && <ChangeBadge label={t("diff.was")} current={submission.station?.station_id as string} />}
            operatorMeta={stationDiffs?.operator_id && currentOperator && <ChangeBadge label={t("diff.was")} current={currentOperator.name} />}
            notesMeta={stationDiffs?.notes && <ChangeBadge label={t("diff.was")} current={submission.station?.notes ?? "-"} />}
          />
        </div>
      </div>

      {showSection && (
        <div className="border rounded-xl px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Globe02Icon} className="size-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Extra Identificators</span>
            </div>
            {!isFormDisabled && showExtraIdsFields && currentStation && (
              <Button type="button" variant="outline" size="sm" onClick={handleFetchSibling} disabled={isFetchingSibling} className="gap-1.5">
                <SiblingLogo className="h-3.5 w-auto shrink-0" />
                {isFetchingSibling ? t("sibling.fetching") : t("sibling.fetchFrom", { brand: siblingBrand })}
              </Button>
            )}
          </div>
          {isFormDisabled ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              {showExtraIdsFields && (
                <>
                  <div>
                    <span className="text-muted-foreground text-xs">{t("common:labels.networksId")}</span>
                    <p className="font-mono font-medium">{extraIdsForm.networks_id ?? "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">{t("common:labels.networksName")}</span>
                    <p className="font-medium">{extraIdsForm.networks_name || "-"}</p>
                  </div>
                </>
              )}
              <div>
                <span className="text-muted-foreground text-xs">{t("common:labels.mnoName", { brand: getMnoBrand(selectedOperator?.mnc) })}</span>
                <p className="font-medium">{extraIdsForm.mno_name || "-"}</p>
              </div>
            </div>
          ) : (
            <>
              {showExtraIdsFields && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("common:labels.networksId")}</Label>
                    <Input
                      type="number"
                      value={extraIdsForm.networks_id ?? ""}
                      placeholder="e.g. 12345"
                      onChange={(e) => onExtraIdsChange({ networks_id: e.target.value ? Number(e.target.value) : null })}
                      className="font-mono"
                    />
                    {currentStation?.extra_identificators?.networks_id !== undefined &&
                      extraIdsForm.networks_id !== currentStation.extra_identificators.networks_id && (
                        <ChangeBadge label={t("diff.was")} current={String(currentStation.extra_identificators.networks_id ?? "-")} />
                      )}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common:labels.networksName")}</Label>
                    <Input
                      value={extraIdsForm.networks_name}
                      maxLength={50}
                      placeholder={t("common:placeholder.optional")}
                      onChange={(e) => onExtraIdsChange({ networks_name: e.target.value })}
                    />
                    {currentStation?.extra_identificators?.networks_name !== undefined &&
                      extraIdsForm.networks_name !== (currentStation.extra_identificators.networks_name ?? "") && (
                        <ChangeBadge label={t("diff.was")} current={currentStation.extra_identificators.networks_name ?? "-"} />
                      )}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("common:labels.mnoName", { brand: getMnoBrand(selectedOperator?.mnc) })}</Label>
                <Input
                  value={extraIdsForm.mno_name}
                  maxLength={50}
                  placeholder={t("common:placeholder.optional")}
                  onChange={(e) => onExtraIdsChange({ mno_name: e.target.value })}
                />
                {currentStation?.extra_identificators?.mno_name !== undefined &&
                  extraIdsForm.mno_name !== (currentStation.extra_identificators.mno_name ?? "") && (
                    <ChangeBadge label={t("diff.was")} current={currentStation.extra_identificators.mno_name ?? "-"} />
                  )}
              </div>
            </>
          )}
        </div>
      )}

      {(!isDeleteSubmission || (locationForm.latitude !== null && locationForm.longitude !== null)) && (
        <div className={cn(isFormDisabled && "pointer-events-none opacity-60")}>
          <LocationPicker
            location={locationForm}
            azimuthStationId={currentStationId}
            onLocationChange={(patch) => !isFormDisabled && onLocationFormChange(patch)}
            locationDiffs={locationDiffs}
            currentLocation={currentStation?.location ?? null}
          />
        </div>
      )}

      {!isDeleteSubmission ? (
        <SectorsPanel
          className="bg-card"
          defaultOpen={previousAzimuthByLocalId.size > 0 || hasNewSectors}
          sectors={sectors}
          onChange={onSectorsChange}
          derivedSectorCount={derivedSectorCount}
          assignedSectorLocalIds={assignedSectorLocalIds}
          previousAzimuthByLocalId={previousAzimuthByLocalId}
          renderPreviousAzimuth={renderPreviousAzimuth}
          readOnly={isFormDisabled}
          siblingSectors={siblingSectors}
          ukeSectors={ukeSectors}
        />
      ) : null}
    </>
  );
}
