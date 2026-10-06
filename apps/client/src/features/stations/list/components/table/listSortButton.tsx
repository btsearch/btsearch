import { ArrowDown02Icon, ArrowUp02Icon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { LIST_SORT_BAR_CLASS } from "./listTableRow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ListSortButtonPlacement = "head" | "datesHead" | "bar";

type ListSortButtonLook = {
  button: string;
  activeButton: string;
  idleButton?: string;
  idleIcon: string;
};

type ListSortButtonProps = {
  label: string;
  isActive: boolean;
  isDescending: boolean;
  placement: ListSortButtonPlacement;
  onClick: () => void;
};

type ListDateColumn = "updated" | "created";

type ListSortHeadProps<Column extends string> = {
  column: Column;
  label: string;
  activeColumn: string | null;
  isDescending: boolean;
  onSortPick: (column: Column) => void;
};

type ListDatesHeadProps = {
  activeColumn: string | null;
  isDescending: boolean;
  onSortPick: (column: ListDateColumn) => void;
};

type ListSortBarProps<IdColumn extends string> = {
  idColumn: IdColumn;
  idLabel: string;
  activeColumn: string | null;
  isDescending: boolean;
  onSortPick: (column: IdColumn | ListDateColumn) => void;
};

type ListAriaSort = "ascending" | "descending" | "none";

const SORT_ICONS: Record<ListAriaSort, IconSvgElement> = { ascending: ArrowUp02Icon, descending: ArrowDown02Icon, none: Sorting05Icon };
const HEAD_LOOK: ListSortButtonLook = {
  button: "-ml-1.25 px-1 text-sm",
  activeButton: "text-primary hover:text-primary",
  idleIcon: "text-muted-foreground group-hover/button:text-foreground",
};
const LOOKS: Record<ListSortButtonPlacement, ListSortButtonLook> = {
  head: HEAD_LOOK,
  datesHead: { ...HEAD_LOOK, button: "-mr-1.25 h-5 px-1 text-sm" },
  bar: {
    button: "h-8 px-2",
    activeButton: "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/10",
    idleButton: "text-muted-foreground",
    idleIcon: "text-muted-foreground",
  },
};

function getListAriaSort(isActive: boolean, isDescending: boolean): ListAriaSort {
  if (!isActive) return "none";
  return isDescending ? "descending" : "ascending";
}

function ListSortButton({ label, isActive, isDescending, placement, onClick }: ListSortButtonProps) {
  const { t } = useTranslation("common");
  const direction = getListAriaSort(isActive, isDescending);
  const directionLabels: Record<ListAriaSort, string> = {
    ascending: t("sorting.ascending"),
    descending: t("sorting.descending"),
    none: t("sorting.none"),
  };
  const look = LOOKS[placement];

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-label={`${label}: ${directionLabels[direction]}`}
      aria-pressed={placement === "bar" ? isActive : undefined}
      className={cn("cursor-pointer", look.button, isActive ? look.activeButton : look.idleButton)}
      onClick={onClick}
    >
      {label}
      <HugeiconsIcon icon={SORT_ICONS[direction]} aria-hidden="true" className={cn("size-3.5", isActive ? null : look.idleIcon)} />
    </Button>
  );
}

export function ListSortHead<Column extends string>({ column, label, activeColumn, isDescending, onSortPick }: ListSortHeadProps<Column>) {
  const isActive = activeColumn === column;

  return (
    <div role="columnheader" aria-sort={getListAriaSort(isActive, isDescending)}>
      <ListSortButton label={label} isActive={isActive} isDescending={isDescending} placement="head" onClick={() => onSortPick(column)} />
    </div>
  );
}

export function ListDatesHead({ activeColumn, isDescending, onSortPick }: ListDatesHeadProps) {
  const { t } = useTranslation("common");
  const isDateActive = activeColumn === "updated" || activeColumn === "created";

  return (
    <div role="columnheader" aria-sort={getListAriaSort(isDateActive, isDescending)} className="flex flex-col items-end">
      <ListSortButton
        label={t("labels.updated")}
        isActive={activeColumn === "updated"}
        isDescending={isDescending}
        placement="datesHead"
        onClick={() => onSortPick("updated")}
      />
      <ListSortButton
        label={t("labels.added")}
        isActive={activeColumn === "created"}
        isDescending={isDescending}
        placement="datesHead"
        onClick={() => onSortPick("created")}
      />
    </div>
  );
}

export function ListSortBar<IdColumn extends string>({ idColumn, idLabel, activeColumn, isDescending, onSortPick }: ListSortBarProps<IdColumn>) {
  const { t } = useTranslation("common");

  return (
    <div role="group" aria-label={t("sorting.title")} className={LIST_SORT_BAR_CLASS}>
      <ListSortButton
        label={idLabel}
        isActive={activeColumn === idColumn}
        isDescending={isDescending}
        placement="bar"
        onClick={() => onSortPick(idColumn)}
      />
      <ListSortButton
        label={t("labels.updated")}
        isActive={activeColumn === "updated"}
        isDescending={isDescending}
        placement="bar"
        onClick={() => onSortPick("updated")}
      />
      <ListSortButton
        label={t("labels.added")}
        isActive={activeColumn === "created"}
        isDescending={isDescending}
        placement="bar"
        onClick={() => onSortPick("created")}
      />
    </div>
  );
}
