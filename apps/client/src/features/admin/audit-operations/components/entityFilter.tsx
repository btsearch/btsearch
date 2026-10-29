import { Note01Icon } from "@hugeicons/core-free-icons";
import type { AuditEntity } from "@openbts/shared/audit";
import { useTranslation } from "react-i18next";

import { ENTITY_GROUPS } from "../constants";
import { getEntityLabel } from "../labels";
import { type FacetOptionGroup, ListFacetCombobox } from "@/features/stations/list/components/panel/listFacetCombobox";

type EntityFilterProps = {
  entities: AuditEntity[];
  onChange: (entities: AuditEntity[]) => void;
  isInline?: boolean;
};

export function EntityFilter({ entities, onChange, isInline = false }: EntityFilterProps) {
  const { t } = useTranslation("admin");
  const groups: FacetOptionGroup<AuditEntity>[] = ENTITY_GROUPS.map((group) => ({
    key: group.key,
    heading: t(`auditLogs.groups.${group.key}`),
    separatorBefore: true,
    options: group.entities.map((entity) => ({ key: entity, name: getEntityLabel(t, entity) })),
  }));

  return (
    <div>
      <ListFacetCombobox
        groups={groups}
        pickedKeys={entities}
        icon={Note01Icon}
        label={t("auditLogs.columns.entity")}
        placeholder={t("auditLogs.filters.allEntities")}
        searchPlaceholder={t("auditLogs.filters.searchEntities")}
        emptyText={t("auditLogs.filters.noEntitiesFound")}
        hasChips
        showPickedNames={isInline}
        isInline={isInline}
        contentClassName="w-64 min-w-(--anchor-width)"
        onChange={onChange}
      />
    </div>
  );
}
