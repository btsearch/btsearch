import {
  AREA_CLASSES,
  CELL_MATCHES_FOUND,
  CELL_NETWORK_MATCHES,
  ENGINE_RUN_KINDS,
  ENGINE_RUN_OUTCOMES,
  EVALUATION_DIMENSIONS,
  EVIDENCE_CLASSES,
  MEASUREMENT_DROP_REASONS,
  MEASUREMENT_READER_SOURCES,
  OBSERVATION_FLAG_CLOSED_REASONS,
  OBSERVATION_FLAG_DISMISSED_REASONS,
  OBSERVATION_FLAG_KINDS,
  READING_BLOCK_FIELDS,
  READING_BLOCK_MODES,
  READING_BLOCK_ROLES,
  SNAP_CANDIDATE_KINDS,
  STATION_HALVES,
  VALUE_PATTERNS,
} from "@openbts/shared/contract/constants";
import {
  bigint,
  boolean,
  bytea,
  char,
  check,
  customType,
  date,
  doublePrecision,
  foreignKey,
  geometry,
  index,
  integer,
  jsonb,
  pgEnum,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm/sql";

import { users } from "./auth.ts";
import { bands, cells, countries, locations, officialSites, ratEnum, regions, stationSectors, stations } from "./bts.ts";
import { ModemFamily, ObservationsSchema, contributors, deviceModels, devices, socs, uploads } from "./measurements.ts";

const multiPolygon = customType<{ data: string }>({ dataType: () => "geometry(MultiPolygon, 4326)" });
const polygon = customType<{ data: string }>({ dataType: () => "geometry(Polygon, 4326)" });
const multiLineString = customType<{ data: string }>({ dataType: () => "geometry(MultiLineString, 4326)" });

export const ReaderSource = pgEnum("reader_source", MEASUREMENT_READER_SOURCES);
export const ReadingBlockRole = pgEnum("reading_block_role", READING_BLOCK_ROLES);
export const ReadingBlockField = pgEnum("reading_block_field", READING_BLOCK_FIELDS);
export const ReadingBlockMode = pgEnum("reading_block_mode", READING_BLOCK_MODES);
export const CellValueField = pgEnum("cell_value_field", [
  "areaCode",
  "pci",
  "channel",
  "bandwidth",
  "reportedBand",
  "ulChannel",
  "ulBandwidth",
  "endcAvailable",
  "accessClosed",
  "barred",
  "reserved",
]);
export const SampleDropReason = pgEnum("sample_drop_reason", MEASUREMENT_DROP_REASONS);
export const BatchValueField = pgEnum("batch_value_field", [
  "latitude",
  "longitude",
  "altitudeMeters",
  "speedMetersPerSecond",
  "bearingDegrees",
  "lac",
  "cid",
  "longCid",
  "eci",
  "nci",
  "tac",
  "arfcn",
  "uarfcn",
  "earfcn",
  "bsic",
  "psc",
  "pci",
  "bandwidthKhz",
  "ulArfcn",
  "ulEarfcn",
  "ulBandwidthKhz",
  "bands",
  "rsrpDbm",
  "rsrqDb",
  "rssnrDb",
  "rssiDbm",
  "cqi",
  "ssRsrpDbm",
  "ssRsrqDb",
  "ssSinrDb",
  "csiRsrpDbm",
  "csiRsrqDb",
  "csiSinrDb",
  "subcarrierSpacingKhz",
  "ssbIndex",
  "rscpDbm",
  "ecNoDb",
  "bitErrorRate",
  "timingAdvance",
]);
export const EngineRunKind = pgEnum("engine_run_kind", ENGINE_RUN_KINDS);
export const EngineRunOutcome = pgEnum("engine_run_outcome", ENGINE_RUN_OUTCOMES);
export const CellMatchKind = pgEnum("cell_match_kind", CELL_MATCHES_FOUND);
export const NetworkMatch = pgEnum("network_match", CELL_NETWORK_MATCHES);
export const SiteLinkKind = pgEnum("site_link_kind", ["matched", "suggested"]);
export const CellCopyBasis = pgEnum("cell_copy_basis", ["broadcastList", "sameReading", "ourCell"]);
export const ConfirmationBasis = pgEnum("confirmation_basis", ["twoPeople", "vouched", "twoTrips"]);
export const StationHalf = pgEnum("station_half", STATION_HALVES);
export const CellEdgeKind = pgEnum("cell_edge_kind", ["handedOver", "faded", "otherLayer", "unmeasured"]);
export const CandidateSource = pgEnum("candidate_source", ["osm", "official"]);
export const AreaClass = pgEnum("area_class", AREA_CLASSES);
export const EvidenceClass = pgEnum("evidence_class", EVIDENCE_CLASSES);
export const SnapCandidateKind = pgEnum("snap_candidate_kind", SNAP_CANDIDATE_KINDS);
export const EvaluationDimension = pgEnum("evaluation_dimension", EVALUATION_DIMENSIONS);
export const CoordinatesFrom = pgEnum("coordinates_from", ["estimate", "snapped", "editor"]);
export const ObservationFlagKind = pgEnum("observation_flag_kind", OBSERVATION_FLAG_KINDS);
export const ObservationFlagClosedReason = pgEnum("observation_flag_closed_reason", OBSERVATION_FLAG_CLOSED_REASONS);
export const ObservationFlagDismissedReason = pgEnum("observation_flag_dismissed_reason", OBSERVATION_FLAG_DISMISSED_REASONS);
export const ValuePattern = pgEnum("value_pattern", VALUE_PATTERNS);

export const taGroups = ObservationsSchema.table(
  "ta_groups",
  {
    id: smallint("id").generatedAlwaysAsIdentity().primaryKey(),
    source: ReaderSource("source").notNull(),
    modemFamily: ModemFamily("modem_family"),
    deviceModelId: integer("device_model_id").references(() => deviceModels.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ta_groups_source_modem_family_unique").on(t.source, t.modemFamily),
    unique("ta_groups_source_device_model_unique").on(t.source, t.deviceModelId),
    check("ta_groups_one_kind_of_phone", sql`num_nonnulls(${t.modemFamily}, ${t.deviceModelId}) = 1`),
  ],
);

export const readers = ObservationsSchema.table("readers", {
  name: varchar("name", { length: 32 }).primaryKey(),
  source: ReaderSource("source").notNull(),
});

export const readerVersions = ObservationsSchema.table(
  "reader_versions",
  {
    id: smallint("id").generatedAlwaysAsIdentity().primaryKey(),
    readerName: varchar("reader_name", { length: 32 })
      .notNull()
      .references(() => readers.name, { onDelete: "restrict", onUpdate: "cascade" }),
    version: varchar("version", { length: 64 }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("reader_versions_reader_version_unique").on(t.readerName, t.version)],
);

export const quirkRules = ObservationsSchema.table("quirk_rules", {
  id: varchar("id", { length: 64 }).primaryKey(),
  readerName: varchar("reader_name", { length: 32 })
    .notNull()
    .references(() => readers.name, { onDelete: "restrict", onUpdate: "cascade" }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const blockedQuirkRules = ObservationsSchema.table("blocked_quirk_rules", {
  quirkRuleId: varchar("quirk_rule_id", { length: 64 })
    .primaryKey()
    .references(() => quirkRules.id, { onDelete: "cascade", onUpdate: "cascade" }),
  blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
  blockedById: uuid("blocked_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  reason: varchar("reason", { length: 500 }).notNull(),
});

export const readingBlocks = ObservationsSchema.table(
  "reading_blocks",
  {
    id: smallint("id").generatedAlwaysAsIdentity().primaryKey(),
    modemFamily: ModemFamily("modem_family"),
    socId: smallint("soc_id").references(() => socs.id, { onDelete: "restrict", onUpdate: "cascade" }),
    deviceModelId: integer("device_model_id").references(() => deviceModels.id, { onDelete: "restrict", onUpdate: "cascade" }),
    readerVersionId: smallint("reader_version_id").references(() => readerVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    rats: ratEnum("rats").array(),
    roles: ReadingBlockRole("roles").array(),
    sdkIntMin: smallint("sdk_int_min"),
    sdkIntMax: smallint("sdk_int_max"),
    radioVersionPrefix: varchar("radio_version_prefix", { length: 128 }),
    fields: ReadingBlockField("fields").array(),
    mode: ReadingBlockMode("mode").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledById: uuid("disabled_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
  },
  (t) => [
    check("reading_blocks_one_kind_of_phone", sql`num_nonnulls(${t.modemFamily}, ${t.socId}, ${t.deviceModelId}, ${t.readerVersionId}) = 1`),
    check("reading_blocks_rats_not_empty", sql`cardinality(${t.rats}) > 0`),
    check("reading_blocks_roles_not_empty", sql`cardinality(${t.roles}) > 0`),
    check("reading_blocks_fields_not_empty", sql`cardinality(${t.fields}) > 0`),
    check("reading_blocks_sdk_int_ordered", sql`${t.sdkIntMin} <= ${t.sdkIntMax}`),
    check("reading_blocks_radio_version_prefix_not_blank", sql`btrim(${t.radioVersionPrefix}) <> ''`),
    check(
      "reading_blocks_corroborate_fields",
      sql`${t.mode} <> 'corroborate' OR ${t.fields} <@ ARRAY['pci', 'channel', 'areaCode', 'bandwidth']::"reading_block_field"[]`,
    ),
    check("reading_blocks_whole_readings_dropped", sql`${t.fields} IS NOT NULL OR (${t.mode} = 'drop' AND ${t.rats} IS NULL AND ${t.roles} IS NULL)`),
  ],
);

export const uploadFolds = ObservationsSchema.table(
  "upload_folds",
  {
    uploadId: uuid("upload_id")
      .primaryKey()
      .references(() => uploads.id, { onDelete: "cascade", onUpdate: "cascade" }),
    foldVersion: smallint("fold_version").notNull(),
    weightMilli: smallint("weight_milli").notNull(),
    foldedAt: timestamp("folded_at", { withTimezone: true }).notNull().defaultNow(),
    formatVersion: smallint("format_version").notNull(),
    sdkInt: smallint("sdk_int").notNull(),
    securityPatch: date("security_patch"),
    radioVersion: varchar("radio_version", { length: 128 }),
    appVersionName: varchar("app_version_name", { length: 64 }).notNull(),
    modemFamily: ModemFamily("modem_family"),
    outlineVersion: smallint("outline_version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    west: doublePrecision("west").notNull(),
    south: doublePrecision("south").notNull(),
    east: doublePrecision("east").notNull(),
    north: doublePrecision("north").notNull(),
    snapshotCount: integer("snapshot_count").notNull(),
    sampleCount: integer("sample_count").notNull(),
    distanceOnlyCount: integer("distance_only_count").notNull().default(0),
    wallClockErrorMs: bigint("wall_clock_error_ms", { mode: "number" }),
    unfoldedAt: timestamp("unfolded_at", { withTimezone: true }),
  },
  (t) => [
    index("upload_folds_outline_version_idx")
      .on(t.outlineVersion)
      .where(sql`${t.unfoldedAt} IS NULL`),
    index("upload_folds_unfolded_idx")
      .on(t.uploadId)
      .where(sql`${t.unfoldedAt} IS NOT NULL`),
    check("upload_folds_weight_milli_positive", sql`${t.weightMilli} > 0`),
    check("upload_folds_span_ordered", sql`${t.startedAt} <= ${t.endedAt}`),
    check("upload_folds_bbox_south_north", sql`${t.south} <= ${t.north}`),
    check("upload_folds_sample_count_positive", sql`${t.sampleCount} > 0`),
    check("upload_folds_snapshot_count_positive", sql`${t.snapshotCount} > 0`),
    check("upload_folds_distance_only_count_range", sql`${t.distanceOnlyCount} BETWEEN 0 AND ${t.sampleCount}`),
    check("upload_folds_unfolded_after_folded", sql`${t.unfoldedAt} >= ${t.foldedAt}`),
  ],
);

function uploadFoldColumn() {
  return uuid("upload_id")
    .notNull()
    .references(() => uploadFolds.uploadId, { onDelete: "cascade", onUpdate: "cascade" });
}

function uploadColumn() {
  return uuid("upload_id")
    .notNull()
    .references(() => uploads.id, { onDelete: "cascade", onUpdate: "cascade" });
}

export const uploadTaGroups = ObservationsSchema.table(
  "upload_ta_groups",
  {
    uploadId: uploadFoldColumn(),
    source: ReaderSource("source").notNull(),
    taGroupId: smallint("ta_group_id")
      .notNull()
      .references(() => taGroups.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.source] })],
);

export const uploadDrops = ObservationsSchema.table(
  "upload_drops",
  {
    uploadId: uploadColumn(),
    reason: SampleDropReason("reason").notNull(),
    sampleCount: integer("sample_count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.reason] }), check("upload_drops_sample_count_positive", sql`${t.sampleCount} > 0`)],
);

export const uploadDroppedValues = ObservationsSchema.table(
  "upload_dropped_values",
  {
    uploadId: uploadFoldColumn(),
    field: BatchValueField("field").notNull(),
    valueCount: integer("value_count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.field] }), check("upload_dropped_values_value_count_positive", sql`${t.valueCount} > 0`)],
);

export const uploadReaders = ObservationsSchema.table(
  "upload_readers",
  {
    uploadId: uploadFoldColumn(),
    readerVersionId: smallint("reader_version_id")
      .notNull()
      .references(() => readerVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    rulesVersion: integer("rules_version"),
    snapshotCount: integer("snapshot_count").notNull(),
    derivedValues: integer("derived_values").notNull(),
    taOnConfirmed: integer("ta_on_confirmed").notNull().default(0),
    taWithinTolerance: integer("ta_within_tolerance").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.uploadId, t.readerVersionId] }),
    check("upload_readers_counts_nonnegative", sql`least(${t.snapshotCount}, ${t.derivedValues}, ${t.taOnConfirmed}, ${t.taWithinTolerance}) >= 0`),
    check("upload_readers_ta_within_confirmed", sql`${t.taWithinTolerance} <= ${t.taOnConfirmed}`),
  ],
);

export const uploadTaResiduals = ObservationsSchema.table(
  "upload_ta_residuals",
  {
    uploadId: uploadFoldColumn(),
    source: ReaderSource("source").notNull(),
    rat: ratEnum("rat").notNull(),
    stationId: integer("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    timingAdvance: smallint("timing_advance").notNull(),
    distanceBucket: smallint("distance_bucket").notNull(),
    samples: integer("samples").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.uploadId, t.source, t.rat, t.stationId, t.timingAdvance, t.distanceBucket] }),
    index("upload_ta_residuals_station_id_idx").on(t.stationId),
    check("upload_ta_residuals_samples_positive", sql`${t.samples} > 0`),
    check("upload_ta_residuals_distance_bucket_nonnegative", sql`${t.distanceBucket} >= 0`),
  ],
);

export const uploadValueChecks = ObservationsSchema.table(
  "upload_value_checks",
  {
    uploadId: uploadFoldColumn(),
    readerVersionId: smallint("reader_version_id")
      .notNull()
      .references(() => readerVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    field: CellValueField("field").notNull(),
    agreed: integer("agreed").notNull(),
    differed: integer("differed").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.uploadId, t.readerVersionId, t.field] }),
    check("upload_value_checks_counts", sql`${t.agreed} >= 0 AND ${t.differed} >= 0 AND ${t.agreed} + ${t.differed} > 0`),
  ],
);

export const uploadValuePatterns = ObservationsSchema.table(
  "upload_value_patterns",
  {
    uploadId: uploadFoldColumn(),
    readerVersionId: smallint("reader_version_id")
      .notNull()
      .references(() => readerVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    field: CellValueField("field").notNull(),
    pattern: ValuePattern("pattern").notNull(),
    parameter: integer("parameter").notNull(),
    valueCount: integer("value_count").notNull(),
    cellCount: integer("cell_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.uploadId, t.readerVersionId, t.field, t.pattern, t.parameter] }),
    check("upload_value_patterns_counts", sql`${t.cellCount} > 0 AND ${t.valueCount} >= ${t.cellCount}`),
    check("upload_value_patterns_swapped_parameter", sql`${t.pattern} <> 'bytesSwapped' OR ${t.parameter} = 0`),
  ],
);

export const uploadCorrections = ObservationsSchema.table(
  "upload_corrections",
  {
    uploadId: uploadFoldColumn(),
    quirkRuleId: varchar("quirk_rule_id", { length: 64 })
      .notNull()
      .references(() => quirkRules.id, { onDelete: "restrict", onUpdate: "cascade" }),
    valueCount: integer("value_count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.quirkRuleId] }), check("upload_corrections_value_count_positive", sql`${t.valueCount} > 0`)],
);

export const uploadSkippedRules = ObservationsSchema.table(
  "upload_skipped_rules",
  {
    uploadId: uploadFoldColumn(),
    quirkRuleId: varchar("quirk_rule_id", { length: 64 })
      .notNull()
      .references(() => quirkRules.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.quirkRuleId] })],
);

export const uploadBlockedValues = ObservationsSchema.table(
  "upload_blocked_values",
  {
    uploadId: uploadFoldColumn(),
    readingBlockId: smallint("reading_block_id")
      .notNull()
      .references(() => readingBlocks.id, { onDelete: "restrict", onUpdate: "cascade" }),
    heldCount: integer("held_count").notNull(),
    droppedCount: integer("dropped_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.uploadId, t.readingBlockId] }),
    check("upload_blocked_values_counts_nonnegative", sql`least(${t.heldCount}, ${t.droppedCount}) >= 0`),
    check("upload_blocked_values_something_blocked", sql`${t.heldCount} + ${t.droppedCount} > 0`),
  ],
);

export const uploadClosedCountries = ObservationsSchema.table(
  "upload_closed_countries",
  {
    uploadId: uploadColumn(),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.countryCode] })],
);

export const uploadNewSquares = ObservationsSchema.table(
  "upload_new_squares",
  {
    uploadId: uploadFoldColumn(),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    month: date("month").notNull(),
    squareCount: integer("square_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.uploadId, t.countryCode, t.month] }),
    check("upload_new_squares_first_day", sql`extract(day FROM ${t.month}) = 1`),
    check("upload_new_squares_square_count_positive", sql`${t.squareCount} > 0`),
  ],
);

export const deviceScores = ObservationsSchema.table(
  "device_scores",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade", onUpdate: "cascade" }),
    scoredOn: date("scored_on").notNull(),
    readings: integer("readings").notNull(),
    taOnConfirmed: integer("ta_on_confirmed").notNull(),
    taWithinTolerance: integer("ta_within_tolerance").notNull(),
    droppedImplausible: integer("dropped_implausible").notNull(),
    mockReadings: integer("mock_readings").notNull(),
    phantomCells: integer("phantom_cells").notNull(),
    factor: real("factor").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.scoredOn] }),
    check(
      "device_scores_counts_nonnegative",
      sql`${t.readings} >= 0 AND ${t.taOnConfirmed} >= 0 AND ${t.taWithinTolerance} BETWEEN 0 AND ${t.taOnConfirmed} AND ${t.droppedImplausible} >= 0 AND ${t.mockReadings} >= 0 AND ${t.phantomCells} >= 0`,
    ),
    check("device_scores_factor_range", sql`${t.factor} BETWEEN 0.2::real AND 1.2::real`),
  ],
);

export const deviceWeightsNow = ObservationsSchema.view("device_weights_now", {
  deviceId: uuid("device_id").notNull(),
  computedWeight: real("computed_weight").notNull(),
  weight: real("weight").notNull(),
  basis: text("basis").$type<"device" | "vouch" | "computed">().notNull(),
}).as(sql`
  SELECT d.id AS device_id, c.weight AS computed_weight,
    coalesce(w.weight, v.weight, c.weight) AS weight,
    CASE WHEN w.device_id IS NOT NULL THEN 'device' WHEN v.user_id IS NOT NULL THEN 'vouch' ELSE 'computed' END AS basis
  FROM observations.devices d
  JOIN observations.device_tiers t ON t.device_id = d.id
  CROSS JOIN LATERAL (
    SELECT least(1, greatest(0.05,
      CASE t.tier WHEN 'strong' THEN 1 WHEN 'hardware' THEN 0.5 ELSE 0.1 END
      * coalesce((SELECT s.factor FROM observations.device_scores s WHERE s.device_id = d.id ORDER BY s.scored_on DESC LIMIT 1), 1)
    ))::real AS weight
  ) c
  LEFT JOIN observations.device_weights w ON w.device_id = d.id
  LEFT JOIN observations.vouches v ON v.user_id = d.user_id AND (v.until IS NULL OR v.until > now())
`);

export const observedSites = ObservationsSchema.table(
  "observed_sites",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    plmn: varchar("plmn", { length: 6 }).notNull(),
    rat: ratEnum("rat"),
    nodeId: bigint("node_id", { mode: "number" }),
    stationId: integer("station_id").references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("observed_sites_identity_unique")
      .on(t.plmn, t.rat, t.nodeId)
      .where(sql`${t.retiredAt} IS NULL`),
    uniqueIndex("observed_sites_station_unique")
      .on(t.stationId, t.plmn)
      .where(sql`${t.retiredAt} IS NULL AND ${t.stationId} IS NOT NULL`),
    index("observed_sites_station_id_idx")
      .on(t.stationId)
      .where(sql`${t.stationId} IS NOT NULL`),
    check("observed_sites_plmn_format", sql`${t.plmn} ~ '^[0-9]{5,6}$'`),
    check("observed_sites_node_id_nonnegative", sql`${t.nodeId} >= 0`),
    check(
      "observed_sites_one_identity",
      sql`(${t.stationId} IS NULL AND ${t.rat} IS NOT NULL AND ${t.nodeId} IS NOT NULL) OR (${t.stationId} IS NOT NULL AND ${t.rat} IS NULL AND ${t.nodeId} IS NULL)`,
    ),
  ],
);

export const observedCells = ObservationsSchema.table(
  "observed_cells",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    plmn: varchar("plmn", { length: 6 }).notNull(),
    rat: ratEnum("rat").notNull(),
    cellKey: bigint("cell_key", { mode: "number" }).notNull(),
    observedSiteId: integer("observed_site_id").references(() => observedSites.id, { onDelete: "set null", onUpdate: "cascade" }),
    firstUploadId: uuid("first_upload_id").references(() => uploads.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("observed_cells_identity_unique").on(t.plmn, t.rat, t.cellKey),
    index("observed_cells_observed_site_id_idx").on(t.observedSiteId),
    index("observed_cells_first_upload_id_idx").on(t.firstUploadId),
    check("observed_cells_plmn_format", sql`${t.plmn} ~ '^[0-9]{5,6}$'`),
    check("observed_cells_cell_key_nonnegative", sql`${t.cellKey} >= 0`),
  ],
);

function observedCellColumn(name = "observed_cell_id") {
  return integer(name)
    .notNull()
    .references(() => observedCells.id, { onDelete: "cascade", onUpdate: "cascade" });
}

function sumColumn(name: string) {
  return bigint(name, { mode: "bigint" }).notNull();
}

function contributorBitsColumn() {
  return bigint("contributor_bits", { mode: "bigint" }).notNull();
}

export const cellBins = ObservationsSchema.table(
  "cell_bins",
  {
    observedCellId: observedCellColumn(),
    bin: bigint("bin", { mode: "number" }).notNull(),
    sampleCount: integer("sample_count").notNull(),
    weightMilli: sumColumn("weight_milli"),
    servingWeightMilli: sumColumn("serving_weight_milli"),
    levelWsum: sumColumn("level_wsum"),
    levelWsq: sumColumn("level_wsq"),
    qualityWeightMilli: sumColumn("quality_weight_milli"),
    qualityWsum: sumColumn("quality_wsum"),
    sinrWeightMilli: sumColumn("sinr_weight_milli"),
    sinrWsum: sumColumn("sinr_wsum"),
    sinrWsq: sumColumn("sinr_wsq"),
    offsetXWsum: sumColumn("offset_x_wsum"),
    offsetYWsum: sumColumn("offset_y_wsum"),
    stationaryCount: integer("stationary_count").notNull(),
    contributorBits: contributorBitsColumn(),
    firstSeenOn: date("first_seen_on").notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.observedCellId, t.bin] })],
);

export const cellTaBins = ObservationsSchema.table(
  "cell_ta_bins",
  {
    observedCellId: observedCellColumn(),
    bin: bigint("bin", { mode: "number" }).notNull(),
    taGroupId: smallint("ta_group_id")
      .notNull()
      .references(() => taGroups.id, { onDelete: "restrict", onUpdate: "cascade" }),
    timingAdvance: smallint("timing_advance").notNull(),
    sampleCount: integer("sample_count").notNull(),
    weightMilli: sumColumn("weight_milli"),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.observedCellId, t.bin, t.taGroupId, t.timingAdvance] })],
);

export const cellValues = ObservationsSchema.table(
  "cell_values",
  {
    observedCellId: observedCellColumn(),
    field: CellValueField("field").notNull(),
    value: integer("value").notNull(),
    held: boolean("held").notNull(),
    sampleCount: integer("sample_count").notNull(),
    contributorBits: contributorBitsColumn(),
    firstSeenOn: date("first_seen_on").notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.observedCellId, t.field, t.value, t.held] }),
    check("cell_values_held_fields", sql`NOT ${t.held} OR ${t.field} IN ('pci', 'channel', 'areaCode', 'bandwidth')`),
  ],
);

export const cellNetworks = ObservationsSchema.table(
  "cell_networks",
  {
    observedCellId: observedCellColumn(),
    plmn: varchar("plmn", { length: 6 }).notNull(),
    sampleCount: integer("sample_count").notNull(),
    contributorBits: contributorBitsColumn(),
    firstSeenOn: date("first_seen_on").notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.observedCellId, t.plmn] })],
);

export const cellContributors = ObservationsSchema.table(
  "cell_contributors",
  {
    observedCellId: observedCellColumn(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sampleCount: integer("sample_count").notNull(),
    tripCount: integer("trip_count").notNull(),
    firstSeenOn: date("first_seen_on").notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.observedCellId, t.deviceId] }), index("cell_contributors_device_id_idx").on(t.deviceId)],
);

export const cellReaders = ObservationsSchema.table(
  "cell_readers",
  {
    observedCellId: observedCellColumn(),
    readerVersionId: smallint("reader_version_id")
      .notNull()
      .references(() => readerVersions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    sampleCount: integer("sample_count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.observedCellId, t.readerVersionId] })],
);

export const handoverBins = ObservationsSchema.table(
  "handover_bins",
  {
    fromCellId: observedCellColumn("from_cell_id"),
    toCellId: observedCellColumn("to_cell_id"),
    bin: bigint("bin", { mode: "number" }).notNull(),
    handoverCount: integer("handover_count").notNull(),
    weightMilli: sumColumn("weight_milli"),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromCellId, t.toCellId, t.bin] }),
    index("handover_bins_to_cell_id_idx").on(t.toCellId),
    check("handover_bins_two_cells", sql`${t.fromCellId} <> ${t.toCellId}`),
  ],
);

export const cellTransitions = ObservationsSchema.table(
  "cell_transitions",
  {
    fromCellId: observedCellColumn("from_cell_id"),
    toCellId: observedCellColumn("to_cell_id"),
    transitionCount: integer("transition_count").notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromCellId, t.toCellId] }),
    index("cell_transitions_to_cell_id_idx").on(t.toCellId),
    check("cell_transitions_two_cells", sql`${t.fromCellId} <> ${t.toCellId}`),
  ],
);

export const neighbourBins = ObservationsSchema.table(
  "neighbour_bins",
  {
    plmn: varchar("plmn", { length: 6 }).notNull(),
    rat: ratEnum("rat").notNull(),
    channel: integer("channel").notNull(),
    pci: smallint("pci").notNull(),
    bin: bigint("bin", { mode: "number" }).notNull(),
    held: boolean("held").notNull(),
    sampleCount: integer("sample_count").notNull(),
    weightMilli: sumColumn("weight_milli"),
    levelWsum: sumColumn("level_wsum"),
    contributorBits: contributorBitsColumn(),
    firstSeenOn: date("first_seen_on").notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.plmn, t.rat, t.channel, t.pci, t.bin, t.held] })],
);

export const nsaLinks = ObservationsSchema.table(
  "nsa_links",
  {
    anchorCellId: observedCellColumn("anchor_cell_id"),
    nrArfcn: integer("nr_arfcn").notNull(),
    nrPci: smallint("nr_pci").notNull(),
    held: boolean("held").notNull(),
    sampleCount: integer("sample_count").notNull(),
    weightMilli: sumColumn("weight_milli"),
    levelWsum: sumColumn("level_wsum"),
    firstSeenOn: date("first_seen_on").notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.anchorCellId, t.nrArfcn, t.nrPci, t.held] })],
);

export const sameReadingPairs = ObservationsSchema.table(
  "same_reading_pairs",
  {
    observedCellId: observedCellColumn(),
    otherObservedCellId: observedCellColumn("other_observed_cell_id"),
    held: boolean("held").notNull(),
    sampleCount: integer("sample_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.observedCellId, t.otherObservedCellId, t.held] }),
    index("same_reading_pairs_other_observed_cell_id_idx").on(t.otherObservedCellId),
    check("same_reading_pairs_lower_id_first", sql`${t.observedCellId} < ${t.otherObservedCellId}`),
  ],
);

export const trailSquares = ObservationsSchema.table(
  "trail_squares",
  {
    plmn: varchar("plmn", { length: 6 }).notNull(),
    rat: ratEnum("rat").notNull(),
    channel: integer("channel").notNull(),
    zoom: smallint("zoom").notNull(),
    bin: bigint("bin", { mode: "number" }).notNull(),
    held: boolean("held").notNull(),
    contributorBits: contributorBitsColumn(),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.plmn, t.zoom, t.bin, t.rat, t.channel, t.held] }),
    check("trail_squares_pyramid_zoom", sql`${t.zoom} IN (12, 14, 16, 18, 20)`),
  ],
);

export const trailLevels = ObservationsSchema.table(
  "trail_levels",
  {
    plmn: varchar("plmn", { length: 6 }).notNull(),
    rat: ratEnum("rat").notNull(),
    channel: integer("channel").notNull(),
    zoom: smallint("zoom").notNull(),
    bin: bigint("bin", { mode: "number" }).notNull(),
    held: boolean("held").notNull(),
    levelBucket: smallint("level_bucket").notNull(),
    sampleCount: integer("sample_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.plmn, t.zoom, t.bin, t.rat, t.channel, t.held, t.levelBucket] }),
    foreignKey({
      name: "trail_levels_trail_squares_fkey",
      columns: [t.plmn, t.rat, t.channel, t.zoom, t.bin, t.held],
      foreignColumns: [trailSquares.plmn, trailSquares.rat, trailSquares.channel, trailSquares.zoom, trailSquares.bin, trailSquares.held],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    check("trail_levels_level_bucket_range", sql`${t.levelBucket} BETWEEN 0 AND 7`),
  ],
);

export const personTrailBins = ObservationsSchema.table(
  "person_trail_bins",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => contributors.userId, { onDelete: "cascade", onUpdate: "cascade" }),
    plmn: varchar("plmn", { length: 6 }).notNull(),
    rat: ratEnum("rat").notNull(),
    bin: bigint("bin", { mode: "number" }).notNull(),
    sampleCount: integer("sample_count").notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.plmn, t.rat, t.bin] })],
);

export const contributorMonths = ObservationsSchema.table(
  "contributor_months",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => contributors.userId, { onDelete: "cascade", onUpdate: "cascade" }),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    month: date("month").notNull(),
    sampleCount: integer("sample_count").notNull(),
    newSquares: integer("new_squares").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.countryCode, t.month] }), check("contributor_months_first_day", sql`extract(day FROM ${t.month}) = 1`)],
);

export const leaderboardMonths = ObservationsSchema.table(
  "leaderboard_months",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => contributors.userId, { onDelete: "cascade", onUpdate: "cascade" }),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    month: date("month").notNull(),
    newSquares: integer("new_squares").notNull(),
    newConfirmedCells: integer("new_confirmed_cells").notNull(),
    newSites: integer("new_sites").notNull(),
    refreshedOn: date("refreshed_on").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.countryCode, t.month] }),
    index("leaderboard_months_country_month_idx").on(t.countryCode, t.month),
    check("leaderboard_months_first_day", sql`extract(day FROM ${t.month}) = 1`),
    check(
      "leaderboard_months_counts",
      sql`${t.newSquares} >= 0 AND ${t.newConfirmedCells} >= 0 AND ${t.newSites} >= 0 AND ${t.newSquares} + ${t.newConfirmedCells} + ${t.newSites} > 0`,
    ),
  ],
);

export const trailDirtyTiles = ObservationsSchema.table("trail_dirty_tiles", {
  tile: bigint("tile", { mode: "number" }).primaryKey(),
  dirtySince: timestamp("dirty_since", { withTimezone: true }).notNull().defaultNow(),
});

export const observedCellSummaries = ObservationsSchema.table("observed_cell_summaries", {
  observedCellId: integer("observed_cell_id")
    .primaryKey()
    .references(() => observedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
  sampleCount: bigint("sample_count", { mode: "number" }).notNull(),
  contributorCount: integer("contributor_count").notNull(),
  personCount: integer("person_count").notNull(),
  squareCount: integer("square_count").notNull().default(0),
  firstSeenOn: date("first_seen_on").notNull(),
  lastSeenOn: date("last_seen_on").notNull(),
});

export const matchQueue = ObservationsSchema.table("match_queue", {
  observedCellId: integer("observed_cell_id")
    .primaryKey()
    .references(() => observedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dirtySites = ObservationsSchema.table(
  "dirty_sites",
  {
    observedSiteId: integer("observed_site_id")
      .primaryKey()
      .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    dirtySince: timestamp("dirty_since", { withTimezone: true }).notNull().defaultNow(),
    attempts: smallint("attempts").notNull().default(0),
  },
  (t) => [
    index("dirty_sites_dirty_since_idx").on(t.dirtySince, t.observedSiteId),
    check("dirty_sites_attempts_nonnegative", sql`${t.attempts} >= 0`),
  ],
);

export const engineRuns = ObservationsSchema.table(
  "engine_runs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: EngineRunKind("kind").notNull(),
    params: jsonb("params").notNull().default({}),
    requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    outcome: EngineRunOutcome("outcome"),
    progress: jsonb("progress"),
    error: text("error"),
  },
  (t) => [
    index("engine_runs_waiting_idx")
      .on(t.createdAt)
      .where(sql`${t.startedAt} IS NULL`),
    check("engine_runs_finished_after_start", sql`${t.finishedAt} >= ${t.startedAt}`),
    check("engine_runs_outcome_when_finished", sql`(${t.finishedAt} IS NULL) = (${t.outcome} IS NULL)`),
  ],
);

export const engineHeartbeats = ObservationsSchema.table("engine_heartbeats", {
  instance: varchar("instance", { length: 64 }).primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
});

export const countryOutlineVersions = ObservationsSchema.table("country_outline_versions", {
  version: smallint("version").generatedAlwaysAsIdentity().primaryKey(),
  sourceFingerprint: bytea("source_fingerprint").notNull(),
  builtAt: timestamp("built_at", { withTimezone: true }).notNull().defaultNow(),
});

export const countryOutlines = ObservationsSchema.table(
  "country_outlines",
  {
    version: smallint("version")
      .notNull()
      .references(() => countryOutlineVersions.version, { onDelete: "cascade", onUpdate: "cascade" }),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: "restrict", onUpdate: "cascade" }),
    outline: multiPolygon("outline").notNull(),
  },
  (t) => [primaryKey({ columns: [t.version, t.countryCode] })],
);

export const cellMatches = ObservationsSchema.table(
  "cell_matches",
  {
    observedCellId: integer("observed_cell_id")
      .primaryKey()
      .references(() => observedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    kind: CellMatchKind("kind").notNull(),
    networkMatch: NetworkMatch("network_match").notNull(),
    cellId: integer("cell_id").references(() => cells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    stationId: integer("station_id").references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    matchedAt: timestamp("matched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cell_matches_cell_id_idx").on(t.cellId),
    index("cell_matches_station_id_idx").on(t.stationId),
    check(
      "cell_matches_one_target",
      sql`(${t.kind} = 'station' AND ${t.stationId} IS NOT NULL AND ${t.cellId} IS NULL) OR (${t.kind} <> 'station' AND ${t.cellId} IS NOT NULL AND ${t.stationId} IS NULL)`,
    ),
  ],
);

export const siteLinks = ObservationsSchema.table(
  "site_links",
  {
    observedSiteId: integer("observed_site_id")
      .primaryKey()
      .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    stationId: integer("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    kind: SiteLinkKind("kind").notNull(),
    linkedById: uuid("linked_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_links_station_id_idx").on(t.stationId)],
);

export const siteIgnores = ObservationsSchema.table(
  "site_ignores",
  {
    observedSiteId: integer("observed_site_id")
      .primaryKey()
      .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    ignoredById: uuid("ignored_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    reason: varchar("reason", { length: 500 }).notNull(),
    ignoredAt: timestamp("ignored_at", { withTimezone: true }).notNull().defaultNow(),
    observedCellIds: integer("observed_cell_ids").array().notNull(),
    point: geometry("point", { type: "point", mode: "xy", srid: 4326 }),
    uncertaintyM: integer("uncertainty_m"),
  },
  (t) => [
    check("site_ignores_reason_present", sql`length(btrim(${t.reason})) > 0`),
    check("site_ignores_cells_present", sql`cardinality(${t.observedCellIds}) > 0`),
    check("site_ignores_point_with_radius", sql`(${t.point} IS NULL) = (${t.uncertaintyM} IS NULL)`),
  ],
);

export const siteOfficialLinks = ObservationsSchema.table(
  "site_official_links",
  {
    observedSiteId: integer("observed_site_id")
      .notNull()
      .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    officialSiteId: integer("official_site_id")
      .notNull()
      .references(() => officialSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.observedSiteId, t.officialSiteId] }), index("site_official_links_official_site_id_idx").on(t.officialSiteId)],
);

export const curatedCellSummaries = ObservationsSchema.table("curated_cell_summaries", {
  cellId: integer("cell_id")
    .primaryKey()
    .references(() => cells.id, { onDelete: "cascade", onUpdate: "cascade" }),
  firstSeenOn: date("first_seen_on").notNull(),
  lastSeenOn: date("last_seen_on").notNull(),
  observedCellCount: integer("observed_cell_count").notNull(),
  bandwidthKhz: integer("bandwidth_khz"),
});

export const siteReplacements = ObservationsSchema.table(
  "site_replacements",
  {
    observedSiteId: integer("observed_site_id")
      .notNull()
      .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    replacedBySiteId: integer("replaced_by_site_id")
      .notNull()
      .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.observedSiteId, t.replacedBySiteId] }),
    index("site_replacements_replaced_by_site_id_idx").on(t.replacedBySiteId),
    check("site_replacements_two_sites", sql`${t.observedSiteId} <> ${t.replacedBySiteId}`),
  ],
);

export const calibrationRuns = ObservationsSchema.table("calibration_runs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  stationHalf: StationHalf("station_half").notNull(),
});

function calibrationRunColumn() {
  return integer("calibration_run_id")
    .notNull()
    .references(() => calibrationRuns.id, { onDelete: "cascade", onUpdate: "cascade" });
}

function taGroupColumn() {
  return smallint("ta_group_id")
    .notNull()
    .references(() => taGroups.id, { onDelete: "cascade", onUpdate: "cascade" });
}

export const taCalibrations = ObservationsSchema.table(
  "ta_calibrations",
  {
    calibrationRunId: calibrationRunColumn(),
    taGroupId: taGroupColumn(),
    rat: ratEnum("rat").notNull(),
    scale: real("scale").notNull(),
    offsetM: real("offset_m").notNull(),
    rowCount: integer("row_count").notNull(),
    stationCount: integer("station_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.calibrationRunId, t.taGroupId, t.rat] }),
    index("ta_calibrations_ta_group_id_idx").on(t.taGroupId),
    check("ta_calibrations_scale_positive", sql`${t.scale} > 0`),
  ],
);

export const errorModels = ObservationsSchema.table(
  "error_models",
  {
    calibrationRunId: calibrationRunColumn(),
    taGroupId: taGroupColumn(),
    rat: ratEnum("rat").notNull(),
    areaClass: AreaClass("area_class").notNull(),
    sigmaM: real("sigma_m").notNull(),
    tailMeanM: real("tail_mean_m").notNull(),
    outlierShare: real("outlier_share").notNull(),
    rowCount: integer("row_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.calibrationRunId, t.taGroupId, t.rat, t.areaClass] }),
    index("error_models_ta_group_id_idx").on(t.taGroupId),
    check("error_models_sizes", sql`${t.sigmaM} > 0 AND ${t.tailMeanM} > 0 AND ${t.outlierShare} BETWEEN 0 AND 1`),
  ],
);

export const levelModels = ObservationsSchema.table(
  "level_models",
  {
    calibrationRunId: calibrationRunColumn(),
    rat: ratEnum("rat").notNull(),
    areaClass: AreaClass("area_class").notNull(),
    slopeDbPerDecade: real("slope_db_per_decade").notNull(),
    scatterDb: real("scatter_db").notNull(),
    binCount: integer("bin_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.calibrationRunId, t.rat, t.areaClass] }),
    check("level_models_sizes", sql`${t.slopeDbPerDecade} > 0 AND ${t.scatterDb} > 0`),
  ],
);

export const ellipseScales = ObservationsSchema.table(
  "ellipse_scales",
  {
    calibrationRunId: calibrationRunColumn(),
    evidenceClass: EvidenceClass("evidence_class").notNull(),
    isSurrounded: boolean("is_surrounded").notNull(),
    scale: real("scale").notNull(),
    siteCount: integer("site_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.calibrationRunId, t.evidenceClass, t.isSurrounded] }),
    check("ellipse_scales_scale_positive", sql`${t.scale} > 0`),
  ],
);

export const snapPriors = ObservationsSchema.table(
  "snap_priors",
  {
    calibrationRunId: calibrationRunColumn(),
    kind: SnapCandidateKind("kind").notNull(),
    sameOperator: boolean("same_operator").notNull(),
    prior: real("prior").notNull(),
  },
  (t) => [primaryKey({ columns: [t.calibrationRunId, t.kind, t.sameOperator] }), check("snap_priors_prior_positive", sql`${t.prior} > 0`)],
);

export const evaluationRuns = ObservationsSchema.table(
  "evaluation_runs",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    calibrationRunId: integer("calibration_run_id").references(() => calibrationRuns.id, { onDelete: "set null", onUpdate: "cascade" }),
    stationHalf: StationHalf("station_half").notNull(),
    groundTruthCount: integer("ground_truth_count").notNull(),
  },
  (t) => [index("evaluation_runs_calibration_run_id_idx").on(t.calibrationRunId)],
);

function evaluationRunColumn() {
  return integer("evaluation_run_id")
    .notNull()
    .references(() => evaluationRuns.id, { onDelete: "cascade", onUpdate: "cascade" });
}

export const evaluationResults = ObservationsSchema.table(
  "evaluation_results",
  {
    evaluationRunId: evaluationRunColumn(),
    algorithmVersion: smallint("algorithm_version").notNull(),
    dimension: EvaluationDimension("dimension").notNull(),
    dimensionValue: varchar("dimension_value", { length: 32 }).notNull(),
    siteCount: integer("site_count").notNull(),
    errorP50M: integer("error_p50_m").notNull(),
    errorP80M: integer("error_p80_m").notNull(),
    errorP95M: integer("error_p95_m").notNull(),
    insideRadiusCount: integer("inside_radius_count").notNull(),
    ambiguousCount: integer("ambiguous_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.evaluationRunId, t.algorithmVersion, t.dimension, t.dimensionValue] }),
    check("evaluation_results_algorithm_version_nonnegative", sql`${t.algorithmVersion} >= 0`),
  ],
);

export const snappingResults = ObservationsSchema.table(
  "snapping_results",
  {
    evaluationRunId: evaluationRunColumn(),
    algorithmVersion: smallint("algorithm_version").notNull(),
    kind: SnapCandidateKind("kind").notNull(),
    possible: integer("possible").notNull(),
    right: integer("right").notNull(),
    wrong: integer("wrong").notNull(),
    missed: integer("missed").notNull(),
  },
  (t) => [primaryKey({ columns: [t.evaluationRunId, t.algorithmVersion, t.kind] })],
);

export const snappingBands = ObservationsSchema.table(
  "snapping_bands",
  {
    evaluationRunId: evaluationRunColumn(),
    algorithmVersion: smallint("algorithm_version").notNull(),
    band: smallint("band").notNull(),
    snaps: integer("snaps").notNull(),
    right: integer("right").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.evaluationRunId, t.algorithmVersion, t.band] }),
    check("snapping_bands_band_range", sql`${t.band} BETWEEN 0 AND 9`),
    check("snapping_bands_right_within_snaps", sql`${t.right} BETWEEN 0 AND ${t.snaps}`),
  ],
);

export const groupingResults = ObservationsSchema.table(
  "grouping_results",
  {
    evaluationRunId: evaluationRunColumn(),
    algorithmVersion: smallint("algorithm_version").notNull(),
    groups: integer("groups").notNull(),
    right: integer("right").notNull(),
    wrong: integer("wrong").notNull(),
    missed: integer("missed").notNull(),
  },
  (t) => [primaryKey({ columns: [t.evaluationRunId, t.algorithmVersion] })],
);

export const readerScores = ObservationsSchema.table(
  "reader_scores",
  {
    evaluationRunId: evaluationRunColumn(),
    readerVersionId: smallint("reader_version_id")
      .notNull()
      .references(() => readerVersions.id, { onDelete: "cascade", onUpdate: "cascade" }),
    uploads: integer("uploads").notNull(),
    taOnConfirmed: integer("ta_on_confirmed").notNull(),
    taWithinTolerance: integer("ta_within_tolerance").notNull(),
    valuesAgreed: integer("values_agreed").notNull(),
    valuesDiffered: integer("values_differed").notNull(),
    onlyCells: integer("only_cells").notNull(),
  },
  (t) => [primaryKey({ columns: [t.evaluationRunId, t.readerVersionId] }), index("reader_scores_reader_version_id_idx").on(t.readerVersionId)],
);

export const gnbLengthTests = ObservationsSchema.table(
  "gnb_length_tests",
  {
    evaluationRunId: evaluationRunColumn(),
    plmn: varchar("plmn", { length: 6 }).notNull(),
    length: smallint("length").notNull(),
    isCutLength: boolean("is_cut_length").notNull(),
    cells: integer("cells").notNull(),
    together: integer("together").notNull(),
    apart: integer("apart").notNull(),
    sites: integer("sites").notNull(),
  },
  (t) => [primaryKey({ columns: [t.evaluationRunId, t.plmn, t.length] }), check("gnb_length_tests_length_range", sql`${t.length} BETWEEN 22 AND 32`)],
);

export const cellCopies = ObservationsSchema.table(
  "cell_copies",
  {
    observedCellId: integer("observed_cell_id")
      .primaryKey()
      .references(() => observedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    primaryCellId: integer("primary_cell_id")
      .notNull()
      .references(() => observedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    basis: CellCopyBasis("basis").notNull(),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cell_copies_primary_cell_id_idx").on(t.primaryCellId),
    check("cell_copies_two_cells", sql`${t.observedCellId} <> ${t.primaryCellId}`),
  ],
);

export const siteEstimates = ObservationsSchema.table(
  "site_estimates",
  {
    observedSiteId: integer("observed_site_id")
      .notNull()
      .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    algorithmVersion: smallint("algorithm_version").notNull(),
    calibrationRunId: integer("calibration_run_id").references(() => calibrationRuns.id, { onDelete: "set null", onUpdate: "cascade" }),
    estimatedAt: timestamp("estimated_at", { withTimezone: true }).notNull().defaultNow(),
    point: geometry("point", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    regionId: integer("region_id").references(() => regions.id, { onDelete: "set null", onUpdate: "cascade" }),
    uncertaintyM: integer("uncertainty_m").notNull(),
    ellipseMajorM: integer("ellipse_major_m").notNull(),
    ellipseMinorM: integer("ellipse_minor_m").notNull(),
    ellipseAzimuthDeg: smallint("ellipse_azimuth_deg").notNull(),
    alternativePoint: geometry("alternative_point", { type: "point", mode: "xy", srid: 4326 }),
    isConsistent: boolean("is_consistent").notNull(),
    sampleCount: bigint("sample_count", { mode: "number" }).notNull(),
    contributorCount: integer("contributor_count").notNull(),
    personCount: integer("person_count").notNull(),
    binCount: integer("bin_count").notNull(),
    taSampleCount: bigint("ta_sample_count", { mode: "number" }).notNull(),
    angularCoverageDeg: smallint("angular_coverage_deg").notNull(),
    distinctDays: integer("distinct_days").notNull(),
    maxDistanceM: integer("max_distance_m").notNull(),
    leaveOutShiftM: integer("leave_out_shift_m"),
    evidenceClass: EvidenceClass("evidence_class").notNull(),
    ellipseScale: real("ellipse_scale").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.observedSiteId, t.algorithmVersion] }),
    index("site_estimates_point_idx").using("gist", t.point),
    index("site_estimates_calibration_run_id_idx").on(t.calibrationRunId),
    index("site_estimates_estimated_at_idx").on(t.algorithmVersion, t.estimatedAt),
    check("site_estimates_algorithm_version_positive", sql`${t.algorithmVersion} > 0`),
    check(
      "site_estimates_sizes_nonnegative",
      sql`${t.uncertaintyM} >= 0 AND ${t.ellipseMinorM} >= 0 AND ${t.ellipseMajorM} >= ${t.ellipseMinorM} AND ${t.maxDistanceM} >= 0`,
    ),
    check("site_estimates_ellipse_azimuth_range", sql`${t.ellipseAzimuthDeg} BETWEEN 0 AND 179`),
    check("site_estimates_angular_coverage_range", sql`${t.angularCoverageDeg} BETWEEN 0 AND 360`),
    check("site_estimates_leave_out_shift_nonnegative", sql`${t.leaveOutShiftM} >= 0`),
    check("site_estimates_ellipse_scale_positive", sql`${t.ellipseScale} > 0`),
  ],
);

function estimateKey(t: { observedSiteId: AnyPgColumn; algorithmVersion: AnyPgColumn }, name: string) {
  return foreignKey({
    name,
    columns: [t.observedSiteId, t.algorithmVersion],
    foreignColumns: [siteEstimates.observedSiteId, siteEstimates.algorithmVersion],
  })
    .onDelete("cascade")
    .onUpdate("cascade");
}

export const siteGroups = ObservationsSchema.table(
  "site_groups",
  {
    observedSiteId: integer("observed_site_id").notNull(),
    algorithmVersion: smallint("algorithm_version").notNull(),
    leadSiteId: integer("lead_site_id")
      .notNull()
      .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.observedSiteId, t.algorithmVersion] }),
    estimateKey(t, "site_groups_estimate_fkey"),
    index("site_groups_lead_site_id_idx").on(t.leadSiteId),
  ],
);

export const groupEstimates = ObservationsSchema.table(
  "group_estimates",
  {
    leadSiteId: integer("lead_site_id")
      .notNull()
      .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    algorithmVersion: smallint("algorithm_version").notNull(),
    calibrationRunId: integer("calibration_run_id").references(() => calibrationRuns.id, { onDelete: "set null", onUpdate: "cascade" }),
    estimatedAt: timestamp("estimated_at", { withTimezone: true }).notNull().defaultNow(),
    point: geometry("point", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    regionId: integer("region_id").references(() => regions.id, { onDelete: "set null", onUpdate: "cascade" }),
    uncertaintyM: integer("uncertainty_m").notNull(),
    ellipseMajorM: integer("ellipse_major_m").notNull(),
    ellipseMinorM: integer("ellipse_minor_m").notNull(),
    ellipseAzimuthDeg: smallint("ellipse_azimuth_deg").notNull(),
    alternativePoint: geometry("alternative_point", { type: "point", mode: "xy", srid: 4326 }),
    isConsistent: boolean("is_consistent").notNull(),
    sampleCount: bigint("sample_count", { mode: "number" }).notNull(),
    contributorCount: integer("contributor_count").notNull(),
    personCount: integer("person_count").notNull(),
    binCount: integer("bin_count").notNull(),
    taSampleCount: bigint("ta_sample_count", { mode: "number" }).notNull(),
    angularCoverageDeg: smallint("angular_coverage_deg").notNull(),
    distinctDays: integer("distinct_days").notNull(),
    maxDistanceM: integer("max_distance_m").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.leadSiteId, t.algorithmVersion] }),
    index("group_estimates_point_idx").using("gist", t.point),
    index("group_estimates_calibration_run_id_idx").on(t.calibrationRunId),
    index("group_estimates_estimated_at_idx").on(t.algorithmVersion, t.estimatedAt),
    check("group_estimates_algorithm_version_positive", sql`${t.algorithmVersion} > 0`),
    check(
      "group_estimates_sizes_nonnegative",
      sql`${t.uncertaintyM} >= 0 AND ${t.ellipseMinorM} >= 0 AND ${t.ellipseMajorM} >= ${t.ellipseMinorM} AND ${t.maxDistanceM} >= 0`,
    ),
    check("group_estimates_ellipse_azimuth_range", sql`${t.ellipseAzimuthDeg} BETWEEN 0 AND 179`),
    check("group_estimates_angular_coverage_range", sql`${t.angularCoverageDeg} BETWEEN 0 AND 360`),
  ],
);

export const candidateSources = ObservationsSchema.table("candidate_sources", {
  source: CandidateSource("source").primaryKey(),
  licence: varchar("licence", { length: 255 }).notNull(),
  mayCopyCoordinates: boolean("may_copy_coordinates").notNull(),
});

export const candidates = ObservationsSchema.table(
  "candidates",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    source: CandidateSource("source")
      .notNull()
      .references(() => candidateSources.source, { onDelete: "cascade", onUpdate: "cascade" }),
    ref: varchar("ref", { length: 128 }).notNull(),
    point: geometry("point", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    attributes: jsonb("attributes").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("candidates_source_ref_unique").on(t.source, t.ref), index("candidates_point_idx").using("gist", t.point)],
);

export const stationOrigins = ObservationsSchema.table(
  "station_origins",
  {
    stationId: integer("station_id")
      .primaryKey()
      .references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    observedSiteId: integer("observed_site_id").references(() => observedSites.id, { onDelete: "set null", onUpdate: "cascade" }),
    coordinatesFrom: CoordinatesFrom("coordinates_from").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("station_origins_observed_site_id_idx").on(t.observedSiteId)],
);

export const observationFlags = ObservationsSchema.table(
  "observation_flags",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    kind: ObservationFlagKind("kind").notNull(),
    subjectKey: varchar("subject_key", { length: 96 }).notNull(),
    observedSiteId: integer("observed_site_id").references(() => observedSites.id, { onDelete: "set null", onUpdate: "cascade" }),
    observedCellId: integer("observed_cell_id").references(() => observedCells.id, { onDelete: "set null", onUpdate: "cascade" }),
    stationId: integer("station_id").references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    cellId: integer("cell_id").references(() => cells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sectorId: integer("sector_id").references(() => stationSectors.id, { onDelete: "cascade", onUpdate: "cascade" }),
    countryCode: char("country_code", { length: 2 }).references(() => countries.code, { onDelete: "cascade", onUpdate: "cascade" }),
    regionId: integer("region_id").references(() => regions.id, { onDelete: "set null", onUpdate: "cascade" }),
    bandId: integer("band_id").references(() => bands.id, { onDelete: "cascade", onUpdate: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: uuid("user_id").references(() => contributors.userId, { onDelete: "cascade", onUpdate: "cascade" }),
    readerVersionId: smallint("reader_version_id").references(() => readerVersions.id, { onDelete: "cascade", onUpdate: "cascade" }),
    deviceModelId: integer("device_model_id").references(() => deviceModels.id, { onDelete: "cascade", onUpdate: "cascade" }),
    evidence: jsonb("evidence").notNull(),
    suggestion: jsonb("suggestion"),
    measure: jsonb("measure"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedReason: ObservationFlagClosedReason("closed_reason"),
    dismissedReason: ObservationFlagDismissedReason("dismissed_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    note: varchar("note", { length: 500 }),
  },
  (t) => [
    uniqueIndex("observation_flags_one_open")
      .on(t.kind, t.subjectKey)
      .where(sql`${t.closedReason} IS NULL`),
    index("observation_flags_subject_idx").on(t.kind, t.subjectKey, t.resolvedAt),
    index("observation_flags_open_created_idx")
      .on(t.createdAt, t.id)
      .where(sql`${t.closedReason} IS NULL`),
    index("observation_flags_updated_idx").on(t.updatedAt, t.id),
    index("observation_flags_station_id_idx").on(t.stationId),
    index("observation_flags_cell_id_idx").on(t.cellId),
    index("observation_flags_sector_id_idx").on(t.sectorId),
    index("observation_flags_observed_cell_id_idx").on(t.observedCellId),
    index("observation_flags_observed_site_id_idx").on(t.observedSiteId),
    index("observation_flags_country_code_idx").on(t.countryCode),
    index("observation_flags_region_id_idx").on(t.regionId),
    index("observation_flags_band_id_idx").on(t.bandId),
    index("observation_flags_device_id_idx").on(t.deviceId),
    index("observation_flags_user_id_idx").on(t.userId),
    index("observation_flags_reader_version_id_idx").on(t.readerVersionId),
    index("observation_flags_device_model_id_idx").on(t.deviceModelId),
    check("observation_flags_resolved_at_when_closed", sql`(${t.closedReason} IS NULL) = (${t.resolvedAt} IS NULL)`),
    check("observation_flags_resolver_when_closed", sql`${t.closedReason} IS NOT NULL OR ${t.resolvedById} IS NULL`),
    check("observation_flags_note_when_dismissed", sql`${t.note} IS NULL OR ${t.closedReason} IS NOT DISTINCT FROM 'dismissed'`),
    check(
      "observation_flags_dismissed_reason_when_dismissed",
      sql`(${t.dismissedReason} IS NOT NULL) = (${t.closedReason} IS NOT DISTINCT FROM 'dismissed')`,
    ),
  ],
);

export const snapTests = ObservationsSchema.table(
  "snap_tests",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    observedSiteId: integer("observed_site_id").notNull(),
    algorithmVersion: smallint("algorithm_version").notNull(),
    locationId: integer("location_id").references(() => locations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    officialSiteId: integer("official_site_id").references(() => officialSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    otherSiteId: integer("other_site_id").references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
    candidateId: integer("candidate_id").references(() => candidates.id, { onDelete: "cascade", onUpdate: "cascade" }),
    difference: real("difference").notNull(),
    probability: real("probability").notNull(),
    isSnap: boolean("is_snap").notNull(),
  },
  (t) => [
    estimateKey(t, "snap_tests_estimate_fkey"),
    unique("snap_tests_target_unique")
      .on(t.observedSiteId, t.algorithmVersion, t.locationId, t.officialSiteId, t.otherSiteId, t.candidateId)
      .nullsNotDistinct(),
    uniqueIndex("snap_tests_one_snap")
      .on(t.observedSiteId, t.algorithmVersion)
      .where(sql`${t.isSnap}`),
    index("snap_tests_location_id_idx").on(t.locationId),
    index("snap_tests_official_site_id_idx").on(t.officialSiteId),
    index("snap_tests_other_site_id_idx").on(t.otherSiteId),
    index("snap_tests_candidate_id_idx").on(t.candidateId),
    check("snap_tests_one_target", sql`num_nonnulls(${t.locationId}, ${t.officialSiteId}, ${t.otherSiteId}, ${t.candidateId}) = 1`),
    check("snap_tests_probability_range", sql`${t.probability} BETWEEN 0 AND 1`),
  ],
);

export const siteEvidenceGrids = ObservationsSchema.table(
  "site_evidence_grids",
  {
    observedSiteId: integer("observed_site_id").notNull(),
    algorithmVersion: smallint("algorithm_version").notNull(),
    origin: geometry("origin", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    cellM: smallint("cell_m").notNull(),
    columns: smallint("columns").notNull(),
    rows: smallint("rows").notNull(),
    cost: bytea("cost").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.observedSiteId, t.algorithmVersion] }),
    estimateKey(t, "site_evidence_grids_estimate_fkey"),
    check("site_evidence_grids_size", sql`${t.cellM} > 0 AND ${t.columns} > 0 AND ${t.rows} > 0 AND length(${t.cost}) = ${t.columns} * ${t.rows}`),
  ],
);

export const cellShapes = ObservationsSchema.table(
  "cell_shapes",
  {
    observedCellId: integer("observed_cell_id")
      .notNull()
      .references(() => observedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    shapeVersion: smallint("shape_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    bearingDeg: real("bearing_deg").notNull(),
    spreadDeg: real("spread_deg").notNull(),
    reachM: integer("reach_m").notNull(),
    reachTaM: integer("reach_ta_m"),
    meanQualityCentiDb: integer("mean_quality_centi_db"),
    meanSinrCentiDb: integer("mean_sinr_centi_db"),
    footprint: polygon("footprint").notNull(),
  },
  (t) => [primaryKey({ columns: [t.observedCellId, t.shapeVersion] }), index("cell_shapes_footprint_idx").using("gist", t.footprint)],
);

export const cellLevelProfiles = ObservationsSchema.table(
  "cell_level_profiles",
  {
    observedCellId: integer("observed_cell_id").notNull(),
    shapeVersion: smallint("shape_version").notNull(),
    distanceBand: smallint("distance_band").notNull(),
    meanLevelCentiDb: integer("mean_level_centi_db").notNull(),
    meanSinrCentiDb: integer("mean_sinr_centi_db"),
    sampleCount: integer("sample_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.observedCellId, t.shapeVersion, t.distanceBand] }),
    foreignKey({
      name: "cell_level_profiles_shape_fkey",
      columns: [t.observedCellId, t.shapeVersion],
      foreignColumns: [cellShapes.observedCellId, cellShapes.shapeVersion],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
  ],
);

export const cellEdges = ObservationsSchema.table(
  "cell_edges",
  {
    observedCellId: integer("observed_cell_id").notNull(),
    shapeVersion: smallint("shape_version").notNull(),
    kind: CellEdgeKind("kind").notNull(),
    edge: multiLineString("edge").notNull(),
    lengthM: integer("length_m").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.observedCellId, t.shapeVersion, t.kind] }),
    foreignKey({
      name: "cell_edges_shape_fkey",
      columns: [t.observedCellId, t.shapeVersion],
      foreignColumns: [cellShapes.observedCellId, cellShapes.shapeVersion],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
  ],
);

export const resolvedNeighbours = ObservationsSchema.table(
  "resolved_neighbours",
  {
    plmn: varchar("plmn", { length: 6 }).notNull(),
    rat: ratEnum("rat").notNull(),
    channel: integer("channel").notNull(),
    pci: smallint("pci").notNull(),
    bin: bigint("bin", { mode: "bigint" }).notNull(),
    observedCellId: integer("observed_cell_id")
      .notNull()
      .references(() => observedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.plmn, t.rat, t.channel, t.pci, t.bin] }), index("resolved_neighbours_observed_cell_id_idx").on(t.observedCellId)],
);

export const cellConfirmations = ObservationsSchema.table("cell_confirmations", {
  observedCellId: integer("observed_cell_id")
    .primaryKey()
    .references(() => observedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
  basis: ConfirmationBasis("basis").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteConfirmations = ObservationsSchema.table("site_confirmations", {
  observedSiteId: integer("observed_site_id")
    .primaryKey()
    .references(() => observedSites.id, { onDelete: "cascade", onUpdate: "cascade" }),
  basis: ConfirmationBasis("basis").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteCopies = ObservationsSchema.view("site_copies", {
  observedSiteId: integer("observed_site_id").notNull(),
  primarySiteId: integer("primary_site_id").notNull(),
}).as(sql`
  SELECT c.observed_site_id, min(p.observed_site_id) AS primary_site_id
  FROM observations.observed_cells c
  LEFT JOIN observations.cell_copies k ON k.observed_cell_id = c.id
  LEFT JOIN observations.observed_cells p ON p.id = k.primary_cell_id
  WHERE c.observed_site_id IS NOT NULL
  GROUP BY c.observed_site_id
  HAVING bool_and(p.observed_site_id IS NOT NULL)
    AND min(p.observed_site_id) = max(p.observed_site_id)
    AND min(p.observed_site_id) <> c.observed_site_id
`);

export const observedCellValues = ObservationsSchema.view("observed_cell_values", {
  observedCellId: integer("observed_cell_id").notNull(),
  field: CellValueField("field").notNull(),
  value: integer("value").notNull(),
  sampleCount: bigint("sample_count", { mode: "number" }).notNull(),
  contributorBits: bigint("contributor_bits", { mode: "bigint" }).notNull(),
  firstSeenOn: date("first_seen_on").notNull(),
  lastSeenOn: date("last_seen_on").notNull(),
  isCurrent: boolean("is_current").notNull(),
}).as(sql`
  SELECT v.observed_cell_id, v.field, v.value,
    sum(v.sample_count) AS sample_count,
    bit_or(v.contributor_bits) AS contributor_bits,
    min(v.first_seen_on) AS first_seen_on,
    max(v.last_seen_on) AS last_seen_on,
    row_number() OVER (
      PARTITION BY v.observed_cell_id, v.field
      ORDER BY max(v.last_seen_on) DESC, sum(v.sample_count) DESC, v.value
    ) = 1 AS is_current
  FROM observations.cell_values v
  GROUP BY v.observed_cell_id, v.field, v.value
  HAVING bool_or(NOT v.held) OR EXISTS (
    SELECT 1 FROM observations.cell_matches m
    LEFT JOIN public.gsm_cells g ON g.cell_id = m.cell_id
    LEFT JOIN public.umts_cells u ON u.cell_id = m.cell_id
    LEFT JOIN public.lte_cells l ON l.cell_id = m.cell_id
    LEFT JOIN public.nr_cells n ON n.cell_id = m.cell_id
    WHERE m.observed_cell_id = v.observed_cell_id
      AND v.value = CASE v.field
        WHEN 'areaCode' THEN coalesce(l.tac, n.nrtac, u.lac, g.lac)
        WHEN 'pci' THEN coalesce(l.pci, n.pci, u.psc, g.bsic)
        WHEN 'channel' THEN coalesce(l.earfcn, n.arfcn, u.arfcn)
      END
  )
`);
