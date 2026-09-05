import { Image01Icon, StarIcon, Tick02Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Lightbox } from "@/components/photos/lightbox";
import { AddPhotoTile, PhotoEditPopover, PhotoImage, isRecentPhoto } from "@/components/photos/photoGridPrimitives";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { LocationPhoto } from "@/features/station-details/api";
import {
  fetchLocationPhotos,
  fetchStationPhotos,
  setStationPhotoSelection,
  updateLocationPhotoNote,
  updateLocationPhotoTakenAt,
  uploadAndAssignStationPhotos,
} from "@/features/station-details/api";
import { cn } from "@/lib/utils";

type Props = { stationId: number; locationId: number };

export function StationPhotoSelector({ stationId, locationId }: Props) {
  const { t } = useTranslation("submissions");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const { data: locationPhotos = [], isLoading: loadingLocation } = useQuery({
    queryKey: ["location-photos", locationId],
    queryFn: () => fetchLocationPhotos(locationId),
    staleTime: 1000 * 60 * 5,
  });

  const { data: stationPhotos = [], isLoading: loadingStation } = useQuery({
    queryKey: ["station-photos", stationId],
    queryFn: () => fetchStationPhotos(stationId),
    staleTime: 1000 * 60 * 5,
  });

  const [selectedOverride, setSelectedOverride] = useState<Set<number> | null>(null);
  const [mainIdOverride, setMainIdOverride] = useState<number | null | "unset">("unset");

  const selected = useMemo(() => selectedOverride ?? new Set(stationPhotos.map((p) => p.id)), [selectedOverride, stationPhotos]);
  const mainId = mainIdOverride === "unset" ? (stationPhotos.find((p) => p.is_main)?.id ?? null) : mainIdOverride;

  const [editState, setEditState] = useState<{ id: number; note: string; takenAt: Date | null } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevLightbox = useCallback(
    () => setLightboxIndex((i) => (i !== null ? (i - 1 + locationPhotos.length) % locationPhotos.length : null)),
    [locationPhotos.length],
  );
  const nextLightbox = useCallback(() => setLightboxIndex((i) => (i !== null ? (i + 1) % locationPhotos.length : null)), [locationPhotos.length]);

  const editMutation = useMutation({
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
      if (note !== originalNote) ops.push(updateLocationPhotoNote(locationId, id, note));
      if (takenAt !== originalTakenAt) ops.push(updateLocationPhotoTakenAt(locationId, id, takenAt));
      if (ops.length > 0) await Promise.all(ops);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["location-photos", locationId] });
      setEditState(null);
    },
    onError: () => toast.error(t("photos.noteFailed")),
  });

  const isDirty = useMemo(() => {
    const serverIds = new Set(stationPhotos.map((p) => p.id));
    const serverMain = stationPhotos.find((p) => p.is_main)?.id ?? null;
    if (selected.size !== serverIds.size || mainId !== serverMain) return true;
    for (const id of selected) if (!serverIds.has(id)) return true;
    return false;
  }, [selected, mainId, stationPhotos]);

  const saveMutation = useMutation({
    mutationFn: () => setStationPhotoSelection(stationId, Array.from(selected), mainId),
    onSuccess: () => {
      setSelectedOverride(null);
      setMainIdOverride("unset");
      void queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] });
      toast.success(t("photos.selectionSaved"));
    },
    onError: () => toast.error(t("photos.selectionFailed")),
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) =>
      uploadAndAssignStationPhotos({
        locationId,
        stationId,
        files,
        selected: Array.from(selected),
        mainId,
        useFirstUploadedAsMain: locationPhotos.length === 0,
      }),
    onSuccess: async () => {
      setSelectedOverride(null);
      setMainIdOverride("unset");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["location-photos", locationId] }),
        queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] }),
      ]);
      toast.success(t("photos.uploaded"));
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["location-photos", locationId] }),
        queryClient.invalidateQueries({ queryKey: ["station-photos", stationId] }),
      ]);
      toast.error(t("photos.uploadFailed"));
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
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) uploadMutation.mutate(files);
  }

  const isLoading = loadingLocation || loadingStation;

  function toggleSelect(photo: LocationPhoto) {
    const next = new Set(selected);
    if (next.has(photo.id)) {
      next.delete(photo.id);
      if (mainId === photo.id) setMainIdOverride(null);
    } else {
      next.add(photo.id);
    }
    setSelectedOverride(next);
  }

  function setMain(photoId: number) {
    setMainIdOverride(photoId);
    if (!selected.has(photoId)) {
      const next = new Set(selected);
      next.add(photoId);
      setSelectedOverride(next);
    }
  }

  if (isLoading) {
    return (
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
          <HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{t("photos.label")}</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </div>
    );
  }

  if (locationPhotos.length === 0) {
    return (
      <div
        className={cn("border rounded-xl overflow-hidden transition-colors", isDragging ? "ring-2 ring-primary border-primary bg-primary/5" : "")}
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
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFileChange} />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} className="gap-1.5">
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
        className={cn("border rounded-xl overflow-hidden transition-colors", isDragging ? "ring-2 ring-primary border-primary bg-primary/5" : "")}
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
          {isDirty && (
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="h-7 text-xs gap-1.5">
              {saveMutation.isPending ? <Spinner className="size-3" /> : <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />}
              {t("photos.saveSelection")}
            </Button>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFileChange} />
        <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 max-h-96 overflow-y-auto">
          {locationPhotos.map((photo) => {
            const isSelected = selected.has(photo.id);
            const isMain = mainId === photo.id;

            return (
              <div
                key={photo.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "rounded-lg overflow-hidden border-2 transition-colors bg-muted cursor-pointer select-none focus:outline-none",
                  isSelected ? "border-primary" : "border-transparent",
                )}
                onClick={() => toggleSelect(photo)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") toggleSelect(photo);
                }}
              >
                <PhotoImage
                  src={`/uploads/${photo.attachment_uuid}.webp`}
                  alt={photo.note ?? ""}
                  imageClassName={cn("transition-opacity", isSelected ? "" : "opacity-40")}
                  onOpen={() => setLightboxIndex(locationPhotos.indexOf(photo))}
                >
                  {isMain && (
                    <span className="absolute top-1 left-1 bg-amber-500 text-white rounded-full p-0.5">
                      <HugeiconsIcon icon={StarIcon} className="size-3" />
                    </span>
                  )}
                  {isRecentPhoto(photo.createdAt) ? (
                    <span className="absolute bottom-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none pointer-events-none">
                      NEW
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "absolute bottom-1 right-1 size-4 rounded-full border-2 flex items-center justify-center pointer-events-none transition-colors",
                      isSelected ? "bg-primary border-primary" : "bg-black/30 border-white/70",
                    )}
                  >
                    {isSelected && <HugeiconsIcon icon={Tick02Icon} className="size-2.5 text-primary-foreground" />}
                  </span>
                </PhotoImage>
                <div className={cn("border-t", isSelected && !isMain ? "grid grid-cols-2 divide-x" : "")}>
                  {isSelected && !isMain && (
                    <button
                      type="button"
                      className="flex items-center justify-center py-2 text-xs text-muted-foreground hover:text-amber-500 hover:bg-accent transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMain(photo.id);
                      }}
                      title={t("photos.setAsMain")}
                    >
                      <HugeiconsIcon icon={StarIcon} className="size-3.5" />
                    </button>
                  )}
                  <PhotoEditPopover
                    isOpen={editState?.id === photo.id}
                    note={editState?.note ?? ""}
                    takenAt={editState?.takenAt ?? null}
                    onOpen={() => setEditState({ id: photo.id, note: photo.note ?? "", takenAt: photo.taken_at ? new Date(photo.taken_at) : null })}
                    onOpenChange={(open) => !open && setEditState(null)}
                    onNoteChange={(note) => setEditState(editState ? { ...editState, note } : editState)}
                    onTakenAtChange={(takenAt) => setEditState(editState ? { ...editState, takenAt } : editState)}
                    onSave={() =>
                      editMutation.mutate({
                        id: photo.id,
                        note: editState?.note ?? "",
                        takenAt: editState?.takenAt?.toISOString() ?? null,
                        originalNote: photo.note ?? "",
                        originalTakenAt: photo.taken_at ?? null,
                      })
                    }
                    isSaving={editMutation.isPending}
                  />
                </div>
              </div>
            );
          })}
          <AddPhotoTile onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} isLoading={uploadMutation.isPending} />
        </div>
      </div>
      <Lightbox photos={locationPhotos} index={lightboxIndex} onClose={closeLightbox} onPrev={prevLightbox} onNext={nextLightbox} />
    </>
  );
}
