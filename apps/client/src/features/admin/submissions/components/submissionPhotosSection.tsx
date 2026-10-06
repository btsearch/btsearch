import { Image01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SubmissionPhoto, SubmissionPhotoUpdate } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useLightbox } from "@/components/lightbox";
import { PhotoDeleteButton, PhotoEditPopover, PhotoImage, PhotoMeta, isRecentPhoto } from "@/components/photos/photoGridPrimitives";
import { PhotoLightbox } from "@/components/photos/photoLightbox";
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
import { InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EditCard } from "@/features/station-editing/components/frame/editCard";
import { editingKeys } from "@/features/station-editing/data/keys";
import { deleteSubmissionPhoto, submissionPhotosQueryOptions, updateSubmissionPhoto } from "@/features/station-editing/data/submissionPhotos";
import { cn } from "@/lib/utils";

type SubmissionPhotosSectionProps = {
  submissionId: string;
  missingCount: number;
  canEdit?: boolean;
  showsDetails?: boolean;
};

type PhotoEdit = {
  id: string;
  note: string;
  takenAt: Date | null;
};

type PendingPhotosProps = {
  count: number;
};

const NO_PHOTOS: SubmissionPhoto[] = [];
const MOST_PLACEHOLDERS = 6;
const TILE_CLASS = cn(
  "rounded-lg overflow-hidden border bg-muted",
  "animate-in fade-in zoom-in-95 animation-duration-300 fill-mode-both motion-reduce:animate-none",
);
const MAIN_BUTTON_CLASS = cn(
  "flex cursor-pointer items-center justify-center px-2.5 py-2 text-muted-foreground transition-colors",
  "hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-50",
);
const PENDING_NOTICE_CLASS = cn(
  "flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/30",
  "px-3 py-2.5",
);
const RECENT_MARK_CLASS = "absolute bottom-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none";

function PendingPhotos({ count }: PendingPhotosProps) {
  const { t } = useTranslation("submissions");

  return (
    <div className="p-3 space-y-2">
      <div className={PENDING_NOTICE_CLASS}>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("photos.pendingCount", { count })}</span>
          <span className="text-xs text-amber-700 dark:text-amber-400">{t("photos.pendingHint")}</span>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
        {Array.from({ length: Math.min(count, MOST_PLACEHOLDERS) }, (_, position) => (
          <div key={position} className="h-36 rounded-lg bg-muted animate-pulse" style={{ animationDelay: `${position * 100}ms` }} />
        ))}
      </div>
    </div>
  );
}

export function SubmissionPhotosSection({ submissionId, missingCount, canEdit = false, showsDetails = false }: SubmissionPhotosSectionProps) {
  const { t, i18n } = useTranslation(["submissions", "common"]);
  const queryClient = useQueryClient();
  const lightbox = useLightbox();
  const [photoToDelete, setPhotoToDelete] = useState<SubmissionPhoto | null>(null);
  const [photoEdit, setPhotoEdit] = useState<PhotoEdit | null>(null);
  const { data: photos = NO_PHOTOS, isLoading, isLoadingError, isFetching, refetch } = useQuery(submissionPhotosQueryOptions(submissionId));

  function refreshPhotos() {
    return queryClient.invalidateQueries({ queryKey: editingKeys.submissionPhotosOf(submissionId) });
  }

  function refreshSubmission() {
    return queryClient.invalidateQueries({ queryKey: editingKeys.submission(submissionId) });
  }

  const deleteMutation = useMutation({
    mutationFn: (photo: SubmissionPhoto) => deleteSubmissionPhoto(submissionId, photo.id),
    onSuccess: () => {
      void refreshPhotos();
      void refreshSubmission();
      toast.success(t("photos.deleted"));
    },
    onError: () => toast.error(t("photos.deleteFailed")),
  });

  const editMutation = useMutation({
    mutationFn: async ({ photo, edit }: { photo: SubmissionPhoto; edit: PhotoEdit }) => {
      const takenAt = edit.takenAt?.toISOString() ?? null;
      const changes: SubmissionPhotoUpdate = {};
      if (edit.note !== (photo.note ?? "")) changes.note = edit.note === "" ? null : edit.note;
      if (takenAt !== photo.takenAt) changes.takenAt = takenAt;
      if (Object.keys(changes).length > 0) await updateSubmissionPhoto(submissionId, photo.id, changes);
    },
    onSuccess: (_result, { photo }) => {
      void refreshPhotos();
      setPhotoEdit((known) => (known?.id === photo.id ? null : known));
    },
    onError: () => toast.error(t("photos.noteFailed")),
  });

  const mainMutation = useMutation({
    mutationFn: (photo: SubmissionPhoto) => updateSubmissionPhoto(submissionId, photo.id, { isMain: true }),
    onSuccess: () => {
      void refreshPhotos();
      void refreshSubmission();
    },
    onError: () => toast.error(t("photos.setMainFailed")),
  });

  function confirmDelete() {
    if (photoToDelete === null) return;
    deleteMutation.mutate(photoToDelete);
    setPhotoToDelete(null);
  }

  function startEdit(photo: SubmissionPhoto) {
    setPhotoEdit({ id: photo.id, note: photo.note ?? "", takenAt: photo.takenAt === null ? null : new Date(photo.takenAt) });
  }

  function saveEdit(photo: SubmissionPhoto) {
    if (photoEdit !== null) editMutation.mutate({ photo, edit: photoEdit });
  }

  const isEmpty = !isLoading && !isLoadingError && photos.length === 0;
  const awaitsPhotos = isEmpty && missingCount > 0;
  const mainLabel = t("common:photos.setAsMain");

  if (isEmpty && !awaitsPhotos) return null;

  return (
    <>
      <EditCard
        title={t("photos.label")}
        icon={Image01Icon}
        count={isLoading || isLoadingError ? undefined : `(${photos.length})`}
        extras={awaitsPhotos ? <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" /> : undefined}
        isCollapsible
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : null}
        {isLoadingError ? <InlineError className="m-3" onRetry={() => refetch()} isRetrying={isFetching} /> : null}
        {awaitsPhotos ? <PendingPhotos count={missingCount} /> : null}
        {photos.length > 0 ? (
          <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 max-h-96 overflow-y-auto custom-scrollbar">
            {photos.map((photo, position) => (
              <div key={photo.id} className={TILE_CLASS} style={{ animationDelay: `${Math.min(position * 40, 400)}ms` }}>
                <PhotoImage ref={lightbox.triggerRef(position)} src={photo.urls.thumb} alt={photo.note ?? ""} onOpen={() => lightbox.open(position)}>
                  {photo.isMain ? (
                    <span className="absolute top-1.5 left-1.5 bg-amber-500 text-white rounded-full p-0.5">
                      <HugeiconsIcon icon={StarIcon} className="size-3" />
                    </span>
                  ) : null}
                  {isRecentPhoto(photo.createdAt) ? <span className={RECENT_MARK_CLASS}>NEW</span> : null}
                </PhotoImage>
                {showsDetails ? <PhotoMeta photo={photo} locale={i18n.language} /> : null}
                {canEdit ? (
                  <div className={cn("border-t divide-x grid", photo.isMain ? "grid-cols-2" : "grid-cols-[auto_1fr_1fr]")}>
                    {photo.isMain ? null : (
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          aria-label={mainLabel}
                          disabled={mainMutation.isPending}
                          onClick={() => mainMutation.mutate(photo)}
                          className={MAIN_BUTTON_CLASS}
                        >
                          <HugeiconsIcon icon={StarIcon} className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>{mainLabel}</TooltipContent>
                      </Tooltip>
                    )}
                    <PhotoEditPopover
                      isOpen={photoEdit?.id === photo.id}
                      note={photoEdit?.note ?? ""}
                      takenAt={photoEdit?.takenAt ?? null}
                      onOpen={() => startEdit(photo)}
                      onOpenChange={(isOpen) => {
                        if (!isOpen) setPhotoEdit(null);
                      }}
                      onNoteChange={(note) => setPhotoEdit((known) => (known === null ? known : { ...known, note }))}
                      onTakenAtChange={(takenAt) => setPhotoEdit((known) => (known === null ? known : { ...known, takenAt }))}
                      onSave={() => saveEdit(photo)}
                      isSaving={editMutation.isPending}
                    />
                    <PhotoDeleteButton onClick={() => setPhotoToDelete(photo)} label={t("common:actions.remove")} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </EditCard>

      <AlertDialog
        open={photoToDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPhotoToDelete(null);
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
