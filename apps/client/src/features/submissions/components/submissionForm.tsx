import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { EmptyPanel } from "@/components/empty-panel";
import { SectorsPanel, ukePermitsToAzimuthSectors } from "@/features/admin/stations/components/sectorsEditor";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { operatorsQueryOptions } from "@/features/shared/queries";
import { deriveSectorPanelState } from "@/features/shared/sectorPanelState";
import OrangeIcon from "@/features/station-details/components/logos/orange.svg?react";
import TMobileIcon from "@/features/station-details/components/logos/t-mobile.svg?react";
import { useSettings } from "@/hooks/useSettings";
import { EXTRA_IDENTIFICATORS_MNCS, getMnoBrand } from "@/lib/operatorUtils";
import type { SectorDraft } from "@/types/station";

import { type SearchStation, fetchSiblingSectors } from "../api";
import type { ProposedCellForm, ProposedLocationForm, ProposedStationForm, RatType, StationAction, SubmissionMode } from "../types";
import { ActionSelector } from "./actionSelector";
import { CellsSection } from "./cellsSection";
import { ExtraIdentificatorsSection } from "./extraIdentificatorsSection";
import { LocationPicker } from "./locationPicker";
import { NewStationForm } from "./newStationForm";
import { RatSelector } from "./ratSelector";
import { StationSelector } from "./stationSelector";
import { SubmissionPhotosPanel } from "./submissionPhotosPanel";
import { SubmitSection } from "./submitSection";
import { useSubmissionForm } from "./useSubmissionForm";

export interface SubmissionFormProps {
  preloadStationId?: number;
  editSubmissionId?: string;
  preloadUkeStationId?: string;
}

function hasCompleteLocation(location: ProposedLocationForm): boolean {
  return location.latitude !== null && location.longitude !== null && location.region_id !== null;
}

type SubmissionSectorsPanelFieldsProps = {
  mode: SubmissionMode;
  action: StationAction;
  selectedStation: SearchStation | null;
  newStation: ProposedStationForm;
  selectedRats: RatType[];
  location: ProposedLocationForm;
  cells: ProposedCellForm[];
  sectors: SectorDraft[];
  mncById: ReadonlyMap<number, number>;
  onSectorsChange: (sectors: SectorDraft[]) => void;
};

function SubmissionSectorsPanelFields({
  mode,
  action,
  selectedStation,
  newStation,
  selectedRats,
  location,
  cells,
  sectors,
  mncById,
  onSectorsChange,
}: SubmissionSectorsPanelFieldsProps) {
  const sectorCells = useMemo(() => cells.filter((cell) => selectedRats.includes(cell.rat)), [cells, selectedRats]);
  const { derivedSectorCount, assignedSectorLocalIds } = useMemo(() => deriveSectorPanelState(sectorCells), [sectorCells]);
  const selectedStationId = selectedStation?.id;
  const operatorMnc = selectedStation?.operator?.mnc;
  const siblingBrand = operatorMnc === 26002 ? getMnoBrand(26003) : getMnoBrand(26002);
  const SiblingLogo = operatorMnc === 26002 ? OrangeIcon : TMobileIcon;
  const canFetchSiblingSectors = mode === "existing" && operatorMnc !== undefined && EXTRA_IDENTIFICATORS_MNCS.includes(operatorMnc);
  const ukeStationId = mode === "existing" ? selectedStation?.station_id : newStation.station_id;
  const ukeOperatorMnc = mode === "existing" ? operatorMnc : (mncById.get(newStation.operator_id ?? -1) ?? null);
  const trimmedUkeStationId = ukeStationId?.trim() ?? "";

  const siblingSectorsIcon = useMemo(() => <SiblingLogo className="h-3.5 w-auto shrink-0" />, [SiblingLogo]);

  const fetchSiblingAzimuthSectors = useCallback(async () => {
    if (!selectedStationId) return [];
    const { data } = await fetchSiblingSectors(selectedStationId);
    return data;
  }, [selectedStationId]);

  const fetchUkeAzimuthSectors = useCallback(async () => {
    if (!trimmedUkeStationId || !ukeOperatorMnc) return [];
    return ukePermitsToAzimuthSectors(await fetchUkePermitsByStationId(trimmedUkeStationId, ukeOperatorMnc));
  }, [trimmedUkeStationId, ukeOperatorMnc]);

  const siblingSectors = useMemo(
    () =>
      canFetchSiblingSectors && selectedStationId
        ? {
            brand: siblingBrand,
            icon: siblingSectorsIcon,
            onFetch: fetchSiblingAzimuthSectors,
          }
        : undefined,
    [canFetchSiblingSectors, fetchSiblingAzimuthSectors, selectedStationId, siblingBrand, siblingSectorsIcon],
  );

  const ukeSectors = useMemo(
    () =>
      trimmedUkeStationId && ukeOperatorMnc
        ? {
            onFetch: fetchUkeAzimuthSectors,
          }
        : undefined,
    [fetchUkeAzimuthSectors, trimmedUkeStationId, ukeOperatorMnc],
  );

  if (mode === "existing" && action === "delete") return null;
  if (mode === "new" && !hasCompleteLocation(location)) return null;
  if (mode !== "new" && !selectedStation) return null;

  return (
    <SectorsPanel
      sectors={sectors}
      onChange={onSectorsChange}
      derivedSectorCount={derivedSectorCount}
      assignedSectorLocalIds={assignedSectorLocalIds}
      siblingSectors={siblingSectors}
      ukeSectors={ukeSectors}
    />
  );
}

export function SubmissionForm({ preloadStationId, editSubmissionId, preloadUkeStationId }: SubmissionFormProps) {
  const { t } = useTranslation(["submissions", "common", "stationDetails"]);
  const { data: settings } = useSettings();
  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const mncById = useMemo(() => new Map(operators.map((o) => [o.id, o.mnc])), [operators]);
  const {
    form,
    mutation,
    isEditMode,
    cellErrors,
    formErrors,
    computeHasChanges,
    photos,
    setPhotos,
    photoNotes,
    setPhotoNotes,
    photoTakenAts,
    setPhotoTakenAts,
    locationPhotoIds,
    setLocationPhotoIds,
    locationPhotoIdsToRemove,
    setLocationPhotoIdsToRemove,
    mainLocationPhotoId,
    setMainLocationPhotoId,
    mainUploadPhotoIndex,
    setMainUploadPhotoIndex,
    handlers: {
      handleModeChange,
      handleActionChange,
      loadStation,
      handleUkeStationSelect,
      handleRatsChange,
      handleCellsChange,
      handleSectorsChange,
      handleLocationChange,
      handleNewStationChange,
      handleSubmitterNoteChange,
      handleNetworksIdChange,
      handleNetworksNameChange,
      handleMnoNameChange,
    },
  } = useSubmissionForm({ preloadStationId, editSubmissionId, preloadUkeStationId });

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    void form.handleSubmit();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tagName = target.tagName;
    if (tagName === "INPUT" || tagName === "SELECT") e.preventDefault();
  }

  return (
    <form onSubmit={handleFormSubmit} onKeyDown={handleKeyDown} className="flex flex-wrap gap-4 min-h-full">
      <div className="flex-[1.5_0_300px] min-w-0 space-y-4">
        {isEditMode && (
          <div className="rounded-xl border bg-muted/50 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <HugeiconsIcon icon={PencilEdit02Icon} className="size-4 text-muted-foreground shrink-0" />
              <p className="text-sm text-foreground/80">{t("form.editingBanner")}</p>
            </div>
            <span className="font-mono text-sm font-semibold text-foreground bg-background border px-2 py-0.5 rounded-md shrink-0">
              #{editSubmissionId}
            </span>
          </div>
        )}

        <div className="space-y-2">
          <form.Subscribe selector={(s) => ({ mode: s.values.mode, selectedStation: s.values.selectedStation })}>
            {({ mode, selectedStation }) => (
              <StationSelector mode={mode} selectedStation={selectedStation} onModeChange={handleModeChange} onStationSelect={loadStation} />
            )}
          </form.Subscribe>

          <form.Subscribe selector={(s) => ({ mode: s.values.mode, action: s.values.action, selectedStation: s.values.selectedStation })}>
            {({ mode, action, selectedStation }) => {
              if (mode !== "existing" || !selectedStation) return null;
              return <ActionSelector action={action} onActionChange={handleActionChange} />;
            }}
          </form.Subscribe>
        </div>

        <form.Subscribe
          selector={(s) => ({ mode: s.values.mode, action: s.values.action, selectedStation: s.values.selectedStation, location: s.values.location })}
        >
          {({ mode, action, selectedStation, location }) => {
            if (mode === "existing" && action === "delete") return null;
            if (mode === "existing" && !selectedStation) return null;

            return (
              <LocationPicker
                location={location}
                azimuthStationId={mode === "existing" ? selectedStation?.id : undefined}
                errors={formErrors.location}
                onLocationChange={handleLocationChange}
                onUkeStationSelect={mode === "new" ? handleUkeStationSelect : undefined}
              />
            );
          }}
        </form.Subscribe>

        <form.Subscribe selector={(s) => ({ mode: s.values.mode, newStation: s.values.newStation, location: s.values.location })}>
          {({ mode, newStation, location }) => {
            if (mode !== "new") return null;
            if (!hasCompleteLocation(location)) return null;

            return <NewStationForm station={newStation} errors={formErrors.station} onStationChange={handleNewStationChange} />;
          }}
        </form.Subscribe>

        <form.Subscribe
          selector={(s) => ({
            mode: s.values.mode,
            action: s.values.action,
            selectedStation: s.values.selectedStation,
            newStation: s.values.newStation,
            networksId: s.values.networksId,
            networksName: s.values.networksName,
            mnoName: s.values.mnoName,
          })}
        >
          {({ mode, action, selectedStation, newStation, networksId, networksName, mnoName }) => {
            if (mode !== "existing" || !selectedStation || action === "delete") return null;
            return (
              <>
                <NewStationForm station={newStation} onStationChange={handleNewStationChange} hideExtraIdentifiers />
                <ExtraIdentificatorsSection
                  selectedStation={selectedStation}
                  networksId={networksId}
                  networksName={networksName}
                  mnoName={mnoName}
                  onNetworksIdChange={handleNetworksIdChange}
                  onNetworksNameChange={handleNetworksNameChange}
                  onMnoNameChange={handleMnoNameChange}
                />
              </>
            );
          }}
        </form.Subscribe>

        <form.Subscribe
          selector={(s) => ({
            mode: s.values.mode,
            action: s.values.action,
            selectedStation: s.values.selectedStation,
            newStation: s.values.newStation,
            selectedRats: s.values.selectedRats,
            location: s.values.location,
            cells: s.values.cells,
            sectors: s.values.sectors,
          })}
        >
          {({ mode, action, selectedStation, newStation, selectedRats, location, cells, sectors }) => {
            return (
              <SubmissionSectorsPanelFields
                mode={mode}
                action={action}
                selectedStation={selectedStation}
                newStation={newStation}
                selectedRats={selectedRats}
                location={location}
                cells={cells}
                sectors={sectors}
                mncById={mncById}
                onSectorsChange={handleSectorsChange}
              />
            );
          }}
        </form.Subscribe>

        {settings?.photosEnabled && (
          <form.Subscribe
            selector={(s) => ({
              mode: s.values.mode,
              selectedStation: s.values.selectedStation,
              location: s.values.location,
              action: s.values.action,
            })}
          >
            {({ mode, selectedStation, location, action }) => {
              return (
                <SubmissionPhotosPanel
                  mode={mode}
                  action={action}
                  selectedStation={selectedStation}
                  location={location}
                  photos={photos}
                  onPhotosChange={setPhotos}
                  notes={photoNotes}
                  onNotesChange={setPhotoNotes}
                  takenAts={photoTakenAts}
                  onTakenAtsChange={setPhotoTakenAts}
                  locationPhotoIds={locationPhotoIds}
                  onLocationPhotoIdsChange={setLocationPhotoIds}
                  locationPhotoIdsToRemove={locationPhotoIdsToRemove}
                  onLocationPhotoIdsToRemoveChange={setLocationPhotoIdsToRemove}
                  mainLocationPhotoId={mainLocationPhotoId}
                  onMainLocationPhotoIdChange={setMainLocationPhotoId}
                  mainUploadPhotoIndex={mainUploadPhotoIndex}
                  onMainUploadPhotoIndexChange={setMainUploadPhotoIndex}
                  editSubmissionId={editSubmissionId}
                />
              );
            }}
          </form.Subscribe>
        )}

        <form.Subscribe
          selector={(s) => ({
            mode: s.values.mode,
            action: s.values.action,
            selectedStation: s.values.selectedStation,
            selectedRats: s.values.selectedRats,
            location: s.values.location,
          })}
        >
          {({ mode, action, selectedStation, selectedRats, location }) => {
            if (mode === "existing" && action === "delete") return null;
            if (mode === "new") {
              if (!hasCompleteLocation(location)) return null;
            } else if (!selectedStation) {
              return null;
            }

            return <RatSelector selectedRats={selectedRats} onRatsChange={handleRatsChange} />;
          }}
        </form.Subscribe>

        <form.Subscribe
          selector={(s) => ({
            mode: s.values.mode,
            action: s.values.action,
            selectedStation: s.values.selectedStation,
            newStation: s.values.newStation,
            location: s.values.location,
            cells: s.values.cells,
            sectors: s.values.sectors,
            submitterNote: s.values.submitterNote,
            networksId: s.values.networksId,
            networksName: s.values.networksName,
            mnoName: s.values.mnoName,
            selectedRats: s.values.selectedRats,
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
          })}
        >
          {({
            mode,
            action,
            selectedStation,
            newStation,
            location,
            cells,
            sectors,
            submitterNote,
            networksId,
            networksName,
            mnoName,
            selectedRats,
            canSubmit,
            isSubmitting,
          }) => {
            const hasChanges = computeHasChanges(
              mode,
              action,
              newStation,
              location,
              cells,
              sectors,
              submitterNote,
              networksId,
              networksName,
              mnoName,
            );
            const cellsCount = cells.filter((c) => selectedRats.includes(c.rat)).length;
            return (
              <SubmitSection
                mode={mode}
                action={action}
                selectedStation={selectedStation}
                newStation={newStation}
                cellsCount={cellsCount}
                submitterNote={submitterNote}
                onSubmitterNoteChange={handleSubmitterNoteChange}
                canSubmit={canSubmit && hasChanges}
                isSubmitting={isSubmitting}
                isPending={mutation.isPending}
                isSuccess={mutation.isSuccess}
                isEditMode={isEditMode}
                hasChanges={hasChanges}
              />
            );
          }}
        </form.Subscribe>
      </div>

      <div className="flex-[3_0_500px] min-w-0 max-md:flex-[1_1_auto]">
        <form.Subscribe
          selector={(s) => ({
            selectedRats: s.values.selectedRats,
            cells: s.values.cells,
            originalCells: s.values.originalCells,
            sectors: s.values.sectors,
            mode: s.values.mode,
            action: s.values.action,
            operatorId: s.values.newStation.operator_id,
          })}
        >
          {({ selectedRats, cells, originalCells, sectors, mode, action, operatorId }) => {
            if (mode === "existing" && action === "delete") {
              return <EmptyPanel>{t("deleteStation.warning")}</EmptyPanel>;
            }

            const operatorMnc = mncById.get(operatorId ?? -1) ?? null;

            return (
              <CellsSection
                selectedRats={selectedRats}
                cells={cells}
                originalCells={originalCells}
                sectors={sectors}
                isNewStation={mode === "new"}
                cellErrors={cellErrors}
                onCellsChange={handleCellsChange}
                operatorMnc={operatorMnc}
              />
            );
          }}
        </form.Subscribe>
      </div>
    </form>
  );
}
