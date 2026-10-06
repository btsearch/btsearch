import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showUserAdminError, storeUpdatedAccount } from "../../api/authAdmin";
import { invalidateUserAdminQueries } from "../../api/queryKeys";
import { REFERENCE_STALE_TIME, countryRegionsQueryOptions } from "../../api/reference";
import { createRoleGrant, updateRoleGrantRegions } from "../../api/roleGrants";
import type { AdminUser, GrantRole, RoleGrant, RoleGrantCreate } from "../../types";
import { type CountryOption, GRANT_ROLES, getGrantRoleLabel, listCountryOptions } from "../../utils/grants";
import { getAccountName } from "../../utils/identity";
import { GrantCountryTile } from "./grantCountryTile";
import { GrantRoleBadge } from "./grantRoleBadge";
import { DialogNote } from "./userDetailPrimitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineError } from "@/components/ui/error-state";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { RegionCombobox } from "@/features/shared/filterPanel";
import { countriesQueryOptions } from "@/features/shared/lookups";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type ScopeKind = "country" | "regions";
type RegionChoice = { countryCode: string | null; regionIds: number[] };

type GrantAddFormProps = {
  user: AdminUser;
  existingGrants: readonly RoleGrant[];
  isPending: boolean;
  onSubmit: (grant: RoleGrantCreate) => void;
  onCancel: () => void;
};

type GrantAddDialogProps = {
  user: AdminUser;
  existingGrants: readonly RoleGrant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type GrantScopeFormProps = {
  grant: RoleGrant;
  isPending: boolean;
  onSubmit: (regionIds: number[] | null) => void;
  onCancel: () => void;
};

type GrantScopeDialogProps = {
  user: AdminUser;
  grant: RoleGrant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type GrantScopeFieldsProps = {
  countryCode: string | null;
  scope: ScopeKind;
  regionIds: number[];
  isScopeLocked: boolean;
  onScopeChange: (scope: ScopeKind) => void;
  onRegionIdsChange: (regionIds: number[]) => void;
};

type GrantRegionsFieldProps = {
  countryCode: string | null;
  regionIds: number[];
  onChange: (regionIds: number[]) => void;
};

const NO_REGION_CHOICE: RegionChoice = { countryCode: null, regionIds: [] };
const FULL_WIDTH_SEGMENTS_CLASS = "flex w-full *:flex-1";
const COUNTRY_CODE_CLASS = cn(
  "inline-flex h-4.5 shrink-0 items-center self-center rounded-sm bg-muted px-1.5",
  "text-[0.625rem] leading-none font-bold tracking-[0.04em]",
);

function hasSameRegions(left: readonly number[] | null, right: readonly number[] | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.length !== right.length) return false;

  const rightRegionIds = new Set(right);
  return left.every((regionId) => rightRegionIds.has(regionId));
}

function GrantCountryLabel({ country }: { country: CountryOption }) {
  return (
    <>
      <span aria-hidden="true" className={COUNTRY_CODE_CLASS}>
        {country.code}
      </span>
      {country.name}
    </>
  );
}

function GrantRegionsField({ countryCode, regionIds, onChange }: GrantRegionsFieldProps) {
  const { t } = useTranslation("admin");
  const { data: regions, isError, isFetching, refetch } = useQuery(countryRegionsQueryOptions(countryCode === null ? [] : [countryCode]));

  return (
    <Field>
      <FieldTitle>{t("users.detail.grants.dialog.regions")}</FieldTitle>
      {countryCode === null ? (
        <FieldDescription>{t("users.detail.grants.dialog.regionsNeedCountry")}</FieldDescription>
      ) : regions !== undefined ? (
        <div>
          <RegionCombobox
            regions={regions}
            selectedRegions={regionIds}
            onChange={onChange}
            placeholder={t("users.detail.grants.dialog.regionsPlaceholder")}
          />
        </div>
      ) : isError ? (
        <InlineError size="sm" title={t("users.detail.grants.dialog.regionsLoadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
      ) : (
        <Skeleton className="h-8 w-full rounded-lg" />
      )}
      {countryCode !== null && regionIds.length === 0 ? <FieldDescription>{t("users.detail.grants.dialog.regionsHint")}</FieldDescription> : null}
    </Field>
  );
}

function GrantScopeFields({ countryCode, scope, regionIds, isScopeLocked, onScopeChange, onRegionIdsChange }: GrantScopeFieldsProps) {
  const { t } = useTranslation("admin");
  const scopeTitleId = useId();
  const scopeOptions: { value: ScopeKind; label: string }[] = [
    { value: "country", label: t("users.shared.grantScope.wholeCountry") },
    { value: "regions", label: t("users.detail.grants.dialog.scopeRegions") },
  ];

  return (
    <>
      <Field>
        <FieldTitle id={scopeTitleId}>{t("users.detail.grants.dialog.scope")}</FieldTitle>
        <SegmentedControl
          value={scope}
          options={scopeOptions}
          onValueChange={onScopeChange}
          ariaLabelledBy={scopeTitleId}
          disabled={isScopeLocked}
          className={FULL_WIDTH_SEGMENTS_CLASS}
        />
        {isScopeLocked ? <FieldDescription>{t("users.detail.grants.dialog.maintainerScopeHint")}</FieldDescription> : null}
      </Field>
      {scope === "regions" ? <GrantRegionsField countryCode={countryCode} regionIds={regionIds} onChange={onRegionIdsChange} /> : null}
    </>
  );
}

function GrantAddForm({ user, existingGrants, isPending, onSubmit, onCancel }: GrantAddFormProps) {
  const { t, i18n } = useTranslation("admin");
  const countryTitleId = useId();
  const roleTitleId = useId();
  const [role, setRole] = useState<GrantRole>("editor");
  const [pickedCountryCode, setPickedCountryCode] = useState<string | null>(null);
  const [pickedScope, setPickedScope] = useState<ScopeKind>("country");
  const [regionChoice, setRegionChoice] = useState(NO_REGION_CHOICE);
  const {
    data: countries,
    isError: hasCountriesLoadFailed,
    isFetching: isFetchingCountries,
    refetch: refetchCountries,
  } = useQuery({ ...countriesQueryOptions(), staleTime: REFERENCE_STALE_TIME });

  const takenCountryCodes = new Set(existingGrants.filter((grant) => grant.role === role).map((grant) => grant.countryCode));
  const countryOptions = listCountryOptions(countries ?? [], i18n.language).filter((country) => !takenCountryCodes.has(country.code));
  const pickedCountry = countryOptions.find((country) => country.code === pickedCountryCode);
  const selectedCountry = pickedCountry ?? (countryOptions.length === 1 ? countryOptions[0] : undefined);
  const countryCode = selectedCountry?.code ?? null;
  const isMaintainer = role === "maintainer";
  const scope = isMaintainer ? "country" : pickedScope;
  const regionIds = regionChoice.countryCode === countryCode ? regionChoice.regionIds : NO_REGION_CHOICE.regionIds;
  const roleOptions = GRANT_ROLES.map((grantRole) => ({ value: grantRole, label: getGrantRoleLabel(t, grantRole) }));
  const canSubmit = countryCode !== null && (scope === "country" || regionIds.length > 0) && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (countryCode === null || !canSubmit) return;
    onSubmit({ userId: user.id, role, countryCode, regionIds: scope === "country" ? null : regionIds });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("users.detail.grants.addGrant")}</DialogTitle>
        <DialogDescription>{t("users.detail.grants.dialog.addDescription", { name: getAccountName(user) })}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldTitle id={countryTitleId}>{t("users.detail.grants.dialog.country")}</FieldTitle>
        {countries !== undefined ? (
          <Select value={countryCode} onValueChange={(code) => setPickedCountryCode(code)} disabled={countryOptions.length === 0}>
            <SelectTrigger aria-labelledby={countryTitleId} className="w-full cursor-pointer">
              <SelectValue placeholder={t("users.detail.grants.dialog.countryPlaceholder")}>
                {selectedCountry ? <GrantCountryLabel country={selectedCountry} /> : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {countryOptions.map((country) => (
                <SelectItem key={country.code} value={country.code} className="cursor-pointer">
                  <GrantCountryLabel country={country} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : hasCountriesLoadFailed ? (
          <InlineError
            size="sm"
            title={t("users.detail.grants.dialog.countriesLoadFailed")}
            onRetry={() => void refetchCountries()}
            isRetrying={isFetchingCountries}
          />
        ) : (
          <Skeleton className="h-8 w-full rounded-lg" />
        )}
        {countries !== undefined && countryOptions.length === 0 ? (
          <FieldDescription>{t("users.detail.grants.dialog.noCountries")}</FieldDescription>
        ) : null}
      </Field>
      <Field>
        <FieldTitle id={roleTitleId}>{t("users.detail.grants.dialog.role")}</FieldTitle>
        <SegmentedControl
          value={role}
          options={roleOptions}
          onValueChange={setRole}
          ariaLabelledBy={roleTitleId}
          className={FULL_WIDTH_SEGMENTS_CLASS}
        />
        <FieldDescription>{t(`users.detail.grants.dialog.roleHints.${role}`)}</FieldDescription>
      </Field>
      <GrantScopeFields
        countryCode={countryCode}
        scope={scope}
        regionIds={regionIds}
        isScopeLocked={isMaintainer}
        onScopeChange={setPickedScope}
        onRegionIdsChange={(nextRegionIds) => setRegionChoice({ countryCode, regionIds: nextRegionIds })}
      />
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={!canSubmit}>
          {isPending ? <Spinner /> : null}
          {t("users.detail.grants.addGrant")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function GrantAddDialog({ user, existingGrants, open, onOpenChange }: GrantAddDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [shownGrants, setShownGrants] = useState(existingGrants);
  if (open && shownGrants !== existingGrants) setShownGrants(existingGrants);

  const createMutation = useMutation({
    mutationFn: (grant: RoleGrantCreate) => createRoleGrant(grant),
    onSuccess: () => {
      onOpenChange(false);
      if (user.role === "editor") void invalidateUserAdminQueries(queryClient, user.id);
      else storeUpdatedAccount(queryClient, { ...user, role: "editor" });
      toast.success(t("users.detail.grants.dialog.addSuccess"));
    },
    onError: showUserAdminError,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!createMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <GrantAddForm
          user={user}
          existingGrants={shownGrants}
          isPending={createMutation.isPending}
          onSubmit={(grant) => createMutation.mutate(grant)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function GrantScopeForm({ grant, isPending, onSubmit, onCancel }: GrantScopeFormProps) {
  const { t, i18n } = useTranslation("admin");
  const [scope, setScope] = useState<ScopeKind>(grant.regionIds === null ? "country" : "regions");
  const [regionIds, setRegionIds] = useState<number[]>(grant.regionIds ?? []);

  const nextRegionIds = scope === "country" ? null : regionIds;
  const hasChanges = !hasSameRegions(grant.regionIds, nextRegionIds);
  const canSubmit = hasChanges && (nextRegionIds === null || nextRegionIds.length > 0) && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit(nextRegionIds);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("users.detail.grants.changeScope")}</DialogTitle>
      </DialogHeader>
      <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
        <GrantCountryTile code={grant.countryCode} />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm leading-5 font-medium">{getCountryName(grant.countryCode, i18n.language)}</p>
          <GrantRoleBadge role={grant.role} />
        </div>
      </div>
      <GrantScopeFields
        countryCode={grant.countryCode}
        scope={scope}
        regionIds={regionIds}
        isScopeLocked={false}
        onScopeChange={setScope}
        onRegionIdsChange={setRegionIds}
      />
      <DialogNote>{t("users.detail.grants.dialog.fixedNote")}</DialogNote>
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={!canSubmit}>
          {isPending ? <Spinner /> : null}
          {t("common:actions.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function GrantScopeDialog({ user, grant, open, onOpenChange }: GrantScopeDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (nextRegionIds: number[] | null) => updateRoleGrantRegions(grant.id, nextRegionIds),
    onSuccess: () => {
      onOpenChange(false);
      void invalidateUserAdminQueries(queryClient, user.id);
      toast.success(t("users.detail.grants.dialog.editSuccess"));
    },
    onError: showUserAdminError,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!updateMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <GrantScopeForm
          key={grant.id}
          grant={grant}
          isPending={updateMutation.isPending}
          onSubmit={(nextRegionIds) => updateMutation.mutate(nextRegionIds)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
