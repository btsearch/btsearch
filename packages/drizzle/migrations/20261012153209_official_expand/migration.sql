SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DELETE FROM "stations_permits" WHERE "permit_id" IS NULL OR "station_id" IS NULL;--> statement-breakpoint
LOCK TABLE "official"."locations", "official"."sites", "official"."permits" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
WITH "held" AS MATERIALIZED (
	SELECT ul."id" AS "list_id", item."position", item."value",
		CASE WHEN jsonb_typeof(item."value") = 'number' THEN item."value"::numeric END AS "number"
	FROM "user_lists" AS ul
	CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(ul."stations" -> 'uke') = 'array' THEN ul."stations" -> 'uke' ELSE '[]'::jsonb END)
		WITH ORDINALITY AS item ("value", "position")
), "kept" AS (
	SELECT held."list_id",
		COALESCE(jsonb_agg(held."value" ORDER BY held."position") FILTER (WHERE held."number" IS NULL OR s."id" IS NOT NULL), '[]'::jsonb) AS "ids"
	FROM "held"
	LEFT JOIN "official"."sites" AS s ON s."id" = held."number"
	GROUP BY held."list_id"
	HAVING count(*) FILTER (WHERE held."number" IS NOT NULL AND s."id" IS NULL) > 0
)
UPDATE "user_lists" AS ul
SET "stations" = jsonb_set(ul."stations", '{uke}', kept."ids")
FROM "kept"
WHERE ul."id" = kept."list_id";
--> statement-breakpoint
WITH "held" AS MATERIALIZED (
	SELECT ul."id" AS "list_id", item."position", item."value",
		CASE WHEN jsonb_typeof(item."value") = 'number' THEN item."value"::numeric END AS "number"
	FROM "user_lists" AS ul
	CROSS JOIN LATERAL jsonb_array_elements(ul."radiolines") WITH ORDINALITY AS item ("value", "position")
), "kept" AS (
	SELECT held."list_id",
		COALESCE(jsonb_agg(held."value" ORDER BY held."position") FILTER (WHERE held."number" IS NULL OR link."id" IS NOT NULL), '[]'::jsonb) AS "ids"
	FROM "held"
	LEFT JOIN "official"."microwave_links" AS link ON link."id" = held."number"
	GROUP BY held."list_id"
	HAVING count(*) FILTER (WHERE held."number" IS NOT NULL AND link."id" IS NULL) > 0
)
UPDATE "user_lists" AS ul
SET "radiolines" = kept."ids"
FROM "kept"
WHERE ul."id" = kept."list_id";
--> statement-breakpoint
DROP VIEW "uke"."uke_locations";--> statement-breakpoint
DROP VIEW "uke"."uke_stations";--> statement-breakpoint
DROP VIEW "uke"."uke_permits";--> statement-breakpoint
DROP VIEW "uke"."uke_permit_sectors";--> statement-breakpoint
DROP VIEW "uke"."uke_operators";--> statement-breakpoint
DROP VIEW "uke"."uke_radiolines";--> statement-breakpoint
DROP VIEW "uke"."radiolines_manufacturers";--> statement-breakpoint
DROP VIEW "uke"."radiolines_antenna_types";--> statement-breakpoint
DROP VIEW "uke"."radiolines_transmitter_types";--> statement-breakpoint
DROP VIEW "uke"."uke_station_watches";--> statement-breakpoint
DROP VIEW "uke"."uke_bands";--> statement-breakpoint
DROP VIEW "uke"."uke_import_metadata";--> statement-breakpoint
DROP SCHEMA "uke";--> statement-breakpoint
CREATE TYPE "official_layer" AS ENUM('sites', 'microwave_links');--> statement-breakpoint
CREATE TYPE "official_change" AS ENUM('site_added', 'site_moved', 'site_remapped', 'permit_added', 'permit_listed', 'permit_unlisted', 'permit_archived', 'station_linked', 'station_unlinked', 'microwave_link_added', 'microwave_link_renewed', 'microwave_link_archived');--> statement-breakpoint
CREATE TYPE "official_run_kind" AS ENUM('import', 'replay', 'remap', 'relink');--> statement-breakpoint
CREATE TYPE "official_run_state" AS ENUM('queued', 'running', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "official_run_step" AS ENUM('unlisted_permits', 'site_notifications', 'links', 'station_notifications', 'orphans', 'statistics', 'push', 'kmz', 'publish', 'prune');--> statement-breakpoint
CREATE TYPE "official_run_trigger" AS ENUM('scheduled', 'manual', 'cli');--> statement-breakpoint
CREATE TYPE "official_slice_outcome" AS ENUM('applied', 'unchanged', 'held');--> statement-breakpoint
CREATE TABLE "official"."dataset_slices" (
	"dataset_id" integer,
	"key" varchar(64),
	"snapshot_id" integer,
	"imported_at" timestamp with time zone,
	CONSTRAINT "dataset_slices_pkey" PRIMARY KEY("dataset_id","key")
);
--> statement-breakpoint
CREATE TABLE "official"."datasets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "official"."datasets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_id" integer NOT NULL,
	"key" varchar(64) NOT NULL,
	"legacy_key" varchar(20),
	"layer" "official_layer" NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"check_every_hours" smallint NOT NULL,
	"next_check_at" timestamp with time zone,
	"hold_shrink_percent" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datasets_source_key_unique" UNIQUE("source_id","key")
);
--> statement-breakpoint
CREATE TABLE "official"."files" (
	"sha256" char(64) PRIMARY KEY,
	"size_bytes" bigint NOT NULL,
	"media_type" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official"."listed_files" (
	"source_id" integer,
	"url" text,
	"file_name" varchar(255) NOT NULL,
	"size_bytes" bigint,
	"published_on" date,
	"etag" text,
	"last_modified" timestamp with time zone,
	"file_sha256" char(64),
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "listed_files_pkey" PRIMARY KEY("source_id","url")
);
--> statement-breakpoint
CREATE TABLE "official"."permit_listings" (
	"permit_id" integer,
	"dataset_id" integer,
	"slice" varchar(64) NOT NULL,
	"licensee_id" integer,
	"source_ref" varchar(255),
	CONSTRAINT "permit_listings_pkey" PRIMARY KEY("permit_id","dataset_id")
);
--> statement-breakpoint
CREATE TABLE "official"."snapshot_files" (
	"snapshot_id" integer,
	"position" smallint,
	"file_sha256" char(64) NOT NULL,
	CONSTRAINT "snapshot_files_pkey" PRIMARY KEY("snapshot_id","position")
);
--> statement-breakpoint
CREATE TABLE "official"."snapshot_slices" (
	"snapshot_id" integer,
	"dataset_id" integer,
	"slice" varchar(64),
	CONSTRAINT "snapshot_slices_pkey" PRIMARY KEY("snapshot_id","dataset_id","slice")
);
--> statement-breakpoint
CREATE TABLE "official"."snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "official"."snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sha256" char(64) NOT NULL UNIQUE,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official"."sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "official"."sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" varchar(64) NOT NULL UNIQUE,
	"country_code" char(2) NOT NULL,
	"short_name" varchar(32) NOT NULL,
	"authority" varchar(200) NOT NULL,
	"homepage_url" varchar(500) NOT NULL,
	"licence" varchar(200) NOT NULL,
	"attribution" text NOT NULL,
	"coverage_note" text,
	"is_redistributable" boolean NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"is_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_visible_only_if_redistributable" CHECK ("is_redistributable" OR NOT "is_visible")
);
--> statement-breakpoint
CREATE TABLE "official"."import_changes" (
	"run_id" uuid,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "official"."import_changes_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" "official_change" NOT NULL,
	"dataset_id" integer,
	"slice" varchar(64),
	"official_site_id" integer,
	"permit_id" integer,
	"station_id" integer,
	"microwave_link_id" integer,
	"from_location_id" integer,
	CONSTRAINT "import_changes_pkey" PRIMARY KEY("run_id","seq"),
	CONSTRAINT "import_changes_official_site_id_by_kind" CHECK (("official_site_id" IS NOT NULL) = ("kind" IN ('site_added', 'site_moved', 'site_remapped', 'permit_added', 'permit_listed', 'permit_unlisted', 'permit_archived'))),
	CONSTRAINT "import_changes_permit_id_by_kind" CHECK (("permit_id" IS NOT NULL) = ("kind" IN ('permit_added', 'permit_listed', 'permit_unlisted', 'permit_archived', 'station_linked', 'station_unlinked'))),
	CONSTRAINT "import_changes_station_id_by_kind" CHECK (("station_id" IS NOT NULL) = ("kind" IN ('station_linked', 'station_unlinked'))),
	CONSTRAINT "import_changes_microwave_link_id_by_kind" CHECK (("microwave_link_id" IS NOT NULL) = ("kind" IN ('microwave_link_added', 'microwave_link_renewed', 'microwave_link_archived'))),
	CONSTRAINT "import_changes_from_location_id_by_kind" CHECK (("from_location_id" IS NOT NULL) = ("kind" = 'site_moved')),
	CONSTRAINT "import_changes_slice_complete" CHECK (("dataset_id" IS NULL) = ("slice" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "official"."import_run_approvals" (
	"run_id" uuid,
	"dataset_id" integer,
	"slice" varchar(64),
	"snapshot_id" integer NOT NULL,
	CONSTRAINT "import_run_approvals_pkey" PRIMARY KEY("run_id","dataset_id","slice")
);
--> statement-breakpoint
CREATE TABLE "official"."import_run_datasets" (
	"run_id" uuid,
	"dataset_id" integer,
	"error" text,
	CONSTRAINT "import_run_datasets_pkey" PRIMARY KEY("run_id","dataset_id")
);
--> statement-breakpoint
CREATE TABLE "official"."import_run_skips" (
	"run_id" uuid,
	"dataset_id" integer,
	"slice" varchar(64),
	"reason" varchar(64),
	"record_count" integer NOT NULL,
	CONSTRAINT "import_run_skips_pkey" PRIMARY KEY("run_id","dataset_id","slice","reason")
);
--> statement-breakpoint
CREATE TABLE "official"."import_run_slices" (
	"run_id" uuid,
	"dataset_id" integer,
	"slice" varchar(64),
	"snapshot_id" integer NOT NULL,
	"outcome" "official_slice_outcome" NOT NULL,
	"staged_count" integer NOT NULL,
	"live_count" integer NOT NULL,
	CONSTRAINT "import_run_slices_pkey" PRIMARY KEY("run_id","dataset_id","slice")
);
--> statement-breakpoint
CREATE TABLE "official"."import_run_steps" (
	"run_id" uuid,
	"step" "official_run_step",
	"last_seq" bigint,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "import_run_steps_pkey" PRIMARY KEY("run_id","step")
);
--> statement-breakpoint
CREATE TABLE "official"."import_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"source_id" integer NOT NULL,
	"kind" "official_run_kind" NOT NULL,
	"trigger" "official_run_trigger" NOT NULL,
	"is_dry_run" boolean DEFAULT false NOT NULL,
	"state" "official_run_state" NOT NULL,
	"error" text,
	"claim_token" uuid,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"requested_by_id" uuid,
	"claimed_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official"."remap_runs" (
	"run_id" uuid PRIMARY KEY,
	"licensee_id" integer NOT NULL,
	"from_operator_id" integer,
	"to_operator_id" integer
);
--> statement-breakpoint
INSERT INTO "official"."sources"
	("key", "country_code", "short_name", "authority", "homepage_url", "licence", "attribution", "coverage_note", "is_redistributable", "is_enabled", "is_visible")
VALUES
	(
		'pl-uke', 'PL', 'UKE', 'Urząd Komunikacji Elektronicznej', 'https://www.uke.gov.pl', 'CC BY 4.0 (as listed on dane.gov.pl)',
		'Source: Urząd Komunikacji Elektronicznej (UKE), bip.uke.gov.pl.', NULL, true, true, true
	);
--> statement-breakpoint
INSERT INTO "official"."datasets" ("source_id", "key", "legacy_key", "layer", "is_enabled", "check_every_hours")
SELECT s."id", d."key", d."legacy_key", d."layer"::"official_layer", true, 6
FROM "official"."sources" AS s
CROSS JOIN (
	VALUES
		('permits', 'permits', 'sites'),
		('device-registry', 'device_registry', 'sites'),
		('microwave-links', 'radiolines', 'microwave_links')
) AS d ("key", "legacy_key", "layer")
WHERE s."key" = 'pl-uke';
--> statement-breakpoint
ALTER TABLE "official"."permits" ADD COLUMN "rat" "rat";--> statement-breakpoint
ALTER TABLE "official"."permits" ADD COLUMN "label_mhz" integer;--> statement-breakpoint
ALTER TABLE "official"."permits" ADD COLUMN "label_variant" "band_variant";--> statement-breakpoint
UPDATE "official"."permits" AS p
SET "rat" = b."rat", "label_mhz" = b."value", "label_variant" = b."variant"
FROM "official"."uke_bands" AS b
WHERE b."id" = p."band_id";
--> statement-breakpoint
INSERT INTO "official"."permit_listings" ("permit_id", "dataset_id", "slice")
SELECT p."id", d."id",
	CASE WHEN p."source" = 'permits' THEN p."rat"::text || ':' || p."label_mhz"::text || ':' || p."label_variant"::text ELSE f."file_key" END
FROM "official"."permits" AS p
JOIN "official"."datasets" AS d ON d."legacy_key" = p."source"::text
JOIN "official"."sources" AS src ON src."id" = d."source_id" AND src."key" = 'pl-uke'
JOIN "official"."sites" AS site ON site."id" = p."official_site_id"
JOIN "operators" AS o ON o."id" = site."operator_id"
LEFT JOIN (VALUES ('Orange', 'orange'), ('Play', 'p4'), ('T-Mobile', 't-mobile'), ('Plus', 'polkomtel')) AS f ("operator_name", "file_key")
	ON f."operator_name" = o."name" AND o."country_code" = 'PL'
WHERE p."source" = 'permits' OR f."file_key" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "official"."dataset_slices" ("dataset_id", "key", "imported_at")
SELECT d."id", used."slice",
	(SELECT max(m."last_import_date") FROM "official"."uke_import_metadata" AS m WHERE m."import_type" = d."legacy_key" AND m."status" = 'success')
FROM "official"."datasets" AS d
JOIN (SELECT DISTINCT l."dataset_id", l."slice" FROM "official"."permit_listings" AS l) AS used ON used."dataset_id" = d."id";
--> statement-breakpoint
CREATE UNIQUE INDEX "permit_listings_dataset_source_ref_unique" ON "official"."permit_listings" ("dataset_id","source_ref") WHERE "source_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "permit_listings_dataset_slice_idx" ON "official"."permit_listings" ("dataset_id","slice");--> statement-breakpoint
ALTER TABLE "official"."permit_listings" ADD CONSTRAINT "permit_listings_permit_id_permits_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "official"."permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."permit_listings" ADD CONSTRAINT "permit_listings_licensee_id_licensees_id_fkey" FOREIGN KEY ("licensee_id") REFERENCES "official"."licensees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."permit_listings" ADD CONSTRAINT "permit_listings_dataset_slice_fkey" FOREIGN KEY ("dataset_id","slice") REFERENCES "official"."dataset_slices"("dataset_id","key") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" ADD COLUMN "rat" "rat";--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" ADD COLUMN "label_mhz" integer;--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" ADD COLUMN "label_variant" "band_variant";--> statement-breakpoint
UPDATE "statistics"."stats_snapshots" AS s
SET "rat" = b."rat", "label_mhz" = b."value", "label_variant" = b."variant"
FROM "official"."uke_bands" AS b
WHERE b."id" = s."band_id";
--> statement-breakpoint
DO $$
DECLARE
	uke_source integer;
	uke_links integer;
BEGIN
	SELECT s."id" INTO STRICT uke_source FROM "official"."sources" AS s WHERE s."key" = 'pl-uke';
	SELECT d."id" INTO STRICT uke_links FROM "official"."datasets" AS d WHERE d."source_id" = uke_source AND d."key" = 'microwave-links';
	EXECUTE format('ALTER TABLE "official"."locations" ADD COLUMN "source_id" integer DEFAULT %s', uke_source);
	EXECUTE format('ALTER TABLE "official"."sites" ADD COLUMN "source_id" integer DEFAULT %s', uke_source);
	EXECUTE format('ALTER TABLE "official"."licensees" ADD COLUMN "source_id" integer DEFAULT %s', uke_source);
	EXECUTE format('ALTER TABLE "official"."microwave_links" ADD COLUMN "dataset_id" integer DEFAULT %s', uke_links);
END
$$;
--> statement-breakpoint
ALTER TABLE "official"."licensees" ADD COLUMN "operator_id" integer;--> statement-breakpoint
ALTER TABLE "official"."microwave_links" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "official"."locations" ADD COLUMN "source_ref" varchar(128);--> statement-breakpoint
ALTER TABLE "official"."sites" ADD COLUMN "source_ref" varchar(128);--> statement-breakpoint
INSERT INTO "official"."dataset_slices" ("dataset_id", "key", "imported_at")
SELECT d."id", '',
	(SELECT max(m."last_import_date") FROM "official"."uke_import_metadata" AS m WHERE m."import_type" = d."legacy_key" AND m."status" = 'success')
FROM "official"."datasets" AS d
WHERE d."id" IN (SELECT link."dataset_id" FROM "official"."microwave_links" AS link);
--> statement-breakpoint
UPDATE "official"."licensees" AS l
SET "operator_id" = o."id", "brand_id" = NULL
FROM "operators" AS o
WHERE o."country_code" = 'PL'
	AND o."name" = COALESCE(
		(
			SELECT m."operator_name"
			FROM (
				VALUES
					('p4', 'Play'),
					('orange polska', 'Orange'),
					('t-mobile polska', 'T-Mobile'),
					('polkomtel', 'Plus'),
					('pkp polskie linie kolejowe', 'PKP PLK'),
					('tatrzańskie ochotnicze pogotowie ratunkowe', 'TOPR')
			) AS m ("short_name", "operator_name")
			WHERE m."short_name" = lower(l."name")
		),
		l."name"
	)
	AND (l."brand_id" IS NULL OR l."brand_id" = o."brand_id")
	AND NOT EXISTS (SELECT 1 FROM "operators" AS twin WHERE twin."country_code" = 'PL' AND twin."name" = o."name" AND twin."id" <> o."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "import_runs_source_running_unique" ON "official"."import_runs" ("source_id") WHERE "state" = 'running';--> statement-breakpoint
ALTER TABLE "official"."licensees" ADD CONSTRAINT "licensees_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "official"."sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."licensees" ADD CONSTRAINT "licensees_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."microwave_links" ADD CONSTRAINT "microwave_links_dataset_id_datasets_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "official"."datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."dataset_slices" ADD CONSTRAINT "dataset_slices_dataset_id_datasets_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "official"."datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."dataset_slices" ADD CONSTRAINT "dataset_slices_snapshot_id_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "official"."snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."datasets" ADD CONSTRAINT "datasets_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "official"."sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."listed_files" ADD CONSTRAINT "listed_files_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "official"."sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."listed_files" ADD CONSTRAINT "listed_files_file_sha256_files_sha256_fkey" FOREIGN KEY ("file_sha256") REFERENCES "official"."files"("sha256") ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."locations" ADD CONSTRAINT "locations_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "official"."sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."sites" ADD CONSTRAINT "sites_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "official"."sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."snapshot_files" ADD CONSTRAINT "snapshot_files_snapshot_id_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "official"."snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."snapshot_files" ADD CONSTRAINT "snapshot_files_file_sha256_files_sha256_fkey" FOREIGN KEY ("file_sha256") REFERENCES "official"."files"("sha256") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."snapshot_slices" ADD CONSTRAINT "snapshot_slices_snapshot_id_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "official"."snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."snapshot_slices" ADD CONSTRAINT "snapshot_slices_dataset_slice_fkey" FOREIGN KEY ("dataset_id","slice") REFERENCES "official"."dataset_slices"("dataset_id","key") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."sources" ADD CONSTRAINT "sources_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_changes" ADD CONSTRAINT "import_changes_run_id_import_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "official"."import_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_changes" ADD CONSTRAINT "import_changes_run_slice_fkey" FOREIGN KEY ("run_id","dataset_id","slice") REFERENCES "official"."import_run_slices"("run_id","dataset_id","slice") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_approvals" ADD CONSTRAINT "import_run_approvals_run_id_import_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "official"."import_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_approvals" ADD CONSTRAINT "import_run_approvals_snapshot_id_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "official"."snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_approvals" ADD CONSTRAINT "import_run_approvals_dataset_slice_fkey" FOREIGN KEY ("dataset_id","slice") REFERENCES "official"."dataset_slices"("dataset_id","key") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_datasets" ADD CONSTRAINT "import_run_datasets_run_id_import_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "official"."import_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_datasets" ADD CONSTRAINT "import_run_datasets_dataset_id_datasets_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "official"."datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_skips" ADD CONSTRAINT "import_run_skips_run_slice_fkey" FOREIGN KEY ("run_id","dataset_id","slice") REFERENCES "official"."import_run_slices"("run_id","dataset_id","slice") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_slices" ADD CONSTRAINT "import_run_slices_snapshot_id_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "official"."snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_slices" ADD CONSTRAINT "import_run_slices_run_dataset_fkey" FOREIGN KEY ("run_id","dataset_id") REFERENCES "official"."import_run_datasets"("run_id","dataset_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_slices" ADD CONSTRAINT "import_run_slices_dataset_slice_fkey" FOREIGN KEY ("dataset_id","slice") REFERENCES "official"."dataset_slices"("dataset_id","key") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_run_steps" ADD CONSTRAINT "import_run_steps_run_id_import_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "official"."import_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_runs" ADD CONSTRAINT "import_runs_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "official"."sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."import_runs" ADD CONSTRAINT "import_runs_requested_by_id_users_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "official"."remap_runs" ADD CONSTRAINT "remap_runs_run_id_import_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "official"."import_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."remap_runs" ADD CONSTRAINT "remap_runs_licensee_id_licensees_id_fkey" FOREIGN KEY ("licensee_id") REFERENCES "official"."licensees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."remap_runs" ADD CONSTRAINT "remap_runs_from_operator_id_operators_id_fkey" FOREIGN KEY ("from_operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."remap_runs" ADD CONSTRAINT "remap_runs_to_operator_id_operators_id_fkey" FOREIGN KEY ("to_operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."licensees" ADD CONSTRAINT "licensees_operator_or_brand" CHECK ("operator_id" IS NULL OR "brand_id" IS NULL);--> statement-breakpoint
DROP TRIGGER "notifications_sync_official_site" ON "notifications";--> statement-breakpoint
DROP FUNCTION "sync_notification_official_site"();--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "uke_station_id";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "official"."sync_band_label"() RETURNS trigger
	LANGUAGE plpgsql SET search_path = pg_catalog
	AS $$
	DECLARE
		label_given boolean := num_nulls(NEW.rat, NEW.label_mhz, NEW.label_variant) = 0;
	BEGIN
		IF label_given AND TG_OP = 'UPDATE' THEN
			label_given := (NEW.rat, NEW.label_mhz, NEW.label_variant) IS DISTINCT FROM (OLD.rat, OLD.label_mhz, OLD.label_variant);
		END IF;
		IF label_given THEN
			SELECT b."id" INTO NEW.band_id
			FROM "official"."uke_bands" AS b
			WHERE b."rat" = NEW.rat AND b."value" = NEW.label_mhz AND b."variant" = NEW.label_variant;
			IF NOT FOUND THEN
				INSERT INTO "official"."uke_bands" AS b ("rat", "value", "variant", "name")
				VALUES (
					NEW.rat, NEW.label_mhz, NEW.label_variant,
					CASE WHEN NEW.label_variant = 'railway' THEN 'GSM-R ' || NEW.label_mhz::text ELSE NEW.rat::text || ' ' || NEW.label_mhz::text END
				)
				ON CONFLICT ("rat", "value", "variant") DO UPDATE SET "name" = b."name"
				RETURNING b."id" INTO NEW.band_id;
			END IF;
		ELSIF NEW.band_id IS NULL AND num_nulls(NEW.rat, NEW.label_mhz, NEW.label_variant) < 3 THEN
			RAISE EXCEPTION '%.%: a band label needs rat, label_mhz and label_variant together', TG_TABLE_SCHEMA, TG_TABLE_NAME;
		ELSE
			SELECT b."rat", b."value", b."variant" INTO NEW.rat, NEW.label_mhz, NEW.label_variant
			FROM "official"."uke_bands" AS b
			WHERE b."id" = NEW.band_id;
		END IF;
		RETURN NEW;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "official"."sync_permit_source"() RETURNS trigger
	LANGUAGE plpgsql SET search_path = pg_catalog
	AS $$
	DECLARE
		listed_permit integer;
		legacy text;
	BEGIN
		IF TG_OP = 'INSERT' THEN
			listed_permit := NEW.permit_id;
			SELECT d."legacy_key" INTO legacy
			FROM "official"."datasets" AS d
			WHERE d."id" = NEW.dataset_id AND d."legacy_key" = ANY (enum_range(NULL::"public"."permits_source")::text[]);
		ELSE
			listed_permit := OLD.permit_id;
			SELECT d."legacy_key" INTO legacy
			FROM "official"."permit_listings" AS l
			JOIN "official"."datasets" AS d ON d."id" = l."dataset_id"
			JOIN "official"."permits" AS p ON p."id" = l."permit_id"
			WHERE l."permit_id" = OLD.permit_id AND d."legacy_key" = ANY (enum_range(NULL::"public"."permits_source")::text[])
			ORDER BY (d."legacy_key" = p."source"::text) DESC, l."dataset_id"
			LIMIT 1;
		END IF;
		IF legacy IS NOT NULL THEN
			UPDATE "official"."permits" AS p
			SET "source" = legacy::"public"."permits_source"
			WHERE p."id" = listed_permit AND p."source" <> legacy::"public"."permits_source";
		END IF;
		RETURN NULL;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "permits_sync_band_label"
	BEFORE INSERT OR UPDATE OF "band_id", "rat", "label_mhz", "label_variant" ON "official"."permits"
	FOR EACH ROW EXECUTE FUNCTION "official"."sync_band_label"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "stats_snapshots_sync_band_label"
	BEFORE INSERT OR UPDATE OF "band_id", "rat", "label_mhz", "label_variant" ON "statistics"."stats_snapshots"
	FOR EACH ROW EXECUTE FUNCTION "official"."sync_band_label"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "permit_listings_sync_permit_source"
	AFTER INSERT OR DELETE ON "official"."permit_listings"
	FOR EACH ROW EXECUTE FUNCTION "official"."sync_permit_source"();
--> statement-breakpoint
DO $$
DECLARE
	problems text[] := '{}';
	counted bigint;
BEGIN
	SELECT count(*) INTO counted FROM "official"."locations" WHERE "source_id" IS NULL;
	IF counted > 0 THEN problems := problems || format('official.locations: %s rows without a source', counted); END IF;

	SELECT count(*) INTO counted FROM "official"."sites" WHERE "source_id" IS NULL;
	IF counted > 0 THEN problems := problems || format('official.sites: %s rows without a source', counted); END IF;

	SELECT count(*) INTO counted FROM "official"."licensees" WHERE "source_id" IS NULL;
	IF counted > 0 THEN problems := problems || format('official.licensees: %s rows without a source', counted); END IF;

	SELECT count(*) INTO counted FROM "official"."microwave_links" WHERE "dataset_id" IS NULL;
	IF counted > 0 THEN problems := problems || format('official.microwave_links: %s rows without a dataset', counted); END IF;

	SELECT count(*) INTO counted
	FROM "official"."microwave_links" AS link
	WHERE NOT EXISTS (SELECT 1 FROM "official"."dataset_slices" AS sl WHERE sl."dataset_id" = link."dataset_id" AND sl."key" = '');
	IF counted > 0 THEN problems := problems || format('official.microwave_links: %s rows whose dataset has no slice', counted); END IF;

	SELECT count(*) INTO counted
	FROM "official"."permits" AS p
	LEFT JOIN "official"."uke_bands" AS b ON b."id" = p."band_id"
	WHERE (p."rat", p."label_mhz", p."label_variant") IS DISTINCT FROM (b."rat", b."value", b."variant");
	IF counted > 0 THEN problems := problems || format('official.permits: %s rows whose label is missing or is not the label of band_id', counted); END IF;

	SELECT count(*) INTO counted
	FROM "official"."permits" AS p
	WHERE NOT EXISTS (SELECT 1 FROM "official"."permit_listings" AS l WHERE l."permit_id" = p."id");
	IF counted > 0 THEN problems := problems || format('official.permits: %s rows without a listing', counted); END IF;

	SELECT count(*) INTO counted
	FROM "official"."permits" AS p
	JOIN "official"."sites" AS site ON site."id" = p."official_site_id"
	JOIN "operators" AS o ON o."id" = site."operator_id"
	WHERE p."source" = 'device_registry' AND NOT (o."country_code" = 'PL' AND o."name" IN ('Orange', 'Play', 'T-Mobile', 'Plus'));
	IF counted > 0 THEN
		problems := problems || format('official.permits: %s device registry rows of an operator that has no registry file', counted);
	END IF;

	SELECT count(*) INTO counted
	FROM "statistics"."stats_snapshots" AS s
	LEFT JOIN "official"."uke_bands" AS b ON b."id" = s."band_id"
	WHERE (s."rat", s."label_mhz", s."label_variant") IS DISTINCT FROM (b."rat", b."value", b."variant");
	IF counted > 0 THEN
		problems := problems || format('statistics.stats_snapshots: %s rows whose label is missing or is not the label of band_id', counted);
	END IF;

	IF cardinality(problems) > 0 THEN
		RAISE EXCEPTION 'M1 (official_expand) stops and changes nothing: %', array_to_string(problems, '; ');
	END IF;
END
$$;
