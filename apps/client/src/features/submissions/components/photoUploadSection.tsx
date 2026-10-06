import {
  ArrowDown01Icon,
  Cancel01Icon,
  Image01Icon,
  InformationCircleIcon,
  PencilEdit02Icon,
  Tick02Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MAX_PHOTO_SIZE_BYTES, MAX_PHOTO_SIZE_LABEL, MAX_SUBMISSION_PHOTOS } from "../photoLimits";
import { UploadPhotosLightbox } from "./submissionPhotosPanel";
import { useLightbox } from "@/components/lightbox";
import { AddPhotoTile, PhotoDeleteButton, PhotoImage } from "@/components/photos/photoGridPrimitives";
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
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type PhotoUploadSectionProps = {
  photos: File[];
  onPhotosChange: (files: File[]) => void;
  notes: string[];
  onNotesChange: (notes: string[]) => void;
  takenAts: (Date | null)[];
  onTakenAtsChange: (takenAts: (Date | null)[]) => void;
  isLocked: boolean;
};

type PhotoDetails = {
  note: string;
  takenAt: Date | null;
};

type PhotoDetailsPopoverProps = PhotoDetails & {
  onSave: (details: PhotoDetails) => void;
};

const NO_STORED_PHOTOS: never[] = [];
const EDIT_TRIGGER_CLASS = cn(
  "flex cursor-pointer items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground",
  "hover:text-foreground hover:bg-accent transition-colors",
);

function PhotoDetailsPopover({ note, takenAt, onSave }: PhotoDetailsPopoverProps) {
  const { t } = useTranslation("submissions");
  const noteInputId = useId();
  const takenAtLabelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [details, setDetails] = useState<PhotoDetails>({ note, takenAt });

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setDetails({ note, takenAt });
    setIsOpen(nextOpen);
  }

  function saveDetails() {
    onSave(details);
    setIsOpen(false);
  }

  return (
    <Popover open={isOpen} onOpenChange={changeOpen}>
      <PopoverTrigger type="button" className={EDIT_TRIGGER_CLASS}>
        <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
        {t("common:actions.edit")}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={noteInputId} className="text-xs font-medium text-foreground">
            {t("photos.note")}
          </label>
          <input
            {...NO_AUTOFILL_PROPS}
            id={noteInputId}
            value={details.note}
            onChange={(event) => {
              const typedNote = event.target.value;
              setDetails((known) => ({ ...known, note: typedNote }));
            }}
            maxLength={100}
            placeholder={t("photos.notePlaceholder")}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm w-full"
          />
        </div>
        <div role="group" aria-labelledby={takenAtLabelId} className="flex flex-col gap-1.5">
          <span id={takenAtLabelId} className="text-xs font-medium text-foreground">
            {t("photos.takenAt")}
          </span>
          <DatePickerInput value={details.takenAt} onChange={(pickedDate) => setDetails((known) => ({ ...known, takenAt: pickedDate }))} />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" className="cursor-pointer" onClick={() => setIsOpen(false)}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            {t("common:actions.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={saveDetails}>
            <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
            {t("common:actions.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PhotoUploadSection({ photos, onPhotosChange, notes, onNotesChange, takenAts, onTakenAtsChange, isLocked }: PhotoUploadSectionProps) {
  const { t } = useTranslation("submissions");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const previewUrls = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);

  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const lightbox = useLightbox();

  useEffect(() => {
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  const hasFreeSlot = photos.length < MAX_SUBMISSION_PHOTOS;

  function addFiles(files: File[]) {
    const fittingFiles: File[] = [];
    for (const file of files) {
      if (file.size > MAX_PHOTO_SIZE_BYTES) toast.error(t("photos.fileTooLarge", { name: file.name, size: MAX_PHOTO_SIZE_LABEL }));
      else fittingFiles.push(file);
    }
    const nextPhotos = [...photos, ...fittingFiles].slice(0, Math.max(MAX_SUBMISSION_PHOTOS, photos.length));
    onPhotosChange(nextPhotos);
    onNotesChange([...notes, ...fittingFiles.map(() => "")].slice(0, nextPhotos.length));
    onTakenAtsChange([...takenAts, ...fittingFiles.map(() => null)].slice(0, nextPhotos.length));
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
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
    if (isLocked || !hasFreeSlot) return;
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (files.length > 0) addFiles(files);
  }

  function confirmDelete() {
    if (deleteIndex === null) return;
    onPhotosChange(photos.filter((_, index) => index !== deleteIndex));
    onNotesChange(notes.filter((_, index) => index !== deleteIndex));
    onTakenAtsChange(takenAts.filter((_, index) => index !== deleteIndex));
    setDeleteIndex(null);
  }

  function changeDetails(index: number, details: PhotoDetails) {
    const updatedNotes = [...notes];
    updatedNotes[index] = details.note;
    onNotesChange(updatedNotes);
    const updatedTakenAts = [...takenAts];
    updatedTakenAts[index] = details.takenAt;
    onTakenAtsChange(updatedTakenAts);
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
              <span className="text-xs text-muted-foreground">
                ({photos.length}/{MAX_SUBMISSION_PHOTOS})
              </span>
            </CollapsibleTrigger>
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

          <CollapsibleContent inert={isLocked}>
            {photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground gap-2">
                <HugeiconsIcon icon={Image01Icon} className="size-8 opacity-20" />
                <p>{t("photos.empty")}</p>
                <Button type="button" size="sm" variant="outline" onClick={openFilePicker} className="cursor-pointer gap-1.5">
                  <HugeiconsIcon icon={Upload04Icon} className="size-3.5" />
                  {t("photos.uploadFirst")}
                </Button>
              </div>
            ) : (
              <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                {photos.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="rounded-lg overflow-hidden border bg-muted">
                    <PhotoImage
                      ref={lightbox.triggerRef(index)}
                      src={previewUrls[index] ?? ""}
                      alt={file.name}
                      frameClassName="aspect-square h-auto"
                      onOpen={() => lightbox.open(index)}
                    />

                    <div className="grid grid-cols-2 divide-x border-t">
                      <PhotoDetailsPopover
                        note={notes[index] ?? ""}
                        takenAt={takenAts[index] ?? null}
                        onSave={(details) => changeDetails(index, details)}
                      />
                      <PhotoDeleteButton onClick={() => setDeleteIndex(index)} label={t("common:actions.remove")} />
                    </div>
                  </div>
                ))}

                {hasFreeSlot ? <AddPhotoTile className="aspect-square h-auto" onClick={openFilePicker} /> : null}
              </div>
            )}
            {photos.length > 0 ? (
              <div className="mx-3 mb-2 rounded-lg border border-blue-500/30 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 flex items-start gap-2">
                <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{t("warnings.photosTitle")}</p>
                  <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">{t("warnings.photosDesc")}</p>
                </div>
              </div>
            ) : null}
            <p className="px-3 pb-2 text-xs text-muted-foreground">{t("photos.hint", { max: MAX_SUBMISSION_PHOTOS, size: MAX_PHOTO_SIZE_LABEL })}</p>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <AlertDialog
        open={deleteIndex !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("photos.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("photos.confirmDeleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="cursor-pointer" onClick={confirmDelete}>
              {t("common:actions.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UploadPhotosLightbox
        files={photos}
        notes={notes}
        previewUrls={previewUrls}
        submissionPhotos={NO_STORED_PHOTOS}
        takenAts={takenAts}
        {...lightbox.lightboxProps}
      />
    </>
  );
}
