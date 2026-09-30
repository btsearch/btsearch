import {
  ArrowDown01Icon,
  Camera01Icon,
  Cancel01Icon,
  Image01Icon,
  InformationCircleIcon,
  StarIcon,
  Tick02Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type ReactNode, type Ref, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  type SearchStation,
  type SubmissionPhoto,
  deleteSubmissionPhoto,
  fetchSubmissionPhotos,
  updateSubmissionPhotoNote,
  updateSubmissionPhotoTakenAt,
} from "../api";
import { MAX_PHOTO_SIZE_BYTES, MAX_PHOTO_SIZE_LABEL, MAX_SUBMISSION_PHOTOS } from "../photoLimits";
import type { ProposedLocationForm, StationAction, SubmissionMode } from "../types";
import { Lightbox, LightboxDetailRow, type LightboxProps, type LightboxSlide, useLightbox } from "@/components/lightbox";
import { photoThumbUrl } from "@/components/photos/photoFiles";
import { AddPhotoTile, PhotoDeleteButton, PhotoEditPopover, PhotoImage, PhotoMeta, isRecentPhoto } from "@/components/photos/photoGridPrimitives";
import { PhotoLightbox, photoSlides } from "@/components/photos/photoLightbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { type LocationPhoto, fetchLocationPhotos, fetchStationPhotos } from "@/features/station-details/api";
import { formatMonthYear } from "@/lib/format";
import { cn } from "@/lib/utils";

type SubmissionPhotosPanelProps = {
  mode: SubmissionMode;
  action: StationAction;
  selectedStation: SearchStation | null;
  location: ProposedLocationForm;
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  notes: string[];
  onNotesChange: (notes: string[]) => void;
  takenAts: (Date | null)[];
  onTakenAtsChange: (takenAts: (Date | null)[]) => void;
  locationPhotoIds: number[];
  onLocationPhotoIdsChange: Dispatch<SetStateAction<number[]>>;
  locationPhotoIdsToRemove: number[];
  onLocationPhotoIdsToRemoveChange: Dispatch<SetStateAction<number[]>>;
  mainLocationPhotoId: number | null;
  onMainLocationPhotoIdChange: (id: number | null) => void;
  mainUploadPhotoIndex: number | null;
  onMainUploadPhotoIndexChange: (index: number | null) => void;
  editSubmissionId?: string;
};

type DeleteTarget = { type: "submission"; id: number } | { type: "local"; index: number };

export function SubmissionPhotosPanel({
  mode,
  action,
  selectedStation,
  location,
  photos,
  onPhotosChange,
  notes,
  onNotesChange,
  takenAts,
  onTakenAtsChange,
  locationPhotoIds,
  onLocationPhotoIdsChange,
  locationPhotoIdsToRemove,
  onLocationPhotoIdsToRemoveChange,
  mainLocationPhotoId,
  onMainLocationPhotoIdChange,
  mainUploadPhotoIndex,
  onMainUploadPhotoIndexChange,
  editSubmissionId,
}: SubmissionPhotosPanelProps) {
  const { t } = useTranslation("submissions");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [localEditState, setLocalEditState] = useState<{ index: number; note: string; takenAt: Date | null } | null>(null);
  const [submissionEditState, setSubmissionEditState] = useState<{ id: number; note: string; takenAt: Date | null } | null>(null);
  const locationLightbox = useLightbox();
  const uploadLightbox = useLightbox();

  const locationId = mode === "existing" ? selectedStation?.location?.id : undefined;
  const stationId = mode === "existing" ? selectedStation?.id : undefined;
  const shouldShowForNew = mode === "new" && location.latitude !== null && location.longitude !== null;
  const shouldRender = action !== "delete" && !(mode === "existing" && selectedStation === null) && !(mode === "new" && !shouldShowForNew);

  const previewUrls = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  const {
    data: locationPhotos = [],
    isLoading: isLoadingLocationPhotos,
    isLoadingError: locationPhotosLoadError,
    isFetching: isFetchingLocationPhotos,
    refetch: refetchLocationPhotos,
  } = useQuery({
    queryKey: ["location-photos", locationId],
    queryFn: () => fetchLocationPhotos(locationId!),
    enabled: shouldRender && locationId !== undefined,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: stationPhotos = [],
    isLoading: isLoadingStationPhotos,
    isLoadingError: stationPhotosLoadError,
    isFetching: isFetchingStationPhotos,
    refetch: refetchStationPhotos,
  } = useQuery({
    queryKey: ["station-photos", stationId],
    queryFn: () => fetchStationPhotos(stationId!),
    enabled: shouldRender && stationId !== undefined,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: submissionPhotos = [],
    isLoading: isLoadingSubmissionPhotos,
    isLoadingError: submissionPhotosLoadError,
    isFetching: isFetchingSubmissionPhotos,
    refetch: refetchSubmissionPhotos,
  } = useQuery({
    queryKey: ["submission-photos", editSubmissionId],
    queryFn: () => fetchSubmissionPhotos(editSubmissionId!),
    enabled: shouldRender && editSubmissionId !== undefined,
    staleTime: 1000 * 60 * 2,
  });

  const invalidateSubmissionPhotos = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["submission-photos", editSubmissionId] }),
    [editSubmissionId, queryClient],
  );

  const deleteMutation = useMutation({
    mutationFn: (photoId: number) => deleteSubmissionPhoto(editSubmissionId!, photoId),
    onSuccess: () => {
      void invalidateSubmissionPhotos();
      toast.success(t("photos.deleted"));
    },
    onError: () => toast.error(t("photos.deleteFailed")),
  });

  const editSubmissionMutation = useMutation({
    mutationFn: async ({
      id,
      note,
      takenAt,
      originalNote,
      originalTakenAt,
    }: {
      id: number;
      note: string;
      takenAt: string | null;
      originalNote: string;
      originalTakenAt: string | null;
    }) => {
      const ops: Promise<void>[] = [];
      if (note !== originalNote) ops.push(updateSubmissionPhotoNote(editSubmissionId!, id, note));
      if (takenAt !== originalTakenAt) ops.push(updateSubmissionPhotoTakenAt(editSubmissionId!, id, takenAt));
      if (ops.length > 0) await Promise.all(ops);
    },
    onSuccess: () => {
      void invalidateSubmissionPhotos();
      setSubmissionEditState(null);
    },
    onError: () => toast.error(t("photos.noteFailed")),
  });

  const assignedPhotoState = useMemo(() => {
    const ids = new Set<number>();
    let mainId: number | null = null;
    for (const photo of stationPhotos) {
      ids.add(photo.id);
      if (photo.is_main) mainId = photo.id;
    }
    return { ids, mainId };
  }, [stationPhotos]);
  const assignedLocationPhotoIds = assignedPhotoState.ids;
  const currentMainLocationPhotoId = assignedPhotoState.mainId;

  const selectedLocationPhotoIds = useMemo(() => new Set(locationPhotoIds), [locationPhotoIds]);
  const markedForRemovalIds = useMemo(() => new Set(locationPhotoIdsToRemove), [locationPhotoIdsToRemove]);
  const uploadTotalCount = submissionPhotos.length + photos.length;
  const remainingSlots = MAX_SUBMISSION_PHOTOS - uploadTotalCount;
  const isLocationLoading = locationId !== undefined && (isLoadingLocationPhotos || isLoadingStationPhotos);
  const hasLocationPhotosError = locationId !== undefined && (locationPhotosLoadError || stationPhotosLoadError);
  const showLocationPhotosSection = locationId !== undefined && (isLocationLoading || hasLocationPhotosError || locationPhotos.length > 0);
  const isUploadEmpty = uploadTotalCount === 0 && !isLoadingSubmissionPhotos;

  const toggleRemoval = useCallback(
    (photo: LocationPhoto) => {
      if (markedForRemovalIds.has(photo.id)) {
        onLocationPhotoIdsToRemoveChange((ids) => ids.filter((id) => id !== photo.id));
        return;
      }

      onLocationPhotoIdsToRemoveChange((ids) => (ids.includes(photo.id) ? ids : [...ids, photo.id]));
      onLocationPhotoIdsChange((ids) => ids.filter((id) => id !== photo.id));
      if (mainLocationPhotoId === photo.id) onMainLocationPhotoIdChange(null);
    },
    [mainLocationPhotoId, markedForRemovalIds, onLocationPhotoIdsChange, onLocationPhotoIdsToRemoveChange, onMainLocationPhotoIdChange],
  );

  const uploadedMainPhotoId = useMemo(() => submissionPhotos.find((photo) => photo.is_main)?.id ?? null, [submissionPhotos]);
  const hasUploadMainProposal = mainUploadPhotoIndex !== null || uploadedMainPhotoId !== null;

  const setLocationPhotoAsMain = useCallback(
    (photo: LocationPhoto) => {
      if (assignedLocationPhotoIds.has(photo.id)) onLocationPhotoIdsChange((ids) => (ids.includes(photo.id) ? ids : [...ids, photo.id]));
      onMainUploadPhotoIndexChange(null);
      onMainLocationPhotoIdChange(photo.id);
    },
    [assignedLocationPhotoIds, onLocationPhotoIdsChange, onMainLocationPhotoIdChange, onMainUploadPhotoIndexChange],
  );

  const setLocalPhotoAsMain = useCallback(
    (index: number) => {
      onMainLocationPhotoIdChange(null);
      onMainUploadPhotoIndexChange(index);
    },
    [onMainLocationPhotoIdChange, onMainUploadPhotoIndexChange],
  );

  if (!shouldRender) return null;

  function toggleLocationPhoto(photo: LocationPhoto) {
    const next = new Set(selectedLocationPhotoIds);
    if (next.has(photo.id)) {
      next.delete(photo.id);
      if (mainLocationPhotoId === photo.id) onMainLocationPhotoIdChange(null);
    } else {
      next.add(photo.id);
    }
    onLocationPhotoIdsChange(Array.from(next));
  }

  function processFiles(files: File[]) {
    if (submissionPhotosLoadError) return;
    const valid: File[] = [];
    for (const file of files) {
      if (file.size > MAX_PHOTO_SIZE_BYTES) toast.error(t("photos.fileTooLarge", { name: file.name, size: MAX_PHOTO_SIZE_LABEL }));
      else valid.push(file);
    }
    const combined = [...photos, ...valid].slice(0, remainingSlots > 0 ? remainingSlots + photos.length : photos.length);
    onPhotosChange(combined);
    onNotesChange([...notes, ...valid.map(() => "")].slice(0, combined.length));
    onTakenAtsChange([...takenAts, ...valid.map(() => null)].slice(0, combined.length));
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    processFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDragEnter(event: React.DragEvent) {
    event.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setIsDragging(true);
  }

  function handleDragLeave() {
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (remainingSlots <= 0) return;
    const droppedFiles = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (droppedFiles.length > 0) processFiles(droppedFiles);
  }

  function removeLocalPhoto(index: number) {
    onPhotosChange(photos.filter((_, i) => i !== index));
    onNotesChange(notes.filter((_, i) => i !== index));
    onTakenAtsChange(takenAts.filter((_, i) => i !== index));
    if (mainUploadPhotoIndex === index) onMainUploadPhotoIndexChange(null);
    else if (mainUploadPhotoIndex !== null && mainUploadPhotoIndex > index) onMainUploadPhotoIndexChange(mainUploadPhotoIndex - 1);
  }

  function confirmDelete() {
    if (deleteTarget === null) return;
    if (deleteTarget.type === "local") removeLocalPhoto(deleteTarget.index);
    else deleteMutation.mutate(deleteTarget.id);
    setDeleteTarget(null);
  }

  function openLocalEdit(index: number) {
    setLocalEditState({ index, note: notes[index] ?? "", takenAt: takenAts[index] ?? null });
  }

  function saveLocalEdit() {
    if (localEditState === null) return;
    const updatedNotes = [...notes];
    updatedNotes[localEditState.index] = localEditState.note;
    const updatedTakenAts = [...takenAts];
    updatedTakenAts[localEditState.index] = localEditState.takenAt;
    onNotesChange(updatedNotes);
    onTakenAtsChange(updatedTakenAts);
    setLocalEditState(null);
  }

  function openSubmissionPhotoEdit(photo: SubmissionPhoto) {
    setSubmissionEditState({ id: photo.id, note: photo.note ?? "", takenAt: photo.taken_at ? new Date(photo.taken_at) : null });
  }

  return (
    <>
      <Collapsible defaultOpen>
        <div
          className={cn("border rounded-xl overflow-hidden transition-colors", isDragging && "ring-2 ring-primary border-primary bg-primary/5")}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer select-none group">
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className="size-3.5 text-muted-foreground transition-transform group-data-panel-open:rotate-0 -rotate-90"
              />
              <HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />
              <span className="font-semibold text-sm">{t("photos.label")}</span>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFileChange} />
            <div className="p-3 space-y-3">
              {showLocationPhotosSection ? (
                <PhotoSubsection
                  title={t("photos.locationPhotos")}
                  meta={
                    !isLocationLoading && !hasLocationPhotosError && locationPhotos.length > 0
                      ? t("photos.selectionCount", { selected: selectedLocationPhotoIds.size, total: locationPhotos.length })
                      : undefined
                  }
                >
                  {hasLocationPhotosError ? (
                    <InlineError
                      className="m-3"
                      onRetry={() => Promise.all([refetchLocationPhotos(), refetchStationPhotos()])}
                      isRetrying={isFetchingLocationPhotos || isFetchingStationPhotos}
                    />
                  ) : (
                    renderLocationPhotoContent({
                      assignedLocationPhotoIds,
                      currentMainLocationPhotoId,
                      hasUploadMainProposal,
                      isLoading: isLocationLoading,
                      locationLightbox,
                      locationPhotos,
                      mainLocationPhotoId,
                      markedForRemovalIds,
                      onSetLocationPhotoAsMain: setLocationPhotoAsMain,
                      onToggleRemoval: toggleRemoval,
                      selectedLocationPhotoIds,
                      t,
                      toggleLocationPhoto,
                    })
                  )}
                </PhotoSubsection>
              ) : null}

              <PhotoSubsection
                title={mode === "existing" ? t("photos.uploadedPhotos") : t("photos.label")}
                meta={!isLoadingSubmissionPhotos && !submissionPhotosLoadError ? `${uploadTotalCount}/${MAX_SUBMISSION_PHOTOS}` : undefined}
              >
                {isLoadingSubmissionPhotos ? (
                  <CenteredSpinner />
                ) : submissionPhotosLoadError ? (
                  <InlineError className="m-3" onRetry={() => refetchSubmissionPhotos()} isRetrying={isFetchingSubmissionPhotos} />
                ) : isUploadEmpty ? (
                  <EmptyUploadState onUploadClick={() => fileInputRef.current?.click()} />
                ) : (
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                    {submissionPhotos.map((photo, index) => (
                      <UploadPhotoCard
                        key={`submission-${photo.id}`}
                        photo={photo}
                        isMain={photo.is_main && mainUploadPhotoIndex === null && mainLocationPhotoId === null}
                        onOpen={() => uploadLightbox.open(index)}
                        triggerRef={uploadLightbox.triggerRef(index)}
                        onEdit={() => openSubmissionPhotoEdit(photo)}
                        onDelete={() => setDeleteTarget({ type: "submission", id: photo.id })}
                        editState={submissionEditState}
                        setEditState={setSubmissionEditState}
                        mutation={editSubmissionMutation}
                      />
                    ))}
                    {photos.map((file, index) => (
                      <LocalPhotoCard
                        key={`local-${file.name}-${index}`}
                        file={file}
                        url={previewUrls[index] ?? ""}
                        localIndex={index}
                        lightboxIndex={submissionPhotos.length + index}
                        isMain={mainUploadPhotoIndex === index}
                        onSetAsMain={() => setLocalPhotoAsMain(index)}
                        onOpen={uploadLightbox.open}
                        triggerRef={uploadLightbox.triggerRef(submissionPhotos.length + index)}
                        onEdit={openLocalEdit}
                        onDelete={() => setDeleteTarget({ type: "local", index })}
                        editState={localEditState}
                        setEditState={setLocalEditState}
                        onSave={saveLocalEdit}
                      />
                    ))}
                    {uploadTotalCount < MAX_SUBMISSION_PHOTOS ? (
                      <AddPhotoTile className="aspect-square h-auto" onClick={() => fileInputRef.current?.click()} />
                    ) : null}
                  </div>
                )}
                {uploadTotalCount > 0 ? <PhotosWarning /> : null}
                <p className="px-3 pb-2 text-xs text-muted-foreground">
                  {t("photos.hint", { max: MAX_SUBMISSION_PHOTOS, size: MAX_PHOTO_SIZE_LABEL })}
                </p>
              </PhotoSubsection>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("photos.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("photos.confirmDeleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Spinner /> : t("common:actions.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PhotoLightbox photos={locationPhotos} {...locationLightbox.lightboxProps} />

      <UploadPhotosLightbox
        files={photos}
        notes={notes}
        previewUrls={previewUrls}
        submissionPhotos={submissionPhotos}
        takenAts={takenAts}
        {...uploadLightbox.lightboxProps}
      />
    </>
  );
}

function PhotoSubsection({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-background overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <Spinner />
    </div>
  );
}

function renderLocationPhotoContent({
  assignedLocationPhotoIds,
  currentMainLocationPhotoId,
  hasUploadMainProposal,
  isLoading,
  locationLightbox,
  locationPhotos,
  mainLocationPhotoId,
  markedForRemovalIds,
  onSetLocationPhotoAsMain,
  onToggleRemoval,
  selectedLocationPhotoIds,
  t,
  toggleLocationPhoto,
}: {
  assignedLocationPhotoIds: ReadonlySet<number>;
  currentMainLocationPhotoId: number | null;
  hasUploadMainProposal: boolean;
  isLoading: boolean;
  locationLightbox: ReturnType<typeof useLightbox>;
  locationPhotos: LocationPhoto[];
  mainLocationPhotoId: number | null;
  markedForRemovalIds: ReadonlySet<number>;
  onSetLocationPhotoAsMain: (photo: LocationPhoto) => void;
  onToggleRemoval: (photo: LocationPhoto) => void;
  selectedLocationPhotoIds: ReadonlySet<number>;
  t: (key: string, options?: Record<string, unknown>) => string;
  toggleLocationPhoto: (photo: LocationPhoto) => void;
}) {
  if (isLoading) return <CenteredSpinner />;
  if (locationPhotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground gap-1.5">
        <HugeiconsIcon icon={Image01Icon} className="size-8 opacity-20" />
        <p>{t("photos.emptyLocation")}</p>
        <p className="text-xs">{t("photos.uploadBelow")}</p>
      </div>
    );
  }

  return (
    <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 max-h-80 overflow-y-auto">
      {locationPhotos.map((photo, index) => (
        <LocationPhotoCard
          key={photo.id}
          assignedLocationPhotoIds={assignedLocationPhotoIds}
          currentMainLocationPhotoId={currentMainLocationPhotoId}
          hasUploadMainProposal={hasUploadMainProposal}
          index={index}
          mainLocationPhotoId={mainLocationPhotoId}
          markedForRemovalIds={markedForRemovalIds}
          onOpen={locationLightbox.open}
          onSetLocationPhotoAsMain={onSetLocationPhotoAsMain}
          onToggleRemoval={onToggleRemoval}
          photo={photo}
          selectedLocationPhotoIds={selectedLocationPhotoIds}
          toggleLocationPhoto={toggleLocationPhoto}
          triggerRef={locationLightbox.triggerRef(index)}
        />
      ))}
    </div>
  );
}

function LocationPhotoCard({
  assignedLocationPhotoIds,
  currentMainLocationPhotoId,
  hasUploadMainProposal,
  index,
  mainLocationPhotoId,
  markedForRemovalIds,
  onOpen,
  onSetLocationPhotoAsMain,
  onToggleRemoval,
  photo,
  selectedLocationPhotoIds,
  toggleLocationPhoto,
  triggerRef,
}: {
  assignedLocationPhotoIds: ReadonlySet<number>;
  currentMainLocationPhotoId: number | null;
  hasUploadMainProposal: boolean;
  index: number;
  mainLocationPhotoId: number | null;
  markedForRemovalIds: ReadonlySet<number>;
  onOpen: (index: number) => void;
  onSetLocationPhotoAsMain: (photo: LocationPhoto) => void;
  onToggleRemoval: (photo: LocationPhoto) => void;
  photo: LocationPhoto;
  selectedLocationPhotoIds: ReadonlySet<number>;
  toggleLocationPhoto: (photo: LocationPhoto) => void;
  triggerRef: Ref<HTMLDivElement>;
}) {
  const { t, i18n } = useTranslation("submissions");
  const isSelected = selectedLocationPhotoIds.has(photo.id);
  const isAssigned = assignedLocationPhotoIds.has(photo.id);
  const isMarkedForRemoval = markedForRemovalIds.has(photo.id);
  const isVisuallySelected = isSelected || (isAssigned && !isMarkedForRemoval);
  const isMain = mainLocationPhotoId === photo.id;
  const isCurrentMain = currentMainLocationPhotoId === photo.id && mainLocationPhotoId === null && !hasUploadMainProposal;
  const isEffectiveMain = isMain || isCurrentMain;
  const showStarBadge = !isMarkedForRemoval && isEffectiveMain;
  const showSetAsMain = isVisuallySelected && !isMarkedForRemoval && !isEffectiveMain;
  const handleToggle = () => {
    if (isAssigned) onToggleRemoval(photo);
    else toggleLocationPhoto(photo);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      title={isAssigned ? t(isMarkedForRemoval ? "photos.cancelRemoval" : "photos.removeFromStation") : undefined}
      className={cn(
        "rounded-lg overflow-hidden border-2 transition-colors bg-muted cursor-pointer select-none focus:outline-none",
        isMarkedForRemoval ? "border-red-500" : isVisuallySelected ? "border-primary" : "border-transparent",
      )}
      onClick={handleToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") handleToggle();
      }}
    >
      <PhotoImage
        ref={triggerRef}
        src={photoThumbUrl(photo)}
        alt={photo.note ?? ""}
        frameClassName="h-36"
        imageClassName={cn("transition-opacity", selectedLocationPhotoIds.size > 0 && !isVisuallySelected && !isMarkedForRemoval && "opacity-40")}
        onOpen={() => onOpen(index)}
      >
        {showStarBadge ? (
          <span
            className={cn(
              "absolute top-1 left-1 rounded-full p-0.5",
              isMain ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground ring-1 ring-border",
            )}
          >
            <HugeiconsIcon icon={StarIcon} className="size-3" />
          </span>
        ) : null}
        {isRecentPhoto(photo.createdAt) ? (
          <span className="absolute bottom-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none pointer-events-none">
            NEW
          </span>
        ) : null}
        {isVisuallySelected || isMarkedForRemoval ? (
          <span
            className={cn(
              "absolute bottom-1 right-1 size-4 rounded-full border-2 flex items-center justify-center pointer-events-none transition-colors",
              isMarkedForRemoval ? "bg-red-500 border-red-500" : "bg-primary border-primary",
            )}
          >
            <HugeiconsIcon icon={isMarkedForRemoval ? Cancel01Icon : Tick02Icon} className="size-2.5 text-white" />
          </span>
        ) : null}
      </PhotoImage>
      {showSetAsMain ? (
        <div className="border-t">
          <button
            type="button"
            className="w-full flex items-center justify-center py-2 text-xs text-muted-foreground hover:text-amber-500 hover:bg-accent transition-colors"
            onClick={(event) => {
              event.stopPropagation();
              onSetLocationPhotoAsMain(photo);
            }}
            title={t("common:photos.setAsMain")}
          >
            <HugeiconsIcon icon={StarIcon} className="size-3.5" />
          </button>
        </div>
      ) : null}
      <PhotoMeta photo={photo} locale={i18n.language} />
    </div>
  );
}

function EmptyUploadState({ onUploadClick }: { onUploadClick: () => void }) {
  const { t } = useTranslation("submissions");
  return (
    <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground gap-2">
      <HugeiconsIcon icon={Image01Icon} className="size-8 opacity-20" />
      <p>{t("photos.empty")}</p>
      <Button type="button" size="sm" variant="outline" onClick={onUploadClick} className="gap-1.5">
        <HugeiconsIcon icon={Upload04Icon} className="size-3.5" />
        {t("photos.uploadFirst")}
      </Button>
    </div>
  );
}

function UploadPhotoCard({
  editState,
  isMain,
  mutation,
  onDelete,
  onEdit,
  onOpen,
  photo,
  setEditState,
  triggerRef,
}: {
  editState: { id: number; note: string; takenAt: Date | null } | null;
  isMain: boolean;
  mutation: ReturnType<
    typeof useMutation<void, Error, { id: number; note: string; takenAt: string | null; originalNote: string; originalTakenAt: string | null }>
  >;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  photo: SubmissionPhoto;
  setEditState: (state: { id: number; note: string; takenAt: Date | null } | null) => void;
  triggerRef: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation("submissions");
  return (
    <div className="rounded-lg overflow-hidden border bg-muted">
      <PhotoImage ref={triggerRef} src={photoThumbUrl(photo)} alt={photo.note ?? ""} frameClassName="aspect-square h-auto" onOpen={onOpen}>
        {isMain ? (
          <span className="absolute top-1 left-1 bg-amber-500 text-white rounded-full p-0.5">
            <HugeiconsIcon icon={StarIcon} className="size-3" />
          </span>
        ) : null}
      </PhotoImage>
      <div className="grid grid-cols-2 divide-x border-t">
        <PhotoEditPopover
          isOpen={editState?.id === photo.id}
          note={editState?.note ?? ""}
          takenAt={editState?.takenAt ?? null}
          onOpen={onEdit}
          onOpenChange={(open) => !open && setEditState(null)}
          onNoteChange={(note) => setEditState(editState ? { ...editState, note } : editState)}
          onTakenAtChange={(takenAt) => setEditState(editState ? { ...editState, takenAt } : editState)}
          onSave={() =>
            mutation.mutate({
              id: photo.id,
              note: editState?.note ?? "",
              takenAt: editState?.takenAt?.toISOString() ?? null,
              originalNote: photo.note ?? "",
              originalTakenAt: photo.taken_at ?? null,
            })
          }
          isSaving={mutation.isPending}
        />
        <PhotoDeleteButton onClick={onDelete} label={t("common:actions.remove")} />
      </div>
    </div>
  );
}

function LocalPhotoCard({
  editState,
  file,
  isMain,
  lightboxIndex,
  localIndex,
  onDelete,
  onEdit,
  onOpen,
  onSave,
  onSetAsMain,
  setEditState,
  triggerRef,
  url,
}: {
  editState: { index: number; note: string; takenAt: Date | null } | null;
  file: File;
  isMain: boolean;
  lightboxIndex: number;
  localIndex: number;
  onDelete: () => void;
  onEdit: (index: number) => void;
  onOpen: (index: number) => void;
  onSave: () => void;
  onSetAsMain: () => void;
  setEditState: (state: { index: number; note: string; takenAt: Date | null } | null) => void;
  triggerRef: Ref<HTMLDivElement>;
  url: string;
}) {
  const { t } = useTranslation("submissions");
  return (
    <div className="rounded-lg overflow-hidden border bg-muted">
      <PhotoImage ref={triggerRef} src={url} alt={file.name} frameClassName="aspect-square h-auto" onOpen={() => onOpen(lightboxIndex)}>
        {isMain ? (
          <span className="absolute top-1 left-1 bg-amber-500 text-white rounded-full p-0.5">
            <HugeiconsIcon icon={StarIcon} className="size-3" />
          </span>
        ) : null}
      </PhotoImage>
      <div className={cn("divide-x border-t", isMain ? "grid grid-cols-2" : "grid grid-cols-3")}>
        {!isMain ? (
          <button
            type="button"
            className="flex items-center justify-center py-2 text-xs text-muted-foreground hover:text-amber-500 hover:bg-accent transition-colors"
            onClick={onSetAsMain}
            title={t("common:photos.setAsMain")}
          >
            <HugeiconsIcon icon={StarIcon} className="size-3.5" />
          </button>
        ) : null}
        <PhotoEditPopover
          isOpen={editState?.index === localIndex}
          note={editState?.note ?? ""}
          takenAt={editState?.takenAt ?? null}
          onOpen={() => onEdit(localIndex)}
          onOpenChange={(open) => !open && setEditState(null)}
          onNoteChange={(note) => setEditState(editState ? { ...editState, note } : editState)}
          onTakenAtChange={(takenAt) => setEditState(editState ? { ...editState, takenAt } : editState)}
          onSave={onSave}
        />
        <PhotoDeleteButton onClick={onDelete} label={t("common:actions.remove")} />
      </div>
    </div>
  );
}

function PhotosWarning() {
  const { t } = useTranslation("submissions");
  return (
    <div className="mx-3 mb-2 rounded-lg border border-blue-500/30 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 flex items-start gap-2">
      <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
      <div className="space-y-0.5 min-w-0">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{t("warnings.photosTitle")}</p>
        <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">{t("warnings.photosDesc")}</p>
      </div>
    </div>
  );
}

export function UploadPhotosLightbox({
  files,
  notes,
  previewUrls,
  submissionPhotos,
  takenAts,
  ...props
}: Omit<LightboxProps, "slides"> & {
  files: File[];
  notes: string[];
  previewUrls: string[];
  submissionPhotos: SubmissionPhoto[];
  takenAts: (Date | null)[];
}) {
  const { t } = useTranslation("stationDetails");
  const slides = [
    ...photoSlides(
      submissionPhotos.map((photo) => ({ ...photo, is_main: false })),
      t,
    ),
    ...files.map((file, index): LightboxSlide => {
      const url = previewUrls[index] ?? "";
      const note = (notes[index] ?? "").trim();
      const takenAt = takenAts[index] ?? null;
      return {
        key: url,
        src: url,
        alt: note || file.name,
        caption: <LocalPhotoCaption name={file.name} note={note} takenAt={takenAt} />,
        details: <LocalPhotoDetails name={file.name} note={note} takenAt={takenAt} />,
        downloadName: file.name,
      };
    }),
  ];

  return <Lightbox slides={slides} {...props} />;
}

function LocalPhotoCaption({ name, note, takenAt }: { name: string; note: string; takenAt: Date | null }) {
  const { t, i18n } = useTranslation("submissions");

  return (
    <div className="flex flex-col gap-1.5 md:items-center">
      {note ? <p className="line-clamp-2 text-sm leading-snug text-white/90 md:text-[15px]">{note}</p> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60 md:justify-center">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-white/80">
          <HugeiconsIcon icon={Image01Icon} className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{name}</span>
        </span>
        {takenAt ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 tabular-nums">
              <HugeiconsIcon icon={Camera01Icon} className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t("photos.takenAt")}: </span>
              <time dateTime={takenAt.toISOString()}>{formatMonthYear(takenAt, i18n.language, "short")}</time>
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function LocalPhotoDetails({ name, note, takenAt }: { name: string; note: string; takenAt: Date | null }) {
  const { t, i18n } = useTranslation("submissions");

  return (
    <>
      {note ? <p className="text-[15px] leading-snug text-white">{note}</p> : null}
      <p className="text-sm wrap-break-word text-white/80">{name}</p>
      {takenAt ? (
        <LightboxDetailRow label={t("photos.takenAt")}>
          <time dateTime={takenAt.toISOString()}>{formatMonthYear(takenAt, i18n.language, "long")}</time>
        </LightboxDetailRow>
      ) : null}
    </>
  );
}
