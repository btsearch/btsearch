import {
  Camera01Icon,
  Cancel01Icon,
  Delete02Icon,
  Image01Icon,
  PencilEdit02Icon,
  Tick02Icon,
  Upload04Icon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentPropsWithoutRef, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export const RECENT_PHOTO_MS = 7 * 24 * 60 * 60 * 1000;

export type PhotoMetaData = {
  note: string | null;
  taken_at?: string | null;
  createdAt: string;
  author: { username: string } | null;
};

export function isRecentPhoto(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < RECENT_PHOTO_MS;
}

type PhotoWithFallbackProps = Omit<ComponentPropsWithoutRef<"img">, "src"> & {
  fallbackClassName?: string;
  fallbackLabelClassName?: string;
  src: string;
};

function PhotoUnavailable({ className, labelClassName, title }: { className?: string; labelClassName?: string; title?: string }) {
  const { t } = useTranslation("common");
  const label = t("photoUnavailable");

  return (
    <span role="img" aria-label={label} title={title ?? label} className={className}>
      <HugeiconsIcon icon={Image01Icon} className="size-7 opacity-55" aria-hidden="true" />
      <span className={labelClassName}>{label}</span>
    </span>
  );
}

export function PhotoWithFallback({
  alt,
  className,
  fallbackClassName,
  fallbackLabelClassName,
  onError,
  src,
  title,
  ...props
}: PhotoWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src.trim().length === 0 || failedSrc === src)
    return (
      <PhotoUnavailable
        title={title}
        className={cn(
          className,
          "flex flex-col items-center justify-center gap-2 bg-muted text-center text-sm text-muted-foreground",
          fallbackClassName,
        )}
        labelClassName={fallbackLabelClassName}
      />
    );

  return (
    <img
      {...props}
      src={src}
      alt={alt}
      title={title}
      className={className}
      onError={(event) => {
        setFailedSrc(src);
        onError?.(event);
      }}
    />
  );
}

export function PhotoImage({
  alt,
  children,
  frameClassName,
  imageClassName,
  onOpen,
  src,
}: {
  alt: string;
  children?: ReactNode;
  frameClassName?: string;
  imageClassName?: string;
  onOpen: () => void;
  src: string;
}) {
  return (
    <div className={cn("relative h-36", frameClassName)}>
      <PhotoWithFallback src={src} alt={alt} className={cn("w-full h-full object-cover", imageClassName)} loading="lazy" />
      {children}
      <button
        type="button"
        className="absolute top-1 right-1 size-8 sm:size-6 rounded-full bg-black/50 ring-1 ring-white/30 shadow-sm flex items-center justify-center cursor-pointer"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label="View full size"
      >
        <HugeiconsIcon icon={ZoomInAreaIcon} className="size-3 text-white" />
      </button>
    </div>
  );
}

export function PhotoMeta({ className, locale, photo }: { className?: string; locale: string; photo: PhotoMetaData }) {
  return (
    <div className={cn("px-2 pt-1 pb-1 text-[11px] space-y-0.5", className)}>
      <p className="truncate font-medium text-foreground/70">@{photo.author?.username ?? "-"}</p>
      <div className="flex items-center gap-1 text-muted-foreground">
        <HugeiconsIcon icon={Upload04Icon} className="size-2.5 shrink-0" />
        <span className="tabular-nums truncate">
          {new Date(photo.createdAt).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}
        </span>
      </div>
      {photo.taken_at ? (
        <div className="flex items-center gap-1 text-muted-foreground">
          <HugeiconsIcon icon={Camera01Icon} className="size-2.5 shrink-0" />
          <span className="tabular-nums truncate">{new Date(photo.taken_at).toLocaleDateString(locale, { year: "numeric", month: "short" })}</span>
        </div>
      ) : null}
      {photo.note ? <p className="truncate italic text-muted-foreground">{photo.note}</p> : null}
    </div>
  );
}

export function PhotoEditPopover({
  isOpen,
  isSaving,
  note,
  onNoteChange,
  onOpen,
  onOpenChange,
  onSave,
  onTakenAtChange,
  showTakenAt = true,
  takenAt,
}: {
  isOpen: boolean;
  isSaving?: boolean;
  note: string;
  onNoteChange: (note: string) => void;
  onOpen: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onTakenAtChange: (date: Date | null) => void;
  showTakenAt?: boolean;
  takenAt: Date | null;
}) {
  const { t } = useTranslation("submissions");
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
        {t("common:actions.edit")}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground">{t("photos.note")}</label>
          <Input value={note} onChange={(event) => onNoteChange(event.target.value)} maxLength={100} placeholder={t("photos.notePlaceholder")} />
        </div>
        {showTakenAt ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">{t("photos.takenAt")}</label>
            <DatePickerInput value={takenAt} onChange={onTakenAtChange} />
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            {t("common:actions.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Spinner className="size-3" /> : <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />}
            {t("common:actions.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PhotoDeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
    >
      <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
      {label}
    </button>
  );
}

export function AddPhotoTile({
  className,
  disabled,
  isLoading,
  onClick,
}: {
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("submissions");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-36 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50",
        className,
      )}
    >
      {isLoading ? <Spinner className="size-5" /> : <HugeiconsIcon icon={Upload04Icon} className="size-5 text-muted-foreground" />}
      <span className="text-xs text-muted-foreground">{t("photos.add")}</span>
    </button>
  );
}
