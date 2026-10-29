import { Activity01Icon } from "@hugeicons/core-free-icons";
import type { AuditOperationKind } from "@openbts/shared/audit";
import { useTranslation } from "react-i18next";

import { KIND_GROUPS } from "../constants";
import { getKindLabel } from "../labels";
import { type FacetOptionGroup, ListFacetCombobox } from "@/features/stations/list/components/panel/listFacetCombobox";

type KindFilterProps = {
  kinds: AuditOperationKind[];
  onChange: (kinds: AuditOperationKind[]) => void;
  isInline?: boolean;
};

export function KindFilter({ kinds, onChange, isInline = false }: KindFilterProps) {
  const { t } = useTranslation("admin");
  const groups: FacetOptionGroup<AuditOperationKind>[] = KIND_GROUPS.map((group) => ({
    key: group.key,
    heading: t(`auditLogs.groups.${group.key}`),
    separatorBefore: true,
    options: group.kinds.map((kind) => ({ key: kind, name: getKindLabel(t, kind) })),
  }));

  return (
    <div>
      <ListFacetCombobox
        groups={groups}
        pickedKeys={kinds}
        icon={Activity01Icon}
        label={t("auditLogs.columns.kind")}
        placeholder={t("auditLogs.filters.allKinds")}
        searchPlaceholder={t("auditLogs.filters.searchKinds")}
        emptyText={t("auditLogs.filters.noKindsFound")}
        hasChips
        showPickedNames={isInline}
        isInline={isInline}
        contentClassName="w-72 min-w-(--anchor-width)"
        onChange={onChange}
      />
    </div>
  );
}
