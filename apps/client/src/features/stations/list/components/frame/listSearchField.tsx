import { useRef } from "react";

import { FilterSearchInput, FilterSearchShell } from "@/features/shared/filterPanel";
import { useListSearchText } from "@/features/stations/list/data/useListSearchText";

type ListSearchFieldProps = {
  searchText: string;
  onSearchTextChange: (searchText: string) => void;
  placeholder: string;
  label: string;
  size?: "default" | "sm";
  maxLength?: number;
  id?: string;
};

export function ListSearchField({ searchText, onSearchTextChange, placeholder, label, size, maxLength, id }: ListSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { text, changeText } = useListSearchText(searchText, onSearchTextChange);

  function clearText() {
    changeText("");
    inputRef.current?.focus();
  }

  return (
    <FilterSearchShell size={size} hasValue={text.length > 0} onClear={clearText}>
      <FilterSearchInput
        ref={inputRef}
        id={id}
        value={text}
        maxLength={maxLength}
        onChange={(event) => changeText(event.currentTarget.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </FilterSearchShell>
  );
}
