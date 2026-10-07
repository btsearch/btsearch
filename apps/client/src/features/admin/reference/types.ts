import type { RoleGrant, UserRef } from "@openbts/shared/contract";

export type {
  Band,
  BandCreate,
  BandRat,
  BandUpdate,
  Brand,
  BrandCreate,
  BrandLogo,
  BrandUpdate,
  ContributionMode,
  Country,
  CountryBand,
  CountryCreate,
  CountryFeatures,
  CountryStatistics,
  CountryUpdate,
  CountryView,
  GrantRole,
  Operator,
  OperatorCreate,
  OperatorLinkInput,
  OperatorUpdate,
  Plmn,
  PlmnInput,
  PlmnRole,
  Region,
  RegionCreate,
  RegionUpdate,
  StationBreakdownRow,
  StructureOwner,
  StructureOwnerCreate,
  StructureOwnerUpdate,
} from "@openbts/shared/contract";

export type TeamGrant = Omit<RoleGrant, "user"> & { user: UserRef | null };

export type BreakdownDimension = "region" | "operator" | "band";
