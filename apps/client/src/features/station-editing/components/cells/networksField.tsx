import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CELL_CONTROL_PROPS } from "../../hooks/useCellNavigation";
import { TEXT_SEPARATOR } from "../../model/changes";
import { type NetworkOption, toPlmnList } from "../../model/networks";
import type { Rat } from "../../model/types";
import { EMPTY_TEXT } from "./cellFields";
import type { NetworkChoice } from "./cellRules";
import { BrandMark } from "@/components/cellular/brandMark";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { formatNetworkName } from "@/features/shared/operatorMarks";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { foldText } from "@/lib/foldText";
import { cn } from "@/lib/utils";

type NetworkPickerProps = {
  choice: NetworkChoice;
  rat: Rat;
  extraPlmns: readonly string[];
  label: string;
  className: string;
  isInvalid: boolean;
  isLocked: boolean;
  isNavigable?: boolean;
  onChange: (extraPlmns: string[]) => void;
};

type NetworksValueProps = {
  choice: NetworkChoice;
  extraPlmns: readonly string[];
};

const TRIGGER_CLASS = cn(
  "flex items-center justify-between gap-1 rounded-md border border-input bg-transparent whitespace-nowrap outline-none select-none",
  "transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
  "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
  "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
);
export const ROW_NETWORKS_CLASS = "h-7 w-full min-w-0 cursor-pointer pr-1 pl-2 text-[13px] [&>svg]:size-3";
export const FIELD_NETWORKS_CLASS = "h-9 w-full min-w-0 cursor-pointer rounded-lg pr-2 pl-2.5 text-sm [&>svg]:size-4";
const LIST_CLASS = "max-h-[min(--spacing(60),calc(var(--available-height)---spacing(20)))]";

function getOptionName(option: NetworkOption): string {
  return formatNetworkName(option.operator, option.code);
}

function findOption(choice: NetworkChoice, code: string): NetworkOption | undefined {
  return choice.options.find((option) => option.code === code);
}

function NetworksValue({ choice, extraPlmns }: NetworksValueProps) {
  const [firstCode] = extraPlmns;
  if (firstCode === undefined) return <span className="text-muted-foreground">{EMPTY_TEXT}</span>;

  const onlyOption = extraPlmns.length === 1 ? findOption(choice, firstCode) : undefined;
  if (onlyOption !== undefined) {
    const brand = getOperatorBrand(onlyOption.operator, choice.brands);
    return <DialogOperatorName name={getOptionName(onlyOption)} brand={brand} compact labelClassName="text-[13px] font-normal" />;
  }

  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {extraPlmns.map((code) => {
        const option = findOption(choice, code);
        return option === undefined ? (
          <span key={code} className="font-mono">
            {code}
          </span>
        ) : (
          <BrandMark key={code} brand={getOperatorBrand(option.operator, choice.brands)} />
        );
      })}
    </span>
  );
}

export function NetworkPicker({ choice, rat, extraPlmns, label, className, isInvalid, isLocked, isNavigable = true, onChange }: NetworkPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { options, ownerPlmn, brands, limits } = choice;
  const max = limits[rat];
  const isFull = extraPlmns.length >= max;
  const selected = toPlmnList(ownerPlmn, extraPlmns);
  const foldedQuery = foldText(query.trim());
  const shownOptions = options.filter((option) => foldText(`${getOptionName(option)} ${option.code}`).includes(foldedQuery));
  const extraNames = extraPlmns.map((code) => {
    const option = findOption(choice, code);
    return option === undefined ? code : getOptionName(option);
  });
  const alwaysText = t("stations:edit.cells.networks.alwaysBroadcast");
  const searchText = t("stations:edit.cells.networks.search");

  function changeSelection(codes: string[]) {
    onChange(codes.filter((code) => code !== ownerPlmn));
  }

  return (
    <Combobox
      multiple
      items={shownOptions.map((option) => option.code)}
      filter={null}
      value={selected}
      onValueChange={changeSelection}
      inputValue={query}
      onInputValueChange={setQuery}
      disabled={isLocked}
    >
      <ComboboxTrigger
        aria-label={label}
        aria-invalid={isInvalid ? true : undefined}
        title={extraNames.length === 0 ? undefined : `${t("stations:edit.cells.networks.alsoFor")} ${extraNames.join(", ")}`}
        className={cn(TRIGGER_CLASS, className)}
        {...(isNavigable ? CELL_CONTROL_PROPS : undefined)}
      >
        <NetworksValue choice={choice} extraPlmns={extraPlmns} />
      </ComboboxTrigger>
      <ComboboxContent aria-label={label} className="w-72 min-w-(--anchor-width)">
        <ComboboxInput showTrigger={false} placeholder={searchText} aria-label={searchText}>
          <InputGroupAddon align="inline-start">
            <HugeiconsIcon icon={Search01Icon} aria-hidden="true" />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxEmpty>{t("stations:edit.cells.networks.noMatches")}</ComboboxEmpty>
        <ComboboxList className={LIST_CLASS}>
          {shownOptions.map((option) => {
            const isOwner = option.code === ownerPlmn;
            const isLimited = isFull && !extraPlmns.includes(option.code);
            return (
              <ComboboxItem
                key={option.code}
                value={option.code}
                disabled={isOwner || isLimited}
                className={cn("cursor-pointer", isOwner && "data-disabled:opacity-100")}
              >
                <DialogOperatorName
                  name={getOptionName(option)}
                  brand={getOperatorBrand(option.operator, brands)}
                  compact
                  labelClassName="text-sm font-normal"
                />
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {isOwner ? [alwaysText, option.code].join(TEXT_SEPARATOR) : option.code}
                </span>
              </ComboboxItem>
            );
          })}
        </ComboboxList>
        {isFull ? (
          <p className="border-t px-2.5 py-2 text-xs leading-4 text-muted-foreground">{t("stations:edit.cells.networks.limit", { max })}</p>
        ) : null}
      </ComboboxContent>
    </Combobox>
  );
}
