import { ArrowDown01Icon, Image01Icon, StarIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Lightbox } from "@/components/lightbox";
import { AddPhotoTile, PhotoDeleteButton, PhotoEditPopover, PhotoImage, isRecentPhoto } from "@/components/photoGridPrimitives";
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
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type Photo = {
  id: number;
  attachment_uuid: string;
  note: string | null;
  taken_at?: string | null;
  createdAt: string;
  author: { uuid: string; username: string; name: string } | null;
  is_main?: boolean;
};

type Props = {
  queryKey: readonly unknown[];
  fetchFn: () => Promise<Photo[]>;
  deleteFn: (id: number) => Promise<void>;
  updateNoteFn: (id: number, note: string) => Promise<void>;
  updateTakenAtFn?: (id: number, takenAt: string | null) => Promise<void>;
  setMainFn?: (id: number) => Promise<void>;
  uploadFn?: (files: File[]) => Promise<unknown>;
  hideWhenEmpty?: boolean;
  readOnly?: boolean;
  pendingPhotos?: number;
};

export function PhotosSection({
  queryKey,
  fetchFn,
  deleteFn,
  updateNoteFn,
  updateTakenAtFn,
  setMainFn,
  uploadFn,
  hideWhenEmpty,
  readOnly,
  pendingPhotos,
}: Props) {
  const { t } = useTranslation("submissions");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const [deletePhotoId, setDeletePhotoId] = useState<number | null>(null);
  const [editState, setEditState] = useState<{ id: number; note: string; takenAt: Date | null } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: queryKey as unknown[],
    queryFn: fetchFn,
    staleTime: 1000 * 60 * 2,
  });

  const queryKeyRef = useRef(queryKey);
  useLayoutEffect(() => {
    queryKeyRef.current = queryKey;
  });
  const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeyRef.current as unknown[] }), [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      void invalidate();
      toast.success(t("photos.deleted"));
    },
    onError: () => toast.error(t("photos.deleteFailed")),
  });

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
      if (note !== originalNote) ops.push(updateNoteFn(id, note));
      if (updateTakenAtFn && takenAt !== originalTakenAt) ops.push(updateTakenAtFn(id, takenAt));
      if (ops.length > 0) await Promise.all(ops);
    },
    onSuccess: () => {
      void invalidate();
      setEditState(null);
    },
    onError: () => toast.error(t("photos.noteFailed")),
  });

  const setMainMutation = useMutation({
    mutationFn: (id: number) => {
      if (!setMainFn) throw new Error("setMainFn is not provided");
      return setMainFn(id);
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error(t("photos.setMainFailed")),
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => {
      if (!uploadFn) throw new Error("uploadFn is not provided");
      return uploadFn(files);
    },
    onSuccess: () => {
      void invalidate();
      toast.success(t("photos.uploaded"));
    },
    onError: () => toast.error(t("photos.uploadFailed")),
  });

  const closeLightbox = () => setLightboxIndex(null);
  const prev = useCallback(() => setLightboxIndex((i) => (i !== null ? (i - 1 + photos.length) % photos.length : null)), [photos.length]);
  const next = useCallback(() => setLightboxIndex((i) => (i !== null ? (i + 1) % photos.length : null)), [photos.length]);

  function openEdit(photo: Photo) {
    setEditState({ id: photo.id, note: photo.note ?? "", takenAt: photo.taken_at ? new Date(photo.taken_at) : null });
  }

  function confirmDelete() {
    if (deletePhotoId === null) return;
    deleteMutation.mutate(deletePhotoId);
    setDeletePhotoId(null);
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

  if (!isLoading && photos.length === 0 && hideWhenEmpty && !pendingPhotos) return null;

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
              {!isLoading ? <span className="text-xs text-muted-foreground">({photos.length})</span> : null}
              {!isLoading && !!pendingPhotos && photos.length === 0 ? <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" /> : null}
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            {uploadFn ? <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFileChange} /> : null}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : photos.length === 0 && pendingPhotos ? (
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
            ) : photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground gap-2">
                <HugeiconsIcon icon={Image01Icon} className="size-8 opacity-40" />
                <p>{t("photos.empty")}</p>
                {uploadFn ? (
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                    <HugeiconsIcon icon={Upload04Icon} className="size-3.5" />
                    {t("photos.uploadFirst")}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 max-h-96 overflow-y-auto custom-scrollbar">
                {photos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    className="rounded-lg overflow-hidden border bg-muted animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(idx * 40, 400)}ms`, animationFillMode: "both" }}
                  >
                    <PhotoImage src={`/uploads/${photo.attachment_uuid}.webp`} alt={photo.note ?? ""} onOpen={() => setLightboxIndex(idx)}>
                      {photo.is_main ? (
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
                      <div className={cn("border-t divide-x", setMainFn && !photo.is_main ? "grid grid-cols-3" : "grid grid-cols-2")}>
                        {setMainFn && !photo.is_main ? (
                          <button
                            type="button"
                            className="flex items-center justify-center py-2 text-xs text-muted-foreground hover:text-amber-500 hover:bg-accent transition-colors disabled:opacity-50"
                            onClick={() => setMainMutation.mutate(photo.id)}
                            disabled={setMainMutation.isPending}
                            title={t("photos.setAsMain")}
                          >
                            <HugeiconsIcon icon={StarIcon} className="size-3.5" />
                          </button>
                        ) : null}
                        <PhotoEditPopover
                          isOpen={editState?.id === photo.id}
                          note={editState?.note ?? ""}
                          takenAt={editState?.takenAt ?? null}
                          onOpen={() => openEdit(photo)}
                          onOpenChange={(open) => !open && setEditState(null)}
                          onNoteChange={(note) => setEditState(editState ? { ...editState, note } : editState)}
                          onTakenAtChange={(takenAt) => setEditState(editState ? { ...editState, takenAt } : editState)}
                          showTakenAt={updateTakenAtFn !== undefined}
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
                        <PhotoDeleteButton onClick={() => setDeletePhotoId(photo.id)} label={t("photos.remove")} />
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
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <AlertDialog
        open={deletePhotoId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletePhotoId(null);
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

      <Lightbox photos={photos} index={lightboxIndex} onClose={closeLightbox} onPrev={prev} onNext={next} />
    </>
  );
}
