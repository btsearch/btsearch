import { Camera01Icon, Cancel01Icon, Image01Icon, InformationCircleIcon, StarIcon, Tick02Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SubmissionPhoto, SubmissionPhotoUpdate } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type DragEvent, type ReactNode, type Ref, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MAX_PHOTO_SIZE_BYTES, MAX_PHOTO_SIZE_LABEL, MAX_SUBMISSION_PHOTOS } from "../photoLimits";
import type { PhotoDraft } from "./hooks/usePhotoDraft";
import { Lightbox, LightboxDetailRow, type LightboxProps, type LightboxSlide, useLightbox } from "@/components/lightbox";
import { AddPhotoTile, PhotoDeleteButton, PhotoEditPopover, PhotoImage, PhotoMeta, isRecentPhoto } from "@/components/photos/photoGridPrimitives";
import { type LightboxPhoto, PhotoLightbox, photoSlides } from "@/components/photos/photoLightbox";
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
import { InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { locationPhotoRecordsQueryOptions } from "@/features/station-details/station/api";
import { isMainPhoto } from "@/features/station-details/station/components/photos/stationPhotos";
import type { PhotoRecord } from "@/features/station-details/station/types";
import { EditCard } from "@/features/station-editing/components/frame/editCard";
import { useRevealedOpen } from "@/features/station-editing/components/frame/editPage";
import { editTargetProps } from "@/features/station-editing/components/frame/editTargets";
import { editingKeys } from "@/features/station-editing/data/keys";
import { deleteSubmissionPhoto, submissionPhotosQueryOptions, updateSubmissionPhoto } from "@/features/station-editing/data/submissionPhotos";
import { useEditText } from "@/features/station-editing/hooks/useStationDraft";
import type { EditError } from "@/features/station-editing/model/types";
import { isGloballyHandledError } from "@/lib/api";
import { formatMonthYear } from "@/lib/format";
import { cn } from "@/lib/utils";

type SubmissionPhotosPanelProps = {
  draft: PhotoDraft;
  stationId: number | null;
  locationId: number | null;
  submissionId: string | null;
  isNewStation: boolean;
  canEdit: boolean;
  errors: readonly EditError[];
};

type DeleteTarget = { kind: "stored"; photoId: string } | { kind: "local"; index: number };
type PhotoEditValues = { note: string; takenAt: Date | null };
type StoredEditState = PhotoEditValues & { photoId: string };
type LocalEditState = PhotoEditValues & { index: number };
type StoredPhotoEdit = { photo: SubmissionPhoto; note: string; takenAt: string | null };

type PhotoSubsectionProps = {
  title: string;
  meta?: string;
  children: ReactNode;
};

type LocationPhotoCardProps = {
  photo: PhotoRecord;
  index: number;
  isAssigned: boolean;
  isSelected: boolean;
  isMarkedForRemoval: boolean;
  isProposedMain: boolean;
  isCurrentMain: boolean;
  isDimmed: boolean;
  canEdit: boolean;
  triggerRef: Ref<HTMLDivElement>;
  onOpen: (index: number) => void;
  onToggle: (photo: PhotoRecord) => void;
  onSetAsMain: (photo: PhotoRecord) => void;
};

type UploadPhotoCardProps = {
  src: string;
  alt: string;
  isMain: boolean;
  canEdit: boolean;
  editValues: PhotoEditValues | null;
  isSaving?: boolean;
  triggerRef: Ref<HTMLDivElement>;
  onOpen: () => void;
  onEditOpen: () => void;
  onEditChange: (values: PhotoEditValues | null) => void;
  onSave: () => void;
  onSetAsMain?: () => void;
  onDelete: () => void;
};

type LocalPhotoTextProps = {
  name: string;
  note: string;
  takenAt: Date | null;
};

type UploadPhotosLightboxProps = Omit<LightboxProps, "slides"> & {
  submissionPhotos: readonly LightboxPhoto[];
  files: readonly File[];
  notes: readonly string[];
  previewUrls: readonly string[];
  takenAts: readonly (Date | null)[];
};

const NO_LOCATION_PHOTOS: PhotoRecord[] = [];
const NO_STORED_PHOTOS: SubmissionPhoto[] = [];
const MAIN_BADGE_CLASS = "absolute top-1 left-1 rounded-full p-0.5";
const PROPOSED_MAIN_CLASS = "bg-amber-500 text-white";
const CURRENT_MAIN_CLASS = "bg-muted text-muted-foreground ring-1 ring-border";
const RECENT_BADGE_CLASS = cn(
  "pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-amber-500",
  "px-1.5 py-0.5 text-[10px] leading-none font-medium text-white",
);
const STAR_BUTTON_CLASS =
  "flex cursor-pointer items-center justify-center py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-amber-500";

function isShownOn(photo: PhotoRecord, stationId: number): boolean {
  return photo.selections.some((shown) => shown.stationId === stationId);
}

function getSelectionBorderClass(isSelected: boolean, isMarkedForRemoval: boolean): string {
  if (isMarkedForRemoval) return "border-red-500";
  return isSelected ? "border-primary" : "border-transparent";
}

function PhotoSubsection({ title, meta, children }: PhotoSubsectionProps) {
  return (
    <section className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {meta === undefined ? null : <span className="text-xs text-muted-foreground">{meta}</span>}
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

function LocationPhotoCard({
  photo,
  index,
  isAssigned,
  isSelected,
  isMarkedForRemoval,
  isProposedMain,
  isCurrentMain,
  isDimmed,
  canEdit,
  triggerRef,
  onOpen,
  onToggle,
  onSetAsMain,
}: LocationPhotoCardProps) {
  const { t, i18n } = useTranslation(["submissions", "common", "stationDetails"]);
  const isMain = isProposedMain || isCurrentMain;
  const hasStarBadge = !isMarkedForRemoval && isMain;
  const offersMain = canEdit && isSelected && !isMarkedForRemoval && !isMain;
  const removalTitle = isMarkedForRemoval ? t("photos.cancelRemoval") : t("photos.removeFromStation");

  function togglePhoto() {
    if (canEdit) onToggle(photo);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-disabled={!canEdit}
      title={isAssigned ? removalTitle : undefined}
      className={cn(
        "overflow-hidden rounded-lg border-2 bg-muted transition-colors select-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        canEdit ? "cursor-pointer" : null,
        getSelectionBorderClass(isSelected, isMarkedForRemoval),
      )}
      onClick={togglePhoto}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        togglePhoto();
      }}
    >
      <PhotoImage
        ref={triggerRef}
        src={photo.urls.thumb}
        alt={photo.note ?? ""}
        frameClassName="h-36"
        imageClassName={cn("transition-opacity", isDimmed ? "opacity-40" : null)}
        onOpen={() => onOpen(index)}
      >
        {hasStarBadge ? (
          <span
            title={isProposedMain ? t("stationDetails:photos.main") : t("photos.currentMain")}
            className={cn(MAIN_BADGE_CLASS, isProposedMain ? PROPOSED_MAIN_CLASS : CURRENT_MAIN_CLASS)}
          >
            <HugeiconsIcon icon={StarIcon} aria-hidden="true" className="size-3" />
          </span>
        ) : null}
        {isRecentPhoto(photo.createdAt) ? <span className={RECENT_BADGE_CLASS}>NEW</span> : null}
        {isSelected || isMarkedForRemoval ? (
          <span
            className={cn(
              "pointer-events-none absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full border-2 transition-colors",
              isMarkedForRemoval ? "border-red-500 bg-red-500" : "border-primary bg-primary",
            )}
          >
            <HugeiconsIcon icon={isMarkedForRemoval ? Cancel01Icon : Tick02Icon} aria-hidden="true" className="size-2.5 text-white" />
          </span>
        ) : null}
      </PhotoImage>
      {offersMain ? (
        <div className="border-t">
          <button
            type="button"
            className={cn(STAR_BUTTON_CLASS, "w-full")}
            onClick={(event) => {
              event.stopPropagation();
              onSetAsMain(photo);
            }}
            title={t("common:photos.setAsMain")}
            aria-label={t("common:photos.setAsMain")}
          >
            <HugeiconsIcon icon={StarIcon} aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      ) : null}
      <PhotoMeta photo={photo} locale={i18n.language} />
    </div>
  );
}

function EmptyUploadState({ canEdit, onUploadClick }: { canEdit: boolean; onUploadClick: () => void }) {
  const { t } = useTranslation("submissions");

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <HugeiconsIcon icon={Image01Icon} aria-hidden="true" className="size-8 opacity-20" />
      <p>{t("photos.empty")}</p>
      {canEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={onUploadClick} className="cursor-pointer gap-1.5">
          <HugeiconsIcon icon={Upload04Icon} aria-hidden="true" className="size-3.5" />
          {t("photos.uploadFirst")}
        </Button>
      ) : null}
    </div>
  );
}

function UploadPhotoCard({
  src,
  alt,
  isMain,
  canEdit,
  editValues,
  isSaving = false,
  triggerRef,
  onOpen,
  onEditOpen,
  onEditChange,
  onSave,
  onSetAsMain,
  onDelete,
}: UploadPhotoCardProps) {
  const { t } = useTranslation(["common", "stationDetails"]);
  const offersMain = onSetAsMain !== undefined && !isMain;

  return (
    <div className="overflow-hidden rounded-lg border bg-muted">
      <PhotoImage ref={triggerRef} src={src} alt={alt} frameClassName="aspect-square h-auto" onOpen={onOpen}>
        {isMain ? (
          <span title={t("stationDetails:photos.main")} className={cn(MAIN_BADGE_CLASS, PROPOSED_MAIN_CLASS)}>
            <HugeiconsIcon icon={StarIcon} aria-hidden="true" className="size-3" />
          </span>
        ) : null}
      </PhotoImage>
      {canEdit ? (
        <div className={cn("grid divide-x border-t", offersMain ? "grid-cols-3" : "grid-cols-2")}>
          {offersMain ? (
            <button
              type="button"
              className={STAR_BUTTON_CLASS}
              onClick={onSetAsMain}
              title={t("photos.setAsMain")}
              aria-label={t("photos.setAsMain")}
            >
              <HugeiconsIcon icon={StarIcon} aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
          <PhotoEditPopover
            isOpen={editValues !== null}
            note={editValues?.note ?? ""}
            takenAt={editValues?.takenAt ?? null}
            onOpen={onEditOpen}
            onOpenChange={(isOpen) => {
              if (!isOpen) onEditChange(null);
            }}
            onNoteChange={(note) => onEditChange(editValues === null ? null : { ...editValues, note })}
            onTakenAtChange={(takenAt) => onEditChange(editValues === null ? null : { ...editValues, takenAt })}
            onSave={onSave}
            isSaving={isSaving}
          />
          <PhotoDeleteButton onClick={onDelete} label={t("actions.remove")} />
        </div>
      ) : null}
    </div>
  );
}

function PhotosWarning() {
  const { t } = useTranslation("submissions");

  return (
    <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
      <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{t("warnings.photosTitle")}</p>
        <p className="text-xs leading-relaxed text-blue-600/80 dark:text-blue-400/80">{t("warnings.photosDesc")}</p>
      </div>
    </div>
  );
}

function LocalPhotoCaption({ name, note, takenAt }: LocalPhotoTextProps) {
  const { t, i18n } = useTranslation("submissions");

  return (
    <div className="flex flex-col gap-1.5 md:items-center">
      {note === "" ? null : <p className="line-clamp-2 text-sm leading-snug text-white/90 md:text-[15px]">{note}</p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60 md:justify-center">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-white/80">
          <HugeiconsIcon icon={Image01Icon} className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{name}</span>
        </span>
        {takenAt === null ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 tabular-nums">
              <HugeiconsIcon icon={Camera01Icon} className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t("photos.takenAt")}: </span>
              <time dateTime={takenAt.toISOString()}>{formatMonthYear(takenAt, i18n.language, "short")}</time>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function LocalPhotoDetails({ name, note, takenAt }: LocalPhotoTextProps) {
  const { t, i18n } = useTranslation("submissions");

  return (
    <>
      {note === "" ? null : <p className="text-[15px] leading-snug text-white">{note}</p>}
      <p className="text-sm wrap-break-word text-white/80">{name}</p>
      {takenAt === null ? null : (
        <LightboxDetailRow label={t("photos.takenAt")}>
          <time dateTime={takenAt.toISOString()}>{formatMonthYear(takenAt, i18n.language, "long")}</time>
        </LightboxDetailRow>
      )}
    </>
  );
}

export function UploadPhotosLightbox({ submissionPhotos, files, notes, previewUrls, takenAts, ...lightboxProps }: UploadPhotosLightboxProps) {
  const { t } = useTranslation("stationDetails");
  const localSlides = files.map((file, index): LightboxSlide => {
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
  });

  return <Lightbox slides={[...photoSlides([...submissionPhotos], t, lightboxProps.onClose), ...localSlides]} {...lightboxProps} />;
}

export function SubmissionPhotosPanel({ draft, stationId, locationId, submissionId, isNewStation, canEdit, errors }: SubmissionPhotosPanelProps) {
  const { t } = useTranslation(["submissions", "common", "stations"]);
  const text = useEditText();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isOpen, setIsOpen] = useRevealedOpen("photos");
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [localEditState, setLocalEditState] = useState<LocalEditState | null>(null);
  const [storedEditState, setStoredEditState] = useState<StoredEditState | null>(null);
  const locationLightbox = useLightbox();
  const uploadLightbox = useLightbox();
  const {
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
  } = draft;

  const previewUrls = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  const locationPhotosQuery = useQuery(locationPhotoRecordsQueryOptions(locationId));
  const storedPhotosQuery = useQuery({ ...submissionPhotosQueryOptions(submissionId ?? ""), enabled: submissionId !== null });

  function invalidateStoredPhotos() {
    if (submissionId !== null) void queryClient.invalidateQueries({ queryKey: editingKeys.submissionPhotosOf(submissionId) });
  }

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => deleteSubmissionPhoto(submissionId ?? "", photoId),
    onSuccess: () => {
      invalidateStoredPhotos();
      toast.success(t("photos.deleted"));
    },
    onError: (error) => {
      if (!isGloballyHandledError(error)) toast.error(t("photos.deleteFailed"));
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ photo, note, takenAt }: StoredPhotoEdit) => {
      const changes: SubmissionPhotoUpdate = {};
      if (note !== (photo.note ?? "")) changes.note = note === "" ? null : note;
      if (takenAt !== photo.takenAt) changes.takenAt = takenAt;
      if (Object.keys(changes).length > 0) await updateSubmissionPhoto(submissionId ?? "", photo.id, changes);
    },
    onSuccess: (_result, { photo }) => {
      invalidateStoredPhotos();
      setStoredEditState((current) => (current?.photoId === photo.id ? null : current));
    },
    onError: (error) => {
      if (!isGloballyHandledError(error)) toast.error(t("photos.noteFailed"));
    },
  });

  const locationPhotos = locationPhotosQuery.data ?? NO_LOCATION_PHOTOS;
  const storedPhotos = storedPhotosQuery.data ?? NO_STORED_PHOTOS;
  const isLocationLoading = locationId !== null && locationPhotosQuery.isLoading;
  const hasLocationError = locationId !== null && locationPhotosQuery.isLoadingError;
  const isStoredLoading = submissionId !== null && storedPhotosQuery.isLoading;
  const hasStoredError = submissionId !== null && storedPhotosQuery.isLoadingError;
  const showsLocationPhotos = !isLocationLoading && !hasLocationError;
  const showsUploads = !isStoredLoading && !hasStoredError;
  const hasLocationSection = locationId !== null && (isLocationLoading || hasLocationError || locationPhotos.length > 0);
  const assignedPhotos = stationId === null ? NO_LOCATION_PHOTOS : locationPhotos.filter((photo) => isShownOn(photo, stationId));
  const assignedIds = new Set(assignedPhotos.map((photo) => photo.id));
  const currentMainId = stationId === null ? null : (locationPhotos.find((photo) => isMainPhoto(photo, stationId))?.id ?? null);
  const storedMainId = storedPhotos.find((photo) => photo.isMain)?.id ?? null;
  const hasUploadMain = mainUploadPhotoIndex !== null || storedMainId !== null;
  const uploadCount = storedPhotos.length + photos.length;
  const freeSlots = Math.max(0, MAX_SUBMISSION_PHOTOS - uploadCount);
  const cardErrors = errors.filter((error) => error.target.scope === "photos");

  function isShownAfterSending(photo: PhotoRecord): boolean {
    return locationPhotoIds.includes(photo.id) || (assignedIds.has(photo.id) && !locationPhotoIdsToRemove.includes(photo.id));
  }

  function toggleLocationPhoto(photo: PhotoRecord) {
    if (!assignedIds.has(photo.id)) {
      const isPicked = locationPhotoIds.includes(photo.id);
      onLocationPhotoIdsChange(isPicked ? locationPhotoIds.filter((id) => id !== photo.id) : [...locationPhotoIds, photo.id]);
      if (isPicked && mainLocationPhotoId === photo.id) onMainLocationPhotoIdChange(null);
      return;
    }
    if (locationPhotoIdsToRemove.includes(photo.id)) {
      onLocationPhotoIdsToRemoveChange(locationPhotoIdsToRemove.filter((id) => id !== photo.id));
      return;
    }
    onLocationPhotoIdsToRemoveChange([...locationPhotoIdsToRemove, photo.id]);
    onLocationPhotoIdsChange(locationPhotoIds.filter((id) => id !== photo.id));
    if (mainLocationPhotoId === photo.id) onMainLocationPhotoIdChange(null);
  }

  function setLocationPhotoAsMain(photo: PhotoRecord) {
    onMainUploadPhotoIndexChange(null);
    onMainLocationPhotoIdChange(photo.id);
  }

  function setLocalPhotoAsMain(index: number) {
    onMainLocationPhotoIdChange(null);
    onMainUploadPhotoIndexChange(index);
  }

  function addFiles(files: File[]) {
    if (!canEdit || hasStoredError) return;

    const fittingFiles: File[] = [];
    for (const file of files) {
      if (file.size > MAX_PHOTO_SIZE_BYTES) toast.error(t("photos.fileTooLarge", { name: file.name, size: MAX_PHOTO_SIZE_LABEL }));
      else fittingFiles.push(file);
    }
    const addedFiles = fittingFiles.slice(0, freeSlots);
    if (addedFiles.length < fittingFiles.length) toast.error(t("stations:edit.errors.tooManyUploads", { max: MAX_SUBMISSION_PHOTOS }));
    if (addedFiles.length === 0) return;

    onPhotosChange([...photos, ...addedFiles]);
    onNotesChange([...notes, ...addedFiles.map(() => "")]);
    onTakenAtsChange([...takenAts, ...addedFiles.map(() => null)]);
  }

  function removeLocalPhoto(index: number) {
    onPhotosChange(photos.filter((_, position) => position !== index));
    onNotesChange(notes.filter((_, position) => position !== index));
    onTakenAtsChange(takenAts.filter((_, position) => position !== index));
    if (mainUploadPhotoIndex === index) onMainUploadPhotoIndexChange(null);
    else if (mainUploadPhotoIndex !== null && mainUploadPhotoIndex > index) onMainUploadPhotoIndexChange(mainUploadPhotoIndex - 1);
  }

  function confirmDelete() {
    if (deleteTarget === null) return;
    if (deleteTarget.kind === "local") removeLocalPhoto(deleteTarget.index);
    else deleteMutation.mutate(deleteTarget.photoId);
    setDeleteTarget(null);
  }

  function saveLocalEdit() {
    if (localEditState === null) return;

    const { index, note, takenAt } = localEditState;
    onNotesChange(notes.map((known, position) => (position === index ? note : known)));
    onTakenAtsChange(takenAts.map((known, position) => (position === index ? takenAt : known)));
    setLocalEditState(null);
  }

  function saveStoredEdit(photo: SubmissionPhoto) {
    if (storedEditState === null) return;
    editMutation.mutate({ photo, note: storedEditState.note, takenAt: storedEditState.takenAt?.toISOString() ?? null });
  }

  function openStoredEdit(photo: SubmissionPhoto) {
    setStoredEditState({ photoId: photo.id, note: photo.note ?? "", takenAt: photo.takenAt === null ? null : new Date(photo.takenAt) });
  }

  function openLocalEdit(index: number) {
    setLocalEditState({ index, note: notes[index] ?? "", takenAt: takenAts[index] ?? null });
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const droppedFiles = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (droppedFiles.length > 0) addFiles(droppedFiles);
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    dragDepth.current += 1;
    if (dragDepth.current === 1) setIsDragging(true);
  }

  function handleDragLeave() {
    dragDepth.current -= 1;
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  const selectedCount = locationPhotos.filter(isShownAfterSending).length;
  const hasPickedPhoto = locationPhotoIds.length > 0;

  return (
    <>
      <div onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <EditCard
          title={t("photos.label")}
          icon={Image01Icon}
          isCollapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className={cn("transition-colors", isDragging && canEdit ? "border-primary bg-primary/5 ring-2 ring-primary" : null)}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <div className="space-y-3 p-3" {...editTargetProps({ scope: "photos" })}>
            {cardErrors.map((error, position) => (
              <p key={`${error.messageKey}:${position}`} role="alert" className="text-xs text-destructive">
                {text.formatError(error)}
              </p>
            ))}
            {hasLocationSection ? (
              <div {...editTargetProps({ scope: "photos", field: "picks" })}>
                <PhotoSubsection
                  title={t("photos.locationPhotos")}
                  meta={showsLocationPhotos ? t("photos.selectionCount", { selected: selectedCount, total: locationPhotos.length }) : undefined}
                >
                  {isLocationLoading ? <CenteredSpinner /> : null}
                  {hasLocationError ? (
                    <InlineError className="m-3" onRetry={() => locationPhotosQuery.refetch()} isRetrying={locationPhotosQuery.isFetching} />
                  ) : null}
                  {showsLocationPhotos ? (
                    <div className="custom-scrollbar grid max-h-80 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 overflow-y-auto p-3">
                      {locationPhotos.map((photo, index) => {
                        const isMarkedForRemoval = locationPhotoIdsToRemove.includes(photo.id);
                        const isSelected = isShownAfterSending(photo);

                        return (
                          <LocationPhotoCard
                            key={photo.id}
                            photo={photo}
                            index={index}
                            isAssigned={assignedIds.has(photo.id)}
                            isSelected={isSelected}
                            isMarkedForRemoval={isMarkedForRemoval}
                            isProposedMain={mainLocationPhotoId === photo.id}
                            isCurrentMain={currentMainId === photo.id && mainLocationPhotoId === null && !hasUploadMain}
                            isDimmed={hasPickedPhoto && !isSelected && !isMarkedForRemoval}
                            canEdit={canEdit}
                            triggerRef={locationLightbox.triggerRef(index)}
                            onOpen={locationLightbox.open}
                            onToggle={toggleLocationPhoto}
                            onSetAsMain={setLocationPhotoAsMain}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </PhotoSubsection>
              </div>
            ) : null}

            <div {...editTargetProps({ scope: "photos", field: "uploads" })}>
              <PhotoSubsection
                title={isNewStation ? t("photos.label") : t("photos.uploadedPhotos")}
                meta={showsUploads ? `${uploadCount}/${MAX_SUBMISSION_PHOTOS}` : undefined}
              >
                {isStoredLoading ? <CenteredSpinner /> : null}
                {hasStoredError ? (
                  <InlineError className="m-3" onRetry={() => storedPhotosQuery.refetch()} isRetrying={storedPhotosQuery.isFetching} />
                ) : null}
                {showsUploads && uploadCount === 0 ? <EmptyUploadState canEdit={canEdit} onUploadClick={openFilePicker} /> : null}
                {showsUploads && uploadCount > 0 ? (
                  <div className="custom-scrollbar grid max-h-96 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3">
                    {storedPhotos.map((photo, index) => (
                      <UploadPhotoCard
                        key={photo.id}
                        src={photo.urls.thumb}
                        alt={photo.note ?? ""}
                        isMain={photo.isMain && mainUploadPhotoIndex === null && mainLocationPhotoId === null}
                        canEdit={canEdit}
                        editValues={storedEditState?.photoId === photo.id ? storedEditState : null}
                        isSaving={editMutation.isPending}
                        triggerRef={uploadLightbox.triggerRef(index)}
                        onOpen={() => uploadLightbox.open(index)}
                        onEditOpen={() => openStoredEdit(photo)}
                        onEditChange={(values) => setStoredEditState(values === null ? null : { ...values, photoId: photo.id })}
                        onSave={() => saveStoredEdit(photo)}
                        onDelete={() => setDeleteTarget({ kind: "stored", photoId: photo.id })}
                      />
                    ))}
                    {photos.map((file, index) => (
                      <UploadPhotoCard
                        key={previewUrls[index] ?? `${file.name}-${index}`}
                        src={previewUrls[index] ?? ""}
                        alt={file.name}
                        isMain={mainUploadPhotoIndex === index}
                        canEdit={canEdit}
                        editValues={localEditState?.index === index ? localEditState : null}
                        triggerRef={uploadLightbox.triggerRef(storedPhotos.length + index)}
                        onOpen={() => uploadLightbox.open(storedPhotos.length + index)}
                        onEditOpen={() => openLocalEdit(index)}
                        onEditChange={(values) => setLocalEditState(values === null ? null : { ...values, index })}
                        onSave={saveLocalEdit}
                        onSetAsMain={() => setLocalPhotoAsMain(index)}
                        onDelete={() => setDeleteTarget({ kind: "local", index })}
                      />
                    ))}
                    {canEdit && freeSlots > 0 ? <AddPhotoTile className="aspect-square h-auto" onClick={openFilePicker} /> : null}
                  </div>
                ) : null}
                {uploadCount > 0 ? <PhotosWarning /> : null}
                <p className="px-3 pb-2 text-xs text-muted-foreground">
                  {t("photos.limitsHint", { max: MAX_SUBMISSION_PHOTOS, size: MAX_PHOTO_SIZE_LABEL })}
                </p>
              </PhotoSubsection>
            </div>
          </div>
        </EditCard>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(isDialogOpen) => {
          if (!isDialogOpen) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("photos.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("photos.confirmDeleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="cursor-pointer" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Spinner /> : t("common:actions.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PhotoLightbox photos={locationPhotos} {...locationLightbox.lightboxProps} />
      <UploadPhotosLightbox
        submissionPhotos={storedPhotos}
        files={photos}
        notes={notes}
        previewUrls={previewUrls}
        takenAts={takenAts}
        {...uploadLightbox.lightboxProps}
      />
    </>
  );
}
