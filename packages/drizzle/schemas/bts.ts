import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  customType,
  date,
  doublePrecision,
  geometry,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const UKEPermissionType = pgEnum("uke_permission_type", ["zmP", "P"]);
export const DuplexType = pgEnum("duplex", ["FDD", "TDD", "SDL"]);
export const ratEnum = pgEnum("rat", ["GSM", "CDMA", "UMTS", "LTE", "NR", "IOT"]);
export const BandVariant = pgEnum("band_variant", ["commercial", "railway"]);
export const StationStatus = pgEnum("station_status", ["published", "inactive", "pending"]);
export const PermitsSource = pgEnum("permits_source", ["permits", "device_registry"]);
export const NRType = pgEnum("nr_type", ["nsa", "sa"]);
export const CellType = pgEnum("cell_type", ["MACROCELL", "MICROCELL", "PICOCELL", "FEMTOCELL"]);
export const UplinkType = pgEnum("uplink_type", ["fiber", "microwave", "satellite"]);
export const ContributionMode = pgEnum("contribution_mode", ["closed", "open"]);
export const PlmnRole = pgEnum("plmn_role", ["primary", "secondary"]);
export const OperatorLinkKind = pgEnum("operator_link_kind", ["jv_member"]);
export const StructureType = pgEnum("structure_type", [
  "lattice_tower",
  "tubular_tower",
  "concrete_tower",
  "tower",
  "mast",
  "rooftop_mast",
  "rooftop",
  "chimney",
  "church",
  "water_tower",
  "silo",
  "pole",
  "mobile_mast",
  "tunnel",
  "indoor",
  "other",
]);
export const UkeSchema = pgSchema("uke");
export const StatisticsSchema = pgSchema("statistics");

const multiPolygon = customType<{ data: string }>({ dataType: () => "geometry(MultiPolygon, 4326)" });
const polygon = customType<{ data: string }>({ dataType: () => "geometry(Polygon, 4326)" });

export const countries = pgTable(
  "countries",
  {
    code: char("code", { length: 2 }).primaryKey(),
    isVisible: boolean("is_visible").notNull().default(false),
    contributions: ContributionMode("contributions").notNull().default("closed"),
    viewWest: doublePrecision("view_west"),
    viewSouth: doublePrecision("view_south"),
    viewEast: doublePrecision("view_east"),
    viewNorth: doublePrecision("view_north"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("countries_code_format", sql`${t.code} ~ '^[A-Z]{2}$'`),
    check("countries_view_complete", sql`num_nulls(${t.viewWest}, ${t.viewSouth}, ${t.viewEast}, ${t.viewNorth}) IN (0, 4)`),
    check("countries_view_south_north", sql`${t.viewSouth} < ${t.viewNorth}`),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    color: char("color", { length: 7 }).notNull(),
    logoFile: varchar("logo_file", { length: 48 }),
    logoWidth: integer("logo_width"),
    logoHeight: integer("logo_height"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("brands_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("brands_color_format", sql`${t.color} ~ '^#[0-9A-F]{6}$'`),
    check("brands_logo_file_format", sql`${t.logoFile} ~ '^[0-9a-f-]{36}[.](svg|webp)$'`),
    check("brands_logo_complete", sql`num_nulls(${t.logoFile}, ${t.logoWidth}, ${t.logoHeight}) IN (0, 3)`),
  ],
);

/**
 * Operator table
 * @example
 * { id: 1, name: "NetWorks", full_name: "NetWorks Sp. z o.o.", parent_id: null, mnc_code: 26034 }
 * @example
 * { id: 2, name: "T-Mobile", full_name: "T-Mobile Polska Sp. z o.o.", parent_id: 1, mnc_code: 26002 }
 */
export const operators = pgTable(
  "operators",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    full_name: varchar("full_name", { length: 250 }).notNull(),
    parent_id: integer("parent_id").references((): AnyPgColumn => operators.id, { onDelete: "set null", onUpdate: "cascade" }),
    mnc: integer("mnc").unique(),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .default("PL")
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    brandId: integer("brand_id").references(() => brands.id, { onDelete: "restrict", onUpdate: "cascade" }),
    shortCode: varchar("short_code", { length: 16 }),
    sortPriority: integer("sort_priority"),
  },
  (t) => [
    index("operator_parent_id_idx").on(t.parent_id),
    index("operators_brand_id_idx").on(t.brandId),
    unique("operators_country_name_unique").on(t.countryCode, t.name),
    check("operators_short_code_not_blank", sql`btrim(${t.shortCode}) <> ''`),
    check("operators_sort_priority_positive", sql`${t.sortPriority} > 0`),
  ],
);

export const plmns = pgTable(
  "plmns",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    mcc: char("mcc", { length: 3 }).notNull(),
    mnc: varchar("mnc", { length: 3 }).notNull(),
    code: varchar("code", { length: 6 })
      .notNull()
      .generatedAlwaysAs((): SQL => sql`${plmns.mcc} || ${plmns.mnc}`),
    operatorId: integer("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade", onUpdate: "cascade" }),
    role: PlmnRole("role").notNull().default("secondary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("plmns_code_unique").on(t.code),
    uniqueIndex("plmns_operator_primary_unique")
      .on(t.operatorId)
      .where(sql`${t.role} = 'primary'`),
    index("plmns_operator_id_idx").on(t.operatorId),
    check("plmns_mcc_format", sql`${t.mcc} ~ '^[0-9]{3}$'`),
    check("plmns_mnc_format", sql`${t.mnc} ~ '^[0-9]{2,3}$'`),
  ],
);

export const operatorLinks = pgTable(
  "operator_links",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    operatorId: integer("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade", onUpdate: "cascade" }),
    relatedOperatorId: integer("related_operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade", onUpdate: "cascade" }),
    kind: OperatorLinkKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("operator_links_unique").on(t.operatorId, t.relatedOperatorId, t.kind),
    index("operator_links_related_operator_id_idx").on(t.relatedOperatorId),
    check("operator_links_not_self", sql`${t.operatorId} <> ${t.relatedOperatorId}`),
  ],
);

export const structureOwners = pgTable(
  "structure_owners",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    countryCode: char("country_code", { length: 2 }).references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    brandId: integer("brand_id").references(() => brands.id, { onDelete: "restrict", onUpdate: "cascade" }),
    operatorId: integer("operator_id").references(() => operators.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("structure_owners_country_name_unique")
      .on(t.countryCode, sql`lower(${t.name})`)
      .where(sql`${t.countryCode} IS NOT NULL`),
    uniqueIndex("structure_owners_global_name_unique")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.countryCode} IS NULL`),
    unique("structure_owners_operator_unique").on(t.operatorId),
    index("structure_owners_brand_id_idx").on(t.brandId),
  ],
);

/**
 * Regions table (Provinces)
 * @example
 * { id: 1, name: "Mazowieckie" }
 */
export const regions = pgTable(
  "regions",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 3 }).notNull(),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .default("PL")
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    isoCode: varchar("iso_code", { length: 6 }).unique(),
  },
  (t) => [
    unique("regions_country_name_unique").on(t.countryCode, t.name),
    unique("regions_country_code_unique").on(t.countryCode, t.code),
    check("regions_iso_code_format", sql`${t.isoCode} ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'`),
  ],
);

export const regionBoundaries = pgTable("region_boundaries", {
  regionId: integer("region_id")
    .primaryKey()
    .references(() => regions.id, { onDelete: "cascade", onUpdate: "cascade" }),
  geom: multiPolygon("geom").notNull(),
  source: varchar("source", { length: 200 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const regionLookup = pgTable(
  "region_lookup",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    regionId: integer("region_id")
      .notNull()
      .references(() => regionBoundaries.regionId, { onDelete: "cascade", onUpdate: "cascade" }),
    geom: polygon("geom").notNull(),
  },
  (t) => [index("region_lookup_geom_gist").using("gist", t.geom), index("region_lookup_region_id_idx").on(t.regionId)],
);

/**
 * Locations table (GPS coordinates)
 * @example
 * { id: 1, region_id: 1, city: "Warsaw", address: "ul. Marszałkowska 1", longitude: 52.2297, latitude: 21.0122 }
 */
export const locations = pgTable(
  "locations",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    region_id: integer("region_id")
      .references(() => regions.id, { onDelete: "restrict", onUpdate: "cascade" })
      .notNull(),
    city: varchar("city", { length: 100 }),
    address: text("address"),
    structure_type: StructureType("structure_type"),
    structure_owner_id: integer("structure_owner_id").references(() => structureOwners.id, { onDelete: "restrict", onUpdate: "cascade" }),
    structure_note: varchar("structure_note", { length: 150 }),
    longitude: doublePrecision("longitude").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    point: geometry("point", { type: "point", mode: "xy", srid: 4326 })
      .notNull()
      .generatedAlwaysAs((): SQL => sql`ST_SetSRID(ST_MakePoint(${locations.longitude}, ${locations.latitude}), 4326)`),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("locations_latitude_range", sql`${t.latitude} BETWEEN -90 AND 90`),
    check("locations_longitude_range", sql`${t.longitude} BETWEEN -180 AND 180`),
    index("locations_region_id_idx").on(t.region_id),
    index("locations_structure_owner_id_idx").on(t.structure_owner_id),
    index("locations_point_gist").using("gist", t.point),
    index("locations_idx").on(t.id),
    index("locations_created_at_idx").on(t.createdAt),
    index("locations_updated_at_idx").on(t.updatedAt),
    index("locations_city_fold_trgm_idx").using("gin", sql`fold_text(${t.city}) gin_trgm_ops`),
    index("locations_address_fold_trgm_idx").using("gin", sql`fold_text(${t.address}) gin_trgm_ops`),
    unique("locations_lonlat_unique").on(t.longitude, t.latitude),
  ],
);

/**
 * Locations table for UKE stations (GPS coordinates)
 * @example
 * { id: 1, region_id: 1, city: "Warsaw", address: "ul. Marszałkowska 1", longitude: 52.2297, latitude: 21.0122 }
 */
export const ukeLocations = UkeSchema.table(
  "uke_locations",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    region_id: integer("region_id")
      .references(() => regions.id, { onDelete: "restrict", onUpdate: "cascade" })
      .notNull(),
    city: varchar("city", { length: 100 }),
    address: text("address"),
    longitude: doublePrecision("longitude").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    point: geometry("point", { type: "point", mode: "xy", srid: 4326 })
      .notNull()
      .generatedAlwaysAs((): SQL => sql`ST_SetSRID(ST_MakePoint(${ukeLocations.longitude}, ${ukeLocations.latitude}), 4326)`),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("uke_locations_latitude_range", sql`${t.latitude} BETWEEN -90 AND 90`),
    check("uke_locations_longitude_range", sql`${t.longitude} BETWEEN -180 AND 180`),
    index("uke_locations_region_id_idx").on(t.region_id),
    index("uke_locations_point_gist").using("gist", t.point),
    index("uke_locations_created_at_idx").on(t.createdAt),
    index("uke_locations_updated_at_idx").on(t.updatedAt),
    index("uke_locations_last_touch_idx").using("btree", sql`GREATEST(${t.createdAt}, ${t.updatedAt})`),
    unique("uke_locations_lonlat_unique").on(t.longitude, t.latitude),
  ],
);

/**
 * Stations table
 * @example
 * { id: 1, station_id: "1234567890123456", location_id: 1, operator_id: 1, notes: "Test station", updatedAt: new Date(), createdAt: new Date(), is_confirmed: false }
 */
export const stations = pgTable(
  "stations",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    station_id: varchar("station_id", { length: 16 }).notNull(),
    location_id: integer("location_id").references(() => locations.id, { onDelete: "set null", onUpdate: "cascade" }),
    operator_id: integer("operator_id").references(() => operators.id, { onDelete: "set null", onUpdate: "cascade" }),
    notes: text("notes"),
    extra_address: text("extra_address"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    is_confirmed: boolean("is_confirmed").default(false),
    status: StationStatus("status").notNull().default("pending"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("station_location_id_idx").on(t.location_id),
    index("stations_published_location_idx")
      .on(t.location_id, t.id)
      .where(sql`${t.status} = 'published'`),
    index("stations_published_location_operator_idx")
      .on(t.location_id, t.operator_id, t.id)
      .where(sql`${t.status} = 'published'`),
    index("stations_operator_id_idx").on(t.operator_id),
    index("stations_operator_location_id_idx").on(t.operator_id, t.location_id, t.id),
    index("stations_station_id_trgm_idx").using("gin", sql`(${t.station_id}) gin_trgm_ops`),
    index("stations_station_id_idx").on(t.station_id),
    index("stations_updated_at_idx").on(t.updatedAt),
    index("stations_created_at_idx").on(t.createdAt),
    index("stations_inactive_status_changed_at_idx")
      .on(t.statusChangedAt)
      .where(sql`${t.status} = 'inactive'`),
    unique("stations_station_id_operator_unique").on(t.station_id, t.operator_id),
    check("stations_station_id_16_length", sql`${t.station_id} ~ '(^.{1,16}$)'`),
  ],
);

export const stationSectors = pgTable(
  "station_sectors",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    station_id: integer("station_id")
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    azimuth: integer("azimuth").notNull(),
  },
  (t) => [
    index("station_sectors_station_id_idx").on(t.station_id),
    unique("station_sectors_station_azimuth_unique").on(t.station_id, t.azimuth),
    check("station_sectors_azimuth_range", sql`${t.azimuth} BETWEEN 0 AND 360`),
  ],
);

export const stationUplinks = pgTable(
  "station_uplinks",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    station_id: integer("station_id")
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    type: UplinkType("type").notNull(),
    speed: integer("speed"),
    model: varchar("model", { length: 100 }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("station_uplinks_station_id_unique").on(t.station_id)],
);

/**
 * Stations permits table
 * @example
 * { id: 1, permit_id: 1, station_id: 1 }
 */
export const stationsPermits = pgTable(
  "stations_permits",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    permit_id: integer("permit_id").references(() => ukePermits.id, { onDelete: "cascade", onUpdate: "cascade" }),
    station_id: integer("station_id").references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (t) => [
    index("stations_permits_station_id_idx").on(t.station_id),
    index("stations_permits_permit_id_idx").on(t.permit_id),
    unique("stations_permits_pair_unique").on(t.station_id, t.permit_id),
  ],
);

export const extraIdentificators = pgTable(
  "extra_identificators",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    station_id: integer("station_id")
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    //* Nullable - Plus (26001) stations may only have mno_name without a networks_id
    networks_id: integer("networks_id"),
    networks_name: varchar("networks_name", { length: 50 }),
    mno_name: varchar("mno_name", { length: 50 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("extra_identificators_station_idx").on(t.station_id),
    index("extra_identificators_networks_id_trgm_idx").using("gin", sql`(${t.networks_id}::text) gin_trgm_ops`),
    index("extra_identificators_networks_name_trgm_idx").using("gin", sql`(${t.networks_name}) gin_trgm_ops`),
    index("extra_identificators_mno_name_trgm_idx").using("gin", sql`(${t.mno_name}) gin_trgm_ops`),
    unique("extra_identificators_networks_id_unique").on(t.station_id, t.networks_id).nullsNotDistinct(),
  ],
);

/**
 * UKE stations table
 * @example
 * { id: 1, station_id: "1234567890123456", location_id: 1, operator_id: 1, updatedAt: new Date(), createdAt: new Date() }
 */
export const ukeStations = UkeSchema.table(
  "uke_stations",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    station_id: varchar("station_id", { length: 16 }).notNull(),
    operator_id: integer("operator_id")
      .references(() => operators.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    location_id: integer("location_id")
      .references(() => ukeLocations.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uke_stations_station_operator_location_unique").on(t.station_id, t.operator_id, t.location_id),
    index("uke_stations_station_id_idx").on(t.station_id),
    index("uke_stations_station_id_trgm_idx").using("gin", sql`(${t.station_id}) gin_trgm_ops`),
    index("uke_stations_operator_id_idx").on(t.operator_id),
    index("uke_stations_operator_location_id_idx").on(t.operator_id, t.location_id),
    index("uke_stations_station_operator_id_idx").on(t.station_id, t.operator_id),
    index("uke_stations_location_id_idx").on(t.location_id),
    index("uke_stations_location_operator_id_idx").on(t.location_id, t.operator_id, t.id),
    index("uke_stations_updated_at_idx").on(t.updatedAt),
    index("uke_stations_created_at_idx").on(t.createdAt),
    check("uke_stations_station_id_16_length", sql`${t.station_id} ~ '(^.{1,16}$)'`),
  ],
);

/**
 * UKE permits table
 */
export const ukePermits = UkeSchema.table(
  "uke_permits",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    uke_station_id: integer("uke_station_id")
      .references(() => ukeStations.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    decision_number: varchar("decision_number", { length: 100 }).notNull(),
    decision_type: UKEPermissionType("decision_type").notNull(),
    expiry_date: timestamp({ withTimezone: true }).notNull(),
    band_id: integer("band_id")
      .references(() => bands.id, { onDelete: "restrict", onUpdate: "cascade" })
      .notNull(),
    source: PermitsSource("source").notNull().default("permits"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uke_permits_unique_permit").on(t.uke_station_id, t.band_id, t.decision_number, t.decision_type, t.expiry_date),
    index("uke_permits_uke_station_id_idx").on(t.uke_station_id),
    index("uke_permits_band_id_idx").on(t.band_id),
    index("uke_permits_decision_type_idx").on(t.decision_type),
    index("uke_permits_decision_number_trgm_idx").using("gin", sql`(${t.decision_number}) gin_trgm_ops`),
    index("uke_permits_uke_station_band_id_idx").on(t.uke_station_id, t.band_id, t.id),
    index("uke_permits_source_idx").on(t.source),
    index("uke_permits_uke_station_id_id_idx").on(t.uke_station_id, t.id),
    index("uke_permits_uke_station_created_at_idx").on(t.uke_station_id, t.createdAt),
    index("uke_permits_created_at_uke_station_idx").on(t.createdAt, t.uke_station_id),
    index("uke_permits_updated_at_uke_station_idx").on(t.updatedAt, t.uke_station_id),
  ],
);

export const AntennaType = pgEnum("antenna_type", ["indoor", "outdoor"]);

export const ukePermitSectors = UkeSchema.table(
  "uke_permit_sectors",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    permit_id: integer("permit_id")
      .references(() => ukePermits.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    azimuth: integer("azimuth"),
    elevation: integer("elevation"),
    antenna_height: doublePrecision("antenna_height"),
    antenna_type: AntennaType("antenna_type"),
  },
  (t) => [
    unique("uke_permit_sectors_unique").on(t.permit_id, t.azimuth, t.elevation, t.antenna_height, t.antenna_type),
    index("uke_permit_sectors_permit_id_idx").on(t.permit_id),
  ],
);

/**
 * Cells table
 * @example
 * { id: 1, station_id: 1, band_id: 1, lac: 123, cid: 456, cid_long: 123456789, arfcn: 1, is_confirmed: false, updatedAt: new Date(), createdAt: new Date() }
 */
export const cells = pgTable(
  "cells",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    station_id: integer("station_id")
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    band_id: integer("band_id")
      .references(() => bands.id, { onDelete: "restrict", onUpdate: "cascade" })
      .notNull(),
    rat: ratEnum("rat").notNull(),
    type: CellType("type"),
    notes: text("notes"),
    sector_id: integer("sector_id").references(() => stationSectors.id, { onDelete: "set null", onUpdate: "cascade" }),
    is_confirmed: boolean("is_confirmed").default(false).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cells_station_band_rat_idx").on(t.station_id, t.band_id, t.rat),
    index("cells_station_rat_idx").on(t.station_id, t.rat),
    index("cells_created_at_idx").on(t.createdAt, t.id),
    index("cells_updated_at_idx").on(t.updatedAt, t.id),
    index("cells_sector_id_idx")
      .on(t.sector_id)
      .where(sql`${t.sector_id} IS NOT NULL`),
  ],
);

export const gsmCells = pgTable(
  "gsm_cells",
  {
    cell_id: integer("cell_id")
      .primaryKey()
      .references(() => cells.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    lac: integer("lac").notNull(),
    cid: integer("cid").notNull(),
    e_gsm: boolean("e_gsm").default(false),
    bsic: integer("bsic"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("gsm_lac_check", sql`${t.lac} BETWEEN 0 AND 65535`),
    check("gsm_cid_check", sql`${t.cid} BETWEEN 0 AND 65535`),
    check("gsm_bsic_check", sql`${t.bsic} BETWEEN 0 AND 63`),
    unique("gsm_cells_lac_cid_unique").on(t.cell_id, t.lac, t.cid),
    index("gsm_cells_cid_idx").on(t.cid),
    index("gsm_cells_cid_trgm_idx").using("gin", sql`(${t.cid}::text) gin_trgm_ops`),
  ],
);

export const umtsCells = pgTable(
  "umts_cells",
  {
    cell_id: integer("cell_id")
      .primaryKey()
      .references(() => cells.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    lac: integer("lac"),
    arfcn: integer("arfcn"),
    rnc: integer("rnc").notNull(),
    cid: integer("cid").notNull(),
    cid_long: integer("cid_long")
      .notNull()
      .generatedAlwaysAs((): SQL => sql`(${umtsCells.rnc} * 65536) + ${umtsCells.cid}`),
    psc: integer("psc"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("umts_lac_check", sql`${t.lac} BETWEEN 0 AND 65535`),
    check("umts_rnc_check", sql`${t.rnc} BETWEEN 0 AND 65535`),
    check("umts_cid_check", sql`${t.cid} BETWEEN 0 AND 65535`),
    check("umts_arfcn_check", sql`${t.arfcn} BETWEEN 0 AND 16383`),
    check("umts_psc_check", sql`${t.psc} BETWEEN 0 AND 511`),
    unique("umts_cells_rnc_cid_unique").on(t.cell_id, t.rnc, t.cid),
    index("umts_cells_cid_idx").on(t.cid),
    index("umts_cells_cid_trgm_idx").using("gin", sql`(${t.cid}::text) gin_trgm_ops`),
    index("umts_cells_cid_long_trgm_idx").using("gin", sql`(${t.cid_long}::text) gin_trgm_ops`),
  ],
);

export const lteCells = pgTable(
  "lte_cells",
  {
    cell_id: integer("cell_id")
      .primaryKey()
      .references(() => cells.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    tac: integer("tac"),
    enbid: integer("enbid").notNull(),
    clid: integer("clid").notNull(),
    ecid: integer("ecid")
      .notNull()
      .generatedAlwaysAs((): SQL => sql`(${lteCells.enbid} * 256) + ${lteCells.clid}`),
    pci: integer("pci"),
    earfcn: integer("earfcn"),
    supports_iot: boolean("supports_iot").default(false),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("lte_tac_check", sql`${t.tac} BETWEEN 0 AND 65535`),
    check("clid_check", sql`${t.clid} BETWEEN 0 AND 255`),
    check("lte_enbid_check", sql`${t.enbid} BETWEEN 0 AND 1048575`),
    check("pci_check", sql`${t.pci} BETWEEN 0 AND 503`),
    check("lte_earfcn_check", sql`${t.earfcn} BETWEEN 0 AND 262143`),
    unique("lte_cells_enbid_clid_unique").on(t.cell_id, t.enbid, t.clid),
    index("lte_cells_iot_true_idx")
      .on(t.enbid, t.clid)
      .where(sql`${t.supports_iot} = true`),
    index("lte_cells_enbid_trgm_idx").using("gin", sql`(${t.enbid}::text) gin_trgm_ops`),
    index("lte_cells_ecid_trgm_idx").using("gin", sql`(${t.ecid}::text) gin_trgm_ops`),
  ],
);

export const nrCells = pgTable(
  "nr_cells",
  {
    cell_id: integer("cell_id")
      .primaryKey()
      .references(() => cells.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    nrtac: integer("nrtac"),
    gnbid: integer("gnbid"),
    gnbid_length: integer("gnbid_length").default(24),
    clid: integer("clid"),
    nci: bigint("nci", { mode: "bigint" }).generatedAlwaysAs(
      (): SQL => sql`(${nrCells.gnbid}::bigint * power(2, 36 - ${nrCells.gnbid_length})::bigint) + ${nrCells.clid}::bigint`,
    ),
    pci: integer("pci"),
    arfcn: integer("arfcn"),
    type: NRType("type").notNull(),
    supports_nr_redcap: boolean("supports_nr_redcap").default(false),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("nr_nrtac_check", sql`${t.nrtac} BETWEEN 0 AND 16777215`),
    check("nr_gnbid_check", sql`${t.gnbid} BETWEEN 0 AND 4294967295`),
    check("nr_clid_check", sql`${t.clid} BETWEEN 0 AND 16383`),
    check("nr_pci_check", sql`${t.pci} BETWEEN 0 AND 1007`),
    check("nr_arfcn_check", sql`${t.arfcn} BETWEEN 0 AND 3279165`),
    // unique("nr_cells_gnbid_clid_unique").on(t.gnbid, t.clid).nullsNotDistinct(),
    index("nr_cells_redcap_true_idx")
      .on(t.gnbid, t.clid)
      .where(sql`${t.supports_nr_redcap} = true`),
    index("nr_cells_gnbid_trgm_idx").using("gin", sql`(${t.gnbid}::text) gin_trgm_ops`),
    index("nr_cells_nci_trgm_idx").using("gin", sql`(${t.nci}::text) gin_trgm_ops`),
  ],
);
/**
 * Bands table
 * @example
 * { id: 1, value: 1800, name: "GSM 1800", duplex: "FDD" }
 */
export const bands = pgTable(
  "bands",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    value: integer("value"),
    rat: ratEnum("rat").notNull(),
    name: varchar("name", { length: 15 }).notNull(),
    duplex: DuplexType("duplex"),
    variant: BandVariant("variant").notNull().default("commercial"),
    code: varchar("code", { length: 16 }),
  },
  (t) => [
    unique("bands_rat_value_unique").on(t.rat, t.value, t.duplex, t.variant, t.code).nullsNotDistinct(),
    unique("bands_name_unique").on(t.name),
    uniqueIndex("bands_code_variant_unique")
      .on(t.code, t.variant)
      .where(sql`${t.code} IS NOT NULL`),
    index("bands_value_idx").on(t.value),
    index("bands_rat_idx").on(t.rat),
  ],
);

export const countryBands = pgTable(
  "country_bands",
  {
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    bandId: integer("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.countryCode, t.bandId] }), index("country_bands_band_id_idx").on(t.bandId)],
);

/**
 * radioLinesManufacturers table. For UKE microwave links table
 * @example
 * { id: 1, name: "Ericsson" }
 */
export const radioLinesManufacturers = UkeSchema.table("radiolines_manufacturers", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});

/**
 * Antenna types table. For UKE microwave links table
 * @example
 * { id: 1, name: "Antenna Type 1", manufacturer_id: 1 }
 */
export const radiolinesAntennaTypes = UkeSchema.table("radiolines_antenna_types", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  manufacturer_id: integer("manufacturer_id").references(() => radioLinesManufacturers.id, { onDelete: "set null", onUpdate: "cascade" }),
});

/**
 * Transmitter types table. For UKE microwave links table
 * @example
 * { id: 1, name: "Transmitter Type 1", manufacturer_id: 1 }
 */
export const radiolinesTransmitterTypes = UkeSchema.table("radiolines_transmitter_types", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  manufacturer_id: integer("manufacturer_id").references(() => radioLinesManufacturers.id, { onDelete: "set null", onUpdate: "cascade" }),
});

export const ukeOperators = UkeSchema.table("uke_operators", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: varchar("full_name", { length: 150 }).notNull(),
  full_name: varchar("name", { length: 250 }).notNull().unique(),
  brandId: integer("brand_id").references(() => brands.id, { onDelete: "restrict", onUpdate: "cascade" }),
});

/**
 * UKE microwave links table
 */
export const ukeRadiolines = UkeSchema.table(
  "uke_radiolines",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    tx_longitude: doublePrecision("tx_longitude").notNull(),
    tx_latitude: doublePrecision("tx_latitude").notNull(),
    tx_height: doublePrecision("tx_height").notNull(),
    tx_city: varchar("tx_city", { length: 100 }),
    tx_province: varchar("tx_province", { length: 50 }),
    tx_street: varchar("tx_street", { length: 200 }),
    tx_location_description: text("tx_location_description"),
    rx_longitude: doublePrecision("rx_longitude").notNull(),
    rx_latitude: doublePrecision("rx_latitude").notNull(),
    rx_height: doublePrecision("rx_height").notNull(),
    rx_city: varchar("rx_city", { length: 100 }),
    rx_province: varchar("rx_province", { length: 50 }),
    rx_street: varchar("rx_street", { length: 200 }),
    rx_location_description: text("rx_location_description"),
    freq: integer("freq").notNull(),
    ch_num: integer("ch_num"),
    plan_symbol: varchar("plan_symbol", { length: 50 }),
    ch_width: doublePrecision("ch_width"),
    polarization: varchar("polarization", { length: 10 }),
    modulation_type: varchar("modulation_type", { length: 50 }),
    //* This has to be in text varchar because UKE does not follow their own schema and types some bandwith in e.g. `2x1000` etc. If the value only has a number, it will be treated as Mb/s.
    bandwidth: varchar("bandwidth", { length: 100 }),
    tx_eirp: doublePrecision("tx_eirp"),
    tx_antenna_attenuation: doublePrecision("tx_antenna_attenuation"),
    tx_transmitter_type_id: integer("tx_transmitter_type_id").references(() => radiolinesTransmitterTypes.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    tx_antenna_type_id: integer("tx_antenna_type_id").references(() => radiolinesAntennaTypes.id, { onDelete: "set null", onUpdate: "cascade" }),
    tx_antenna_gain: doublePrecision("tx_antenna_gain"),
    tx_antenna_height: doublePrecision("tx_antenna_height"),
    rx_antenna_type_id: integer("rx_antenna_type_id").references(() => radiolinesAntennaTypes.id, { onDelete: "set null", onUpdate: "cascade" }),
    rx_antenna_gain: doublePrecision("rx_antenna_gain"),
    rx_antenna_height: doublePrecision("rx_antenna_height"),
    rx_noise_figure: doublePrecision("rx_noise_figure"),
    rx_atpc_attenuation: doublePrecision("rx_atpc_attenuation"),
    operator_id: integer("operator_id").references(() => ukeOperators.id, { onDelete: "set null", onUpdate: "cascade" }),
    physical_key: text("physical_key").notNull(),
    permit_number: varchar("permit_number", { length: 100 }).notNull(),
    decision_type: UKEPermissionType("decision_type").notNull(),
    issue_date: timestamp({ withTimezone: true }),
    expiry_date: timestamp({ withTimezone: true }).notNull(),
    //* Date of the UKE file the technical columns (modulation, bandwidth, equipment, gains...) were last read from. UKE sometimes publishes files without them, so it can be older than updatedAt or null for links that never had them
    specs_date: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uke_radiolines_natural_key").on(t.permit_number, t.physical_key),
    index("uke_radiolines_operator_id_idx").on(t.operator_id),
    index("uke_radiolines_physical_key_idx").on(t.physical_key),
    index("uke_radiolines_permit_number_idx").on(t.permit_number),
    index("uke_radiolines_permit_number_trgm_idx").using("gin", sql`(${t.permit_number}) gin_trgm_ops`),
    index("uke_radiolines_tx_point_gist").using("gist", sql`(ST_SetSRID(ST_MakePoint(${t.tx_longitude}, ${t.tx_latitude}), 4326))`),
    index("uke_radiolines_rx_point_gist").using("gist", sql`(ST_SetSRID(ST_MakePoint(${t.rx_longitude}, ${t.rx_latitude}), 4326))`),
    index("uke_radiolines_freq_idx").on(t.freq),
  ],
);

/**
 * UKE import metadata table
 * @example
 * { id: 1, import_type: "stations", file_list: ["https://uke.gov.pl/file1.xlsx", "https://uke.gov.pl/file2.xlsx"], last_import_date: new Date(), status: "success" }
 */
export const ukeImportMetadata = UkeSchema.table("uke_import_metadata", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  import_type: varchar("import_type", { length: 20 }).notNull(),
  file_list: text("file_list").notNull(),
  last_import_date: timestamp({ withTimezone: true }).notNull().defaultNow(),
  status: varchar("status", { length: 20 }).notNull(),
});

export const statsSnapshots = StatisticsSchema.table(
  "stats_snapshots",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    snapshot_date: timestamp("snapshot_date", { withTimezone: true }).notNull(),
    operator_id: integer("operator_id")
      .references(() => operators.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    band_id: integer("band_id").references(() => bands.id, { onDelete: "restrict", onUpdate: "cascade" }),
    unique_stations_count: integer("unique_stations_count").notNull(),
    permits_count: integer("permits_count").notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("stats_snapshots_date_operator_band_unique").on(t.snapshot_date, t.operator_id, t.band_id),
    uniqueIndex("stats_snapshots_date_operator_null_band_unique")
      .on(t.snapshot_date, t.operator_id)
      .where(sql`${t.band_id} IS NULL`),
    index("stats_snapshots_date_idx").on(t.snapshot_date),
    index("stats_snapshots_operator_id_idx").on(t.operator_id),
    index("stats_snapshots_date_operator_band_idx").on(t.snapshot_date, t.operator_id, t.band_id),
  ],
);

export const analyzerUsage = StatisticsSchema.table("analyzer_usage", {
  date: date("date").primaryKey(),
  count: integer("count").notNull().default(0),
});

export const contributionSnapshots = StatisticsSchema.table(
  "contribution_snapshots",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    snapshot_date: timestamp("snapshot_date", { withTimezone: true }).notNull(),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .default("PL")
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    totalStations: integer("total_stations").notNull().default(0),
    totalSectors: integer("total_sectors").notNull().default(0),
    totalExtraIds: integer("total_extra_ids").notNull().default(0),
    totalCells: integer("total_cells").notNull().default(0),
    totalCellsWithPCI: integer("total_cells_with_pci").notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("contribution_snapshots_date_country_unique").on(t.snapshot_date, t.countryCode)],
);

export const deletedEntries = pgTable(
  "deleted_entries",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    source_table: varchar("source_table", { length: 50 }).notNull(),
    source_id: integer("source_id").notNull(),
    source_type: varchar("source_type", { length: 50 }).notNull(),
    data: jsonb("data").notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
    import_id: integer("import_id").references(() => ukeImportMetadata.id, { onDelete: "set null", onUpdate: "cascade" }),
  },
  (t) => [
    index("deleted_entries_source_table_idx").on(t.source_table),
    index("deleted_entries_source_type_idx").on(t.source_type),
    index("deleted_entries_deleted_at_idx").on(t.deleted_at),
    index("deleted_entries_source_table_type_idx").on(t.source_table, t.source_type),
    index("deleted_entries_source_table_deleted_at_idx").on(t.source_table, t.deleted_at),
  ],
);
