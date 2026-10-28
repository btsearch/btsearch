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
  foreignKey,
  geometry,
  index,
  integer,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const OfficialDecisionType = pgEnum("official_decision_type", ["permit_change", "permit"]);
export const DuplexType = pgEnum("duplex", ["FDD", "TDD", "SDL"]);
export const ratEnum = pgEnum("rat", ["GSM", "CDMA", "UMTS", "LTE", "NR", "IOT"]);
export const BandVariant = pgEnum("band_variant", ["commercial", "railway"]);
export const StationStatus = pgEnum("station_status", ["published", "inactive", "pending"]);
export const NRType = pgEnum("nr_type", ["nsa", "sa"]);
export const CellType = pgEnum("cell_type", ["MACROCELL", "MICROCELL", "PICOCELL", "FEMTOCELL"]);
export const BackhaulMedium = pgEnum("uplink_type", ["fiber", "microwave", "satellite", "xdsl"]);
export const ContributionMode = pgEnum("contribution_mode", ["closed", "open"]);
export const CountryTool = pgEnum("country_tool", ["analyzer", "measurements"]);
export const PlmnRole = pgEnum("plmn_role", ["primary", "secondary"]);
export const OperatorLinkKind = pgEnum("operator_link_kind", ["jv_member"]);
export const OfficialLayer = pgEnum("official_layer", ["sites", "microwave_links"]);
export const OfficialPermitKind = pgEnum("official_permit_kind", [
  "permit",
  "registration",
  "inventory",
  "environmental_permit",
  "certificate",
  "assessment",
  "licence",
]);
export const OfficialPermitStatus = pgEnum("official_permit_status", ["approved", "in_service"]);
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
export const OfficialSchema = pgSchema("official");
export const StatisticsSchema = pgSchema("statistics");

const multiPolygon = customType<{ data: string }>({ dataType: () => "geometry(MultiPolygon, 4326)" });
const polygon = customType<{ data: string }>({ dataType: () => "geometry(Polygon, 4326)" });

export const countries = pgTable(
  "countries",
  {
    code: char("code", { length: 2 }).primaryKey(),
    isVisible: boolean("is_visible").notNull().default(false),
    contributions: ContributionMode("contributions").notNull().default("closed"),
    tools: CountryTool("tools").array().notNull().default(["analyzer", "measurements"]),
    structureOwnerProposals: boolean("structure_owner_proposals").notNull().default(true),
    psc: boolean("psc").notNull().default(false),
    bsic: boolean("bsic").notNull().default(false),
    observationsPublic: boolean("observations_public").notNull().default(true),
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
    index("locations_point_geography_gist").using("gist", sql`(${t.point}::geography)`),
    index("locations_idx").on(t.id),
    index("locations_created_at_idx").on(t.createdAt),
    index("locations_updated_at_idx").on(t.updatedAt),
    index("locations_city_fold_trgm_idx").using("gin", sql`fold_text(${t.city}) gin_trgm_ops`),
    index("locations_address_fold_trgm_idx").using("gin", sql`fold_text(${t.address}) gin_trgm_ops`),
    unique("locations_lonlat_unique").on(t.longitude, t.latitude),
  ],
);

/**
 * Locations table for official sites (GPS coordinates)
 * @example
 * { id: 1, region_id: 1, city: "Warsaw", address: "ul. Marszałkowska 1", longitude: 52.2297, latitude: 21.0122 }
 */
export const officialLocations = OfficialSchema.table(
  "locations",
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
      .generatedAlwaysAs((): SQL => sql`ST_SetSRID(ST_MakePoint(${officialLocations.longitude}, ${officialLocations.latitude}), 4326)`),
    precision_meters: integer("precision_meters"),
    source_id: integer("source_id")
      .references(() => officialSources.id, { onDelete: "restrict", onUpdate: "cascade" })
      .notNull(),
    source_ref: varchar("source_ref", { length: 128 }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("locations_latitude_range", sql`${t.latitude} BETWEEN -90 AND 90`),
    check("locations_longitude_range", sql`${t.longitude} BETWEEN -180 AND 180`),
    check("locations_precision_positive", sql`${t.precision_meters} > 0`),
    index("locations_region_id_idx").on(t.region_id),
    index("locations_point_gist").using("gist", t.point),
    index("locations_created_at_idx").on(t.createdAt),
    index("locations_updated_at_idx").on(t.updatedAt),
    index("locations_last_touch_idx").using("btree", sql`GREATEST(${t.createdAt}, ${t.updatedAt})`),
    uniqueIndex("locations_source_lonlat_unique")
      .on(t.source_id, t.longitude, t.latitude)
      .where(sql`${t.source_ref} IS NULL`),
    uniqueIndex("locations_source_source_ref_unique")
      .on(t.source_id, t.source_ref)
      .where(sql`${t.source_ref} IS NOT NULL`),
    unique("locations_id_source_unique").on(t.id, t.source_id),
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

export const stationBackhauls = pgTable(
  "station_uplinks",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    station_id: integer("station_id")
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    type: BackhaulMedium("type").notNull(),
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
    permit_id: integer("permit_id")
      .references(() => officialPermits.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    station_id: integer("station_id")
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
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
 * Official sites table
 * @example
 * { id: 1, station_id: "1234567890123456", location_id: 1, operator_id: 1, updatedAt: new Date(), createdAt: new Date() }
 */
export const officialSites = OfficialSchema.table(
  "sites",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    station_id: varchar("site_id", { length: 16 }),
    operator_id: integer("operator_id")
      .references(() => operators.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    location_id: integer("location_id").notNull(),
    source_id: integer("source_id")
      .references(() => officialSources.id, { onDelete: "restrict", onUpdate: "cascade" })
      .notNull(),
    source_ref: varchar("source_ref", { length: 128 }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "sites_location_source_fkey",
      columns: [t.location_id, t.source_id],
      foreignColumns: [officialLocations.id, officialLocations.source_id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("sites_source_site_operator_unique")
      .on(t.source_id, t.station_id, t.operator_id)
      .where(sql`${t.source_ref} IS NULL`),
    uniqueIndex("sites_source_source_ref_unique")
      .on(t.source_id, t.source_ref)
      .where(sql`${t.source_ref} IS NOT NULL`),
    index("sites_site_id_idx").on(t.station_id),
    index("sites_site_id_trgm_idx").using("gin", sql`(${t.station_id}) gin_trgm_ops`),
    index("sites_operator_id_idx").on(t.operator_id),
    index("sites_operator_location_id_idx").on(t.operator_id, t.location_id),
    index("sites_site_operator_id_idx").on(t.station_id, t.operator_id),
    index("sites_location_id_idx").on(t.location_id),
    index("sites_location_operator_id_idx").on(t.location_id, t.operator_id, t.id),
    index("sites_updated_at_idx").on(t.updatedAt),
    index("sites_created_at_idx").on(t.createdAt),
    check("sites_site_id_16_length", sql`${t.station_id} ~ '(^.{1,16}$)'`),
    check("sites_site_id_or_source_ref", sql`${t.station_id} IS NOT NULL OR ${t.source_ref} IS NOT NULL`),
  ],
);

export const officialPermits = OfficialSchema.table(
  "permits",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    official_site_id: integer("official_site_id")
      .references(() => officialSites.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    decision_number: varchar("decision_number", { length: 100 }),
    decision_type: OfficialDecisionType("decision_type"),
    expiry_date: date({ mode: "string" }),
    rat: ratEnum("rat"),
    label_mhz: integer("label_mhz"),
    label_variant: BandVariant("label_variant"),
    status: OfficialPermitStatus("status"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("permits_label_shape", sql`num_nulls(${t.label_mhz}, ${t.label_variant}) IN (0, 2) AND (${t.label_mhz} IS NULL OR ${t.rat} IS NOT NULL)`),
    unique("permits_unique_permit")
      .on(t.official_site_id, t.rat, t.label_mhz, t.label_variant, t.decision_number, t.decision_type, t.expiry_date)
      .nullsNotDistinct(),
    index("permits_official_site_id_idx").on(t.official_site_id),
    index("permits_label_idx").on(t.rat, t.label_mhz, t.label_variant),
    index("permits_decision_type_idx").on(t.decision_type),
    index("permits_decision_number_trgm_idx").using("gin", sql`(${t.decision_number}) gin_trgm_ops`),
    index("permits_official_site_label_id_idx").on(t.official_site_id, t.rat, t.label_mhz, t.label_variant, t.id),
    index("permits_official_site_id_id_idx").on(t.official_site_id, t.id),
    index("permits_official_site_created_at_idx").on(t.official_site_id, t.createdAt),
    index("permits_created_at_official_site_idx").on(t.createdAt, t.official_site_id),
    index("permits_updated_at_official_site_idx").on(t.updatedAt, t.official_site_id),
  ],
);

export const AntennaType = pgEnum("antenna_type", ["indoor", "outdoor"]);

export const officialPermitSectors = OfficialSchema.table(
  "permit_sectors",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    permit_id: integer("permit_id")
      .references(() => officialPermits.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    azimuth: integer("azimuth"),
    antenna_height: doublePrecision("antenna_height"),
    antenna_type: AntennaType("antenna_type"),
  },
  (t) => [
    unique("permit_sectors_unique").on(t.permit_id, t.azimuth, t.antenna_height, t.antenna_type),
    index("permit_sectors_permit_id_idx").on(t.permit_id),
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
    index("gsm_cells_cid_idx").on(t.cid),
    index("gsm_cells_lac_cid_idx").on(t.lac, t.cid),
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
    index("umts_cells_cid_idx").on(t.cid),
    index("umts_cells_rnc_cid_idx").on(t.rnc, t.cid),
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
    index("lte_cells_enbid_clid_idx").on(t.enbid, t.clid),
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
    gnbid: bigint("gnbid", { mode: "number" }),
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
    index("nr_cells_nci_idx").on(t.nci),
    index("nr_cells_gnbid_clid_idx").on(t.gnbid, t.clid),
    index("nr_cells_redcap_true_idx")
      .on(t.gnbid, t.clid)
      .where(sql`${t.supports_nr_redcap} = true`),
    index("nr_cells_gnbid_trgm_idx").using("gin", sql`(${t.gnbid}::text) gin_trgm_ops`),
    index("nr_cells_nci_trgm_idx").using("gin", sql`(${t.nci}::text) gin_trgm_ops`),
  ],
);

export const cellPlmns = pgTable(
  "cell_plmns",
  {
    cellId: integer("cell_id")
      .notNull()
      .references(() => cells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    plmnId: integer("plmn_id")
      .notNull()
      .references(() => plmns.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cellId, t.plmnId] }), index("cell_plmns_plmn_id_idx").on(t.plmnId)],
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
    check(
      "bands_real_band_check",
      sql`${t.rat} IN ('GSM', 'UMTS', 'LTE', 'NR') AND (${t.rat} = 'GSM' OR ${t.duplex} IS NOT NULL OR ${t.value} IS NOT DISTINCT FROM 0)`,
    ),
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

export const spectrumHoldings = pgTable(
  "spectrum_holdings",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    operatorId: integer("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "restrict", onUpdate: "cascade" }),
    jointOperatorId: integer("joint_operator_id").references(() => operators.id, { onDelete: "restrict", onUpdate: "cascade" }),
    bandId: integer("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "restrict", onUpdate: "cascade" }),
    regionId: integer("region_id").references(() => regions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    downlinkLowKhz: integer("dl_low_khz").notNull(),
    downlinkHighKhz: integer("dl_high_khz").notNull(),
    uplinkLowKhz: integer("ul_low_khz"),
    uplinkHighKhz: integer("ul_high_khz"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    source: varchar("source", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("spectrum_holdings_operator_id_idx").on(t.operatorId),
    index("spectrum_holdings_joint_operator_id_idx").on(t.jointOperatorId),
    index("spectrum_holdings_band_id_idx").on(t.bandId),
    index("spectrum_holdings_region_id_idx").on(t.regionId),
    check("spectrum_holdings_joint_operator_distinct", sql`${t.jointOperatorId} <> ${t.operatorId}`),
    check("spectrum_holdings_downlink_order", sql`${t.downlinkLowKhz} < ${t.downlinkHighKhz}`),
    check("spectrum_holdings_uplink_complete", sql`num_nulls(${t.uplinkLowKhz}, ${t.uplinkHighKhz}) IN (0, 2)`),
    check("spectrum_holdings_uplink_order", sql`${t.uplinkLowKhz} < ${t.uplinkHighKhz}`),
    check("spectrum_holdings_validity_order", sql`${t.validFrom} <= ${t.validTo}`),
    check("spectrum_holdings_source_not_blank", sql`btrim(${t.source}) <> ''`),
  ],
);

/**
 * Manufacturers table. For the official microwave links table
 * @example
 * { id: 1, name: "Ericsson" }
 */
export const microwaveLinkManufacturers = OfficialSchema.table("microwave_link_manufacturers", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});

/**
 * Antenna types table. For the official microwave links table
 * @example
 * { id: 1, name: "Antenna Type 1", manufacturer_id: 1 }
 */
export const microwaveLinkAntennaTypes = OfficialSchema.table("microwave_link_antenna_types", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  manufacturer_id: integer("manufacturer_id").references(() => microwaveLinkManufacturers.id, {
    name: "microwave_link_antenna_types_manufacturer_fkey",
    onDelete: "set null",
    onUpdate: "cascade",
  }),
});

/**
 * Transmitter types table. For the official microwave links table
 * @example
 * { id: 1, name: "Transmitter Type 1", manufacturer_id: 1 }
 */
export const microwaveLinkTransmitterTypes = OfficialSchema.table("microwave_link_transmitter_types", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  manufacturer_id: integer("manufacturer_id").references(() => microwaveLinkManufacturers.id, {
    name: "microwave_link_transmitter_types_manufacturer_fkey",
    onDelete: "set null",
    onUpdate: "cascade",
  }),
});

export const licensees = OfficialSchema.table(
  "licensees",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    full_name: varchar("legal_name", { length: 250 }).notNull(),
    brandId: integer("brand_id").references(() => brands.id, { onDelete: "restrict", onUpdate: "cascade" }),
    sourceId: integer("source_id")
      .references(() => officialSources.id, { onDelete: "restrict", onUpdate: "cascade" })
      .notNull(),
    operatorId: integer("operator_id").references(() => operators.id, { onDelete: "set null", onUpdate: "cascade" }),
  },
  (t) => [
    unique("licensees_source_legal_name_unique").on(t.sourceId, t.full_name),
    check("licensees_operator_or_brand", sql`${t.operatorId} IS NULL OR ${t.brandId} IS NULL`),
  ],
);

/**
 * Official microwave links table
 */
export const microwaveLinks = OfficialSchema.table(
  "microwave_links",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    tx_longitude: doublePrecision("tx_longitude").notNull(),
    tx_latitude: doublePrecision("tx_latitude").notNull(),
    tx_height: doublePrecision("tx_height"),
    tx_city: varchar("tx_city", { length: 100 }),
    tx_province: varchar("tx_province", { length: 50 }),
    tx_street: varchar("tx_street", { length: 200 }),
    tx_location_description: text("tx_location_description"),
    rx_longitude: doublePrecision("rx_longitude").notNull(),
    rx_latitude: doublePrecision("rx_latitude").notNull(),
    rx_height: doublePrecision("rx_height"),
    rx_city: varchar("rx_city", { length: 100 }),
    rx_province: varchar("rx_province", { length: 50 }),
    rx_street: varchar("rx_street", { length: 200 }),
    rx_location_description: text("rx_location_description"),
    freq_khz: integer("freq_khz").notNull(),
    ch_num: integer("ch_num"),
    plan_symbol: varchar("plan_symbol", { length: 50 }),
    ch_width: doublePrecision("ch_width"),
    polarization: varchar("polarization", { length: 10 }),
    modulation_type: varchar("modulation_type", { length: 50 }),
    //* This has to be in text varchar because UKE does not follow their own schema and types some bandwith in e.g. `2x1000` etc. If the value only has a number, it will be treated as Mb/s.
    bandwidth: varchar("bandwidth", { length: 100 }),
    tx_eirp: doublePrecision("tx_eirp"),
    tx_antenna_attenuation: doublePrecision("tx_antenna_attenuation"),
    tx_transmitter_type_id: integer("tx_transmitter_type_id").references(() => microwaveLinkTransmitterTypes.id, {
      name: "microwave_links_tx_transmitter_type_fkey",
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    tx_antenna_type_id: integer("tx_antenna_type_id").references(() => microwaveLinkAntennaTypes.id, {
      name: "microwave_links_tx_antenna_type_fkey",
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    tx_antenna_gain: doublePrecision("tx_antenna_gain"),
    tx_antenna_height: doublePrecision("tx_antenna_height"),
    rx_antenna_type_id: integer("rx_antenna_type_id").references(() => microwaveLinkAntennaTypes.id, {
      name: "microwave_links_rx_antenna_type_fkey",
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    rx_antenna_gain: doublePrecision("rx_antenna_gain"),
    rx_antenna_height: doublePrecision("rx_antenna_height"),
    rx_noise_figure: doublePrecision("rx_noise_figure"),
    rx_atpc_attenuation: doublePrecision("rx_atpc_attenuation"),
    operator_id: integer("licensee_id").references(() => licensees.id, { onDelete: "set null", onUpdate: "cascade" }),
    dataset_id: integer("dataset_id")
      .references(() => officialDatasets.id, { onDelete: "restrict", onUpdate: "cascade" })
      .notNull(),
    source_ref: text("source_ref"),
    permit_number: varchar("permit_number", { length: 100 }).notNull(),
    decision_type: OfficialDecisionType("decision_type"),
    issue_date: date({ mode: "string" }),
    expiry_date: date({ mode: "string" }),
    //* Date of the UKE file the technical columns (modulation, bandwidth, equipment, gains...) were last read from. UKE sometimes publishes files without them, so it can be older than updatedAt or null for links that never had them
    specs_date: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("microwave_links_natural_key")
      .on(
        t.dataset_id,
        t.permit_number,
        t.operator_id,
        t.tx_longitude,
        t.tx_latitude,
        t.rx_longitude,
        t.rx_latitude,
        t.freq_khz,
        t.polarization,
        t.ch_num,
      )
      .where(sql`${t.source_ref} IS NULL`),
    uniqueIndex("microwave_links_dataset_source_ref_unique")
      .on(t.dataset_id, t.source_ref)
      .where(sql`${t.source_ref} IS NOT NULL`),
    index("microwave_links_licensee_id_idx").on(t.operator_id),
    index("microwave_links_permit_number_idx").on(t.permit_number),
    index("microwave_links_permit_number_trgm_idx").using("gin", sql`(${t.permit_number}) gin_trgm_ops`),
    index("microwave_links_tx_point_gist").using("gist", sql`(ST_SetSRID(ST_MakePoint(${t.tx_longitude}, ${t.tx_latitude}), 4326))`),
    index("microwave_links_rx_point_gist").using("gist", sql`(ST_SetSRID(ST_MakePoint(${t.rx_longitude}, ${t.rx_latitude}), 4326))`),
    index("microwave_links_freq_khz_idx").on(t.freq_khz),
  ],
);

export const officialSources = OfficialSchema.table(
  "sources",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    key: varchar("key", { length: 64 }).notNull().unique(),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    shortName: varchar("short_name", { length: 32 }).notNull(),
    authority: varchar("authority", { length: 200 }).notNull(),
    homepageUrl: varchar("homepage_url", { length: 500 }).notNull(),
    licence: varchar("licence", { length: 200 }).notNull(),
    attribution: text("attribution").notNull(),
    coverageNote: text("coverage_note"),
    isRedistributable: boolean("is_redistributable").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(false),
    isVisible: boolean("is_visible").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("sources_visible_only_if_redistributable", sql`${t.isRedistributable} OR NOT ${t.isVisible}`)],
);

export const officialDatasets = OfficialSchema.table(
  "datasets",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => officialSources.id, { onDelete: "restrict", onUpdate: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),
    layer: OfficialLayer("layer").notNull(),
    permitKind: OfficialPermitKind("permit_kind").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    checkEveryHours: smallint("check_every_hours").notNull(),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    holdShrinkPercent: smallint("hold_shrink_percent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("datasets_source_key_unique").on(t.sourceId, t.key)],
);

export const officialDatasetSlices = OfficialSchema.table(
  "dataset_slices",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => officialDatasets.id, { onDelete: "cascade", onUpdate: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),
    snapshotId: integer("snapshot_id").references(() => officialSnapshots.id, { onDelete: "set null", onUpdate: "cascade" }),
    importedAt: timestamp("imported_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.key] })],
);

export const officialListedFiles = OfficialSchema.table(
  "listed_files",
  {
    sourceId: integer("source_id")
      .notNull()
      .references(() => officialSources.id, { onDelete: "cascade", onUpdate: "cascade" }),
    url: text("url").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    publishedOn: date("published_on"),
    etag: text("etag"),
    lastModified: timestamp("last_modified", { withTimezone: true }),
    fileSha256: char("file_sha256", { length: 64 }).references(() => officialFiles.sha256, { onUpdate: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.url] })],
);

export const officialFiles = OfficialSchema.table("files", {
  sha256: char("sha256", { length: 64 }).primaryKey(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  mediaType: varchar("media_type", { length: 100 }).notNull(),
});

export const officialSnapshots = OfficialSchema.table("snapshots", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  sha256: char("sha256", { length: 64 }).notNull().unique(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

export const officialSnapshotFiles = OfficialSchema.table(
  "snapshot_files",
  {
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => officialSnapshots.id, { onDelete: "cascade", onUpdate: "cascade" }),
    position: smallint("position").notNull(),
    fileSha256: char("file_sha256", { length: 64 })
      .notNull()
      .references(() => officialFiles.sha256, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.position] })],
);

export const officialSnapshotSlices = OfficialSchema.table(
  "snapshot_slices",
  {
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => officialSnapshots.id, { onDelete: "cascade", onUpdate: "cascade" }),
    datasetId: integer("dataset_id").notNull(),
    slice: varchar("slice", { length: 64 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.snapshotId, t.datasetId, t.slice] }),
    foreignKey({
      name: "snapshot_slices_dataset_slice_fkey",
      columns: [t.datasetId, t.slice],
      foreignColumns: [officialDatasetSlices.datasetId, officialDatasetSlices.key],
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
  ],
);

export const officialPermitListings = OfficialSchema.table(
  "permit_listings",
  {
    permitId: integer("permit_id")
      .notNull()
      .references(() => officialPermits.id, { onDelete: "cascade", onUpdate: "cascade" }),
    datasetId: integer("dataset_id").notNull(),
    slice: varchar("slice", { length: 64 }).notNull(),
    licenseeId: integer("licensee_id").references(() => licensees.id, { onDelete: "restrict", onUpdate: "cascade" }),
    sourceRef: varchar("source_ref", { length: 255 }),
  },
  (t) => [
    primaryKey({ columns: [t.permitId, t.datasetId] }),
    foreignKey({
      name: "permit_listings_dataset_slice_fkey",
      columns: [t.datasetId, t.slice],
      foreignColumns: [officialDatasetSlices.datasetId, officialDatasetSlices.key],
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    uniqueIndex("permit_listings_dataset_source_ref_unique")
      .on(t.datasetId, t.sourceRef)
      .where(sql`${t.sourceRef} IS NOT NULL`),
    index("permit_listings_dataset_slice_idx").on(t.datasetId, t.slice),
  ],
);

export const statsSnapshots = StatisticsSchema.table(
  "stats_snapshots",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    snapshot_date: timestamp("snapshot_date", { withTimezone: true }).notNull(),
    operator_id: integer("operator_id")
      .references(() => operators.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    rat: ratEnum("rat"),
    label_mhz: integer("label_mhz"),
    label_variant: BandVariant("label_variant"),
    unique_stations_count: integer("unique_stations_count").notNull(),
    permits_count: integer("permits_count").notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("stats_snapshots_date_operator_label_unique").on(t.snapshot_date, t.operator_id, t.rat, t.label_mhz, t.label_variant).nullsNotDistinct(),
    index("stats_snapshots_date_idx").on(t.snapshot_date),
    index("stats_snapshots_operator_id_idx").on(t.operator_id),
    check("stats_snapshots_label_complete", sql`num_nulls(${t.rat}, ${t.label_mhz}, ${t.label_variant}) IN (0, 3)`),
  ],
);

export const microwaveLinkSnapshots = StatisticsSchema.table(
  "microwave_link_snapshots",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => officialSources.id, { onDelete: "restrict", onUpdate: "cascade" }),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    specsDate: timestamp("specs_date", { withTimezone: true }),
  },
  (t) => [
    unique("microwave_link_snapshots_source_starts_on_unique").on(t.sourceId, t.startsOn),
    check("microwave_link_snapshots_starts_on_month_start", sql`extract(day from ${t.startsOn}) = 1`),
  ],
);

export const microwaveLinkSnapshotCounts = StatisticsSchema.table(
  "microwave_link_snapshot_counts",
  {
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => microwaveLinkSnapshots.id, {
        name: "microwave_link_snapshot_counts_snapshot_fkey",
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    licenseeId: integer("licensee_id").references(() => licensees.id, { onDelete: "restrict", onUpdate: "cascade" }),
    dimension: varchar("dimension", { length: 32 }).notNull(),
    bucket: varchar("bucket", { length: 100 }),
    linksCount: integer("links_count").notNull(),
    lengthSumMeters: bigint("length_sum_m", { mode: "number" }).notNull(),
  },
  (t) => [
    unique("microwave_link_snapshot_counts_group_unique").on(t.snapshotId, t.licenseeId, t.dimension, t.bucket).nullsNotDistinct(),
    index("microwave_link_snapshot_counts_licensee_id_idx").on(t.licenseeId),
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
