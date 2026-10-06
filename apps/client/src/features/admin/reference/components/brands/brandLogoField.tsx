import { Delete02Icon, Image01Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ChangeEvent, type DragEvent, type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { BRAND_LOGO_TYPES } from "../../api/brands";
import type { BrandLogo } from "../../types";
import { REFERENCE_DESCRIPTION_CLASS } from "../shared/referenceCards";
import { formatLogoFileInfo } from "./brandLogo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type BrandLogoFieldProps = {
  logo: BrandLogo | null;
  logoInfo: string;
  isLogoStored: boolean;
  uploadingFile: File | null;
  isRemoving: boolean;
  isDisabled: boolean;
  hasError: boolean;
  onFileChosen: (file: File) => void;
  onRemove: () => void;
};

type LogoPreviewProps = {
  logo: BrandLogo;
  logoInfo: string;
  isLogoStored: boolean;
  isRemoving: boolean;
  isDisabled: boolean;
  onChooseFile: () => void;
  onRemove: () => void;
};

type LogoEmptyZoneProps = {
  isDisabled: boolean;
  hasError: boolean;
  onChooseFile: () => void;
};

export const DESTRUCTIVE_BUTTON_CLASS = "cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15";

const LOGO_ACCEPT = BRAND_LOGO_TYPES.join(",");
const ZONE_CLASS = "flex flex-col items-center justify-center gap-2 rounded-xl border px-4 py-5 text-center";
const TILE_CLASS = "flex size-18 shrink-0 items-center justify-center rounded-xl ring-1 ring-border ring-inset";
const IMAGE_CLASS = "h-10 w-auto max-w-14 object-contain";

function LogoDropTarget({ isShown }: { isShown: boolean }) {
  const { t } = useTranslation("admin");

  return (
    <div
      aria-hidden={!isShown}
      className={cn(
        "pointer-events-none absolute inset-0 rounded-xl bg-background transition-opacity duration-150 motion-reduce:transition-none",
        isShown ? "opacity-100" : "opacity-0",
      )}
    >
      <div className={cn(ZONE_CLASS, "h-full border-primary bg-primary/5 ring-2 ring-primary")}>
        <HugeiconsIcon icon={Upload04Icon} aria-hidden="true" className="size-7 text-primary" />
        <p className="text-sm leading-5 font-medium">{t("reference.brands.logo.dropNow")}</p>
      </div>
    </div>
  );
}

function LogoUploading({ file }: { file: File }) {
  const { t } = useTranslation("admin");

  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border p-3">
      <span aria-hidden="true" className={cn(TILE_CLASS, "bg-card")}>
        <Spinner role="presentation" aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5 font-medium">{t("reference.brands.logo.uploading")}</p>
        <p className={cn("truncate", REFERENCE_DESCRIPTION_CLASS)}>{formatLogoFileInfo(file)}</p>
      </div>
    </div>
  );
}

function LogoPreview({ logo, logoInfo, isLogoStored, isRemoving, isDisabled, onChooseFile, onRemove }: LogoPreviewProps) {
  const { t } = useTranslation("admin");

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
      <span aria-hidden="true" className={cn(TILE_CLASS, "dark bg-card")}>
        <img src={logo.url} alt="" className={IMAGE_CLASS} />
      </span>
      <span aria-hidden="true" className={cn(TILE_CLASS, "bg-white")}>
        <img src={logo.url} alt="" className={IMAGE_CLASS} />
      </span>
      <div className="min-w-0 flex-1 basis-32">
        <p className="truncate text-sm leading-5 font-medium">{logoInfo}</p>
        <p className={REFERENCE_DESCRIPTION_CLASS}>{t("reference.brands.logo.previewHint")}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 max-sm:w-full max-sm:flex-row">
        <Button type="button" variant="outline" size="sm" className="cursor-pointer" disabled={isDisabled} onClick={onChooseFile}>
          <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" aria-hidden="true" />
          {isLogoStored ? t("reference.brands.logo.uploadNew") : t("reference.brands.logo.chooseAnother")}
        </Button>
        <Button type="button" variant="ghost" size="sm" className={DESTRUCTIVE_BUTTON_CLASS} disabled={isDisabled} onClick={onRemove}>
          {isRemoving ? <Spinner /> : <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" aria-hidden="true" />}
          {t("reference.brands.logo.remove")}
        </Button>
      </div>
    </div>
  );
}

function LogoEmptyZone({ isDisabled, hasError, onChooseFile }: LogoEmptyZoneProps) {
  const { t } = useTranslation("admin");

  return (
    <div className={cn(ZONE_CLASS, "border-dashed", hasError ? "border-destructive/40" : "border-input")}>
      <HugeiconsIcon icon={Image01Icon} aria-hidden="true" className="size-7 text-muted-foreground" />
      <p className="text-sm leading-5">{t("reference.brands.logo.drop")}</p>
      <Button type="button" variant="outline" size="sm" className="cursor-pointer" disabled={isDisabled} onClick={onChooseFile}>
        <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" aria-hidden="true" />
        {t("reference.brands.logo.choose")}
      </Button>
    </div>
  );
}

export function BrandLogoField({
  logo,
  logoInfo,
  isLogoStored,
  uploadingFile,
  isRemoving,
  isDisabled,
  hasError,
  onFileChosen,
  onRemove,
}: BrandLogoFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFileChosen(file);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    if (dragDepth.current === 1 && !isDisabled) setIsDragging(true);
  }

  function handleDragLeave() {
    dragDepth.current -= 1;
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !isDisabled) onFileChosen(file);
  }

  let logoBox: ReactNode;
  if (uploadingFile !== null) {
    logoBox = <LogoUploading file={uploadingFile} />;
  } else if (logo !== null) {
    logoBox = (
      <LogoPreview
        logo={logo}
        logoInfo={logoInfo}
        isLogoStored={isLogoStored}
        isRemoving={isRemoving}
        isDisabled={isDisabled}
        onChooseFile={openFilePicker}
        onRemove={onRemove}
      />
    );
  } else {
    logoBox = <LogoEmptyZone isDisabled={isDisabled} hasError={hasError} onChooseFile={openFilePicker} />;
  }

  return (
    <div className="relative" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {logoBox}
      <LogoDropTarget isShown={isDragging} />
      <input ref={fileInputRef} type="file" accept={LOGO_ACCEPT} className="hidden" onChange={handleFileChange} />
    </div>
  );
}
