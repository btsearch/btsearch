import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type FormEvent, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { createBrand, deleteBrandLogo, updateBrand, uploadBrandLogo } from "../../api/brands";
import { invalidateBrands } from "../../api/queryKeys";
import type { Brand, BrandCreate, BrandUpdate } from "../../types";
import { hasChanges, pickChanges } from "../../utils/diff";
import { getReferenceErrorMessage, showReferenceError } from "../../utils/errors";
import { BrandTile } from "../shared/brandTile";
import { useOpeningCount } from "../shared/useOpeningCount";
import { BrandColorField } from "./brandColorField";
import {
  BRAND_NAME_MAX_LENGTH,
  BRAND_SLUG_MAX_LENGTH,
  BRAND_VALUE_KEYS,
  isBrandSlug,
  isUnfinishedBrandSlug,
  parseBrandColor,
  toBrandDraft,
  toBrandSlug,
  toBrandValues,
} from "./brandDraft";
import { formatLogoFileInfo, formatLogoInfo, getLogoFileProblem, toLocalLogo } from "./brandLogo";
import { BrandLogoField, DESTRUCTIVE_BUTTON_CLASS } from "./brandLogoField";
import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createAuditOperationHandle, isConflict } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type BrandDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand?: Brand;
  onDelete: (brand: Brand) => void;
};

type BrandPreviewProps = {
  look: BrandLook;
  name: string;
  slug: string;
};

type BrandSlugFieldProps = {
  slug: string;
  error: string | null;
  isDisabled: boolean;
  onChange: (slug: string) => void;
};

type ChosenLogo = { file: File; previewUrl: string };
type BrandCreation = { body: BrandCreate; logoFile: File | null };
type BrandCreationResult = { brand: Brand; failedLogoUpload: { error: unknown } | null };
type BrandSave = { id: number; changes: BrandUpdate };
type BrandLogoUpload = { id: number; file: File };

const PREVIEW_FRAME_CLASS = "flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-xl border border-border/70 px-4 py-3.5";
const PREVIEW_WASH_CLASS = "bg-linear-115 from-(--brand-preview-wash)/20 via-(--brand-preview-wash)/7 via-40% to-transparent to-78%";
const PREVIEW_CLASS = `${PREVIEW_FRAME_CLASS} ${PREVIEW_WASH_CLASS}`;

function getPreviewWashStyle(color: string): CSSProperties {
  return { "--brand-preview-wash": color } as CSSProperties;
}

async function createBrandWithLogo({ body, logoFile }: BrandCreation): Promise<BrandCreationResult> {
  const auditOperation = createAuditOperationHandle();
  const brand = await createBrand(body, auditOperation);
  if (logoFile === null) return { brand, failedLogoUpload: null };

  try {
    return { brand: await uploadBrandLogo(brand.id, logoFile, auditOperation), failedLogoUpload: null };
  } catch (error) {
    return { brand, failedLogoUpload: { error } };
  }
}

function BrandPreview({ look, name, slug }: BrandPreviewProps) {
  return (
    <div aria-hidden="true" style={getPreviewWashStyle(look.color)} className={PREVIEW_CLASS}>
      <BrandTile brand={look} size={56} />
      <div className="min-w-0 flex-1 basis-32">
        <p className="truncate text-lg leading-7 font-semibold">{name}</p>
        <p className="truncate font-mono text-[0.8125rem] leading-5 text-muted-foreground">{slug}</p>
      </div>
      <span className="inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-md bg-muted px-2.5 text-xs font-medium">
        <BrandMark brand={look} size={16} />
        <span className="truncate">{name}</span>
      </span>
    </div>
  );
}

function BrandSlugField({ slug, error, isDisabled, onChange }: BrandSlugFieldProps) {
  const { t } = useTranslation("admin");
  const slugId = useId();
  const [isFocused, setIsFocused] = useState(false);

  const isStillTyping = isFocused && isUnfinishedBrandSlug(slug);
  const hasFormatError = slug !== "" && !isBrandSlug(slug) && !isStillTyping;
  const shownError = error ?? (hasFormatError ? t("reference.errors.brand.slugFormat") : null);

  return (
    <Field data-invalid={shownError !== null || undefined}>
      <FieldLabel htmlFor={slugId}>{t("reference.brands.fields.slug")}</FieldLabel>
      <Input
        {...NO_AUTOFILL_PROPS}
        id={slugId}
        value={slug}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={t("reference.brands.dialog.slugPlaceholder")}
        maxLength={BRAND_SLUG_MAX_LENGTH}
        autoCapitalize="none"
        spellCheck={false}
        disabled={isDisabled}
        aria-invalid={shownError !== null || undefined}
        className="font-mono"
      />
      {shownError === null ? <FieldDescription>{t("reference.brands.dialog.slugHint")}</FieldDescription> : <FieldError>{shownError}</FieldError>}
    </Field>
  );
}

function BrandDialogSession({ open, onOpenChange, brand, onDelete }: BrandDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const nameId = useId();
  const [savedBrand, setSavedBrand] = useState<Brand | null>(brand ?? null);
  const [draft, setDraft] = useState(() => toBrandDraft(brand));
  const [isSlugEdited, setIsSlugEdited] = useState(false);
  const [takenSlug, setTakenSlug] = useState<string | null>(null);
  const [chosenLogo, setChosenLogo] = useState<ChosenLogo | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const previewUrl = chosenLogo?.previewUrl ?? null;

  useEffect(() => {
    if (previewUrl === null) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const createMutation = useMutation({
    mutationFn: createBrandWithLogo,
    onSuccess: ({ brand: createdBrand, failedLogoUpload }) => {
      void invalidateBrands(queryClient);
      if (failedLogoUpload === null) {
        onOpenChange(false);
        toast.success(t("reference.brands.toasts.created"));
        return;
      }
      setSavedBrand(createdBrand);
      setDraft(toBrandDraft(createdBrand));
      setChosenLogo(null);
      setLogoError(getReferenceErrorMessage(t, failedLogoUpload.error, "admin:reference.brands.logo.uploadFailed"));
      toast.warning(t("reference.brands.logo.createdWithoutLogo"));
    },
    onError: (error, creation) => {
      if (isConflict(error)) setTakenSlug(creation.body.slug);
      else showReferenceError(error, "admin:reference.brands.errors.createFailed");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, changes }: BrandSave) => updateBrand(id, changes),
    onSuccess: () => {
      onOpenChange(false);
      void invalidateBrands(queryClient);
      toast.success(t("reference.brands.toasts.saved"));
    },
    onError: (error, save) => {
      if (isConflict(error) && save.changes.slug !== undefined) setTakenSlug(save.changes.slug);
      else showReferenceError(error, "admin:reference.brands.errors.saveFailed");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: BrandLogoUpload) => uploadBrandLogo(id, file),
    onSuccess: (updatedBrand) => {
      setSavedBrand(updatedBrand);
      void invalidateBrands(queryClient);
      toast.success(t("reference.brands.logo.uploaded"));
    },
    onError: (error) => setLogoError(getReferenceErrorMessage(t, error, "admin:reference.brands.logo.uploadFailed")),
  });

  const removeLogoMutation = useMutation({
    mutationFn: (id: number) => deleteBrandLogo(id),
    onSuccess: () => {
      setSavedBrand((current) => (current === null ? current : { ...current, logo: null }));
      void invalidateBrands(queryClient);
      toast.success(t("reference.brands.logo.removed"));
    },
    onError: (error) => showReferenceError(error, "admin:reference.brands.logo.removeFailed"),
  });

  const isEditing = savedBrand !== null;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isBusy = isSaving || uploadMutation.isPending || removeLogoMutation.isPending;
  const name = draft.name.trim();
  const slug = isEditing || isSlugEdited ? draft.slug : toBrandSlug(draft.name);
  const values: BrandCreate = { slug, name, color: draft.color };
  const changes: BrandUpdate = savedBrand === null ? {} : pickChanges(toBrandValues(savedBrand), values, BRAND_VALUE_KEYS);
  const isSlugTaken = slug === takenSlug;
  const isComplete = name !== "" && isBrandSlug(slug) && !isSlugTaken && parseBrandColor(draft.colorText) !== null;
  const canSubmit = isComplete && !isBusy && (savedBrand === null || hasChanges(changes));

  const requiredError = isEditing ? t("common:validation.required") : null;
  const nameError = name === "" ? requiredError : null;
  let slugError: string | null = null;
  if (slug === "") slugError = requiredError;
  else if (isSlugTaken) slugError = t("reference.errors.brand.slugTaken");

  const storedLogo = savedBrand?.logo ?? null;
  const shownLogo = chosenLogo === null ? storedLogo : toLocalLogo(chosenLogo.previewUrl);
  let logoInfo = "";
  if (chosenLogo !== null) logoInfo = formatLogoFileInfo(chosenLogo.file);
  else if (storedLogo !== null) logoInfo = formatLogoInfo(storedLogo);
  let uploadingFile: File | null = null;
  if (uploadMutation.isPending) uploadingFile = uploadMutation.variables?.file ?? null;
  else if (createMutation.isPending) uploadingFile = createMutation.variables?.logoFile ?? null;

  function changeSlug(nextSlug: string) {
    setIsSlugEdited(true);
    setDraft((current) => ({ ...current, slug: nextSlug }));
  }

  function changeColorText(colorText: string) {
    const color = parseBrandColor(colorText);
    setDraft((current) => ({ ...current, colorText, color: color ?? current.color }));
  }

  function pickColor(color: string) {
    setDraft((current) => ({ ...current, colorText: color, color }));
  }

  function chooseLogoFile(file: File) {
    const problem = getLogoFileProblem(file);
    if (problem !== null) {
      setLogoError(problem === "type" ? t("reference.errors.logo.type") : t("reference.errors.logo.tooLarge"));
      return;
    }

    setLogoError(null);
    if (savedBrand === null) setChosenLogo({ file, previewUrl: URL.createObjectURL(file) });
    else uploadMutation.mutate({ id: savedBrand.id, file });
  }

  function removeLogo() {
    setLogoError(null);
    if (savedBrand === null) setChosenLogo(null);
    else removeLogoMutation.mutate(savedBrand.id);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    if (savedBrand === null) createMutation.mutate({ body: values, logoFile: chosenLogo?.file ?? null });
    else updateMutation.mutate({ id: savedBrand.id, changes });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isBusy) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[33.75rem]">
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          <DialogHeader className="pr-7">
            <DialogTitle>{isEditing ? t("reference.brands.edit") : t("reference.brands.add")}</DialogTitle>
            <DialogDescription>
              {isEditing ? t("reference.brands.dialog.editDescription") : t("reference.brands.dialog.addDescription")}
            </DialogDescription>
          </DialogHeader>
          <BrandPreview
            look={{ color: draft.color, logo: shownLogo }}
            name={name === "" ? t("reference.brands.dialog.newBrand") : name}
            slug={slug === "" ? t("reference.brands.dialog.slugPreview") : slug}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field data-invalid={nameError !== null || undefined}>
              <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
              <Input
                {...NO_AUTOFILL_PROPS}
                id={nameId}
                value={draft.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setDraft((current) => ({ ...current, name: nextName }));
                }}
                maxLength={BRAND_NAME_MAX_LENGTH}
                disabled={isBusy}
                aria-invalid={nameError !== null || undefined}
              />
              {nameError === null ? null : <FieldError>{nameError}</FieldError>}
            </Field>
            <BrandSlugField slug={slug} error={slugError} isDisabled={isBusy} onChange={changeSlug} />
          </div>
          <BrandColorField
            color={draft.color}
            colorText={draft.colorText}
            isDisabled={isBusy}
            onColorTextChange={changeColorText}
            onColorPick={pickColor}
          />
          <Field data-invalid={logoError !== null || undefined}>
            <FieldTitle>{t("reference.brands.fields.logo")}</FieldTitle>
            <BrandLogoField
              logo={shownLogo}
              logoInfo={logoInfo}
              isLogoStored={chosenLogo === null}
              uploadingFile={uploadingFile}
              isRemoving={removeLogoMutation.isPending}
              isDisabled={isBusy}
              hasError={logoError !== null}
              onFileChosen={chooseLogoFile}
              onRemove={removeLogo}
            />
            {logoError === null ? null : <FieldError>{logoError}</FieldError>}
            <FieldDescription>{t("reference.brands.logo.rules")}</FieldDescription>
          </Field>
          <DialogFooter className={isEditing ? "sm:justify-between" : undefined}>
            {savedBrand === null ? null : (
              <Button type="button" variant="ghost" className={DESTRUCTIVE_BUTTON_CLASS} disabled={isBusy} onClick={() => onDelete(savedBrand)}>
                <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" aria-hidden="true" />
                {t("reference.brands.delete")}
              </Button>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="cursor-pointer" disabled={isBusy} onClick={() => onOpenChange(false)}>
                {t("common:actions.cancel")}
              </Button>
              <Button type="submit" className="cursor-pointer" disabled={!canSubmit}>
                {isSaving ? <Spinner /> : null}
                {isEditing ? t("common:actions.saveChanges") : t("reference.brands.add")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BrandDialog({ open, onOpenChange, brand, onDelete }: BrandDialogProps) {
  const openingCount = useOpeningCount(open);

  return <BrandDialogSession key={openingCount} open={open} onOpenChange={onOpenChange} brand={brand} onDelete={onDelete} />;
}
