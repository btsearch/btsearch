import { useTranslation } from "react-i18next";

import type { AdminListsVisibility } from "../listsSearch";

export type AdminListsFilterProps = {
  searchText: string;
  visibility: AdminListsVisibility;
  ownerIds: string[];
  activeFilterCount: number;
  onSearchTextChange: (text: string) => void;
  onVisibilityChange: (visibility: AdminListsVisibility) => void;
  onOwnerIdsChange: (ownerIds: string[]) => void;
  onClearFilters: () => void;
};

type VisibilityOption = {
  value: AdminListsVisibility;
  label: string;
};

export function useVisibilityOptions(): VisibilityOption[] {
  const { t } = useTranslation(["admin", "common"]);

  return [
    { value: "all", label: t("common:status.all") },
    { value: "public", label: t("admin:lists.visibilityFilter.public") },
    { value: "private", label: t("admin:lists.visibilityFilter.private") },
  ];
}
