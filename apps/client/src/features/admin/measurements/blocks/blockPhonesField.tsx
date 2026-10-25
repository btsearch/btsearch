import { MEASUREMENT_MODEM_FAMILIES, type MeasurementModemFamily, type MeasurementSoc } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { readerVersionsQueryOptions, socsQueryOptions } from "../api/readingBlocks";
import { DeviceModelPicker } from "../components/deviceModelPicker";
import type { BlockDraft } from "./blockDraft";
import { type PhonesKind, getReaderVersionName } from "./blockText";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import { Field, FieldTitle } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";

type PhonesDraft = Pick<BlockDraft, "phonesKind" | "modemFamily" | "socId" | "deviceModel" | "readerVersionId">;

type BlockPhonesFieldProps = {
  draft: PhonesDraft;
  disabled: boolean;
  onChange: (change: Partial<PhonesDraft>) => void;
};

type PickerProps<T> = {
  value: T | null;
  labelledBy: string;
  disabled: boolean;
  onChange: (value: T | null) => void;
};

const PHONES_KINDS = ["modemFamily", "soc", "deviceModel", "readerVersion"] as const satisfies readonly PhonesKind[];
const NO_SOCS: MeasurementSoc[] = [];
const PLACEHOLDER_CLASS = "truncate text-muted-foreground";
const SELECT_TRIGGER_CLASS = "w-full cursor-pointer";

function getSocLabel(soc: MeasurementSoc): string {
  return `${soc.manufacturer} ${soc.model}`;
}

function getSocValue(soc: MeasurementSoc): string {
  return String(soc.id);
}

function isSameSoc(left: MeasurementSoc, right: MeasurementSoc): boolean {
  return left.id === right.id;
}

function ModemFamilySelect({ value, labelledBy, disabled, onChange }: PickerProps<MeasurementModemFamily>) {
  const { t } = useTranslation("admin");

  return (
    <Select value={value} onValueChange={(family) => onChange(family)} disabled={disabled}>
      <SelectTrigger aria-labelledby={labelledBy} className={SELECT_TRIGGER_CLASS}>
        <SelectValue>
          {value === null ? (
            <span className={PLACEHOLDER_CLASS}>{t("measurements.blocks.dialog.chooseModemFamily")}</span>
          ) : (
            t(`measurements.blocks.modemFamilies.${value}`)
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {MEASUREMENT_MODEM_FAMILIES.map((family) => (
          <SelectItem key={family} value={family} className="cursor-pointer">
            {t(`measurements.blocks.modemFamilies.${family}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function getSocsEmptyText(t: TFunction, socsQuery: { data: unknown; isError: boolean }): string {
  if (socsQuery.data !== undefined) return t("measurements.blocks.dialog.noSocMatches");
  return socsQuery.isError ? t("measurements.blocks.dialog.socsLoadFailed") : t("common:actions.loading");
}

function SocPicker({ socId, labelledBy, disabled, onChange }: Omit<PickerProps<MeasurementSoc>, "value"> & { socId: number | null }) {
  const { t, i18n } = useTranslation("admin");
  const socsQuery = useQuery(socsQueryOptions());
  const socs = socsQuery.data;
  const value = socs?.find((soc) => soc.id === socId) ?? null;

  return (
    <Combobox
      items={socs ?? NO_SOCS}
      value={value}
      onValueChange={(soc) => onChange(soc)}
      itemToStringLabel={getSocLabel}
      itemToStringValue={getSocValue}
      isItemEqualToValue={isSameSoc}
      locale={i18n.language}
      autoHighlight
      disabled={disabled}
    >
      <ComboboxTrigger
        aria-labelledby={labelledBy}
        render={<Button type="button" variant="outline" className="w-full cursor-pointer justify-between font-normal" />}
      >
        {value === null ? (
          <span className={PLACEHOLDER_CLASS}>{t("measurements.blocks.dialog.chooseSoc")}</span>
        ) : (
          <span className="truncate">{getSocLabel(value)}</span>
        )}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} placeholder={t("common:placeholder.search")} aria-label={t("measurements.blocks.dialog.searchSoc")} />
        <ComboboxEmpty>{getSocsEmptyText(t, socsQuery)}</ComboboxEmpty>
        <ComboboxList>
          {(soc: MeasurementSoc) => (
            <ComboboxItem key={soc.id} value={soc} className="cursor-pointer">
              <span className="truncate">{getSocLabel(soc)}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function ReaderVersionSelect({ value, labelledBy, disabled, onChange }: PickerProps<number>) {
  const { t } = useTranslation("admin");
  const { data: readerVersions } = useQuery(readerVersionsQueryOptions());
  const chosen = readerVersions?.find((readerVersion) => readerVersion.id === value);

  return (
    <Select value={value} onValueChange={(readerVersionId) => onChange(readerVersionId)} disabled={disabled || readerVersions === undefined}>
      <SelectTrigger aria-labelledby={labelledBy} className={SELECT_TRIGGER_CLASS}>
        <SelectValue>
          {chosen === undefined ? (
            <span className={PLACEHOLDER_CLASS}>{t("measurements.blocks.dialog.chooseReaderVersion")}</span>
          ) : (
            getReaderVersionName(t, chosen)
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {readerVersions?.map((readerVersion) => (
          <SelectItem key={readerVersion.id} value={readerVersion.id} className="cursor-pointer">
            {getReaderVersionName(t, readerVersion)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BlockPhonesField({ draft, disabled, onChange }: BlockPhonesFieldProps) {
  const { t } = useTranslation("admin");
  const titleId = useId();
  const kindOptions = PHONES_KINDS.map((kind) => ({ value: kind, label: t(`measurements.blocks.dialog.phoneKinds.${kind}`) }));

  return (
    <Field>
      <FieldTitle id={titleId}>{t("measurements.blocks.dialog.phones")}</FieldTitle>
      <SegmentedControl
        value={draft.phonesKind}
        options={kindOptions}
        ariaLabelledBy={titleId}
        disabled={disabled}
        onValueChange={(phonesKind) => onChange({ phonesKind })}
        className="flex w-full *:flex-auto"
      />
      {draft.phonesKind === "modemFamily" ? (
        <ModemFamilySelect value={draft.modemFamily} labelledBy={titleId} disabled={disabled} onChange={(modemFamily) => onChange({ modemFamily })} />
      ) : null}
      {draft.phonesKind === "soc" ? (
        <SocPicker socId={draft.socId} labelledBy={titleId} disabled={disabled} onChange={(soc) => onChange({ socId: soc?.id ?? null })} />
      ) : null}
      {draft.phonesKind === "deviceModel" ? (
        <DeviceModelPicker value={draft.deviceModel} labelledBy={titleId} disabled={disabled} onChange={(deviceModel) => onChange({ deviceModel })} />
      ) : null}
      {draft.phonesKind === "readerVersion" ? (
        <ReaderVersionSelect
          value={draft.readerVersionId}
          labelledBy={titleId}
          disabled={disabled}
          onChange={(readerVersionId) => onChange({ readerVersionId })}
        />
      ) : null}
    </Field>
  );
}
