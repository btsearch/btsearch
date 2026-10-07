import type { QueryClient } from "@tanstack/react-query";

import type { BreakdownDimension } from "../types";
import { userAdminKeys } from "@/features/admin/users/api/queryKeys";

const REFERENCE_ROOT = ["admin", "reference"] as const;
const COUNTRY_RECORDS_KEY = [...REFERENCE_ROOT, "countries"] as const;
const OPERATOR_RECORDS_KEY = [...REFERENCE_ROOT, "operators"] as const;
const BAND_PLANS_KEY = [...REFERENCE_ROOT, "band-plans"] as const;
const TEAM_KEY = [...REFERENCE_ROOT, "team"] as const;
const APP_OPERATORS_KEY = ["operators"] as const;
const APP_BANDS_KEY = ["bands"] as const;
const APP_REGIONS_KEY = ["regions"] as const;
const APP_BRANDS_KEY = ["brands"] as const;
const APP_COUNTRIES_KEY = ["countries"] as const;
const USER_ADMIN_REGION_LISTS_KEY = userAdminKeys.countryRegions([]).slice(0, -1);

export const REFERENCE_LIST_STALE_TIME = 1000 * 60 * 5;

export const referenceKeys = {
  all: REFERENCE_ROOT,
  country: (code: string) => [...COUNTRY_RECORDS_KEY, code] as const,
  bandPlan: (countryCode: string) => [...BAND_PLANS_KEY, countryCode] as const,
  operator: (id: number) => [...OPERATOR_RECORDS_KEY, id] as const,
  structureOwners: () => [...REFERENCE_ROOT, "structure-owners"] as const,
  countryStatistics: () => [...REFERENCE_ROOT, "statistics", "countries"] as const,
  stationBreakdown: (dimension: BreakdownDimension) => [...REFERENCE_ROOT, "statistics", "stations", dimension] as const,
  teamGrants: (countryCodes: readonly string[]) => [...TEAM_KEY, countryCodes] as const,
  regionLocationCount: (regionId: number) => [...REFERENCE_ROOT, "usage", "region", regionId] as const,
  ownerLocationCount: (ownerId: number) => [...REFERENCE_ROOT, "usage", "owner", ownerId] as const,
};

export async function invalidateCountries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: COUNTRY_RECORDS_KEY }),
    queryClient.invalidateQueries({ queryKey: referenceKeys.countryStatistics() }),
    queryClient.invalidateQueries({ queryKey: APP_COUNTRIES_KEY }),
  ]);
}

export async function invalidateRegions(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: USER_ADMIN_REGION_LISTS_KEY }),
    queryClient.invalidateQueries({ queryKey: APP_REGIONS_KEY }),
  ]);
}

export async function invalidateBandPlan(queryClient: QueryClient, countryCode: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: referenceKeys.bandPlan(countryCode) });
}

export async function invalidateBands(queryClient: QueryClient): Promise<void> {
  await Promise.all([queryClient.invalidateQueries({ queryKey: BAND_PLANS_KEY }), queryClient.invalidateQueries({ queryKey: APP_BANDS_KEY })]);
}

export async function invalidateBrands(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: APP_BRANDS_KEY });
}

export async function invalidateOperators(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: OPERATOR_RECORDS_KEY }),
    queryClient.invalidateQueries({ queryKey: referenceKeys.structureOwners() }),
    queryClient.invalidateQueries({ queryKey: APP_OPERATORS_KEY }),
  ]);
}

export async function invalidateStructureOwners(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: referenceKeys.structureOwners() });
}

export async function invalidateTeam(queryClient: QueryClient): Promise<void> {
  await Promise.all([queryClient.invalidateQueries({ queryKey: TEAM_KEY }), queryClient.invalidateQueries({ queryKey: userAdminKeys.grants() })]);
}

export function removeCountryQueries(queryClient: QueryClient, countryCode: string): void {
  queryClient.removeQueries({ queryKey: referenceKeys.country(countryCode) });
  queryClient.removeQueries({ queryKey: referenceKeys.bandPlan(countryCode) });
}

export function removeOperatorQueries(queryClient: QueryClient, operatorId: number): void {
  queryClient.removeQueries({ queryKey: referenceKeys.operator(operatorId) });
}
