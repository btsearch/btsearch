import type { MeasurementDeviceModel } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { deviceModelSearchQueryOptions } from "../api/readingBlocks";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type DeviceModelPickerProps = {
  value: MeasurementDeviceModel | null;
  labelledBy: string;
  disabled?: boolean;
  onChange: (model: MeasurementDeviceModel | null) => void;
};

const SEARCH_DEBOUNCE_MS = 300;
const NO_MODELS: MeasurementDeviceModel[] = [];

export function getDeviceModelName(model: Pick<MeasurementDeviceModel, "manufacturer" | "model">): string {
  return `${model.manufacturer} ${model.model}`;
}

function getDeviceModelValue(model: MeasurementDeviceModel): string {
  return String(model.id);
}

function isSameDeviceModel(left: MeasurementDeviceModel, right: MeasurementDeviceModel): boolean {
  return left.id === right.id;
}

export function DeviceModelPicker({ value, labelledBy, disabled = false, onChange }: DeviceModelPickerProps) {
  const { t, i18n } = useTranslation("admin");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const searchQuery = useQuery(deviceModelSearchQueryOptions(debouncedSearch));

  const hasSearch = search.trim() !== "";
  const models = hasSearch && debouncedSearch.trim() !== "" ? (searchQuery.data ?? NO_MODELS) : NO_MODELS;
  const isSearching = hasSearch && (search !== debouncedSearch || searchQuery.isFetching);

  let emptyText = t("measurements.pickers.model.noMatches");
  if (!hasSearch) emptyText = t("measurements.pickers.model.typeHint");
  else if (isSearching) emptyText = t("common:actions.loading");
  else if (searchQuery.isError) emptyText = t("measurements.pickers.model.loadFailed");

  return (
    <Combobox
      items={models}
      value={value}
      onValueChange={(model) => onChange(model)}
      itemToStringLabel={getDeviceModelName}
      itemToStringValue={getDeviceModelValue}
      isItemEqualToValue={isSameDeviceModel}
      filter={null}
      inputValue={search}
      onInputValueChange={setSearch}
      locale={i18n.language}
      autoHighlight
      disabled={disabled}
    >
      <ComboboxTrigger
        aria-labelledby={labelledBy}
        render={<Button type="button" variant="outline" className="w-full cursor-pointer justify-between font-normal" />}
      >
        {value === null ? (
          <span className="truncate text-muted-foreground">{t("measurements.pickers.model.placeholder")}</span>
        ) : (
          <span className="truncate">{getDeviceModelName(value)}</span>
        )}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} placeholder={t("common:placeholder.search")} aria-label={t("measurements.pickers.model.searchLabel")} />
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(model: MeasurementDeviceModel) => (
            <ComboboxItem key={model.id} value={model} className="cursor-pointer">
              <span className="truncate">{getDeviceModelName(model)}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
