import { AirportTowerIcon, Globe02Icon, SquareArrowExpand01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";

import { OperatorSelect } from "@/components/operator-select";

const StationDetailsDialog = lazy(() =>
  import("@/features/station-details/components/stationsDetailsDialog").then((m) => ({ default: m.StationDetailsDialog })),
);
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SubmissionDetail } from "@/features/admin/submissions/types";
import { LocationPicker } from "@/features/submissions/components/locationPicker";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { EXTRA_IDENTIFICATORS_MNCS, MNO_NAME_ONLY_MNCS, getMnoBrand } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator, Station } from "@/types/station";

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
  operators,
  selectedOperator,
  currentOperator,
  currentStation,
  stationDiffs,
  locationDiffs,
  isFormDisabled,
  isDeleteSubmission,
}: SubmissionStationFormProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const showExtraIdsFields = selectedOperator ? EXTRA_IDENTIFICATORS_MNCS.includes(selectedOperator.mnc) : !!extraIdsForm.networks_id;
  const showMnoNameOnly = selectedOperator ? MNO_NAME_ONLY_MNCS.includes(selectedOperator.mnc) : !extraIdsForm.networks_id && !!extraIdsForm.mno_name;
  const showSection = showExtraIdsFields || showMnoNameOnly;

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
              onClick={() => setStationDialogOpen(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
            >
              <HugeiconsIcon icon={SquareArrowExpand01Icon} className="size-3.5" />
              {t("common:actions.view")}
            </button>
          )}
        </div>
        <div className="px-4 py-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("common:labels.stationId")}</Label>
              <Input
                value={stationForm.station_id}
                onChange={(e) => onStationFormChange({ station_id: e.target.value })}
                maxLength={16}
                disabled={isFormDisabled}
              />
              {stationDiffs?.station_id && <ChangeBadge label={t("diff.was")} current={submission.station?.station_id as string} />}
            </div>
            <div className="space-y-2">
              <Label>{t("common:labels.operator")}</Label>
              <OperatorSelect
                operators={operators}
                value={stationForm.operator_id}
                onChange={(v) => onStationFormChange({ operator_id: v })}
                disabled={isFormDisabled}
              />
              {stationDiffs?.operator_id && currentOperator && <ChangeBadge label={t("diff.was")} current={currentOperator.name} />}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("common:labels.notes")}</Label>
            <Textarea value={stationForm.notes} onChange={(e) => onStationFormChange({ notes: e.target.value })} rows={3} disabled={isFormDisabled} />
            {stationDiffs?.notes && <ChangeBadge label={t("diff.was")} current={submission.station?.notes ?? "-"} />}
          </div>
        </div>
      </div>

      {showSection && (
        <div className="border rounded-xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Globe02Icon} className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Extra Identificators</span>
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
            onLocationChange={(patch) => !isFormDisabled && onLocationFormChange(patch)}
            locationDiffs={locationDiffs}
            currentLocation={currentStation?.location ?? null}
          />
        </div>
      )}

      {currentStation && stationDialogOpen && (
        <Suspense>
          <StationDetailsDialog stationId={currentStation.id} source="internal" onClose={() => setStationDialogOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
