import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateSpectrumHoldings } from "../../api/queryKeys";
import { createSpectrumHolding, updateSpectrumHolding } from "../../api/spectrumHoldings";
import type { Band, Brand, Country, Operator, Region, SpectrumHolding, SpectrumHoldingCreate } from "../../types";
import { hasChanges, pickChanges } from "../../utils/diff";
import { getReferenceErrorMessage, showReferenceError } from "../../utils/errors";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { PRESSED_TOGGLE_CLASS } from "../shared/facetToggles";
import { useOpeningCount } from "../shared/useOpeningCount";
import { MONO_INPUT_CLASS } from "../shared/values";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineError } from "@/components/ui/error-state";
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMhz, formatRange, holderBackground } from "@/features/spectrum/format";
import {
  type BandRanges,
  type KhzRange,
  holdingOperators,
  holdingsOverlap,
  listBandRanges,
  toSpectrumOperator,
  widthKhz,
} from "@/features/spectrum/model";
import { ApiResponseError } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type SpectrumHoldingDialogProps = {
  country: Country;
  holding: SpectrumHolding | null;
  holdings: readonly SpectrumHolding[];
  operators: readonly Operator[];
  brands: readonly Brand[];
  planBands: readonly Band[];
  regions: readonly Region[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SpectrumHoldingFormProps = Omit<SpectrumHoldingDialogProps, "open" | "onOpenChange"> & {
  isPending: boolean;
  onSubmit: (fields: HoldingFields, onRefused: (reason: string) => void) => void;
  onCancel: () => void;
};

type HoldingFields = Required<SpectrumHoldingCreate>;
type RangeText = { low: string; high: string };
type Validity = Pick<SpectrumHolding, "validFrom" | "validTo">;

const WHOLE_COUNTRY = "_country";
const SOURCE_MAX_LENGTH = 500;
const HOLDING_FIELD_KEYS = [
  "operatorId",
  "jointOperatorId",
  "bandId",
  "regionId",
  "downlinkKhz",
  "uplinkKhz",
  "validFrom",
  "validTo",
  "source",
] as const;
const SAVE_FAILED_KEY = "admin:reference.country.spectrum.dialog.saveFailed";
const BAND_ID_PREFERENCE: readonly Band["rat"][] = ["lte", "nr", "umts", "gsm"];
const REFUSAL_STATUSES: ReadonlySet<number> = new Set([400, 403, 409]);

function toHoldingFields(holding: SpectrumHolding): HoldingFields {
  return {
    operatorId: holding.operatorId,
    jointOperatorId: holding.jointOperatorId,
    bandId: holding.bandId,
    regionId: holding.regionId,
    downlinkKhz: holding.downlinkKhz,
    uplinkKhz: holding.uplinkKhz,
    validFrom: holding.validFrom,
    validTo: holding.validTo,
    source: holding.source,
  };
}

function toRangeText(range: KhzRange | null): RangeText {
  return range === null ? { low: "", high: "" } : { low: String(range[0] / 1000), high: String(range[1] / 1000) };
}

function parseKhz(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const mhz = Number(trimmed.replace(",", "."));
  return Number.isFinite(mhz) && mhz > 0 ? Math.round(mhz * 1000) : null;
}

function parseRange(text: RangeText): [number, number] | null {
  const low = parseKhz(text.low);
  const high = parseKhz(text.high);
  return low === null || high === null ? null : [low, high];
}

function isWithin(range: KhzRange, band: KhzRange): boolean {
  return range[0] >= band[0] && range[1] <= band[1];
}

function periodsMeet(left: Validity, right: Validity): boolean {
  const startsBeforeLeftEnds = left.validTo === null || right.validFrom === null || right.validFrom <= left.validTo;
  const endsAfterLeftStarts = left.validFrom === null || right.validTo === null || right.validTo >= left.validFrom;
  return startsBeforeLeftEnds && endsAfterLeftStarts;
}

function clashes(fields: HoldingFields, other: SpectrumHolding): boolean {
  const regionsMeet = fields.regionId === null || other.regionId === null || other.regionId === fields.regionId;
  return regionsMeet && periodsMeet(fields, other) && holdingsOverlap(fields, other);
}

function pickBandId(group: BandRanges, planBands: readonly Band[], current: number | null): number | undefined {
  if (current !== null && group.bandIds.includes(current)) return current;
  for (const rat of BAND_ID_PREFERENCE) {
    const band = planBands.find((candidate) => candidate.rat === rat && group.bandIds.includes(candidate.id));
    if (band !== undefined) return band.id;
  }
  return group.bandIds[0];
}

function duplexSpacingOf(group: BandRanges): number | null {
  return group.uplinkKhz === null ? null : group.downlinkKhz[0] - group.uplinkKhz[0];
}

function uplinkFromSpacing(downlink: KhzRange | null, duplexSpacing: number | null): RangeText {
  if (downlink === null || duplexSpacing === null) return toRangeText(null);
  return toRangeText([downlink[0] - duplexSpacing, downlink[1] - duplexSpacing]);
}

function isRefusal(error: unknown): boolean {
  return error instanceof ApiResponseError && REFUSAL_STATUSES.has(error.status);
}

function bandGroupLabel(t: TFunction, group: BandRanges): string {
  const title = t("spectrum:band.titleWithDuplex", { mhz: group.labelMhz, duplex: group.duplex.toUpperCase() });
  return group.codes.length === 0 ? title : `${title} - ${group.codes.join(", ")}`;
}

function SpectrumHoldingForm({
  country,
  holding,
  holdings,
  operators,
  brands,
  planBands,
  regions,
  isPending,
  onSubmit,
  onCancel,
}: SpectrumHoldingFormProps) {
  const { t, i18n } = useTranslation(["admin", "spectrum"]);
  const operatorTitleId = useId();
  const jointOperatorTitleId = useId();
  const bandTitleId = useId();
  const regionTitleId = useId();
  const downlinkLowId = useId();
  const downlinkHighId = useId();
  const uplinkLowId = useId();
  const uplinkHighId = useId();
  const validFromId = useId();
  const validToId = useId();
  const sourceId = useId();
  const groups = listBandRanges(planBands);
  const initialGroup = holding === null ? groups[0] : groups.find((group) => group.bandIds.includes(holding.bandId));
  const [operatorId, setOperatorId] = useState<number | null>(holding?.operatorId ?? null);
  const [jointOperatorId, setJointOperatorId] = useState<number | null>(holding?.jointOperatorId ?? null);
  const [groupKey, setGroupKey] = useState(initialGroup?.key ?? "");
  const [downlinkText, setDownlinkText] = useState(() => toRangeText(holding?.downlinkKhz ?? null));
  const [uplinkText, setUplinkText] = useState<RangeText | null>(() => (holding?.uplinkKhz ? toRangeText(holding.uplinkKhz) : null));
  const [regionId, setRegionId] = useState<number | null>(holding?.regionId ?? null);
  const [validFrom, setValidFrom] = useState(holding?.validFrom ?? "");
  const [validTo, setValidTo] = useState(holding?.validTo ?? "");
  const [source, setSource] = useState(holding?.source ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);

  const group = groups.find((candidate) => candidate.key === groupKey);
  const bandUplinkKhz = group?.uplinkKhz ?? null;
  const duplexSpacing = group === undefined ? null : duplexSpacingOf(group);
  const downlink = parseRange(downlinkText);
  const shownUplinkText = uplinkText ?? uplinkFromSpacing(downlink, duplexSpacing);
  const uplink = bandUplinkKhz === null ? null : parseRange(shownUplinkText);
  const bandId = group === undefined ? undefined : pickBandId(group, planBands, holding?.bandId ?? null);
  const fields: HoldingFields | null =
    operatorId === null || bandId === undefined || downlink === null
      ? null
      : {
          operatorId,
          jointOperatorId,
          bandId,
          regionId,
          downlinkKhz: downlink,
          uplinkKhz: uplink,
          validFrom: validFrom === "" ? null : validFrom,
          validTo: validTo === "" ? null : validTo,
          source: source.trim() === "" ? null : source.trim(),
        };

  const others = holdings.filter((other) => other.id !== holding?.id && group?.bandIds.includes(other.bandId) === true);
  const operatorById = new Map(operators.map((operator) => [operator.id, toSpectrumOperator(operator, brands)]));
  const draftColors = operatorId === null ? [] : colorsOf({ operatorId, jointOperatorId });
  const clash = fields === null ? undefined : holdings.find((other) => other.id !== holding?.id && clashes(fields, other));

  function rangeError(range: KhzRange | null, text: RangeText, bandRange: KhzRange | null): string | null {
    if (text.low.trim() === "" && text.high.trim() === "") return null;
    if (range === null) return t("reference.country.spectrum.dialog.rangeInvalid");
    if (range[0] >= range[1]) return t("reference.country.spectrum.dialog.rangeOrder");
    if (bandRange !== null && !isWithin(range, bandRange)) {
      return t("reference.country.spectrum.dialog.outsideBand", { range: formatRange(t, bandRange) });
    }
    return null;
  }

  const overlapError =
    clash === undefined
      ? null
      : t("reference.country.spectrum.dialog.overlaps", {
          name: operatorById.get(clash.operatorId)?.name ?? "",
          range: formatRange(t, clash.downlinkKhz),
        });
  const downlinkError = rangeError(downlink, downlinkText, group?.downlinkKhz ?? null) ?? overlapError;
  const uplinkError = bandUplinkKhz === null ? null : rangeError(uplink, shownUplinkText, bandUplinkKhz);
  const hasRequiredUplink = bandUplinkKhz === null || uplink !== null;
  const isValidityOrdered = validFrom === "" || validTo === "" || validFrom <= validTo;
  const isChanged = holding === null || (fields !== null && hasChanges(pickChanges(toHoldingFields(holding), fields, HOLDING_FIELD_KEYS)));
  const canSubmit =
    fields !== null && downlinkError === null && uplinkError === null && hasRequiredUplink && isValidityOrdered && isChanged && !isPending;

  function colorsOf(holders: Pick<SpectrumHolding, "operatorId" | "jointOperatorId">): string[] {
    return holdingOperators(holders, operatorById).map((operator) => operator.color);
  }

  function chooseOperator(id: number) {
    setOperatorId(id);
    if (id === jointOperatorId) setJointOperatorId(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit(fields, setRefusal);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{holding === null ? t("reference.country.spectrum.add") : t("reference.country.spectrum.dialog.editTitle")}</DialogTitle>
        <DialogDescription>{getCountryName(country.code, i18n.language)}</DialogDescription>
      </DialogHeader>
      {refusal === null ? null : <InlineError title={refusal} />}
      <Field>
        <FieldTitle id={operatorTitleId}>{t("spectrum:summary.operator")}</FieldTitle>
        <div role="group" aria-labelledby={operatorTitleId} className="flex flex-wrap gap-1.5">
          {operators.map((operator) => {
            const isPressed = operator.id === operatorId;
            return (
              <Button
                key={operator.id}
                type="button"
                variant={isPressed ? "ghost" : "outline"}
                aria-pressed={isPressed}
                disabled={isPending}
                className={cn("cursor-pointer", isPressed && PRESSED_TOGGLE_CLASS)}
                onClick={() => chooseOperator(operator.id)}
              >
                <BrandMark brand={operatorById.get(operator.id)?.brand ?? null} />
                {operator.name}
              </Button>
            );
          })}
        </div>
      </Field>
      <Field>
        <FieldTitle id={jointOperatorTitleId}>{t("reference.country.spectrum.dialog.jointOperator")}</FieldTitle>
        <div role="group" aria-labelledby={jointOperatorTitleId} className="flex flex-wrap gap-1.5">
          {operators
            .filter((operator) => operator.id !== operatorId)
            .map((operator) => {
              const isPressed = operator.id === jointOperatorId;
              return (
                <Button
                  key={operator.id}
                  type="button"
                  variant={isPressed ? "ghost" : "outline"}
                  aria-pressed={isPressed}
                  disabled={isPending}
                  className={cn("cursor-pointer", isPressed && PRESSED_TOGGLE_CLASS)}
                  onClick={() => setJointOperatorId(isPressed ? null : operator.id)}
                >
                  <BrandMark brand={operatorById.get(operator.id)?.brand ?? null} />
                  {operator.name}
                </Button>
              );
            })}
        </div>
        <FieldDescription>{t("reference.country.spectrum.dialog.jointOperatorHint")}</FieldDescription>
      </Field>
      <Field>
        <FieldTitle id={bandTitleId}>{t("reference.country.spectrum.dialog.band")}</FieldTitle>
        <Select
          value={groupKey}
          onValueChange={(value) => {
            if (value === null) return;
            setGroupKey(value);
            setUplinkText(null);
          }}
          disabled={isPending}
        >
          <SelectTrigger aria-labelledby={bandTitleId} className="w-full cursor-pointer">
            <SelectValue>{group === undefined ? null : bandGroupLabel(t, group)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {groups.map((candidate) => (
              <SelectItem key={candidate.key} value={candidate.key} className="cursor-pointer">
                {bandGroupLabel(t, candidate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {group === undefined ? null : <BandPreview group={group} others={others} draft={downlink} draftColors={draftColors} colorsOf={colorsOf} />}
      </Field>
      <RangeFields
        label={group?.duplex === "tdd" ? t("spectrum:band.tdd") : t("spectrum:band.downlink")}
        lowId={downlinkLowId}
        highId={downlinkHighId}
        value={downlinkText}
        onChange={setDownlinkText}
        error={downlinkError}
        isPending={isPending}
      />
      {bandUplinkKhz === null ? null : (
        <RangeFields
          label={t("spectrum:band.uplink")}
          lowId={uplinkLowId}
          highId={uplinkHighId}
          value={shownUplinkText}
          onChange={setUplinkText}
          error={uplinkError}
          hint={
            uplinkText === null && duplexSpacing !== null
              ? t("reference.country.spectrum.dialog.uplinkFromSpacing", { spacing: formatMhz(duplexSpacing) })
              : undefined
          }
          isPending={isPending}
        />
      )}
      <div className="grid items-start gap-3 sm:grid-cols-3">
        <Field>
          <FieldTitle id={regionTitleId}>{t("reference.country.spectrum.columns.region")}</FieldTitle>
          <Select
            value={regionId === null ? WHOLE_COUNTRY : String(regionId)}
            onValueChange={(value) => setRegionId(value === null || value === WHOLE_COUNTRY ? null : Number(value))}
            disabled={isPending}
          >
            <SelectTrigger aria-labelledby={regionTitleId} className="w-full cursor-pointer">
              <SelectValue>
                {regionId === null ? t("reference.country.spectrum.wholeCountry") : (regions.find((region) => region.id === regionId)?.name ?? null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WHOLE_COUNTRY} className="cursor-pointer">
                {t("reference.country.spectrum.wholeCountry")}
              </SelectItem>
              {regions.map((region) => (
                <SelectItem key={region.id} value={String(region.id)} className="cursor-pointer">
                  {region.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={validFromId}>{t("spectrum:holding.validFrom")}</FieldLabel>
          <Input id={validFromId} type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} disabled={isPending} />
        </Field>
        <Field data-invalid={!isValidityOrdered || undefined}>
          <FieldLabel htmlFor={validToId}>{t("spectrum:holding.validTo")}</FieldLabel>
          <Input
            id={validToId}
            type="date"
            value={validTo}
            onChange={(event) => setValidTo(event.target.value)}
            disabled={isPending}
            aria-invalid={!isValidityOrdered || undefined}
          />
          {isValidityOrdered ? null : <FieldError>{t("reference.country.spectrum.dialog.validityOrder")}</FieldError>}
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={sourceId}>{t("spectrum:holding.source")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={sourceId}
          value={source}
          onChange={(event) => setSource(event.target.value)}
          maxLength={SOURCE_MAX_LENGTH}
          placeholder={t("reference.country.spectrum.dialog.sourcePlaceholder")}
          disabled={isPending}
        />
      </Field>
      <DialogFormFooter
        submitLabel={holding === null ? t("reference.country.spectrum.add") : t("common:actions.saveChanges")}
        canSubmit={canSubmit}
        isPending={isPending}
        onCancel={onCancel}
      />
    </form>
  );
}

type RangeFieldsProps = {
  label: string;
  lowId: string;
  highId: string;
  value: RangeText;
  onChange: (value: RangeText) => void;
  error: string | null;
  hint?: string;
  isPending: boolean;
};

function RangeFields({ label, lowId, highId, value, onChange, error, hint, isPending }: RangeFieldsProps) {
  const { t } = useTranslation("admin");
  const messageId = useId();

  return (
    <Field data-invalid={error !== null || undefined}>
      <div className="grid grid-cols-2 items-start gap-3">
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={lowId}>{t("reference.country.spectrum.dialog.from", { label })}</FieldLabel>
          <Input
            {...NO_AUTOFILL_PROPS}
            id={lowId}
            inputMode="decimal"
            value={value.low}
            onChange={(event) => onChange({ ...value, low: event.target.value })}
            disabled={isPending}
            aria-invalid={error !== null || undefined}
            aria-describedby={messageId}
            className={MONO_INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={highId}>{t("reference.country.spectrum.dialog.to", { label })}</FieldLabel>
          <Input
            {...NO_AUTOFILL_PROPS}
            id={highId}
            inputMode="decimal"
            value={value.high}
            onChange={(event) => onChange({ ...value, high: event.target.value })}
            disabled={isPending}
            aria-invalid={error !== null || undefined}
            aria-describedby={messageId}
            className={MONO_INPUT_CLASS}
          />
        </div>
      </div>
      {error === null ? null : <FieldError id={messageId}>{error}</FieldError>}
      {error === null && hint !== undefined ? <FieldDescription id={messageId}>{hint}</FieldDescription> : null}
    </Field>
  );
}

type BandPreviewProps = {
  group: BandRanges;
  others: readonly SpectrumHolding[];
  draft: KhzRange | null;
  draftColors: readonly string[];
  colorsOf: (holding: SpectrumHolding) => string[];
};

function BandPreview({ group, others, draft, draftColors, colorsOf }: BandPreviewProps) {
  const { t } = useTranslation("spectrum");
  const span = widthKhz(group.downlinkKhz);

  function position(range: KhzRange) {
    const low = Math.max(range[0], group.downlinkKhz[0]);
    const high = Math.min(range[1], group.downlinkKhz[1]);
    return { left: `${((low - group.downlinkKhz[0]) / span) * 100}%`, width: `${((high - low) / span) * 100}%` };
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3">
      <div aria-hidden="true" className="relative h-3.5 overflow-hidden rounded-sm bg-muted">
        {others
          .filter((other) => other.regionId === null)
          .map((other) => (
            <span
              key={other.id}
              className="absolute inset-y-0"
              style={{ ...position(other.downlinkKhz), background: holderBackground(colorsOf(other)) }}
            />
          ))}
        {draft === null || draft[0] >= draft[1] ? null : (
          <span
            className="absolute inset-y-0 ring-2 ring-foreground ring-inset"
            style={{ ...position(draft), background: holderBackground(draftColors) }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {group.uplinkKhz === null
          ? `${group.duplex.toUpperCase()} ${formatRange(t, group.downlinkKhz)}`
          : `${t("band.downlink")} ${formatRange(t, group.downlinkKhz)}, ${t("band.uplink")} ${formatRange(t, group.uplinkKhz)}`}
      </p>
    </div>
  );
}

export function SpectrumHoldingDialog({ holding, open, onOpenChange, ...formProps }: SpectrumHoldingDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);

  const saveMutation = useMutation({
    mutationFn: (fields: HoldingFields) => {
      if (holding === null) return createSpectrumHolding(fields);
      return updateSpectrumHolding(holding.id, pickChanges(toHoldingFields(holding), fields, HOLDING_FIELD_KEYS));
    },
    onSuccess: () => {
      onOpenChange(false);
      void invalidateSpectrumHoldings(queryClient);
      toast.success(holding === null ? t("reference.country.spectrum.dialog.addSuccess") : t("reference.country.spectrum.dialog.saveSuccess"));
    },
  });

  function saveHolding(fields: HoldingFields, onRefused: (reason: string) => void) {
    saveMutation.mutate(fields, {
      onError: (error) => {
        if (isRefusal(error)) onRefused(getReferenceErrorMessage(t, error, SAVE_FAILED_KEY));
        else showReferenceError(error, SAVE_FAILED_KEY);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saveMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <SpectrumHoldingForm
          key={openingCount}
          holding={holding}
          isPending={saveMutation.isPending}
          onSubmit={saveHolding}
          onCancel={() => onOpenChange(false)}
          {...formProps}
        />
      </DialogContent>
    </Dialog>
  );
}
