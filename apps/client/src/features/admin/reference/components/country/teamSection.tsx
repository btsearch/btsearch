import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { teamGrantsQueryOptions } from "../../api/team";
import type { Country, GrantRole, TeamGrant } from "../../types";
import { REFERENCE_TWO_COLUMN_CLASS, ReferenceSection } from "../shared/referenceSection";
import { COUNTRY_SECTION_IDS } from "./countrySections";
import { TeamEditorsCard } from "./teamEditorsCard";
import { TeamGrantDialog } from "./teamGrantDialog";
import { TeamMaintainersCard } from "./teamMaintainersCard";
import { type TeamEntry, listTeamEntries } from "./teamMember";
import { TeamRemoveDialog } from "./teamRemoveDialog";
import { TeamScopeDialog } from "./teamScopeDialog";

type TeamSectionProps = {
  country: Country;
  canManageEditors: boolean;
  canManageMaintainers: boolean;
  pageOpenedAt: number;
};

const NO_GRANTS: readonly TeamGrant[] = [];

export function TeamSection({ country, canManageEditors, canManageMaintainers, pageOpenedAt }: TeamSectionProps) {
  const { t, i18n } = useTranslation("admin");
  const [roleToAdd, setRoleToAdd] = useState<GrantRole>("editor");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [entryToEdit, setEntryToEdit] = useState<TeamEntry | null>(null);
  const [isScopeOpen, setIsScopeOpen] = useState(false);
  const [entryToRemove, setEntryToRemove] = useState<TeamEntry | null>(null);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const {
    data: fetchedGrants,
    dataUpdatedAt,
    isFetchedAfterMount,
    isFetching,
    refetch,
  } = useQuery({
    ...teamGrantsQueryOptions([country.code]),
    refetchOnMount: (query) => query.state.dataUpdatedAt < pageOpenedAt,
  });

  const grants = fetchedGrants !== undefined && dataUpdatedAt >= pageOpenedAt ? fetchedGrants : undefined;
  const hasLoadFailed = grants === undefined && isFetchedAfterMount;
  const unknownUserName = t("users.picker.unknownUser");
  const maintainers = grants === undefined ? undefined : listTeamEntries(grants, "maintainer", unknownUserName, i18n.language);
  const editors = grants === undefined ? undefined : listTeamEntries(grants, "editor", unknownUserName, i18n.language);

  function openAddDialog(role: GrantRole) {
    setRoleToAdd(role);
    setIsAddOpen(true);
  }

  function openScopeDialog(entry: TeamEntry) {
    setEntryToEdit(entry);
    setIsScopeOpen(true);
  }

  function openRemoveDialog(entry: TeamEntry) {
    setEntryToRemove(entry);
    setIsRemoveOpen(true);
  }

  function retryLoad() {
    void refetch();
  }

  return (
    <ReferenceSection id={COUNTRY_SECTION_IDS.team} title={t("reference.country.team.title")}>
      <div className={REFERENCE_TWO_COLUMN_CLASS}>
        <TeamMaintainersCard
          entries={maintainers}
          hasLoadFailed={hasLoadFailed}
          isRetrying={isFetching}
          onRetry={retryLoad}
          canManage={canManageMaintainers}
          onAdd={() => openAddDialog("maintainer")}
          onRemove={openRemoveDialog}
        />
        <TeamEditorsCard
          entries={editors}
          hasLoadFailed={hasLoadFailed}
          isRetrying={isFetching}
          onRetry={retryLoad}
          canManage={canManageEditors}
          areNamesLinked={canManageMaintainers}
          onAdd={() => openAddDialog("editor")}
          onEdit={openScopeDialog}
          onRemove={openRemoveDialog}
        />
      </div>
      {canManageEditors || canManageMaintainers ? (
        <TeamGrantDialog country={country} role={roleToAdd} grants={grants ?? NO_GRANTS} open={isAddOpen} onOpenChange={setIsAddOpen} />
      ) : null}
      {entryToEdit === null ? null : <TeamScopeDialog entry={entryToEdit} open={isScopeOpen} onOpenChange={setIsScopeOpen} />}
      {entryToRemove === null ? null : <TeamRemoveDialog entry={entryToRemove} open={isRemoveOpen} onOpenChange={setIsRemoveOpen} />}
    </ReferenceSection>
  );
}
