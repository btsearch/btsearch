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
			LOCK TABLE "official"."permits", "official"."permit_listings", "statistics"."stats_snapshots", "official"."microwave_links", "official"."datasets", "official"."uke_bands", "official"."uke_import_metadata", "deleted_entries" IN ACCESS EXCLUSIVE MODE;
			got_all := true;
		EXCEPTION WHEN lock_not_available THEN
			PERFORM pg_sleep(0.5 + random());
		END;
		EXIT WHEN got_all;
	END LOOP;
	IF NOT got_all THEN
		RAISE EXCEPTION 'M3 (official_cleanup) could not lock its eight tables in 40 tries and changed nothing';
	END IF;
	PERFORM set_config('lock_timeout', held_wait, true);
END
$$;
--> statement-breakpoint
DROP TRIGGER "permits_sync_band_label" ON "official"."permits";--> statement-breakpoint
DROP TRIGGER "stats_snapshots_sync_band_label" ON "statistics"."stats_snapshots";--> statement-breakpoint
DROP TRIGGER "permit_listings_sync_permit_source" ON "official"."permit_listings";--> statement-breakpoint
DROP FUNCTION "official"."sync_band_label"();--> statement-breakpoint
DROP FUNCTION "official"."sync_permit_source"();--> statement-breakpoint
DROP INDEX "official"."permits_band_id_idx";--> statement-breakpoint
DROP INDEX "official"."permits_official_site_band_id_idx";--> statement-breakpoint
DROP INDEX "official"."permits_source_idx";--> statement-breakpoint
DROP INDEX "statistics"."stats_snapshots_date_operator_band_idx";--> statement-breakpoint
DROP INDEX "official"."microwave_links_physical_key_idx";--> statement-breakpoint
ALTER TABLE "official"."permits" DROP CONSTRAINT "permits_band_id_uke_bands_id_fkey";--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" DROP CONSTRAINT "stats_snapshots_band_id_uke_bands_id_fkey";--> statement-breakpoint
DO $$
DECLARE
	problems text[] := '{}';
	counted bigint;
	in_use text;
BEGIN
	SELECT count(*) INTO counted
	FROM "statistics"."stats_snapshots" AS s
	WHERE s."band_id" IS NOT NULL AND num_nulls(s."rat", s."label_mhz", s."label_variant") > 0;
	IF counted > 0 THEN problems := problems || format('statistics.stats_snapshots: %s rows with a band_id and no label', counted); END IF;

	SELECT string_agg(pg_describe_object(d.classid, d.objid, d.objsubid) || ' uses ' || dropped."table_name" || '.' || dropped."column_name", ', ') INTO in_use
	FROM (
		VALUES
			('official.permits', 'band_id'), ('official.permits', 'source'), ('statistics.stats_snapshots', 'band_id'),
			('official.microwave_links', 'physical_key'), ('official.datasets', 'legacy_key')
	) AS dropped ("table_name", "column_name")
	JOIN pg_attribute AS a ON a.attrelid = to_regclass(dropped."table_name") AND a.attname = dropped."column_name" AND NOT a.attisdropped
	JOIN pg_depend AS d ON d.refclassid = 'pg_class'::regclass AND d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
	WHERE NOT (d.classid = 'pg_attrdef'::regclass AND EXISTS (SELECT 1 FROM pg_attrdef AS def WHERE def.oid = d.objid AND def.adrelid = a.attrelid AND def.adnum = a.attnum))
		AND NOT (d.classid = 'pg_constraint'::regclass AND EXISTS (SELECT 1 FROM pg_constraint AS con WHERE con.oid = d.objid AND con.contype = 'n'));
	IF in_use IS NOT NULL THEN problems := problems || format('a column M3 drops is still in use, and DROP COLUMN would take this along: %s', in_use); END IF;

	SELECT count(*) INTO counted
	FROM (
		SELECT 1
		FROM "official"."permits" AS p
		GROUP BY p."official_site_id", p."rat", p."label_mhz", p."label_variant", p."decision_number", p."decision_type",
			CASE WHEN p."expiry_date" = '2099-12-31 23:59:59+00' THEN NULL ELSE (p."expiry_date" AT TIME ZONE 'UTC')::date END
		HAVING count(*) > 1
	) AS twins;
	IF counted > 0 THEN problems := problems || format('official.permits: %s keys of permits_unique_permit that two permits or more would share once expiry_date is a day', counted); END IF;

	IF cardinality(problems) > 0 THEN
		RAISE EXCEPTION 'M3 (official_cleanup) stops and changes nothing: %', array_to_string(problems, '; ');
	END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "official"."permits" DROP COLUMN "band_id";--> statement-breakpoint
ALTER TABLE "official"."permits" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" DROP COLUMN "band_id";--> statement-breakpoint
ALTER TABLE "official"."microwave_links" DROP COLUMN "physical_key";--> statement-breakpoint
ALTER TABLE "official"."datasets" DROP COLUMN "legacy_key";--> statement-breakpoint
DROP TYPE "permits_source";--> statement-breakpoint
DROP TABLE "deleted_entries";--> statement-breakpoint
DROP TABLE "official"."uke_import_metadata";--> statement-breakpoint
DROP TABLE "official"."uke_bands";--> statement-breakpoint
ALTER TYPE "public"."official_decision_type" RENAME VALUE 'P' TO 'permit';--> statement-breakpoint
ALTER TYPE "public"."official_decision_type" RENAME VALUE 'zmP' TO 'permit_change';--> statement-breakpoint
ALTER TABLE "official"."permits" DROP CONSTRAINT "permits_unique_permit";--> statement-breakpoint
ALTER TABLE "official"."permits" ALTER COLUMN "expiry_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official"."permits" ALTER COLUMN "expiry_date" SET DATA TYPE date
	USING CASE WHEN "expiry_date" = '2099-12-31 23:59:59+00' THEN NULL ELSE ("expiry_date" AT TIME ZONE 'UTC')::date END;--> statement-breakpoint
ALTER TABLE "official"."permits" ADD CONSTRAINT "permits_unique_permit" UNIQUE NULLS NOT DISTINCT("official_site_id","rat","label_mhz","label_variant","decision_number","decision_type","expiry_date");--> statement-breakpoint
ALTER TABLE "official"."microwave_links"
	ALTER COLUMN "issue_date" SET DATA TYPE date USING ("issue_date" AT TIME ZONE 'UTC')::date,
	ALTER COLUMN "expiry_date" SET DATA TYPE date USING ("expiry_date" AT TIME ZONE 'UTC')::date;--> statement-breakpoint
ALTER TYPE "public"."notification_type" RENAME VALUE 'station_uke_permit_added' TO 'station_official_permit_added';--> statement-breakpoint
UPDATE "notifications"
SET "metadata" = ("metadata" - ARRAY['uke_stations_added', 'uke_station_deleted'])
	|| CASE WHEN "metadata" ? 'uke_stations_added' THEN jsonb_build_object('official_sites_added', "metadata" -> 'uke_stations_added') ELSE '{}'::jsonb END
	|| CASE WHEN "metadata" ? 'uke_station_deleted' THEN jsonb_build_object('official_site_deleted', "metadata" -> 'uke_station_deleted') ELSE '{}'::jsonb END
WHERE jsonb_typeof("metadata") = 'object' AND "metadata" ?| ARRAY['uke_stations_added', 'uke_station_deleted'];--> statement-breakpoint
UPDATE "push_subscriptions"
SET "preferences" = ("preferences" - 'ukeUpdates') || jsonb_build_object('officialDataUpdates', "preferences" -> 'ukeUpdates')
WHERE jsonb_typeof("preferences") = 'object' AND "preferences" ? 'ukeUpdates';--> statement-breakpoint
UPDATE "auth"."apikeys"
SET "permissions" = regexp_replace(regexp_replace("permissions", '([":])uke_permits"', E'\\1official_permits"', 'g'), '([":])uke_radiolines"', E'\\1microwave_links"', 'g')
WHERE "permissions" ~ '[":]uke_(permits|radiolines)"';--> statement-breakpoint
UPDATE "auth"."oauth_clients"
SET
	"scopes" = array_replace(array_replace(array_replace("scopes", 'read:uke_permits', 'read:official_permits'), 'read_unassigned:uke_permits', 'read_unassigned:official_permits'), 'read:uke_radiolines', 'read:microwave_links'),
	"client_credentials_scopes" = array_replace(array_replace(array_replace("client_credentials_scopes", 'read:uke_permits', 'read:official_permits'), 'read_unassigned:uke_permits', 'read_unassigned:official_permits'), 'read:uke_radiolines', 'read:microwave_links')
WHERE "scopes" && ARRAY['read:uke_permits', 'read_unassigned:uke_permits', 'read:uke_radiolines']
	OR "client_credentials_scopes" && ARRAY['read:uke_permits', 'read_unassigned:uke_permits', 'read:uke_radiolines'];--> statement-breakpoint
UPDATE "auth"."oauth_resources"
SET "allowed_scopes" = array_replace(array_replace(array_replace("allowed_scopes", 'read:uke_permits', 'read:official_permits'), 'read_unassigned:uke_permits', 'read_unassigned:official_permits'), 'read:uke_radiolines', 'read:microwave_links')
WHERE "allowed_scopes" && ARRAY['read:uke_permits', 'read_unassigned:uke_permits', 'read:uke_radiolines'];--> statement-breakpoint
UPDATE "auth"."oauth_refresh_tokens"
SET "scopes" = array_replace(array_replace(array_replace("scopes", 'read:uke_permits', 'read:official_permits'), 'read_unassigned:uke_permits', 'read_unassigned:official_permits'), 'read:uke_radiolines', 'read:microwave_links')
WHERE "scopes" && ARRAY['read:uke_permits', 'read_unassigned:uke_permits', 'read:uke_radiolines'];--> statement-breakpoint
UPDATE "auth"."oauth_access_tokens"
SET "scopes" = array_replace(array_replace(array_replace("scopes", 'read:uke_permits', 'read:official_permits'), 'read_unassigned:uke_permits', 'read_unassigned:official_permits'), 'read:uke_radiolines', 'read:microwave_links')
WHERE "scopes" && ARRAY['read:uke_permits', 'read_unassigned:uke_permits', 'read:uke_radiolines'];--> statement-breakpoint
UPDATE "auth"."oauth_consents"
SET "scopes" = array_replace(array_replace(array_replace("scopes", 'read:uke_permits', 'read:official_permits'), 'read_unassigned:uke_permits', 'read_unassigned:official_permits'), 'read:uke_radiolines', 'read:microwave_links')
WHERE "scopes" && ARRAY['read:uke_permits', 'read_unassigned:uke_permits', 'read:uke_radiolines'];--> statement-breakpoint
DROP INDEX "user_lists_stations_uke_gin";--> statement-breakpoint
UPDATE "user_lists"
SET "stations" = ("stations" - 'uke') || jsonb_build_object('official', "stations" -> 'uke')
WHERE "stations" ? 'uke';--> statement-breakpoint
CREATE INDEX "user_lists_stations_official_gin" ON "user_lists" USING gin (("stations" -> 'official'));--> statement-breakpoint
UPDATE "audit"."audit_logs"
SET
	"old_values" = CASE
		WHEN jsonb_typeof("old_values" -> 'stations') = 'object' AND ("old_values" -> 'stations') ? 'uke'
		THEN jsonb_set("old_values", '{stations}', (("old_values" -> 'stations') - 'uke') || jsonb_build_object('official', "old_values" #> '{stations,uke}'))
		ELSE "old_values"
	END,
	"new_values" = CASE
		WHEN jsonb_typeof("new_values" -> 'stations') = 'object' AND ("new_values" -> 'stations') ? 'uke'
		THEN jsonb_set("new_values", '{stations}', (("new_values" -> 'stations') - 'uke') || jsonb_build_object('official', "new_values" #> '{stations,uke}'))
		ELSE "new_values"
	END
WHERE "entity" = 'user_lists' AND (("old_values" -> 'stations') ? 'uke' OR ("new_values" -> 'stations') ? 'uke');
