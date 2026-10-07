import { ArrowDown01Icon, Image01Icon, StarIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useLightbox } from "@/components/lightbox";
import { AddPhotoTile, PhotoDeleteButton, PhotoEditPopover, PhotoImage, isRecentPhoto } from "@/components/photos/photoGridPrimitives";
import { type LightboxPhoto, PhotoLightbox } from "@/components/photos/photoLightbox";
import { type PhotoUploadProgress, trackPhotoUpload } from "@/components/photos/photoUploadToast";
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
import { photoQualityErrorKey } from "@/lib/photoUploadError";
import { cn } from "@/lib/utils";

export type PhotoChanges = { note?: string; takenAt?: string | null };

type Props<Row> = {
  queryKey: readonly unknown[];
  invalidateKey?: readonly unknown[];
  fetchFn: () => Promise<Row[]>;
  toPhoto: (row: Row) => LightboxPhoto;
  deleteFn: (row: Row) => Promise<unknown>;
  updateFn: (row: Row, changes: PhotoChanges) => Promise<unknown>;
  uploadFn?: (files: File[], onProgress: PhotoUploadProgress) => Promise<unknown>;
  hideWhenEmpty?: boolean;
  readOnly?: boolean;
  pendingPhotos?: number;
};

export function PhotosSection<Row>({
  queryKey,
  invalidateKey = queryKey,
  fetchFn,
  toPhoto,
  deleteFn,
  updateFn,
  uploadFn,
  hideWhenEmpty,
  readOnly,
  pendingPhotos,
}: Props<Row>) {
  const { t } = useTranslation("submissions");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const [rowToDelete, setRowToDelete] = useState<Row | null>(null);
  const [editState, setEditState] = useState<{ id: string; note: string; takenAt: Date | null } | null>(null);
  const lightbox = useLightbox();

  const {
    data: rows = [],
    isLoading,
    isLoadingError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKey as unknown[],
    queryFn: fetchFn,
    staleTime: 1000 * 60 * 2,
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: invalidateKey as unknown[] });
  }

  const deleteMutation = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      void invalidate();
      toast.success(t("photos.deleted"));
    },
    onError: () => toast.error(t("photos.deleteFailed")),
  });

  const editMutation = useMutation({
    mutationFn: async ({ row, photo, note, takenAt }: { row: Row; photo: LightboxPhoto; note: string; takenAt: string | null }) => {
      const changes: PhotoChanges = {};
      if (note !== (photo.note ?? "")) changes.note = note;
      if (takenAt !== photo.takenAt) changes.takenAt = takenAt;
      if (Object.keys(changes).length > 0) await updateFn(row, changes);
    },
    onSuccess: () => {
      void invalidate();
      setEditState(null);
    },
    onError: () => toast.error(t("photos.noteFailed")),
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => {
      if (!uploadFn) throw new Error("uploadFn is not provided");
      return trackPhotoUpload((onProgress) => uploadFn(files, onProgress), {
        success: t("photos.uploaded"),
        error: (error) => t(photoQualityErrorKey(error) ?? "photos.uploadFailed"),
      });
    },
    onSuccess: () => {
      void invalidate();
    },
  });

  function openEdit(photo: LightboxPhoto) {
    setEditState({ id: photo.id, note: photo.note ?? "", takenAt: photo.takenAt ? new Date(photo.takenAt) : null });
  }

  function confirmDelete() {
    if (rowToDelete === null) return;
    deleteMutation.mutate(rowToDelete);
    setRowToDelete(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) uploadMutation.mutate(files);
    e.target.value = "";
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!uploadFn) return;
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setIsDragging(true);
  }

  function handleDragLeave() {
    if (!uploadFn) return;
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!uploadFn) return;
    e.preventDefault();
  }

  function handleDrop(e: React.DragEvent) {
    if (!uploadFn) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) uploadMutation.mutate(files);
  }

  const photos = rows.map((row) => toPhoto(row));
  const isEmpty = !isLoading && !isLoadingError && photos.length === 0;

  if (isEmpty && hideWhenEmpty && !pendingPhotos) return null;

  return (
    <>
      <Collapsible defaultOpen>
        <div
          className={cn("border rounded-xl overflow-hidden transition-colors", isDragging ? "ring-2 ring-primary border-primary bg-primary/5" : "")}
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
              {!isLoading && !isLoadingError ? <span className="text-xs text-muted-foreground">({photos.length})</span> : null}
              {isEmpty && pendingPhotos ? <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" /> : null}
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            {uploadFn ? (
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
            ) : null}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : null}
            {isLoadingError ? <InlineError className="m-3" onRetry={() => refetch()} isRetrying={isFetching} /> : null}
            {isEmpty && pendingPhotos ? (
              <div className="p-3 space-y-2">
                <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/30 px-3 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {t("photos.pendingCount", { count: pendingPhotos })}
                    </span>
                    <span className="text-xs text-amber-600/70 dark:text-amber-500/60">{t("photos.pendingHint")}</span>
                  </div>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                  {Array.from({ length: Math.min(pendingPhotos, 6) }).map((_, i) => (
                    <div key={i} className="h-36 rounded-lg bg-muted animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                  ))}
                </div>
              </div>
            ) : null}
            {isEmpty && !pendingPhotos ? (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground gap-2">
                <HugeiconsIcon icon={Image01Icon} className="size-8 opacity-40" />
                <p>{t("photos.empty")}</p>
                {uploadFn ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                    className="cursor-pointer gap-1.5"
                  >
                    <HugeiconsIcon icon={Upload04Icon} className="size-3.5" />
                    {t("photos.uploadFirst")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {photos.length > 0 ? (
              <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 max-h-96 overflow-y-auto custom-scrollbar">
                {photos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    className="rounded-lg overflow-hidden border bg-muted animate-in fade-in zoom-in-95 animation-duration-300 fill-mode-both motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
                  >
                    <PhotoImage ref={lightbox.triggerRef(idx)} src={photo.urls.thumb} alt={photo.note ?? ""} onOpen={() => lightbox.open(idx)}>
                      {photo.isMain ? (
                        <span className="absolute top-1.5 left-1.5 bg-amber-500 text-white rounded-full p-0.5">
                          <HugeiconsIcon icon={StarIcon} className="size-3" />
                        </span>
                      ) : null}
                      {isRecentPhoto(photo.createdAt) ? (
                        <span className="absolute bottom-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none">
                          NEW
                        </span>
                      ) : null}
                    </PhotoImage>
                    {!readOnly ? (
                      <div className="border-t divide-x grid grid-cols-2">
                        <PhotoEditPopover
                          isOpen={editState?.id === photo.id}
                          note={editState?.note ?? ""}
                          takenAt={editState?.takenAt ?? null}
                          onOpen={() => openEdit(photo)}
                          onOpenChange={(open) => !open && setEditState(null)}
                          onNoteChange={(note) => setEditState(editState ? { ...editState, note } : editState)}
                          onTakenAtChange={(takenAt) => setEditState(editState ? { ...editState, takenAt } : editState)}
                          onSave={() =>
                            editMutation.mutate({
                              row: rows[idx],
                              photo,
                              note: editState?.note ?? "",
                              takenAt: editState?.takenAt?.toISOString() ?? null,
                            })
                          }
                          isSaving={editMutation.isPending}
                        />
                        <PhotoDeleteButton onClick={() => setRowToDelete(rows[idx])} label={t("common:actions.remove")} />
                      </div>
                    ) : null}
                  </div>
                ))}

                {uploadFn ? (
                  <AddPhotoTile
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                    isLoading={uploadMutation.isPending}
                  />
                ) : null}
              </div>
            ) : null}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <AlertDialog
        open={rowToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setRowToDelete(null);
        }}
      >
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

      <PhotoLightbox photos={photos} {...lightbox.lightboxProps} />
    </>
  );
}
