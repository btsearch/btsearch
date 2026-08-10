import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Camera01Icon,
  Cancel01Icon,
  Delete02Icon,
  Image01Icon,
  InformationCircleIcon,
  PencilEdit02Icon,
  Tick02Icon,
  Upload04Icon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { cn } from "@/lib/utils";

import { type SubmissionPhoto, deleteSubmissionPhoto, fetchSubmissionPhotos, updateSubmissionPhotoNote, updateSubmissionPhotoTakenAt } from "../api";

const MAX_FILES = 5;
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

type Props = {
  photos: File[];
  onPhotosChange: (files: File[]) => void;
  notes: string[];
  onNotesChange: (notes: string[]) => void;
  takenAts: (Date | null)[];
  onTakenAtsChange: (takenAts: (Date | null)[]) => void;
  editSubmissionId?: string;
};

type LightboxItem = { type: "existing"; photo: SubmissionPhoto } | { type: "local"; url: string; name: string; note: string; takenAt: Date | null };

export function PhotoUploadSection({ photos, onPhotosChange, notes, onNotesChange, takenAts, onTakenAtsChange, editSubmissionId }: Props) {
  const { t, i18n } = useTranslation("submissions");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const previewUrls = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);

  const [deleteTarget, setDeleteTarget] = useState<{ type: "existing"; id: number } | { type: "local"; index: number } | null>(null);
  const [localEditState, setLocalEditState] = useState<{ index: number; note: string; takenAt: Date | null } | null>(null);
  const [existingEditState, setExistingEditState] = useState<{ id: number; note: string; takenAt: Date | null } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data: existingPhotos = [], isLoading: isLoadingExisting } = useQuery({
    queryKey: ["submission-photos", editSubmissionId],
    queryFn: () => fetchSubmissionPhotos(editSubmissionId!),
    enabled: !!editSubmissionId,
    staleTime: 1000 * 60 * 2,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["submission-photos", editSubmissionId] }),
    [queryClient, editSubmissionId],
  );

  const deleteMutation = useMutation({
    mutationFn: (photoId: number) => deleteSubmissionPhoto(editSubmissionId!, photoId),
    onSuccess: () => {
      void invalidate();
      toast.success(t("photos.deleted"));
    },
    onError: () => toast.error(t("photos.deleteFailed")),
  });

  const editExistingMutation = useMutation({
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
      void invalidate();
      setExistingEditState(null);
    },
    onError: () => toast.error(t("photos.noteFailed")),
  });

  useEffect(() => {
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  const totalCount = existingPhotos.length + photos.length;
  const remainingSlots = MAX_FILES - totalCount;

  function processFiles(files: File[]) {
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > MAX_SIZE_BYTES) toast.error(t("photos.fileTooLarge", { name: f.name, size: "10 MB" }));
      else valid.push(f);
    }
    const combined = [...photos, ...valid].slice(0, remainingSlots > 0 ? remainingSlots + photos.length : photos.length);
    const combinedNotes = [...notes, ...valid.map(() => "")].slice(0, combined.length);
    const combinedTakenAts = [...takenAts, ...valid.map(() => null)].slice(0, combined.length);
    onPhotosChange(combined);
    onNotesChange(combinedNotes);
    onTakenAtsChange(combinedTakenAts);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    processFiles(Array.from(e.target.files ?? []));
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
    if (remainingSlots <= 0) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) processFiles(files);
  }

  function removeLocalPhoto(idx: number) {
    onPhotosChange(photos.filter((_, i) => i !== idx));
    onNotesChange(notes.filter((_, i) => i !== idx));
    onTakenAtsChange(takenAts.filter((_, i) => i !== idx));
  }

  function confirmDelete() {
    if (deleteTarget === null) return;
    if (deleteTarget.type === "local") {
      removeLocalPhoto(deleteTarget.index);
    } else {
      deleteMutation.mutate(deleteTarget.id);
    }
    setDeleteTarget(null);
  }

  function openLocalEdit(idx: number) {
    setLocalEditState({ index: idx, note: notes[idx] ?? "", takenAt: takenAts[idx] ?? null });
  }

  function saveLocalEdit() {
    if (localEditState === null) return;
    const updatedNotes = [...notes];
    updatedNotes[localEditState.index] = localEditState.note;
    onNotesChange(updatedNotes);
    const updatedTakenAts = [...takenAts];
    updatedTakenAts[localEditState.index] = localEditState.takenAt;
    onTakenAtsChange(updatedTakenAts);
    setLocalEditState(null);
  }

  function openExistingEdit(photo: SubmissionPhoto) {
    setExistingEditState({ id: photo.id, note: photo.note ?? "", takenAt: photo.taken_at ? new Date(photo.taken_at) : null });
  }

  const lightboxItems: LightboxItem[] = [
    ...existingPhotos.map((p): LightboxItem => ({ type: "existing", photo: p })),
    ...photos.map((_, idx): LightboxItem => ({
      type: "local",
      url: previewUrls[idx] ?? "",
      name: photos[idx].name,
      note: notes[idx] ?? "",
      takenAt: takenAts[idx] ?? null,
    })),
  ];

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  useEscapeKey(closeLightbox, lightboxIndex !== null);

  const prev = useCallback(() => setLightboxIndex((i) => (i !== null ? (i - 1 + totalCount) % totalCount : null)), [totalCount]);
  const next = useCallback(() => setLightboxIndex((i) => (i !== null ? (i + 1) % totalCount : null)), [totalCount]);
  const activeLightbox = lightboxIndex !== null ? (lightboxItems[lightboxIndex] ?? null) : null;

  const isEmpty = totalCount === 0 && !isLoadingExisting;

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
              {!isLoadingExisting ? (
                <span className="text-xs text-muted-foreground">
                  ({totalCount}/{MAX_FILES})
                </span>
              ) : null}
            </CollapsibleTrigger>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFileChange} />

          <CollapsibleContent>
            {isLoadingExisting ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground gap-2">
                <HugeiconsIcon icon={Image01Icon} className="size-8 opacity-20" />
                <p>{t("photos.empty")}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                  <HugeiconsIcon icon={Upload04Icon} className="size-3.5" />
                  {t("photos.uploadFirst")}
                </Button>
              </div>
            ) : (
              <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                {existingPhotos.map((photo, idx) => (
                  <div key={`existing-${photo.id}`} className="rounded-lg overflow-hidden border bg-muted">
                    <div className="relative aspect-square">
                      <img
                        src={`/uploads/${photo.attachment_uuid}.webp`}
                        alt={photo.note ?? ""}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        className="absolute top-1 right-1 size-8 sm:size-6 rounded-full bg-black/50 ring-1 ring-white/30 shadow-sm flex items-center justify-center cursor-pointer"
                        onClick={() => setLightboxIndex(idx)}
                        aria-label="View full size"
                      >
                        <HugeiconsIcon icon={ZoomInAreaIcon} className="size-3 text-white" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 divide-x border-t">
                      <Popover
                        open={existingEditState?.id === photo.id}
                        onOpenChange={(open) => {
                          if (!open) setExistingEditState(null);
                        }}
                      >
                        <PopoverTrigger
                          type="button"
                          onClick={() => openExistingEdit(photo)}
                          className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                          {t("common:actions.edit")}
                        </PopoverTrigger>
                        <PopoverContent side="bottom" align="end" className="w-64 flex flex-col gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-foreground">{t("photos.note")}</label>
                            <input
                              value={existingEditState?.note ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setExistingEditState((prev) => (prev ? { ...prev, note: v } : prev));
                              }}
                              maxLength={100}
                              placeholder={t("photos.notePlaceholder")}
                              className="h-8 rounded-md border border-input bg-background px-2 text-sm w-full"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-foreground">{t("photos.takenAt")}</label>
                            <DatePickerInput
                              value={existingEditState?.takenAt ?? null}
                              onChange={(v) => setExistingEditState((prev) => (prev ? { ...prev, takenAt: v } : prev))}
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setExistingEditState(null)}>
                              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                              {t("common:actions.cancel")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                editExistingMutation.mutate({
                                  id: photo.id,
                                  note: existingEditState?.note ?? "",
                                  takenAt: existingEditState?.takenAt?.toISOString() ?? null,
                                  originalNote: photo.note ?? "",
                                  originalTakenAt: photo.taken_at ?? null,
                                })
                              }
                              disabled={editExistingMutation.isPending}
                            >
                              {editExistingMutation.isPending ? (
                                <Spinner className="size-3" />
                              ) : (
                                <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
                              )}
                              {t("common:actions.save")}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ type: "existing", id: photo.id })}
                        className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                        {t("photos.remove")}
                      </button>
                    </div>
                  </div>
                ))}

                {photos.map((file, idx) => (
                  <div key={`local-${file.name}-${idx}`} className="rounded-lg overflow-hidden border bg-muted">
                    <div className="relative aspect-square">
                      <img src={previewUrls[idx]} alt={file.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        className="absolute top-1 right-1 size-8 sm:size-6 rounded-full bg-black/50 ring-1 ring-white/30 shadow-sm flex items-center justify-center cursor-pointer"
                        onClick={() => setLightboxIndex(existingPhotos.length + idx)}
                        aria-label="View full size"
                      >
                        <HugeiconsIcon icon={ZoomInAreaIcon} className="size-3 text-white" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 divide-x border-t">
                      <Popover
                        open={localEditState?.index === idx}
                        onOpenChange={(open) => {
                          if (!open) setLocalEditState(null);
                        }}
                      >
                        <PopoverTrigger
                          type="button"
                          onClick={() => openLocalEdit(idx)}
                          className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                          {t("common:actions.edit")}
                        </PopoverTrigger>
                        <PopoverContent side="bottom" align="end" className="w-64 flex flex-col gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-foreground">{t("photos.note")}</label>
                            <input
                              value={localEditState?.note ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setLocalEditState((prev) => (prev ? { ...prev, note: v } : prev));
                              }}
                              maxLength={100}
                              placeholder={t("photos.notePlaceholder")}
                              className="h-8 rounded-md border border-input bg-background px-2 text-sm w-full"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-foreground">{t("photos.takenAt")}</label>
                            <DatePickerInput
                              value={localEditState?.takenAt ?? null}
                              onChange={(v) => setLocalEditState((prev) => (prev ? { ...prev, takenAt: v } : prev))}
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setLocalEditState(null)}>
                              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                              {t("common:actions.cancel")}
                            </Button>
                            <Button type="button" size="sm" onClick={saveLocalEdit}>
                              <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
                              {t("common:actions.save")}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ type: "local", index: idx })}
                        className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                        {t("photos.remove")}
                      </button>
                    </div>
                  </div>
                ))}

                {totalCount < MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  >
                    <HugeiconsIcon icon={Upload04Icon} className="size-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t("photos.add")}</span>
                  </button>
                )}
              </div>
            )}
            {totalCount > 0 && (
              <div className="mx-3 mb-2 rounded-lg border border-blue-500/30 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 flex items-start gap-2">
                <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{t("warnings.photosTitle")}</p>
                  <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">{t("warnings.photosDesc")}</p>
                </div>
              </div>
            )}
            <p className="px-3 pb-2 text-xs text-muted-foreground">{t("photos.hint", { max: MAX_FILES, size: "10 MB" })}</p>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
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
              {deleteMutation.isPending ? <Spinner /> : t("photos.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {lightboxIndex !== null && activeLightbox
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/90"
              onClick={closeLightbox}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeLightbox();
              }}
            >
              <button
                type="button"
                className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                onClick={closeLightbox}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-6" />
              </button>
              {lightboxItems.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="absolute left-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      prev();
                    }}
                  >
                    <HugeiconsIcon icon={ArrowLeft01Icon} className="size-6" />
                  </button>
                  <button
                    type="button"
                    className="absolute right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      next();
                    }}
                  >
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-6" />
                  </button>
                </>
              ) : null}
              <div role="presentation" className="flex flex-col items-center gap-3 max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <img
                  src={activeLightbox.type === "existing" ? `/uploads/${activeLightbox.photo.attachment_uuid}.webp` : activeLightbox.url}
                  alt={activeLightbox.type === "existing" ? (activeLightbox.photo.note ?? "") : activeLightbox.name}
                  className="max-w-full max-h-[calc(90vh-4rem)] object-contain rounded-lg"
                />
                <div className="flex flex-col items-center gap-1 text-white/80 text-xs">
                  {activeLightbox.type === "existing" ? (
                    <>
                      <span className="font-medium">@{activeLightbox.photo.author?.username ?? "-"}</span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <HugeiconsIcon icon={Upload04Icon} className="size-3 opacity-60" />
                          <span className="tabular-nums">
                            {new Date(activeLightbox.photo.createdAt).toLocaleDateString(i18n.language, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        {activeLightbox.photo.taken_at ? (
                          <div className="flex items-center gap-1.5">
                            <HugeiconsIcon icon={Camera01Icon} className="size-3 opacity-60" />
                            <span className="tabular-nums">
                              {new Date(activeLightbox.photo.taken_at).toLocaleDateString(i18n.language, { year: "numeric", month: "short" })}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      {activeLightbox.photo.note ? <span className="italic opacity-70">{activeLightbox.photo.note}</span> : null}
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{activeLightbox.name}</span>
                      <div className="flex items-center gap-3">
                        {activeLightbox.takenAt ? (
                          <div className="flex items-center gap-1.5">
                            <HugeiconsIcon icon={Camera01Icon} className="size-3 opacity-60" />
                            <span className="tabular-nums">
                              {activeLightbox.takenAt.toLocaleDateString(i18n.language, { year: "numeric", month: "short" })}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      {activeLightbox.note ? <span className="italic opacity-70">{activeLightbox.note}</span> : null}
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
