SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DO $$
DECLARE
	held_wait text := current_setting('lock_timeout');
	try_wait integer;
	got_all boolean := false;
BEGIN
	SELECT greatest(s.setting::integer / 10, 1) INTO try_wait FROM pg_settings AS s WHERE s.name = 'deadlock_timeout';
	PERFORM set_config('lock_timeout', format('%sms', try_wait), true);
	FOR attempt IN 1..40 LOOP
		BEGIN
			LOCK TABLE "stations_permits", "official"."permits", "official"."sites", "official"."locations", "official"."microwave_links", "official"."licensees", "statistics"."stats_snapshots" IN ACCESS EXCLUSIVE MODE;
			got_all := true;
		EXCEPTION WHEN lock_not_available THEN
			PERFORM pg_sleep(0.5 + random());
		END;
		EXIT WHEN got_all;
	END LOOP;
	IF NOT got_all THEN
		RAISE EXCEPTION 'M2 (official_contract) could not lock its seven tables in 40 tries and changed nothing';
	END IF;
	PERFORM set_config('lock_timeout', held_wait, true);
END
$$;
--> statement-breakpoint
DELETE FROM "stations_permits" WHERE "permit_id" IS NULL OR "station_id" IS NULL;--> statement-breakpoint
UPDATE "official"."licensees" AS l
SET "operator_id" = o."id", "brand_id" = NULL
FROM "operators" AS o
WHERE l."operator_id" IS NULL
	AND o."country_code" = 'PL'
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
WITH "wanted" AS (
	SELECT p."id" AS "permit_id", d."id" AS "dataset_id", d."legacy_key",
		CASE WHEN p."source" = 'permits' THEN p."rat"::text || ':' || p."label_mhz"::text || ':' || p."label_variant"::text ELSE f."file_key" END AS "slice"
	FROM "official"."permits" AS p
	JOIN "official"."datasets" AS d ON d."legacy_key" = p."source"::text
	JOIN "official"."sources" AS src ON src."id" = d."source_id" AND src."key" = 'pl-uke'
	JOIN "official"."sites" AS site ON site."id" = p."official_site_id"
	JOIN "operators" AS o ON o."id" = site."operator_id"
	LEFT JOIN (VALUES ('Orange', 'orange'), ('Play', 'p4'), ('T-Mobile', 't-mobile'), ('Plus', 'polkomtel')) AS f ("operator_name", "file_key")
		ON f."operator_name" = o."name" AND o."country_code" = 'PL'
	WHERE NOT EXISTS (SELECT 1 FROM "official"."permit_listings" AS l WHERE l."permit_id" = p."id" AND l."dataset_id" = d."id")
), "missing" AS (
	SELECT DISTINCT wanted."dataset_id", wanted."legacy_key", wanted."slice"
	FROM "wanted"
	WHERE wanted."slice" IS NOT NULL
)
INSERT INTO "official"."dataset_slices" ("dataset_id", "key", "imported_at")
SELECT missing."dataset_id", missing."slice",
	(SELECT max(m."last_import_date") FROM "official"."uke_import_metadata" AS m WHERE m."import_type" = missing."legacy_key" AND m."status" = 'success')
FROM "missing"
WHERE NOT EXISTS (SELECT 1 FROM "official"."dataset_slices" AS sl WHERE sl."dataset_id" = missing."dataset_id" AND sl."key" = missing."slice");
--> statement-breakpoint
WITH "wanted" AS (
	SELECT p."id" AS "permit_id", d."id" AS "dataset_id", d."legacy_key",
		CASE WHEN p."source" = 'permits' THEN p."rat"::text || ':' || p."label_mhz"::text || ':' || p."label_variant"::text ELSE f."file_key" END AS "slice"
	FROM "official"."permits" AS p
	JOIN "official"."datasets" AS d ON d."legacy_key" = p."source"::text
	JOIN "official"."sources" AS src ON src."id" = d."source_id" AND src."key" = 'pl-uke'
	JOIN "official"."sites" AS site ON site."id" = p."official_site_id"
	JOIN "operators" AS o ON o."id" = site."operator_id"
	LEFT JOIN (VALUES ('Orange', 'orange'), ('Play', 'p4'), ('T-Mobile', 't-mobile'), ('Plus', 'polkomtel')) AS f ("operator_name", "file_key")
		ON f."operator_name" = o."name" AND o."country_code" = 'PL'
	WHERE NOT EXISTS (SELECT 1 FROM "official"."permit_listings" AS l WHERE l."permit_id" = p."id" AND l."dataset_id" = d."id")
)
INSERT INTO "official"."permit_listings" ("permit_id", "dataset_id", "slice")
SELECT wanted."permit_id", wanted."dataset_id", wanted."slice"
FROM "wanted"
WHERE wanted."slice" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "official"."dataset_slices" ("dataset_id", "key", "imported_at")
SELECT d."id", '',
	(SELECT max(m."last_import_date") FROM "official"."uke_import_metadata" AS m WHERE m."import_type" = d."legacy_key" AND m."status" = 'success')
FROM "official"."datasets" AS d
WHERE d."id" IN (SELECT link."dataset_id" FROM "official"."microwave_links" AS link)
	AND NOT EXISTS (SELECT 1 FROM "official"."dataset_slices" AS sl WHERE sl."dataset_id" = d."id" AND sl."key" = '');
--> statement-breakpoint
UPDATE "official"."dataset_slices" AS sl
SET "imported_at" = newest."imported_at"
FROM (
	SELECT d."id" AS "dataset_id", max(m."last_import_date") AS "imported_at"
	FROM "official"."datasets" AS d
	JOIN "official"."uke_import_metadata" AS m ON m."import_type" = d."legacy_key" AND m."status" = 'success'
	GROUP BY d."id"
) AS newest
WHERE newest."dataset_id" = sl."dataset_id" AND sl."snapshot_id" IS NULL AND sl."imported_at" IS DISTINCT FROM newest."imported_at";
--> statement-breakpoint
DO $$
DECLARE
	problems text[] := '{}';
	counted bigint;
	missing text;
BEGIN
	SELECT count(*) INTO counted
	FROM "official"."permits" AS p
	WHERE NOT EXISTS (SELECT 1 FROM "official"."permit_listings" AS l WHERE l."permit_id" = p."id");
	IF counted > 0 THEN problems := problems || format('official.permits: %s rows without a listing', counted); END IF;

	SELECT count(*) INTO counted
	FROM "official"."permit_listings" AS l
	WHERE NOT EXISTS (SELECT 1 FROM "official"."dataset_slices" AS sl WHERE sl."dataset_id" = l."dataset_id" AND sl."key" = l."slice");
	IF counted > 0 THEN problems := problems || format('official.permit_listings: %s rows whose slice has no row in official.dataset_slices', counted); END IF;

	SELECT count(*) INTO counted FROM "official"."locations" WHERE "source_id" IS NULL;
	IF counted > 0 THEN problems := problems || format('official.locations: %s rows without a source', counted); END IF;

	SELECT count(*) INTO counted FROM "official"."sites" WHERE "source_id" IS NULL;
	IF counted > 0 THEN problems := problems || format('official.sites: %s rows without a source', counted); END IF;

	SELECT count(*) INTO counted FROM "official"."licensees" WHERE "source_id" IS NULL;
	IF counted > 0 THEN problems := problems || format('official.licensees: %s rows without a source', counted); END IF;

	SELECT count(*) INTO counted FROM "official"."microwave_links" WHERE "dataset_id" IS NULL;
	IF counted > 0 THEN problems := problems || format('official.microwave_links: %s rows without a dataset', counted); END IF;

	SELECT count(*) INTO counted FROM "official"."permits" WHERE num_nulls("rat", "label_mhz", "label_variant") > 0;
	IF counted > 0 THEN problems := problems || format('official.permits: %s rows without a whole label', counted); END IF;

	SELECT count(*) INTO counted FROM "official"."licensees" WHERE "operator_id" IS NOT NULL AND "brand_id" IS NOT NULL;
	IF counted > 0 THEN problems := problems || format('official.licensees: %s rows with an operator and a brand of their own', counted); END IF;

	SELECT string_agg(wanted."name", ', ') INTO missing
	FROM (VALUES ('official.sync_band_label()'), ('official.sync_permit_source()')) AS wanted ("name")
	WHERE to_regprocedure(wanted."name") IS NULL;
	IF missing IS NOT NULL THEN problems := problems || format('missing function of M1: %s', missing); END IF;

	SELECT string_agg(wanted."name", ', ') INTO missing
	FROM (
		VALUES
			('permits_sync_band_label', 'official.permits', 'official.sync_band_label()'),
			('stats_snapshots_sync_band_label', 'statistics.stats_snapshots', 'official.sync_band_label()'),
			('permit_listings_sync_permit_source', 'official.permit_listings', 'official.sync_permit_source()')
	) AS wanted ("name", "table_name", "function_name")
	WHERE NOT EXISTS (
		SELECT 1
		FROM pg_trigger AS t
		WHERE t.tgrelid = to_regclass(wanted."table_name") AND t.tgname = wanted."name" AND NOT t.tgisinternal
			AND t.tgenabled IN ('O', 'A') AND t.tgfoid = to_regprocedure(wanted."function_name")
	);
	IF missing IS NOT NULL THEN problems := problems || format('missing or disabled trigger of M1: %s', missing); END IF;

	IF cardinality(problems) > 0 THEN
		RAISE EXCEPTION 'M2 (official_contract) stops and changes nothing: %', array_to_string(problems, '; ');
	END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "official"."microwave_links" ALTER COLUMN "dataset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."microwave_links" ALTER COLUMN "dataset_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "official"."microwave_links" ALTER COLUMN "physical_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."microwave_links" DROP CONSTRAINT "microwave_links_natural_key";--> statement-breakpoint
CREATE UNIQUE INDEX "microwave_links_natural_key" ON "official"."microwave_links" ("dataset_id","permit_number","licensee_id","tx_longitude","tx_latitude","rx_longitude","rx_latitude","freq","polarization","ch_num") NULLS NOT DISTINCT WHERE "source_ref" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "microwave_links_dataset_source_ref_unique" ON "official"."microwave_links" ("dataset_id","source_ref") WHERE "source_ref" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" DROP CONSTRAINT "stats_snapshots_date_operator_band_unique";--> statement-breakpoint
DROP INDEX "statistics"."stats_snapshots_date_operator_null_band_unique";--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" ADD CONSTRAINT "stats_snapshots_date_operator_label_unique" UNIQUE NULLS NOT DISTINCT("snapshot_date","operator_id","rat","label_mhz","label_variant");--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" ADD CONSTRAINT "stats_snapshots_label_complete" CHECK (num_nulls("rat", "label_mhz", "label_variant") IN (0, 3));--> statement-breakpoint
ALTER TABLE "official"."locations" ALTER COLUMN "source_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."locations" ALTER COLUMN "source_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "official"."locations" DROP CONSTRAINT "locations_lonlat_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "locations_source_lonlat_unique" ON "official"."locations" ("source_id","longitude","latitude") WHERE "source_ref" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_source_source_ref_unique" ON "official"."locations" ("source_id","source_ref") WHERE "source_ref" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."locations" ADD CONSTRAINT "locations_id_source_unique" UNIQUE("id","source_id");--> statement-breakpoint
ALTER TABLE "official"."sites" ALTER COLUMN "source_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."sites" ALTER COLUMN "source_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "official"."sites" DROP CONSTRAINT "sites_site_operator_location_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "sites_site_operator_location_unique" ON "official"."sites" ("site_id","operator_id","location_id") WHERE "source_ref" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sites_source_source_ref_unique" ON "official"."sites" ("source_id","source_ref") WHERE "source_ref" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."sites" DROP CONSTRAINT "sites_location_id_locations_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."sites" ADD CONSTRAINT "sites_location_source_fkey" FOREIGN KEY ("location_id","source_id") REFERENCES "official"."locations"("id","source_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "official"."permits" ALTER COLUMN "rat" SET NOT NULL, ALTER COLUMN "label_mhz" SET NOT NULL, ALTER COLUMN "label_variant" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."permits" DROP CONSTRAINT "permits_unique_permit";--> statement-breakpoint
ALTER TABLE "official"."permits" ADD CONSTRAINT "permits_unique_permit" UNIQUE("official_site_id","rat","label_mhz","label_variant","decision_number","decision_type","expiry_date");--> statement-breakpoint
CREATE INDEX "permits_label_idx" ON "official"."permits" ("rat","label_mhz","label_variant");--> statement-breakpoint
CREATE INDEX "permits_official_site_label_id_idx" ON "official"."permits" ("official_site_id","rat","label_mhz","label_variant","id");--> statement-breakpoint
ALTER TABLE "official"."licensees" ALTER COLUMN "source_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."licensees" ALTER COLUMN "source_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "official"."licensees" DROP CONSTRAINT "licensees_legal_name_key";--> statement-breakpoint
ALTER TABLE "official"."licensees" ADD CONSTRAINT "licensees_source_legal_name_unique" UNIQUE("source_id","legal_name");--> statement-breakpoint
ALTER TABLE "stations_permits" ALTER COLUMN "permit_id" SET NOT NULL, ALTER COLUMN "station_id" SET NOT NULL;
--> statement-breakpoint
-- merged from 20261012213930_official_audit_kind
UPDATE "audit"."audit_operations" SET "kind" = 'official.import' WHERE "kind" = 'uke.import';
