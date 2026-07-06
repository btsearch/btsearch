import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm/sql";

import { locationPhotos, users } from "./auth.ts";
import { NRType, bands, cells, operators, ratEnum, regions, stationSectors, stations } from "./bts.ts";

export const SubmissionStatus = pgEnum("submission_status", ["pending", "approved", "rejected"]);
export const SubmissionTypeEnum = pgEnum("submission_type", ["new", "update", "delete"]);
export const CellOperationEnum = pgEnum("cell_operation", ["add", "update", "delete"]);
export const StationOperationEnum = pgEnum("station_operation", ["add", "update", "delete"]);
export const SubmissionsSchema = pgSchema("submissions");

/**
 * Submissions table
 */
export const submissions = SubmissionsSchema.table(
  "submissions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`)
      .notNull(),
    station_id: integer("station_id").references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    submitter_id: uuid("submitter_id")
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    status: SubmissionStatus("status").notNull().default("pending"),
    type: SubmissionTypeEnum("type").notNull().default("new"),
    reviewer_id: uuid("reviewer_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    review_notes: text("review_notes"),
    submitter_note: text("submitter_note"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    reviewed_at: timestamp({ withTimezone: true }),
    pending_photos: integer("pending_photos"),
  },
  (t) => [
    index("submission_station_id_idx").on(t.station_id),
    index("submission_submitter_id_idx").on(t.submitter_id),
    index("submission_reviewer_id_idx").on(t.reviewer_id),
    index("submission_status_idx").on(t.status),
    index("submission_created_at_idx").on(t.createdAt),
  ],
);

export const proposedCells = SubmissionsSchema.table(
  "proposed_cells",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    submission_id: uuid("submission_id").references(() => submissions.id, { onDelete: "cascade", onUpdate: "cascade" }),
    operation: CellOperationEnum("operation").notNull().default("add"),
    target_cell_id: integer("target_cell_id").references(() => cells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    station_id: integer("station_id").references(() => stations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    band_id: integer("band_id").references(() => bands.id, { onDelete: "cascade", onUpdate: "cascade" }),
    target_sector_id: integer("target_sector_id").references(() => stationSectors.id, { onDelete: "set null", onUpdate: "cascade" }),
    sector_local_id: text("sector_local_id"),
    sector_unassigned: boolean("sector_unassigned").default(false).notNull(),
    rat: ratEnum("rat"),
    notes: text("notes"),
    is_confirmed: boolean("is_confirmed").default(false).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proposed_cells_submission_id_idx").on(t.submission_id), unique("proposed_cells_unique").on(t.submission_id, t.target_cell_id)],
);

export const proposedSectors = SubmissionsSchema.table(
  "proposed_sectors",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    submission_id: uuid("submission_id").references(() => submissions.id, { onDelete: "cascade", onUpdate: "cascade" }),
    target_sector_id: integer("target_sector_id").references(() => stationSectors.id, { onDelete: "set null", onUpdate: "cascade" }),
    local_id: text("local_id").notNull(),
    azimuth: integer("azimuth").notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("proposed_sectors_submission_id_idx").on(t.submission_id),
    unique("proposed_sectors_submission_local_unique").on(t.submission_id, t.local_id),
    check("proposed_sectors_azimuth_range", sql`${t.azimuth} BETWEEN 0 AND 360`),
  ],
);

export const proposedGSMCells = SubmissionsSchema.table(
  "proposed_gsm_cells",
  {
    proposed_cell_id: integer("proposed_cell_id")
      .primaryKey()
      .references(() => proposedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    lac: integer("lac").notNull(),
    cid: integer("cid").notNull(),
    e_gsm: boolean("e_gsm").default(false),
  },
  (t) => [check("gsm_lac_check", sql`${t.lac} BETWEEN 0 AND 65535`), check("gsm_cid_check", sql`${t.cid} BETWEEN 0 AND 65535`)],
);

export const proposedUMTSCells = SubmissionsSchema.table(
  "proposed_umts_cells",
  {
    proposed_cell_id: integer("proposed_cell_id")
      .primaryKey()
      .references(() => proposedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    lac: integer("lac"),
    arfcn: integer("arfcn"),
    rnc: integer("rnc").notNull(),
    cid: integer("cid").notNull(),
  },
  (t) => [
    check("umts_lac_check", sql`${t.lac} BETWEEN 0 AND 65535`),
    check("umts_rnc_check", sql`${t.rnc} BETWEEN 0 AND 65535`),
    check("umts_cid_check", sql`${t.cid} BETWEEN 0 AND 65535`),
    check("umts_arfcn_check", sql`${t.arfcn} BETWEEN 0 AND 16383`),
  ],
);

export const proposedLTECells = SubmissionsSchema.table(
  "proposed_lte_cells",
  {
    proposed_cell_id: integer("proposed_cell_id")
      .primaryKey()
      .references(() => proposedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tac: integer("tac"),
    enbid: integer("enbid").notNull(),
    clid: integer("clid").notNull(),
    pci: integer("pci"),
    earfcn: integer("earfcn"),
    supports_iot: boolean("supports_iot").default(false),
  },
  (t) => [
    check("lte_tac_check", sql`${t.tac} BETWEEN 0 AND 65535`),
    check("clid_check", sql`${t.clid} BETWEEN 0 AND 255`),
    check("lte_enbid_check", sql`${t.enbid} BETWEEN 0 AND 1048575`),
    check("pci_check", sql`${t.pci} BETWEEN 0 AND 503`),
    check("lte_earfcn_check", sql`${t.earfcn} BETWEEN 0 AND 262143`),
  ],
);

export const proposedNRCells = SubmissionsSchema.table(
  "proposed_nr_cells",
  {
    proposed_cell_id: integer("proposed_cell_id")
      .primaryKey()
      .references(() => proposedCells.id, { onDelete: "cascade", onUpdate: "cascade" }),
    nrtac: integer("nrtac"),
    gnbid: integer("gnbid"),
    gnbid_length: integer("gnbid_length").default(24),
    clid: integer("clid"),
    pci: integer("pci"),
    arfcn: integer("arfcn"),
    type: NRType("type").notNull(),
    supports_nr_redcap: boolean("supports_nr_redcap").default(false),
  },
  (t) => [
    check("nr_nrtac_check", sql`${t.nrtac} BETWEEN 0 AND 16777215`),
    check("nr_gnbid_check", sql`${t.gnbid} BETWEEN 0 AND 4294967295`),
    check("nr_clid_check", sql`${t.clid} BETWEEN 0 AND 16383`),
    check("nr_pci_check", sql`${t.pci} BETWEEN 0 AND 1007`),
    check("nr_arfcn_check", sql`${t.arfcn} BETWEEN 0 AND 3279165`),
  ],
);

export const proposedStations = SubmissionsSchema.table(
  "proposed_stations",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    submission_id: uuid("submission_id").references(() => submissions.id, { onDelete: "cascade", onUpdate: "cascade" }),
    operation: StationOperationEnum("operation").notNull().default("add"),
    target_station_id: integer("target_station_id").references(() => stations.id, { onDelete: "set null", onUpdate: "cascade" }),
    station_id: varchar("station_id", { length: 16 }),
    operator_id: integer("operator_id")
      .references(() => operators.id, { onDelete: "set null", onUpdate: "cascade" })
      .notNull(),
    notes: text("notes"),
    networks_id: integer("networks_id"),
    networks_name: varchar("networks_name", { length: 50 }),
    mno_name: varchar("mno_name", { length: 50 }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    is_confirmed: boolean("is_confirmed").default(false),
  },
  (t) => [
    index("proposed_stations_submission_id_idx").on(t.submission_id),
    index("proposed_stations_target_station_id_idx").on(t.target_station_id),
    unique("proposed_stations_submission_station_unique").on(t.submission_id, t.station_id),
  ],
);

export const proposedLocations = SubmissionsSchema.table(
  "proposed_locations",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    submission_id: uuid("submission_id").references(() => submissions.id, { onDelete: "cascade", onUpdate: "cascade" }),
    region_id: integer("region_id")
      .references(() => regions.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    city: varchar("city", { length: 100 }),
    address: text("address"),
    longitude: doublePrecision("longitude").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proposed_locations_submission_id_idx").on(t.submission_id)],
);

export const submissionPhotos = SubmissionsSchema.table(
  "submission_photos",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    submission_id: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    attachment_id: integer("attachment_id").notNull(),
    note: varchar("note", { length: 100 }),
    taken_at: timestamp("taken_at", { withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("submission_photos_submission_id_idx").on(t.submission_id), unique("submission_photos_unique").on(t.submission_id, t.attachment_id)],
);

export const submissionLocationPhotoSelections = SubmissionsSchema.table(
  "submission_location_photo_selections",
  {
    submission_id: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    location_photo_id: integer("location_photo_id")
      .notNull()
      .references(() => locationPhotos.id, { onDelete: "cascade" }),
    is_main: boolean("is_main").notNull().default(false),
    is_removal: boolean("is_removal").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.submission_id, t.location_photo_id] }),
    check("is_main_not_removal", sql`NOT (${t.is_main} = true AND ${t.is_removal} = true)`),
  ],
);
