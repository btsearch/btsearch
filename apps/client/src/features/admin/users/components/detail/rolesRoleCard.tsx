import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { LockIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { setUserRole, showUserAdminError, storeUpdatedAccount } from "../../api/authAdmin";
import type { AdminUser, RoleGrant, UserRole } from "../../types";
import { getAccountName } from "../../utils/identity";
import { getUserRoleLabel } from "../../utils/roles";
import { USER_ROLE_ICONS } from "../shared/userRoleIcon";
import { ROLE_TONES } from "@/components/app/roleTone";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsCardNote,
  SettingsIconTile,
} from "@/features/settings/components/settingsPrimitives";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type RoleOption = {
  role: UserRole;
  icon: IconSvgElement;
  tileClassName?: string;
};

type RoleChangeCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive: boolean;
};

type RolesRoleCardProps = {
  user: AdminUser;
  isSelf: boolean;
  grants: readonly RoleGrant[];
  onAddGrant: () => void;
};

type RoleOptionRowProps = {
  option: RoleOption;
  isChecked: boolean;
  isLocked: boolean;
};

type RoleChange = {
  targetRole: UserRole;
  copy: RoleChangeCopy;
};

type RoleChangeDialogProps = {
  user: AdminUser;
  targetRole: UserRole;
  copy: RoleChangeCopy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ROLE_OPTIONS: readonly RoleOption[] = [
  { role: "user", icon: USER_ROLE_ICONS.user.icon },
  { role: "editor", icon: USER_ROLE_ICONS.editor.icon, tileClassName: ROLE_TONES.editor.badge },
  { role: "admin", icon: USER_ROLE_ICONS.admin.icon, tileClassName: ROLE_TONES.admin.badge },
];

function listGrantCountryNames(grants: readonly RoleGrant[], language: string): string[] {
  const countryCodes = new Set(grants.map((grant) => grant.countryCode));
  return [...countryCodes].map((countryCode) => getCountryName(countryCode, language)).sort((left, right) => left.localeCompare(right, language));
}

function describeRoleChange(t: TFunction, language: string, user: AdminUser, targetRole: UserRole, grants: readonly RoleGrant[]): RoleChangeCopy {
  const name = getAccountName(user);
  const countryNames = listGrantCountryNames(grants, language);

  if (targetRole === "admin") {
    return {
      title: t("admin:users.detail.roles.confirm.promoteAdmin.title"),
      description:
        countryNames.length > 0
          ? t("admin:users.detail.roles.confirm.promoteAdmin.descriptionWithGrants", { name, count: countryNames.length })
          : t("admin:users.detail.roles.confirm.promoteAdmin.description", { name }),
      confirmLabel: t("admin:users.detail.roles.confirm.grantLabel"),
      isDestructive: false,
    };
  }
  if (user.role === "admin") {
    return {
      title: t("admin:users.detail.roles.confirm.demoteAdmin.title"),
      description:
        targetRole === "editor"
          ? t("admin:users.detail.roles.confirm.demoteAdmin.toEditor", { name })
          : t("admin:users.detail.roles.confirm.demoteAdmin.toUser", { name }),
      confirmLabel: t("admin:users.detail.roles.confirm.revokeLabel"),
      isDestructive: true,
    };
  }

  return {
    title: t("admin:users.detail.roles.confirm.demoteEditor.title"),
    description:
      countryNames.length > 0
        ? t("admin:users.detail.roles.confirm.demoteEditor.descriptionWithGrants", {
            count: countryNames.length,
            countries: new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(countryNames),
          })
        : t("admin:users.detail.roles.confirm.demoteEditor.description", { name }),
    confirmLabel: t("admin:users.detail.roles.confirm.revokeLabel"),
    isDestructive: true,
  };
}

function RoleChangeDialog({ user, targetRole, copy, open, onOpenChange }: RoleChangeDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const roleMutation = useMutation({
    mutationFn: () => setUserRole(user.id, targetRole),
    onSuccess: (updatedUser) => {
      onOpenChange(false);
      storeUpdatedAccount(queryClient, updatedUser);
      toast.success(t("users.detail.roles.changeSuccess"));
    },
    onError: showUserAdminError,
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!roleMutation.isPending) onOpenChange(nextOpen);
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      destructive={copy.isDestructive}
      pending={roleMutation.isPending}
      onConfirm={() => roleMutation.mutate()}
    />
  );
}

function RoleOptionRow({ option, isChecked, isLocked }: RoleOptionRowProps) {
  const { t } = useTranslation("admin");

  return (
    <RadioPrimitive.Root
      value={option.role}
      render={<div />}
      className={cn(
        "flex items-center gap-3.5 border-t px-4 py-3.5 transition-colors first:border-t-0 sm:px-5",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        isChecked && "bg-muted/50",
        isLocked ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted/50",
        isLocked && !isChecked && "opacity-50",
      )}
    >
      <SettingsIconTile icon={option.icon} className={option.tileClassName} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5 font-medium">{getUserRoleLabel(t, option.role)}</p>
        <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t(`users.detail.roles.options.${option.role}`)}</p>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          isChecked ? "border-primary" : "border-input dark:bg-input/30",
        )}
      >
        {isChecked ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
    </RadioPrimitive.Root>
  );
}

export function RolesRoleCard({ user, isSelf, grants, onAddGrant }: RolesRoleCardProps) {
  const { t, i18n } = useTranslation("admin");
  const titleId = useId();
  const [roleChange, setRoleChange] = useState<RoleChange | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  function handleRolePick(pickedRole: UserRole) {
    if (pickedRole === user.role) return;
    if (user.role === "user" && pickedRole === "editor") {
      onAddGrant();
      return;
    }
    setRoleChange({ targetRole: pickedRole, copy: describeRoleChange(t, i18n.language, user, pickedRole, grants) });
    setIsConfirmOpen(true);
  }

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("users.table.role")} titleId={titleId} description={t("users.detail.roles.roleCard.description")} />
      <RadioGroupPrimitive value={user.role} onValueChange={handleRolePick} disabled={isSelf} aria-labelledby={titleId} className="border-t">
        {ROLE_OPTIONS.map((option) => (
          <RoleOptionRow key={option.role} option={option} isChecked={option.role === user.role} isLocked={isSelf} />
        ))}
      </RadioGroupPrimitive>
      {isSelf ? (
        <SettingsCardNote icon={LockIcon} className="mt-auto">
          {t("users.detail.roles.roleCard.lockedNote")}
        </SettingsCardNote>
      ) : (
        <SettingsCardNote className="mt-auto">{t("users.detail.roles.roleCard.note")}</SettingsCardNote>
      )}
      {roleChange === null ? null : (
        <RoleChangeDialog
          user={user}
          targetRole={roleChange.targetRole}
          copy={roleChange.copy}
          open={isConfirmOpen}
          onOpenChange={setIsConfirmOpen}
        />
      )}
    </SettingsCard>
  );
}
