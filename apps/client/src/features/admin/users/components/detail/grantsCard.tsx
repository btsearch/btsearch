import { Add01Icon, Delete02Icon, Flag02Icon, Globe02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showUserAdminError, storeUpdatedAccount } from "../../api/authAdmin";
import { invalidateUserAdminQueries } from "../../api/queryKeys";
import { countryRegionsQueryOptions } from "../../api/reference";
import { deleteRoleGrant } from "../../api/roleGrants";
import { usersByIdsQueryOptions } from "../../api/users";
import type { AdminUser, NamedUserRef, RoleGrant } from "../../types";
import { formatLongDate } from "../../utils/dates";
import { type RegionNameIndex, getGrantRoleLabel, getGrantScope, getRegionScopedCountryCodes, indexRegionNames } from "../../utils/grants";
import { getAccountName } from "../../utils/identity";
import { GrantChipSkeleton } from "../shared/grantChip";
import { GrantCountryTile } from "./grantCountryTile";
import { GrantScopeDialog } from "./grantDialog";
import { GrantRoleBadge } from "./grantRoleBadge";
import { CenteredCardState, META_USER_LINK_CLASS, RowIconButton, TINTED_BUTTON_CLASS } from "./userDetailPrimitives";
import { ROLE_TONES } from "@/components/app/roleTone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardNote,
  SettingsMeta,
  SettingsMetaItem,
  SettingsRowError,
  SettingsRowSkeleton,
} from "@/features/settings/components/settingsPrimitives";
import { UserLink } from "@/features/user-profile/components/userLink";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type GrantsCardProps = {
  user: AdminUser;
  grants: RoleGrant[] | undefined;
  hasLoadFailed: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onAddGrant: () => void;
};

type GrantsCardBodyProps = GrantsCardProps & {
  onEditGrant: (grant: RoleGrant) => void;
  onRemoveGrant: (grant: RoleGrant) => void;
};

type GrantListProps = {
  grants: RoleGrant[];
  onEditGrant: (grant: RoleGrant) => void;
  onRemoveGrant: (grant: RoleGrant) => void;
};

type GrantRowProps = {
  grant: RoleGrant;
  regionNames: RegionNameIndex | null;
  hasRegionsLoadFailed: boolean;
  granter?: NamedUserRef;
  onEdit: () => void;
  onRemove: () => void;
};

type GrantScopeBadgesProps = {
  grant: RoleGrant;
  regionNames: RegionNameIndex | null;
  hasRegionsLoadFailed: boolean;
};

type GrantRemoval = {
  grant: RoleGrant;
  isLastGrant: boolean;
};

type GrantRemoveDialogProps = {
  user: AdminUser;
  grant: RoleGrant;
  isLastGrant: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ADD_BUTTON_CLASS = cn("cursor-pointer", TINTED_BUTTON_CLASS);

function AddGrantButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("admin");

  return (
    <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={onClick}>
      <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
      {t("users.detail.grants.addGrant")}
    </Button>
  );
}

function GrantScopeBadges({ grant, regionNames, hasRegionsLoadFailed }: GrantScopeBadgesProps) {
  const { t } = useTranslation("admin");

  if (grant.regionIds === null) {
    return (
      <Badge variant="secondary">
        <HugeiconsIcon icon={Globe02Icon} data-icon="inline-start" aria-hidden="true" />
        {t("users.shared.grantScope.wholeCountry")}
      </Badge>
    );
  }
  if (regionNames === null) {
    if (!hasRegionsLoadFailed) return <GrantChipSkeleton />;
    return <Badge variant="secondary">{t("main:userProfile.regionCount", { count: grant.regionIds.length })}</Badge>;
  }

  const scope = getGrantScope(grant, regionNames);
  const regions = scope.kind === "regions" ? scope.regions : [];
  return regions.map((region) => (
    <Badge key={region.id} variant="secondary">
      {region.name}
    </Badge>
  ));
}

function GrantRow({ grant, regionNames, hasRegionsLoadFailed, granter, onEdit, onRemove }: GrantRowProps) {
  const { t, i18n } = useTranslation("admin");
  const grantedOn = formatLongDate(grant.createdAt, i18n.language);

  return (
    <div className="flex items-start gap-3.5 border-t px-4 py-3.5 first:border-t-0 sm:px-5">
      <GrantCountryTile code={grant.countryCode} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm leading-5 font-medium">{getCountryName(grant.countryCode, i18n.language)}</p>
          <GrantRoleBadge role={grant.role} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <GrantScopeBadges grant={grant} regionNames={regionNames} hasRegionsLoadFailed={hasRegionsLoadFailed} />
        </div>
        <div className="mt-1.5 text-xs leading-4 text-muted-foreground">
          {granter !== undefined && granter.name !== "" ? (
            <SettingsMeta>
              <SettingsMetaItem>
                <Trans
                  t={t}
                  i18nKey="admin:users.detail.grants.grantedBy"
                  values={{ name: granter.name }}
                  components={{
                    user: (
                      <UserLink user={granter} className={META_USER_LINK_CLASS}>
                        {granter.name}
                      </UserLink>
                    ),
                  }}
                />
              </SettingsMetaItem>
              <SettingsMetaItem>{grantedOn}</SettingsMetaItem>
            </SettingsMeta>
          ) : (
            t("users.detail.grants.grantedOn", { date: grantedOn })
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {grant.role === "editor" ? <RowIconButton label={t("users.detail.grants.changeScope")} icon={PencilEdit02Icon} onClick={onEdit} /> : null}
        <RowIconButton label={t("users.detail.grants.removeGrant")} icon={Delete02Icon} destructive onClick={onRemove} />
      </div>
    </div>
  );
}

function GrantRemoveDialog({ user, grant, isLastGrant, open, onOpenChange }: GrantRemoveDialogProps) {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: () => deleteRoleGrant(grant.id),
    onSuccess: () => {
      onOpenChange(false);
      if (isLastGrant) storeUpdatedAccount(queryClient, { ...user, role: "user" });
      else void invalidateUserAdminQueries(queryClient, user.id);
      toast.success(t("users.detail.grants.remove.success"));
    },
    onError: showUserAdminError,
  });

  const accountName = getAccountName(user);
  const description = isLastGrant
    ? t("users.detail.grants.remove.lastDescription", { name: accountName })
    : t("users.detail.grants.remove.description", {
        name: accountName,
        country: getCountryName(grant.countryCode, i18n.language),
        role: getGrantRoleLabel(t, grant.role),
      });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!removeMutation.isPending) onOpenChange(nextOpen);
      }}
      title={t("users.detail.grants.remove.title")}
      description={description}
      confirmLabel={t("common:actions.delete")}
      pending={removeMutation.isPending}
      onConfirm={() => removeMutation.mutate()}
    />
  );
}

function GrantList({ grants, onEditGrant, onRemoveGrant }: GrantListProps) {
  const { t } = useTranslation("admin");
  const { data: regions, isError: hasRegionsLoadFailed } = useQuery(countryRegionsQueryOptions(getRegionScopedCountryCodes(grants)));
  const { data: granters } = useQuery(usersByIdsQueryOptions(grants.flatMap((grant) => (grant.grantedById === null ? [] : [grant.grantedById]))));

  const regionNames = regions === undefined ? null : indexRegionNames(regions);
  const grantersById = new Map((granters ?? []).map((granter) => [granter.id, granter]));

  return (
    <>
      <div className="border-t">
        {grants.map((grant) => (
          <GrantRow
            key={grant.id}
            grant={grant}
            regionNames={regionNames}
            hasRegionsLoadFailed={hasRegionsLoadFailed}
            granter={grant.grantedById === null ? undefined : grantersById.get(grant.grantedById)}
            onEdit={() => onEditGrant(grant)}
            onRemove={() => onRemoveGrant(grant)}
          />
        ))}
      </div>
      <SettingsCardNote className="mt-auto">{t("users.detail.grants.maintainerNote")}</SettingsCardNote>
    </>
  );
}

function GrantsCardBody({ user, grants, hasLoadFailed, isRetrying, onRetry, onAddGrant, onEditGrant, onRemoveGrant }: GrantsCardBodyProps) {
  const { t } = useTranslation("admin");

  if (user.role === "admin") {
    return (
      <CenteredCardState
        icon={ROLE_TONES.admin.icon}
        iconClassName={ROLE_TONES.admin.badge}
        title={t("users.detail.grants.admin.title")}
        description={t("users.detail.grants.admin.description")}
      />
    );
  }
  if (user.role === "user") {
    return (
      <CenteredCardState
        icon={Flag02Icon}
        title={t("users.detail.grants.empty.title")}
        description={t("users.detail.grants.empty.userDescription")}
        action={<AddGrantButton onClick={onAddGrant} />}
      />
    );
  }
  if (grants === undefined) {
    return (
      <div className="border-t">
        {hasLoadFailed ? (
          <SettingsRowError title={t("users.detail.grants.loadFailed")} onRetry={onRetry} isRetrying={isRetrying} />
        ) : (
          <>
            <SettingsRowSkeleton />
            <SettingsRowSkeleton />
          </>
        )}
      </div>
    );
  }
  if (grants.length === 0) {
    return (
      <CenteredCardState
        icon={Flag02Icon}
        title={t("users.detail.grants.empty.title")}
        description={t("users.detail.grants.empty.editorDescription")}
        action={<AddGrantButton onClick={onAddGrant} />}
      />
    );
  }

  return <GrantList grants={grants} onEditGrant={onEditGrant} onRemoveGrant={onRemoveGrant} />;
}

export function GrantsCard({ user, grants, hasLoadFailed, isRetrying, onRetry, onAddGrant }: GrantsCardProps) {
  const { t } = useTranslation("admin");
  const [grantToEdit, setGrantToEdit] = useState<RoleGrant | null>(null);
  const [isScopeDialogOpen, setIsScopeDialogOpen] = useState(false);
  const [removal, setRemoval] = useState<GrantRemoval | null>(null);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);

  function openScopeDialog(grant: RoleGrant) {
    setGrantToEdit(grant);
    setIsScopeDialogOpen(true);
  }

  function openRemoveDialog(grant: RoleGrant) {
    setRemoval({ grant, isLastGrant: grants?.length === 1 });
    setIsRemoveDialogOpen(true);
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={t("users.detail.grants.title")}
        description={t("users.detail.grants.description")}
        action={
          user.role === "editor" ? (
            <Button type="button" variant="ghost" size="sm" className={ADD_BUTTON_CLASS} disabled={grants === undefined} onClick={onAddGrant}>
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
              {t("users.detail.grants.add")}
            </Button>
          ) : null
        }
      />
      <GrantsCardBody
        user={user}
        grants={grants}
        hasLoadFailed={hasLoadFailed}
        isRetrying={isRetrying}
        onRetry={onRetry}
        onAddGrant={onAddGrant}
        onEditGrant={openScopeDialog}
        onRemoveGrant={openRemoveDialog}
      />
      {grantToEdit === null ? null : (
        <GrantScopeDialog user={user} grant={grantToEdit} open={isScopeDialogOpen} onOpenChange={setIsScopeDialogOpen} />
      )}
      {removal === null ? null : (
        <GrantRemoveDialog
          user={user}
          grant={removal.grant}
          isLastGrant={removal.isLastGrant}
          open={isRemoveDialogOpen}
          onOpenChange={setIsRemoveDialogOpen}
        />
      )}
    </SettingsCard>
  );
}
