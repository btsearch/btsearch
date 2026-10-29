import { AUDIT_ENTITIES, AUDIT_OPERATION_KINDS, type AuditEntity } from "@openbts/shared/audit";

const KIND_GROUP_ORDER = [
  "station",
  "cells",
  "location",
  "submission",
  "comment",
  "operator",
  "brand",
  "structure_owner",
  "band",
  "region",
  "country",
  "spectrum_holding",
  "grant",
  "user",
  "api_key",
  "passkey",
  "oauth_client",
  "oauth_consent",
  "list",
  "settings",
  "official",
  "official_source",
  "official_dataset",
  "licensee",
  "analyzer",
  "observations",
  "system",
  "revert",
];

const ENTITY_GROUP_ORDER = [
  "station",
  "locations_and_photos",
  "submission",
  "reference",
  "register",
  "observations",
  "users_and_access",
  "system",
] as const;

type AuditEntityGroup = (typeof ENTITY_GROUP_ORDER)[number];

const ENTITY_GROUP_BY_ENTITY: Record<AuditEntity, AuditEntityGroup> = {
  stations: "station",
  cells: "station",
  station_sectors: "station",
  extra_identificators: "station",
  station_uplinks: "station",
  station_comments: "station",
  locations: "locations_and_photos",
  location_photos: "locations_and_photos",
  station_photo_selections: "locations_and_photos",
  submissions: "submission",
  submission_photos: "submission",
  operators: "reference",
  brands: "reference",
  structure_owners: "reference",
  bands: "reference",
  country_bands: "reference",
  regions: "reference",
  countries: "reference",
  spectrum_holdings: "reference",
  official_sources: "register",
  official_datasets: "register",
  licensees: "register",
  uploads: "observations",
  device_revocations: "observations",
  device_weights: "observations",
  reading_blocks: "observations",
  vouches: "observations",
  contributor_blocks: "observations",
  blocked_quirk_rules: "observations",
  crowd_settings: "observations",
  observation_flags: "observations",
  site_ignores: "observations",
  site_links: "observations",
  users: "users_and_access",
  role_grants: "users_and_access",
  apikeys: "users_and_access",
  passkeys: "users_and_access",
  sessions: "users_and_access",
  accounts: "users_and_access",
  oauth_clients: "users_and_access",
  oauth_consents: "users_and_access",
  user_lists: "users_and_access",
  settings: "system",
};

function isAuditEntity(value: string): value is AuditEntity {
  return AUDIT_ENTITIES.some((entity) => entity === value);
}

const ENTITIES_IN_LISTED_ORDER = Object.keys(ENTITY_GROUP_BY_ENTITY).filter(isAuditEntity);

export const KIND_GROUPS = KIND_GROUP_ORDER.flatMap((key) => {
  const kinds = AUDIT_OPERATION_KINDS.filter((kind) => (key === "revert" ? kind === "revert" : kind.startsWith(`${key}.`)));
  return kinds.length > 0 ? [{ key, kinds }] : [];
});

export const ENTITY_GROUPS = ENTITY_GROUP_ORDER.map((key) => ({
  key,
  entities: ENTITIES_IN_LISTED_ORDER.filter((entity) => ENTITY_GROUP_BY_ENTITY[entity] === key),
}));
