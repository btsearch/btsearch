import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { addBandToPlan } from "../../api/bandPlan";
import { createBand, updateBand } from "../../api/bands";
import { invalidateBands } from "../../api/queryKeys";
import type { Band, BandCreate, BandUpdate, Country } from "../../types";
import { getRatLabel } from "../../utils/bands";
import { hasChanges, pickChanges } from "../../utils/diff";
import { showReferenceError } from "../../utils/errors";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { FacetToggles } from "../shared/facetToggles";
import { FULL_WIDTH_SEGMENTS_CLASS, SegmentedControl } from "../shared/referenceCards";
import { useOpeningCount } from "../shared/useOpeningCount";
import { MONO_INPUT_CLASS, MONO_TEXT_CLASS } from "../shared/values";
import {
  type BandVariant,
  type CatalogBand,
  bandCatalogQueryOptions,
  describeBandRanges,
  getCatalogBandName,
  indexTakenCodes,
  listCatalogEntries,
} from "./bandCatalog";
import { BandCodePicker } from "./bandCodePicker";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineError } from "@/components/ui/error-state";
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { listCountryOptions } from "@/features/admin/users/utils/grants";
import { countriesQueryOptions } from "@/features/shared/lookups";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { createAuditOperationHandle } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type BandDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  band: Band | null;
  bands: readonly Band[];
};

type BandValues = {
  code: string | null;
  name: string;
  variant: BandVariant;
  labelMhz: number | null;
};

type BandFacts = {
  rat: string;
  duplex: string;
  downlinkKhz: CatalogBand["downlinkKhz"];
  uplinkKhz: CatalogBand["uplinkKhz"];
};

type BandCreation = { body: BandCreate; planCountryCodes: string[] };
type BandCreationResult = { failedCountryCodes: string[] };
type BandSave = { id: number; changes: BandUpdate };

type BandFormProps = {
  band: Band | null;
  bands: readonly Band[];
  isPending: boolean;
  onCreate: (creation: BandCreation) => void;
  onUpdate: (save: BandSave) => void;
  onCancel: () => void;
};

type BandPlanCountriesFieldProps = {
  selected: readonly string[];
  isLocked: boolean;
  onChange: (countryCodes: string[]) => void;
};

const BAND_NAME_MAX_LENGTH = 15;
const LABEL_MHZ_MAX = 100_000;
const LABEL_MHZ_MAX_DIGITS = 6;
const LABEL_MHZ_PATTERN = /^\d+$/;
const BAND_VALUE_KEYS = ["code", "name", "variant", "labelMhz"] as const satisfies readonly (keyof BandValues)[];
const BAND_VARIANTS: readonly BandVariant[] = ["commercial", "railway"];
const NO_COUNTRIES: Country[] = [];
const NO_ENTRIES: readonly CatalogBand[] = [];
const NO_TAKEN_NAMES: ReadonlyMap<string, string> = new Map<string, string>();
const FACTS_COLLAPSE_CLASS = "grid transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none";
const PICKER_STATUS_CLASS = "flex h-8 items-center gap-2 rounded-lg border border-input px-2.5 text-sm text-muted-foreground dark:bg-input/30";

function toBandValues(band: Band | null): BandValues {
  if (band === null) return { code: null, name: "", variant: "commercial", labelMhz: null };
  return { code: band.code, name: band.name, variant: band.variant, labelMhz: band.labelMhz };
}

function toSavedBandFacts(band: Band): BandFacts | null {
  if (band.code === null || band.duplex === null) return null;
  return { rat: getRatLabel(band.rat), duplex: band.duplex.toUpperCase(), downlinkKhz: band.downlinkKhz, uplinkKhz: band.uplinkKhz };
}

function parseLabelMhz(text: string): number | null {
  const digits = text.trim();
  if (!LABEL_MHZ_PATTERN.test(digits)) return null;

  const labelMhz = Number(digits);
  return labelMhz >= 1 && labelMhz <= LABEL_MHZ_MAX ? labelMhz : null;
}

function toBandUpdate(changes: Partial<BandValues>, current: BandValues): BandUpdate {
  const update: BandUpdate = {};
  if (changes.code !== undefined && changes.code !== null) update.code = changes.code;
  if (changes.name !== undefined) update.name = changes.name;
  if (changes.variant !== undefined) update.variant = changes.variant;

  const labelMhz = update.code === undefined ? changes.labelMhz : current.labelMhz;
  if (labelMhz !== undefined && labelMhz !== null) update.labelMhz = labelMhz;
  return update;
}

async function createBandInPlans({ body, planCountryCodes }: BandCreation): Promise<BandCreationResult> {
  const auditOperation = createAuditOperationHandle();
  const band = await createBand(body, auditOperation);
  const outcomes = await Promise.allSettled(planCountryCodes.map((countryCode) => addBandToPlan(countryCode, band.id, auditOperation)));
  return { failedCountryCodes: planCountryCodes.filter((_, index) => outcomes[index].status === "rejected") };
}

function BandCodelessNotice() {
  const { t } = useTranslation("admin");

  return (
    <div role="note" className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/10 px-3.5 py-3 text-sm leading-5">
      <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1">{t("admin:reference.bands.dialog.codelessNotice")}</p>
    </div>
  );
}

function BandFact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-4 text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm leading-5 font-medium">{children}</dd>
    </div>
  );
}

function BandCatalogFacts({ facts }: { facts: BandFacts | null }) {
  const { t } = useTranslation("admin");
  const ranges = facts === null ? [] : describeBandRanges(facts.downlinkKhz, facts.uplinkKhz);

  return (
    <div inert={facts === null} className={cn(FACTS_COLLAPSE_CLASS, facts === null ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}>
      <div className="min-h-0 overflow-hidden">
        {facts === null ? null : (
          <dl className="mt-4 grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-5 rounded-lg bg-muted/50 p-3">
            <BandFact term={t("admin:reference.bands.fields.technology")}>
              <RatGenerationLabel rat={facts.rat} />
              {facts.rat}
            </BandFact>
            <BandFact term={t("admin:reference.bands.fields.duplex")}>{facts.duplex}</BandFact>
            <BandFact term={t("admin:reference.bands.fields.range")}>
              <span className={MONO_TEXT_CLASS}>
                {ranges.map((range, index) => (
                  <span key={range} className="block whitespace-nowrap">
                    {index === ranges.length - 1 ? `${range} MHz` : range}
                  </span>
                ))}
              </span>
            </BandFact>
          </dl>
        )}
      </div>
    </div>
  );
}

function BandPlanCountriesField({ selected, isLocked, onChange }: BandPlanCountriesFieldProps) {
  const { t, i18n } = useTranslation("admin");
  const { data: countries, isError, isFetching, refetch } = useQuery(countriesQueryOptions());
  const title = t("admin:reference.bands.dialog.plans");
  const options = listCountryOptions(countries ?? NO_COUNTRIES, i18n.language).map((country) => ({
    value: country.code,
    label: country.name,
    lead: <CountryCodeTile code={country.code} size="xs" />,
  }));

  let control: ReactNode;
  if (countries !== undefined) {
    control = (
      <div inert={isLocked}>
        <FacetToggles label={title} options={options} selected={selected} onChange={onChange} showLabel={false} />
      </div>
    );
  } else if (isError) {
    control = (
      <InlineError
        size="sm"
        title={t("admin:users.detail.grants.dialog.countriesLoadFailed")}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  } else {
    control = <Skeleton className="h-8 w-full rounded-lg" />;
  }

  return (
    <Field>
      <FieldTitle>{title}</FieldTitle>
      {control}
      <FieldDescription>{t("admin:reference.bands.dialog.plansHint")}</FieldDescription>
    </Field>
  );
}

function BandForm({ band, bands, isPending, onCreate, onUpdate, onCancel }: BandFormProps) {
  const { t } = useTranslation(["admin", "common"]);
  const codeTitleId = useId();
  const nameId = useId();
  const labelId = useId();
  const variantTitleId = useId();
  const [editedBand] = useState(band);
  const [code, setCode] = useState(editedBand?.code ?? null);
  const [typedName, setTypedName] = useState(editedBand?.name ?? null);
  const [typedLabel, setTypedLabel] = useState(editedBand === null ? null : String(editedBand.labelMhz ?? ""));
  const [variant, setVariant] = useState<BandVariant>(editedBand?.variant ?? "commercial");
  const [planCountryCodes, setPlanCountryCodes] = useState<string[]>([]);
  const catalogQuery = useQuery(bandCatalogQueryOptions());

  const catalog = catalogQuery.data;
  const baseline = toBandValues(editedBand);
  const entries = catalog === undefined ? NO_ENTRIES : listCatalogEntries(catalog, editedBand);
  const entry = code === null ? null : (entries.find((candidate) => candidate.code === code) ?? null);
  const savedFacts = editedBand === null || code !== editedBand.code ? null : toSavedBandFacts(editedBand);
  const takenNames = catalog === undefined ? NO_TAKEN_NAMES : indexTakenCodes(bands, variant, editedBand?.id ?? null, catalog.resolveBand);

  const name = typedName ?? (entry === null ? "" : getCatalogBandName(entry, variant));
  const labelText = typedLabel ?? (entry === null ? "" : String(entry.labelMhz));
  const trimmedName = name.trim();
  const labelMhz = parseLabelMhz(labelText);
  const isNameTaken = bands.some((other) => other.id !== editedBand?.id && other.name === trimmedName);
  const isNameValid = trimmedName !== "" && trimmedName.length <= BAND_NAME_MAX_LENGTH && !isNameTaken;
  const isLabelValid = labelText.trim() === "" ? editedBand !== null && baseline.labelMhz === null : labelMhz !== null;
  const isLabelMarkedInvalid = typedLabel !== null && !isLabelValid;
  const isIdentityChanged = code !== baseline.code || variant !== baseline.variant;
  const twinName = code !== null && isIdentityChanged ? takenNames.get(code) : undefined;

  const current: BandValues = { code, name: trimmedName, variant, labelMhz };
  const update = toBandUpdate(pickChanges(baseline, current, BAND_VALUE_KEYS), current);
  const isComplete = (editedBand !== null || code !== null) && isNameValid && isLabelValid && twinName === undefined;
  const canSubmit = isComplete && !isPending && (editedBand === null || hasChanges(update));
  const variantOptions = BAND_VARIANTS.map((value) => ({ value, label: t(`admin:reference.bands.variants.${value}`) }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    if (editedBand !== null) onUpdate({ id: editedBand.id, changes: update });
    else if (code !== null && labelMhz !== null) onCreate({ body: { code, name: trimmedName, variant, labelMhz }, planCountryCodes });
  }

  let codeControl: ReactNode;
  if (catalog !== undefined) {
    codeControl = (
      <BandCodePicker
        entries={entries}
        selectedCode={code}
        takenNames={takenNames}
        placeholder={
          editedBand === null
            ? t("admin:reference.bands.picker.placeholder")
            : t("admin:reference.bands.picker.placeholderOfRat", { rat: getRatLabel(editedBand.rat) })
        }
        labelledBy={codeTitleId}
        isDisabled={isPending}
        onSelect={(chosen) => setCode(chosen.code)}
      />
    );
  } else if (catalogQuery.isError) {
    codeControl = (
      <InlineError
        size="sm"
        title={t("admin:reference.bands.picker.loadFailed")}
        onRetry={() => void catalogQuery.refetch()}
        isRetrying={catalogQuery.isFetching}
      />
    );
  } else {
    codeControl = (
      <div role="status" className={PICKER_STATUS_CLASS}>
        <Spinner role="presentation" aria-hidden="true" className="size-3.5" />
        {t("admin:reference.bands.picker.loading")}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{editedBand === null ? t("admin:reference.bands.actions.add") : t("admin:reference.bands.actions.edit")}</DialogTitle>
        <DialogDescription>{editedBand === null ? t("admin:reference.bands.dialog.addDescription") : editedBand.name}</DialogDescription>
      </DialogHeader>
      {editedBand !== null && editedBand.code === null ? <BandCodelessNotice /> : null}
      <div>
        <Field data-invalid={twinName !== undefined || undefined}>
          <FieldTitle id={codeTitleId}>{t("admin:reference.bands.fields.code")}</FieldTitle>
          {codeControl}
          {twinName !== undefined ? <FieldError>{t("admin:reference.errors.band.exists", { value: twinName })}</FieldError> : null}
          {twinName === undefined && editedBand !== null ? (
            <FieldDescription>{t("admin:reference.bands.dialog.technologyFixed")}</FieldDescription>
          ) : null}
        </Field>
        <BandCatalogFacts facts={entry ?? savedFacts} />
      </div>
      <div className="grid grid-cols-2 items-start gap-3">
        <Field data-invalid={isNameTaken || undefined}>
          <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
          <Input
            {...NO_AUTOFILL_PROPS}
            id={nameId}
            value={name}
            onChange={(event) => setTypedName(event.target.value)}
            maxLength={BAND_NAME_MAX_LENGTH}
            spellCheck={false}
            aria-invalid={isNameTaken || undefined}
            disabled={isPending}
          />
          {isNameTaken ? (
            <FieldError>{t("admin:reference.errors.band.nameTaken")}</FieldError>
          ) : (
            <FieldDescription>{t("admin:reference.bands.dialog.nameLength", { length: name.length, max: BAND_NAME_MAX_LENGTH })}</FieldDescription>
          )}
        </Field>
        <Field data-invalid={isLabelMarkedInvalid || undefined}>
          <FieldLabel htmlFor={labelId}>{t("admin:reference.bands.fields.labelMhz")}</FieldLabel>
          <Input
            {...NO_AUTOFILL_PROPS}
            id={labelId}
            value={labelText}
            onChange={(event) => setTypedLabel(event.target.value)}
            inputMode="numeric"
            maxLength={LABEL_MHZ_MAX_DIGITS}
            aria-invalid={isLabelMarkedInvalid || undefined}
            disabled={isPending}
            className={MONO_INPUT_CLASS}
          />
          {isLabelMarkedInvalid ? <FieldError>{t("admin:reference.bands.dialog.labelInvalid", { max: LABEL_MHZ_MAX })}</FieldError> : null}
          {typedLabel === null ? <FieldDescription>{t("admin:reference.bands.dialog.labelFromCatalog")}</FieldDescription> : null}
        </Field>
      </div>
      <Field>
        <FieldTitle id={variantTitleId}>{t("admin:reference.bands.fields.variant")}</FieldTitle>
        <SegmentedControl
          value={variant}
          options={variantOptions}
          onValueChange={setVariant}
          ariaLabelledBy={variantTitleId}
          disabled={isPending}
          className={FULL_WIDTH_SEGMENTS_CLASS}
        />
      </Field>
      {editedBand === null ? <BandPlanCountriesField selected={planCountryCodes} isLocked={isPending} onChange={setPlanCountryCodes} /> : null}
      <DialogFormFooter
        submitLabel={editedBand === null ? t("admin:reference.bands.actions.add") : t("common:actions.saveChanges")}
        canSubmit={canSubmit}
        isPending={isPending}
        onCancel={onCancel}
      />
    </form>
  );
}

export function BandDialog({ open, onOpenChange, band, bands }: BandDialogProps) {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);
  const [knownBands, setKnownBands] = useState(bands);
  if (open && knownBands !== bands) setKnownBands(bands);

  const createMutation = useMutation({
    mutationFn: createBandInPlans,
    onSuccess: ({ failedCountryCodes }) => {
      onOpenChange(false);
      void invalidateBands(queryClient);
      if (failedCountryCodes.length === 0) {
        toast.success(t("admin:reference.bands.dialog.created"));
        return;
      }

      const countries = failedCountryCodes.map((countryCode) => getCountryName(countryCode, i18n.language)).join(", ");
      toast.warning(t("admin:reference.bands.dialog.createdOutsidePlans"), {
        description: t("admin:reference.bands.dialog.plansFailed", { countries }),
      });
    },
    onError: (error) => showReferenceError(error, "admin:reference.bands.dialog.createFailed"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, changes }: BandSave) => updateBand(id, changes),
    onSuccess: () => {
      onOpenChange(false);
      void invalidateBands(queryClient);
      toast.success(t("admin:reference.bands.dialog.saved"));
    },
    onError: (error) => showReferenceError(error, "admin:reference.bands.dialog.saveFailed"),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <BandForm
          key={openingCount}
          band={band}
          bands={knownBands}
          isPending={isPending}
          onCreate={(creation) => createMutation.mutate(creation)}
          onUpdate={(save) => updateMutation.mutate(save)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
