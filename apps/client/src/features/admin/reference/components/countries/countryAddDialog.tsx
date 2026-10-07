import { Radio01Icon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { countryQueryOptions, createCountry } from "../../api/countries";
import { invalidateCountries } from "../../api/queryKeys";
import { type CountryOption, listSelectableCountries } from "../../utils/countries";
import { showReferenceError } from "../../utils/errors";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { REFERENCE_DESCRIPTION_CLASS } from "../shared/referenceCards";
import { useOpeningCount } from "../shared/useOpeningCount";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type CountryAddDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCountryCodes: readonly string[];
};

type CountryAddFormProps = {
  existingCountryCodes: readonly string[];
  isPending: boolean;
  onSubmit: (countryCode: string) => void;
  onCancel: () => void;
};

type CountryPickerProps = {
  options: readonly CountryOption[];
  value: CountryOption | null;
  labelledBy: string;
  disabled: boolean;
  onChange: (country: CountryOption | null) => void;
};

type CountryAddNoteProps = {
  icon: IconSvgElement;
  children: ReactNode;
};

function getCountrySearchLabel(country: CountryOption): string {
  return `${country.name} ${country.code}`;
}

function getCountryOptionCode(country: CountryOption): string {
  return country.code;
}

function isSameCountryOption(left: CountryOption, right: CountryOption): boolean {
  return left.code === right.code;
}

function CountryOptionLabel({ country }: { country: CountryOption }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CountryCodeTile code={country.code} size="xs" />
      <span className="truncate">{country.name}</span>
    </span>
  );
}

function CountryPicker({ options, value, labelledBy, disabled, onChange }: CountryPickerProps) {
  const { t, i18n } = useTranslation("admin");

  return (
    <Combobox
      items={options}
      value={value}
      onValueChange={onChange}
      itemToStringLabel={getCountrySearchLabel}
      itemToStringValue={getCountryOptionCode}
      isItemEqualToValue={isSameCountryOption}
      locale={i18n.language}
      autoHighlight
      disabled={disabled}
    >
      <ComboboxTrigger
        aria-labelledby={labelledBy}
        render={<Button type="button" variant="outline" className="w-full cursor-pointer justify-between font-normal" />}
      >
        {value === null ? (
          <span className="truncate text-muted-foreground">{t("admin:users.detail.grants.dialog.countryPlaceholder")}</span>
        ) : (
          <CountryOptionLabel country={value} />
        )}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} placeholder={t("common:placeholder.search")} aria-label={t("reference.countries.addDialog.searchLabel")} />
        <ComboboxEmpty>{t("reference.countries.addDialog.noMatches")}</ComboboxEmpty>
        <ComboboxList>
          {(country: CountryOption) => (
            <ComboboxItem key={country.code} value={country} className="cursor-pointer">
              <CountryOptionLabel country={country} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function CountryAddNote({ icon, children }: CountryAddNoteProps) {
  return (
    <p className={cn("flex items-start gap-2", REFERENCE_DESCRIPTION_CLASS)}>
      <HugeiconsIcon icon={icon} aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

function CountryAddForm({ existingCountryCodes, isPending, onSubmit, onCancel }: CountryAddFormProps) {
  const { t, i18n } = useTranslation("admin");
  const countryTitleId = useId();
  const [pickedCountryCode, setPickedCountryCode] = useState<string | null>(null);

  const options = listSelectableCountries(i18n.language, existingCountryCodes);
  const pickedCountry = options.find((option) => option.code === pickedCountryCode) ?? null;
  const canSubmit = pickedCountry !== null && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pickedCountry === null || !canSubmit) return;
    onSubmit(pickedCountry.code);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("reference.countries.add")}</DialogTitle>
        <DialogDescription>{t("reference.countries.addDialog.description")}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldTitle id={countryTitleId}>{t("admin:users.detail.grants.dialog.country")}</FieldTitle>
        <CountryPicker
          options={options}
          value={pickedCountry}
          labelledBy={countryTitleId}
          disabled={isPending}
          onChange={(country) => setPickedCountryCode(country?.code ?? null)}
        />
        <FieldDescription>{t("reference.countries.addDialog.codeHint")}</FieldDescription>
      </Field>
      <div className="flex flex-col gap-2">
        <CountryAddNote icon={ViewOffIcon}>{t("reference.countries.addDialog.startsHidden")}</CountryAddNote>
        <CountryAddNote icon={Radio01Icon}>{t("reference.countries.addDialog.emptyPlanNote")}</CountryAddNote>
      </div>
      <DialogFormFooter submitLabel={t("reference.countries.add")} canSubmit={canSubmit} isPending={isPending} onCancel={onCancel} />
    </form>
  );
}

export function CountryAddDialog({ open, onOpenChange, existingCountryCodes }: CountryAddDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const openingCount = useOpeningCount(open);
  const [shownCountryCodes, setShownCountryCodes] = useState(existingCountryCodes);
  if (open && shownCountryCodes !== existingCountryCodes) setShownCountryCodes(existingCountryCodes);

  const createMutation = useMutation({
    mutationFn: (countryCode: string) => createCountry({ code: countryCode }),
    onSuccess: (country) => {
      onOpenChange(false);
      queryClient.setQueryData(countryQueryOptions(country.code).queryKey, country);
      void invalidateCountries(queryClient);
      toast.success(t("reference.countries.addDialog.success"));
      void navigate({ to: "/admin/countries/$code", params: { code: country.code } });
    },
    onError: (error) => showReferenceError(error, "admin:reference.countries.addDialog.failed"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!createMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <CountryAddForm
          key={openingCount}
          existingCountryCodes={shownCountryCodes}
          isPending={createMutation.isPending}
          onSubmit={(countryCode) => createMutation.mutate(countryCode)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
