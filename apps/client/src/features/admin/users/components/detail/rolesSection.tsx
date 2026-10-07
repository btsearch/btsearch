import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { userGrantsQueryOptions } from "../../api/roleGrants";
import type { AdminUser, RoleGrant } from "../../types";
import { sortGrants } from "../../utils/grants";
import { GrantAddDialog } from "./grantDialog";
import { GrantsCard } from "./grantsCard";
import { RolesRoleCard } from "./rolesRoleCard";
import { USER_DETAIL_TWO_COLUMN_CLASS } from "./userDetailPrimitives";
import { USER_DETAIL_SECTION_IDS } from "./userDetailSections";
import { SettingsSection } from "@/features/settings/components/settingsPrimitives";

const NO_GRANTS: readonly RoleGrant[] = [];

export function RolesSection({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { t } = useTranslation("admin");
  const [mountedAt] = useState(Date.now);
  const [isAddingGrant, setIsAddingGrant] = useState(false);
  const isEditor = user.role === "editor";
  const {
    data: fetchedGrants,
    dataUpdatedAt,
    isFetchedAfterMount,
    isFetching,
    refetch,
  } = useQuery({ ...userGrantsQueryOptions(user.id), enabled: isEditor });

  const grants = isEditor && fetchedGrants !== undefined && dataUpdatedAt >= mountedAt ? sortGrants(fetchedGrants) : undefined;

  function openGrantDialog() {
    setIsAddingGrant(true);
  }

  return (
    <SettingsSection id={USER_DETAIL_SECTION_IDS.roles} title={t("users.detail.roles.title")}>
      <div className={USER_DETAIL_TWO_COLUMN_CLASS}>
        <RolesRoleCard user={user} isSelf={isSelf} grants={grants ?? NO_GRANTS} onAddGrant={openGrantDialog} />
        <GrantsCard
          user={user}
          grants={grants}
          hasLoadFailed={grants === undefined && isFetchedAfterMount}
          isRetrying={isFetching}
          onRetry={() => void refetch()}
          onAddGrant={openGrantDialog}
        />
      </div>
      <GrantAddDialog user={user} existingGrants={grants ?? NO_GRANTS} open={isAddingGrant} onOpenChange={setIsAddingGrant} />
    </SettingsSection>
  );
}
