import { Image01Icon, StarIcon, Tick02Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useLightbox } from "@/components/lightbox";
import { AddPhotoTile, PhotoEditPopover, PhotoImage, isRecentPhoto } from "@/components/photos/photoGridPrimitives";
import { PhotoLightbox } from "@/components/photos/photoLightbox";
import { trackPhotoUpload } from "@/components/photos/photoUploadToast";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import {
  invalidatePhotoLists,
  invalidateStationPhotoLists,
  locationPhotoRecordsQueryOptions,
  replaceStationPhotos,
  stationPhotoRecordsQueryOptions,
  updateLocationPhotoRecord,
  uploadAndAssignStationPhotoRecords,
} from "@/features/station-details/station/api";
import { isMainPhoto } from "@/features/station-details/station/components/photos/stationPhotos";
import type { PhotoRecord, PhotoUpdate } from "@/features/station-details/station/types";
import { isGloballyHandledError } from "@/lib/api";
import { photoQualityErrorKey } from "@/lib/photoUploadError";
import { cn } from "@/lib/utils";

type Props = { stationId: number; locationId: number };

export const StationPhotoSelector = memo(function StationPhotoSelector({ stationId, locationId }: Props) {
  const { t } = useTranslation("submissions");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const {
    data: locationPhotos = [],
    isLoading: loadingLocation,
    isLoadingError: locationLoadError,
    isFetching: fetchingLocation,
    refetch: refetchLocation,
  } = useQuery(locationPhotoRecordsQueryOptions(locationId));

  const {
    data: stationPhotos = [],
    isLoading: loadingStation,
    isLoadingError: stationLoadError,
    isFetching: fetchingStation,
    refetch: refetchStation,
  } = useQuery(stationPhotoRecordsQueryOptions(stationId));

  const [selectedOverride, setSelectedOverride] = useState<Set<string> | null>(null);
  const [mainIdOverride, setMainIdOverride] = useState<string | null>();

  const serverMainId = stationPhotos.find((p) => isMainPhoto(p, stationId))?.id ?? null;
  const selected = useMemo(() => selectedOverride ?? new Set(stationPhotos.map((p) => p.id)), [selectedOverride, stationPhotos]);
  const mainId = mainIdOverride === undefined ? serverMainId : mainIdOverride;

  const [editState, setEditState] = useState<{ id: string; note: string; takenAt: Date | null } | null>(null);
  const lightbox = useLightbox();

  const editMutation = useMutation({
    mutationFn: async ({ photo, note, takenAt }: { photo: PhotoRecord; note: string; takenAt: string | null }) => {
      const changes: PhotoUpdate = {};
      if (note !== (photo.note ?? "")) changes.note = note;
      if (takenAt !== photo.takenAt) changes.takenAt = takenAt;
      if (Object.keys(changes).length > 0) await updateLocationPhotoRecord(locationId, photo.id, changes);
    },
    onSuccess: (_updated, { photo }) => {
      void queryClient.invalidateQueries({ queryKey: ["location-photos", locationId] });
      void invalidateStationPhotoLists(queryClient, photo);
      setEditState(null);
    },
    onError: (error) => {
      if (isGloballyHandledError(error)) return;
      toast.error(t("photos.noteFailed"));
    },
  });

  const isDirty = useMemo(() => {
    const serverIds = new Set(stationPhotos.map((p) => p.id));
    if (selected.size !== serverIds.size || mainId !== serverMainId) return true;
    for (const id of selected) if (!serverIds.has(id)) return true;
    return false;
  }, [selected, mainId, stationPhotos, serverMainId]);

  const saveMutation = useMutation({
    mutationFn: () => replaceStationPhotos(stationId, Array.from(selected), mainId),
    onSuccess: (shownPhotos) => {
      queryClient.setQueryData(stationPhotoRecordsQueryOptions(stationId).queryKey, shownPhotos);
      setSelectedOverride(null);
      setMainIdOverride(undefined);
      void invalidatePhotoLists(queryClient, locationId, stationId);
      toast.success(t("photos.selectionSaved"));
    },
    onError: (error) => {
      if (isGloballyHandledError(error)) return;
      toast.error(t("photos.selectionFailed"));
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) =>
      trackPhotoUpload(
        (onProgress) =>
          uploadAndAssignStationPhotoRecords({
            locationId,
            stationId,
            files,
            photoIds: Array.from(selected),
            mainPhotoId: mainId,
            useFirstUploadedAsMain: locationPhotos.length === 0,
            onProgress,
          }),
        { success: t("photos.uploaded"), error: (error) => t(photoQualityErrorKey(error) ?? "photos.uploadFailed") },
      ),
    onSuccess: async (shownPhotos) => {
      queryClient.setQueryData(stationPhotoRecordsQueryOptions(stationId).queryKey, shownPhotos);
      setSelectedOverride(null);
      setMainIdOverride(undefined);
      await invalidatePhotoLists(queryClient, locationId, stationId);
    },
    onError: async () => {
      await invalidatePhotoLists(queryClient, locationId, stationId);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) uploadMutation.mutate(files);
    e.target.value = "";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setIsDragging(true);
  }

  function handleDragLeave() {
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (uploadMutation.isPending) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) uploadMutation.mutate(files);
  }

  const isLoading = loadingLocation || loadingStation;
  const isDropTarget = isDragging && !uploadMutation.isPending;

  function toggleSelect(photo: PhotoRecord) {
    const next = new Set(selected);
    if (next.has(photo.id)) {
      next.delete(photo.id);
      if (mainId === photo.id) setMainIdOverride(null);
    } else {
      next.add(photo.id);
    }
    setSelectedOverride(next);
  }

  function setMain(photoId: string) {
    setMainIdOverride(photoId);
    if (!selected.has(photoId)) {
      const next = new Set(selected);
      next.add(photoId);
      setSelectedOverride(next);
    }
  }

  if (isLoading || locationLoadError || stationLoadError) {
    return (
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
          <HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{t("photos.label")}</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <InlineError
            className="m-3"
            onRetry={() => Promise.all([refetchLocation(), refetchStation()])}
            isRetrying={fetchingLocation || fetchingStation}
          />
        )}
      </div>
    );
  }

  if (locationPhotos.length === 0) {
    return (
      <div
        className={cn("border rounded-xl overflow-hidden transition-colors", isDropTarget ? "ring-2 ring-primary border-primary bg-primary/5" : "")}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
          <HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{t("photos.label")}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground gap-2">
          <HugeiconsIcon icon={Image01Icon} className="size-8 opacity-20" />
          <p>{t("photos.emptyLocation")}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            onChange={handleFileChange}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="cursor-pointer gap-1.5"
          >
            {uploadMutation.isPending ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={Upload04Icon} className="size-3.5" />}
            {t("photos.uploadFirst")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn("border rounded-xl overflow-hidden transition-colors", isDropTarget ? "ring-2 ring-primary border-primary bg-primary/5" : "")}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{t("photos.label")}</span>
            <span className="text-xs text-muted-foreground">
              {t("photos.selectionCount", { selected: selected.size, total: locationPhotos.length })}
            </span>
          </div>
          {isDirty ? (
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="h-7 text-xs gap-1.5">
              {saveMutation.isPending ? <Spinner className="size-3" /> : <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />}
              {t("photos.saveSelection")}
            </Button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={handleFileChange}
        />
        <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 max-h-96 overflow-y-auto">
          {locationPhotos.map((photo, index) => {
            const isSelected = selected.has(photo.id);
            const isMain = mainId === photo.id;

            return (
              <div
                key={photo.id}
                className={cn(
                  "rounded-lg overflow-hidden border-2 transition-colors bg-muted cursor-pointer select-none",
                  "has-[[data-photo-select]:focus-visible]:ring-2 has-[[data-photo-select]:focus-visible]:ring-ring/50",
                  isSelected ? "border-primary" : "border-transparent",
                )}
                onClick={(e) => {
                  if (e.target instanceof Node && e.currentTarget.contains(e.target)) toggleSelect(photo);
                }}
              >
                <div className="relative">
                  <PhotoImage
                    ref={lightbox.triggerRef(index)}
                    src={photo.urls.thumb}
                    alt={photo.note ?? ""}
                    imageClassName={cn("transition-opacity", isSelected ? "" : "opacity-40")}
                    onOpen={() => lightbox.open(index)}
                  >
                    {isMain ? (
                      <span className="absolute top-1 left-1 bg-amber-500 text-white rounded-full p-0.5">
                        <HugeiconsIcon icon={StarIcon} className="size-3" />
                      </span>
                    ) : null}
                    {isRecentPhoto(photo.createdAt) ? (
                      <span className="absolute bottom-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none pointer-events-none">
                        NEW
                      </span>
                    ) : null}
                  </PhotoImage>
                  <button
                    type="button"
                    data-photo-select
                    aria-pressed={isSelected}
                    aria-label={t("stationDetails:photos.photoAlt", { number: index + 1 })}
                    className={cn(
                      "absolute bottom-1 right-1 size-4 rounded-full border-2 flex items-center justify-center pointer-events-none transition-colors outline-none",
                      isSelected ? "bg-primary border-primary" : "bg-black/30 border-white/70",
                    )}
                  >
                    {isSelected ? <HugeiconsIcon icon={Tick02Icon} className="size-2.5 text-primary-foreground" aria-hidden="true" /> : null}
                  </button>
                </div>
                <div className={cn("border-t", isSelected && !isMain ? "grid grid-cols-2 divide-x" : "")}>
                  {isSelected && !isMain ? (
                    <button
                      type="button"
                      className="flex cursor-pointer items-center justify-center py-2 text-xs text-muted-foreground hover:text-amber-500 hover:bg-accent transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMain(photo.id);
                      }}
                      title={t("common:photos.setAsMain")}
                      aria-label={t("common:photos.setAsMain")}
                    >
                      <HugeiconsIcon icon={StarIcon} className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                  <PhotoEditPopover
                    isOpen={editState?.id === photo.id}
                    note={editState?.note ?? ""}
                    takenAt={editState?.takenAt ?? null}
                    onOpen={() => setEditState({ id: photo.id, note: photo.note ?? "", takenAt: photo.takenAt ? new Date(photo.takenAt) : null })}
                    onOpenChange={(open) => !open && setEditState(null)}
                    onNoteChange={(note) => setEditState(editState ? { ...editState, note } : editState)}
                    onTakenAtChange={(takenAt) => setEditState(editState ? { ...editState, takenAt } : editState)}
                    onSave={() => editMutation.mutate({ photo, note: editState?.note ?? "", takenAt: editState?.takenAt?.toISOString() ?? null })}
                    isSaving={editMutation.isPending}
                  />
                </div>
              </div>
            );
          })}
          <AddPhotoTile onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} isLoading={uploadMutation.isPending} />
        </div>
      </div>
      <PhotoLightbox photos={locationPhotos} {...lightbox.lightboxProps} />
    </>
  );
});
