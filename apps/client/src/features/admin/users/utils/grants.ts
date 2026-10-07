import type { TFunction } from "i18next";

import type { Country, CountryRegion, GrantRole, RoleGrant } from "../types";
import { getCountryName } from "@/lib/geo/countryName";

export const GRANT_ROLES = ["editor", "maintainer"] as const satisfies readonly GrantRole[];

export type RegionNameIndex = ReadonlyMap<number, string>;
export type CountryOption = { code: string; name: string };
type GrantScope = { kind: "country" } | { kind: "regions"; regions: { id: number; name: string }[] };

const GRANT_ROLE_ORDER: Record<GrantRole, number> = { maintainer: 0, editor: 1 };

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareGrants(left: RoleGrant, right: RoleGrant): number {
  return (
    GRANT_ROLE_ORDER[left.role] - GRANT_ROLE_ORDER[right.role] ||
    compareText(left.countryCode, right.countryCode) ||
    compareText(left.createdAt, right.createdAt)
  );
}

export function listCountryOptions(countries: readonly Country[], language: string): CountryOption[] {
  return countries
    .map((country) => ({ code: country.code, name: getCountryName(country.code, language) }))
    .sort((left, right) => left.name.localeCompare(right.name, language));
}

export function sortGrants(grants: readonly RoleGrant[]): RoleGrant[] {
  return [...grants].sort(compareGrants);
}

export function groupGrantsByUser(grants: readonly RoleGrant[]): Map<string, RoleGrant[]> {
  const grantsByUser = new Map<string, RoleGrant[]>();
  for (const grant of sortGrants(grants)) {
    const userGrants = grantsByUser.get(grant.userId);
    if (userGrants) userGrants.push(grant);
    else grantsByUser.set(grant.userId, [grant]);
  }
  return grantsByUser;
}

export function getRegionScopedCountryCodes(grants: readonly RoleGrant[]): string[] {
  const countryCodes = new Set<string>();
  for (const grant of grants) if (grant.regionIds !== null) countryCodes.add(grant.countryCode);
  return [...countryCodes].sort();
}

export function indexRegionNames(regions: readonly CountryRegion[]): RegionNameIndex {
  return new Map<number, string>(regions.map((region) => [region.id, region.name]));
}

export function getGrantScope(grant: Pick<RoleGrant, "regionIds">, regionNames: RegionNameIndex): GrantScope {
  if (grant.regionIds === null) return { kind: "country" };

  const regions = grant.regionIds
    .map((id) => ({ id, name: regionNames.get(id) ?? String(id) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { kind: "regions", regions };
}

export function getGrantRoleLabel(t: TFunction, role: GrantRole): string {
  return role === "maintainer" ? t("admin:users.shared.grantRoles.maintainer") : t("common:roles.editor");
}

export function getGrantChipLabel(t: TFunction, role: GrantRole, scope: GrantScope): string {
  if (role === "maintainer") return t("admin:users.shared.inline.maintainer");
  if (scope.kind === "country") return t("admin:users.shared.inline.wholeCountry");

  const [firstRegion, ...otherRegions] = scope.regions;
  if (firstRegion !== undefined && otherRegions.length === 0) return firstRegion.name;
  return t("main:userProfile.regionCount", { count: scope.regions.length });
}

export function describeGrant(t: TFunction, grant: RoleGrant, regionNames: RegionNameIndex): string {
  return `${grant.countryCode} ${getGrantChipLabel(t, grant.role, getGrantScope(grant, regionNames))}`;
}
