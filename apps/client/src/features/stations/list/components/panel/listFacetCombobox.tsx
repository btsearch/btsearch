import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Fragment, type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@/components/ui/combobox";
import { Reveal } from "@/features/map/components/search-overlay/mapFilterMotion";
import { foldText } from "@/lib/foldText";
import { cn } from "@/lib/utils";

type FacetKey = string | number;

type FacetOption<Key extends FacetKey> = {
  key: Key;
  name: string;
  code?: string;
  mark?: ReactNode;
  separatorBefore?: boolean;
};

export type FacetOptionGroup<Key extends FacetKey> = {
  key: string;
  heading: ReactNode;
  options: readonly FacetOption<Key>[];
  separatorBefore?: boolean;
};

type ListFacetComboboxProps<Key extends FacetKey> = {
  groups: readonly FacetOptionGroup<Key>[];
  pickedKeys: readonly Key[];
  icon: IconSvgElement;
  label: string;
  placeholder: string;
  addPlaceholder?: string;
  emptyText: string;
  hasChips?: boolean;
  showPickedNames?: boolean;
  isLoadingOptions?: boolean;
  isInline?: boolean;
  getCountText?: (shownCount: number, optionCount: number) => string;
  onChange: (keys: Key[]) => void;
};

type FacetOptionRowsProps<Key extends FacetKey> = {
  groups: readonly FacetOptionGroup<Key>[];
};

const FIELD_CLASS = "h-8 max-h-8 min-h-8 flex-nowrap overflow-hidden text-sm has-data-[slot=combobox-chip]:px-2.5";
const INLINE_FIELD_CLASS = cn(
  "flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors",
  "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
);
const FIELD_ICON_CLASS = "pointer-events-none size-3.5 shrink-0 text-muted-foreground";
const NAME_SEPARATOR = ", ";

function matchesQuery<Key extends FacetKey>(option: FacetOption<Key>, foldedQuery: string): boolean {
  if (foldText(option.name).includes(foldedQuery)) return true;
  return option.code !== undefined && foldText(option.code) === foldedQuery;
}

function listMatchingGroups<Key extends FacetKey>(groups: readonly FacetOptionGroup<Key>[], query: string): readonly FacetOptionGroup<Key>[] {
  const foldedQuery = foldText(query.trim());
  if (foldedQuery === "") return groups;

  return groups.flatMap((group) => {
    const options: FacetOption<Key>[] = [];
    let hasSeparator = false;
    for (const option of group.options) {
      hasSeparator = hasSeparator || option.separatorBefore === true;
      if (!matchesQuery(option, foldedQuery)) continue;
      options.push(hasSeparator && options.length > 0 ? { ...option, separatorBefore: true } : option);
      hasSeparator = false;
    }
    return options.length === 0 ? [] : [{ ...group, options }];
  });
}

function FacetOptionRows<Key extends FacetKey>({ groups }: FacetOptionRowsProps<Key>) {
  return (
    <>
      {groups.map((group, groupIndex) => {
        const rows = group.options.map((option, optionIndex) => (
          <Fragment key={option.key}>
            {option.separatorBefore && optionIndex > 0 ? <ComboboxSeparator /> : null}
            <ComboboxItem value={option.key} className="cursor-pointer">
              {option.mark}
              <span className="truncate">{option.name}</span>
            </ComboboxItem>
          </Fragment>
        ));
        if (group.heading === null) return <Fragment key={group.key}>{rows}</Fragment>;

        return (
          <Fragment key={group.key}>
            {group.separatorBefore && groupIndex > 0 ? <ComboboxSeparator /> : null}
            <ComboboxGroup>
              <ComboboxLabel className="flex items-center gap-1.5 px-1.5 pt-1.5 pb-1">{group.heading}</ComboboxLabel>
              {rows}
            </ComboboxGroup>
          </Fragment>
        );
      })}
    </>
  );
}

export function ListFacetCombobox<Key extends FacetKey>({
  groups,
  pickedKeys,
  icon,
  label,
  placeholder,
  addPlaceholder,
  emptyText,
  hasChips = false,
  showPickedNames = true,
  isLoadingOptions = false,
  isInline = false,
  getCountText,
  onChange,
}: ListFacetComboboxProps<Key>) {
  const { t } = useTranslation("common");
  const fieldRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const options = groups.flatMap((group) => group.options);
  const optionsByKey = new Map(options.map((option): [Key, FacetOption<Key>] => [option.key, option]));
  const pickedOptions = pickedKeys.flatMap((key) => {
    const option = optionsByKey.get(key);
    return option === undefined ? [] : [option];
  });
  const matchingGroups = listMatchingGroups(groups, query);
  const matchingOptions = matchingGroups.flatMap((group) => group.options);

  const hasPicks = pickedOptions.length > 0;
  const fieldChipName = hasChips && !isInline ? (pickedOptions.at(0)?.name ?? null) : null;
  const hasFieldChips = fieldChipName !== null;
  const placeholderWithPicks = hasFieldChips ? "" : (addPlaceholder ?? placeholder);
  const placeholderWithoutPicks = isLoadingOptions && pickedKeys.length > 0 ? t("actions.loading") : placeholder;
  const fieldPlaceholder = hasPicks ? placeholderWithPicks : placeholderWithoutPicks;
  const restPickedCount = pickedOptions.length - 1;
  const hasPickedNames = showPickedNames && hasChips && (isInline ? hasPicks : restPickedCount > 0);
  const pickedNames = pickedOptions.map((option) => option.name).join(NAME_SEPARATOR);
  const hasNoMatch = options.length > 0 && matchingOptions.length === 0;
  const isNarrowed = matchingOptions.length > 0 && matchingOptions.length < options.length;
  const countText = getCountText !== undefined && isNarrowed ? getCountText(matchingOptions.length, options.length) : null;

  const status = (
    <div role="status">
      {hasNoMatch ? <p className="px-2 py-2 text-center text-sm text-muted-foreground">{emptyText}</p> : null}
      {countText === null ? null : <p className="px-2.5 pt-1 pb-1.5 text-xs leading-4 text-muted-foreground tabular-nums">{countText}</p>}
    </div>
  );

  return (
    <>
      <Combobox
        multiple
        inline={isInline}
        open={isInline ? true : undefined}
        items={matchingOptions.map((option) => option.key)}
        filter={null}
        value={pickedOptions.map((option) => option.key)}
        onValueChange={(keys) => onChange(keys)}
        inputValue={query}
        onInputValueChange={(value) => setQuery(value)}
      >
        {isInline ? (
          <>
            <div className={INLINE_FIELD_CLASS}>
              <HugeiconsIcon icon={icon} className={FIELD_ICON_CLASS} aria-hidden="true" />
              <ComboboxChipsInput aria-label={label} className="min-w-0" placeholder={t("placeholder.search")} />
            </div>
            <div className="custom-scrollbar mt-1.5 max-h-64 overflow-y-auto overscroll-contain">
              <ComboboxList className="max-h-none overflow-visible p-0">
                <FacetOptionRows groups={matchingGroups} />
              </ComboboxList>
              {status}
            </div>
          </>
        ) : (
          <>
            <ComboboxChips ref={fieldRef} className={FIELD_CLASS}>
              <HugeiconsIcon icon={icon} className={FIELD_ICON_CLASS} aria-hidden="true" />
              {fieldChipName === null ? null : (
                <ComboboxChip className="max-w-36 shrink-0">
                  <span className="truncate">{fieldChipName}</span>
                </ComboboxChip>
              )}
              {hasFieldChips && restPickedCount > 0 ? (
                <ComboboxChip showRemove={false} className="shrink-0 text-muted-foreground">
                  +{restPickedCount}
                </ComboboxChip>
              ) : null}
              <ComboboxChipsInput aria-label={label} className={hasFieldChips ? "min-w-8" : "min-w-0"} placeholder={fieldPlaceholder} />
            </ComboboxChips>
            <ComboboxContent anchor={fieldRef}>
              <ComboboxList>
                <FacetOptionRows groups={matchingGroups} />
              </ComboboxList>
              {status}
            </ComboboxContent>
          </>
        )}
      </Combobox>
      <Reveal shown={hasPickedNames} className="pt-1.5">
        <p className="text-xs leading-4 text-muted-foreground">{pickedNames}</p>
      </Reveal>
    </>
  );
}
