SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "official_site_id" integer;--> statement-breakpoint
UPDATE "notifications" SET "official_site_id" = "uke_station_id" WHERE "uke_station_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_official_site_type_unread_unique" ON "notifications" ("user_id","official_site_id","type") WHERE "readAt" IS NULL AND "official_site_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_official_site_id_sites_id_fkey" FOREIGN KEY ("official_site_id") REFERENCES "uke"."uke_stations"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sync_notification_official_site"() RETURNS trigger
	LANGUAGE plpgsql SET search_path = public
	AS $$
	BEGIN
		IF TG_OP = 'INSERT' THEN
			NEW.official_site_id := COALESCE(NEW.official_site_id, NEW.uke_station_id);
			NEW.uke_station_id := NEW.official_site_id;
		ELSIF NEW.official_site_id IS DISTINCT FROM OLD.official_site_id THEN
			NEW.uke_station_id := NEW.official_site_id;
		ELSIF NEW.uke_station_id IS DISTINCT FROM OLD.uke_station_id THEN
			NEW.official_site_id := NEW.uke_station_id;
		END IF;
		RETURN NEW;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "notifications_sync_official_site"
	BEFORE INSERT OR UPDATE OF "official_site_id", "uke_station_id" ON "notifications"
	FOR EACH ROW EXECUTE FUNCTION "sync_notification_official_site"();
--> statement-breakpoint
ALTER SCHEMA "uke" RENAME TO "official";--> statement-breakpoint
ALTER TYPE "uke_permission_type" RENAME TO "official_decision_type";--> statement-breakpoint
ALTER TABLE "official"."uke_locations" RENAME TO "locations";--> statement-breakpoint
ALTER TABLE "official"."uke_stations" RENAME TO "sites";--> statement-breakpoint
ALTER TABLE "official"."uke_permits" RENAME TO "permits";--> statement-breakpoint
ALTER TABLE "official"."uke_permit_sectors" RENAME TO "permit_sectors";--> statement-breakpoint
ALTER TABLE "official"."uke_operators" RENAME TO "licensees";--> statement-breakpoint
ALTER TABLE "official"."uke_radiolines" RENAME TO "microwave_links";--> statement-breakpoint
ALTER TABLE "official"."radiolines_manufacturers" RENAME TO "microwave_link_manufacturers";--> statement-breakpoint
ALTER TABLE "official"."radiolines_antenna_types" RENAME TO "microwave_link_antenna_types";--> statement-breakpoint
ALTER TABLE "official"."radiolines_transmitter_types" RENAME TO "microwave_link_transmitter_types";--> statement-breakpoint
ALTER TABLE "official"."uke_station_watches" RENAME TO "site_watches";--> statement-breakpoint
ALTER TABLE "official"."sites" RENAME COLUMN "station_id" TO "site_id";--> statement-breakpoint
ALTER TABLE "official"."permits" RENAME COLUMN "uke_station_id" TO "official_site_id";--> statement-breakpoint
ALTER TABLE "official"."licensees" RENAME COLUMN "name" TO "legal_name";--> statement-breakpoint
ALTER TABLE "official"."licensees" RENAME COLUMN "full_name" TO "name";--> statement-breakpoint
ALTER TABLE "official"."microwave_links" RENAME COLUMN "operator_id" TO "licensee_id";--> statement-breakpoint
ALTER TABLE "official"."site_watches" RENAME COLUMN "uke_station_id" TO "official_site_id";--> statement-breakpoint
ALTER SEQUENCE "official"."uke_locations_id_seq" RENAME TO "locations_id_seq";--> statement-breakpoint
ALTER SEQUENCE "official"."uke_stations_id_seq" RENAME TO "sites_id_seq";--> statement-breakpoint
ALTER SEQUENCE "official"."uke_permits_id_seq" RENAME TO "permits_id_seq";--> statement-breakpoint
ALTER SEQUENCE "official"."uke_permit_sectors_id_seq" RENAME TO "permit_sectors_id_seq";--> statement-breakpoint
ALTER SEQUENCE "official"."uke_operators_id_seq" RENAME TO "licensees_id_seq";--> statement-breakpoint
ALTER SEQUENCE "official"."uke_radiolines_id_seq" RENAME TO "microwave_links_id_seq";--> statement-breakpoint
ALTER SEQUENCE "official"."radiolines_manufacturers_id_seq" RENAME TO "microwave_link_manufacturers_id_seq";--> statement-breakpoint
ALTER SEQUENCE "official"."radiolines_antenna_types_id_seq" RENAME TO "microwave_link_antenna_types_id_seq";--> statement-breakpoint
ALTER SEQUENCE "official"."radiolines_transmitter_types_id_seq" RENAME TO "microwave_link_transmitter_types_id_seq";--> statement-breakpoint
ALTER TABLE "official"."locations" RENAME CONSTRAINT "uke_locations_pkey" TO "locations_pkey";--> statement-breakpoint
ALTER TABLE "official"."locations" RENAME CONSTRAINT "uke_locations_lonlat_unique" TO "locations_lonlat_unique";--> statement-breakpoint
ALTER TABLE "official"."locations" RENAME CONSTRAINT "uke_locations_latitude_range" TO "locations_latitude_range";--> statement-breakpoint
ALTER TABLE "official"."locations" RENAME CONSTRAINT "uke_locations_longitude_range" TO "locations_longitude_range";--> statement-breakpoint
ALTER TABLE "official"."locations" RENAME CONSTRAINT "uke_locations_region_id_regions_id_fkey" TO "locations_region_id_regions_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."sites" RENAME CONSTRAINT "uke_stations_pkey" TO "sites_pkey";--> statement-breakpoint
ALTER TABLE "official"."sites" RENAME CONSTRAINT "uke_stations_station_operator_location_unique" TO "sites_site_operator_location_unique";--> statement-breakpoint
ALTER TABLE "official"."sites" RENAME CONSTRAINT "uke_stations_station_id_16_length" TO "sites_site_id_16_length";--> statement-breakpoint
ALTER TABLE "official"."sites" RENAME CONSTRAINT "uke_stations_operator_id_operators_id_fkey" TO "sites_operator_id_operators_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."sites" RENAME CONSTRAINT "uke_stations_location_id_uke_locations_id_fkey" TO "sites_location_id_locations_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."permits" RENAME CONSTRAINT "uke_permits_pkey" TO "permits_pkey";--> statement-breakpoint
ALTER TABLE "official"."permits" RENAME CONSTRAINT "uke_permits_unique_permit" TO "permits_unique_permit";--> statement-breakpoint
ALTER TABLE "official"."permits" RENAME CONSTRAINT "uke_permits_uke_station_id_uke_stations_id_fkey" TO "permits_official_site_id_sites_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."permits" RENAME CONSTRAINT "uke_permits_band_id_uke_bands_id_fkey" TO "permits_band_id_uke_bands_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."permit_sectors" RENAME CONSTRAINT "uke_permit_sectors_pkey" TO "permit_sectors_pkey";--> statement-breakpoint
ALTER TABLE "official"."permit_sectors" RENAME CONSTRAINT "uke_permit_sectors_unique" TO "permit_sectors_unique";--> statement-breakpoint
ALTER TABLE "official"."permit_sectors" RENAME CONSTRAINT "uke_permit_sectors_permit_id_uke_permits_id_fkey" TO "permit_sectors_permit_id_permits_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."licensees" RENAME CONSTRAINT "uke_operators_pkey" TO "licensees_pkey";--> statement-breakpoint
ALTER TABLE "official"."licensees" RENAME CONSTRAINT "uke_operators_name_key" TO "licensees_legal_name_key";--> statement-breakpoint
ALTER TABLE "official"."licensees" RENAME CONSTRAINT "uke_operators_brand_id_brands_id_fkey" TO "licensees_brand_id_brands_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_links" RENAME CONSTRAINT "uke_radiolines_pkey" TO "microwave_links_pkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_links" RENAME CONSTRAINT "uke_radiolines_natural_key" TO "microwave_links_natural_key";--> statement-breakpoint
ALTER TABLE "official"."microwave_links" RENAME CONSTRAINT "uke_radiolines_xpP9wLlwGhu5_fkey" TO "microwave_links_tx_transmitter_type_fkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_links" RENAME CONSTRAINT "uke_radiolines_uhDc8hacOF2B_fkey" TO "microwave_links_tx_antenna_type_fkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_links" RENAME CONSTRAINT "uke_radiolines_VhBmnsa9wuqD_fkey" TO "microwave_links_rx_antenna_type_fkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_links" RENAME CONSTRAINT "uke_radiolines_operator_id_uke_operators_id_fkey" TO "microwave_links_licensee_id_licensees_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_link_manufacturers" RENAME CONSTRAINT "radiolines_manufacturers_pkey" TO "microwave_link_manufacturers_pkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_link_manufacturers" RENAME CONSTRAINT "radiolines_manufacturers_name_key" TO "microwave_link_manufacturers_name_key";--> statement-breakpoint
ALTER TABLE "official"."microwave_link_antenna_types" RENAME CONSTRAINT "radiolines_antenna_types_pkey" TO "microwave_link_antenna_types_pkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_link_antenna_types" RENAME CONSTRAINT "radiolines_antenna_types_name_key" TO "microwave_link_antenna_types_name_key";--> statement-breakpoint
ALTER TABLE "official"."microwave_link_antenna_types" RENAME CONSTRAINT "radiolines_antenna_types_TuOPp7ql9804_fkey" TO "microwave_link_antenna_types_manufacturer_fkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_link_transmitter_types" RENAME CONSTRAINT "radiolines_transmitter_types_pkey" TO "microwave_link_transmitter_types_pkey";--> statement-breakpoint
ALTER TABLE "official"."microwave_link_transmitter_types" RENAME CONSTRAINT "radiolines_transmitter_types_name_key" TO "microwave_link_transmitter_types_name_key";--> statement-breakpoint
ALTER TABLE "official"."microwave_link_transmitter_types" RENAME CONSTRAINT "radiolines_transmitter_types_8oEyuaF5SmFi_fkey" TO "microwave_link_transmitter_types_manufacturer_fkey";--> statement-breakpoint
ALTER TABLE "official"."site_watches" RENAME CONSTRAINT "uke_station_watches_pkey" TO "site_watches_pkey";--> statement-breakpoint
ALTER TABLE "official"."site_watches" RENAME CONSTRAINT "uke_station_watches_user_station_unique" TO "site_watches_user_official_site_unique";--> statement-breakpoint
ALTER TABLE "official"."site_watches" RENAME CONSTRAINT "uke_station_watches_user_id_users_id_fkey" TO "site_watches_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "official"."site_watches" RENAME CONSTRAINT "uke_station_watches_uke_station_id_uke_stations_id_fkey" TO "site_watches_official_site_id_sites_id_fkey";--> statement-breakpoint
ALTER INDEX "official"."uke_locations_region_id_idx" RENAME TO "locations_region_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_locations_point_gist" RENAME TO "locations_point_gist";--> statement-breakpoint
ALTER INDEX "official"."uke_locations_created_at_idx" RENAME TO "locations_created_at_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_locations_updated_at_idx" RENAME TO "locations_updated_at_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_locations_last_touch_idx" RENAME TO "locations_last_touch_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_stations_station_id_idx" RENAME TO "sites_site_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_stations_station_id_trgm_idx" RENAME TO "sites_site_id_trgm_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_stations_operator_id_idx" RENAME TO "sites_operator_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_stations_operator_location_id_idx" RENAME TO "sites_operator_location_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_stations_station_operator_id_idx" RENAME TO "sites_site_operator_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_stations_location_id_idx" RENAME TO "sites_location_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_stations_location_operator_id_idx" RENAME TO "sites_location_operator_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_stations_updated_at_idx" RENAME TO "sites_updated_at_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_stations_created_at_idx" RENAME TO "sites_created_at_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_uke_station_id_idx" RENAME TO "permits_official_site_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_band_id_idx" RENAME TO "permits_band_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_decision_type_idx" RENAME TO "permits_decision_type_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_decision_number_trgm_idx" RENAME TO "permits_decision_number_trgm_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_uke_station_band_id_idx" RENAME TO "permits_official_site_band_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_source_idx" RENAME TO "permits_source_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_uke_station_id_id_idx" RENAME TO "permits_official_site_id_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_uke_station_created_at_idx" RENAME TO "permits_official_site_created_at_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_created_at_uke_station_idx" RENAME TO "permits_created_at_official_site_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permits_updated_at_uke_station_idx" RENAME TO "permits_updated_at_official_site_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_permit_sectors_permit_id_idx" RENAME TO "permit_sectors_permit_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_radiolines_operator_id_idx" RENAME TO "microwave_links_licensee_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_radiolines_physical_key_idx" RENAME TO "microwave_links_physical_key_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_radiolines_permit_number_idx" RENAME TO "microwave_links_permit_number_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_radiolines_permit_number_trgm_idx" RENAME TO "microwave_links_permit_number_trgm_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_radiolines_tx_point_gist" RENAME TO "microwave_links_tx_point_gist";--> statement-breakpoint
ALTER INDEX "official"."uke_radiolines_rx_point_gist" RENAME TO "microwave_links_rx_point_gist";--> statement-breakpoint
ALTER INDEX "official"."uke_radiolines_freq_idx" RENAME TO "microwave_links_freq_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_station_watches_user_id_idx" RENAME TO "site_watches_user_id_idx";--> statement-breakpoint
ALTER INDEX "official"."uke_station_watches_uke_station_id_idx" RENAME TO "site_watches_official_site_id_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "official"."uke_permits_decision_fragment_idx" RENAME TO "permits_decision_fragment_idx";--> statement-breakpoint
ALTER TABLE "stations_permits" RENAME CONSTRAINT "stations_permits_permit_id_uke_permits_id_fkey" TO "stations_permits_permit_id_permits_id_fkey";--> statement-breakpoint
DO $$
DECLARE
	item record;
BEGIN
	FOR item IN
		SELECT listed.relname, listed.conname, listed.wanted
		FROM (
			SELECT c.relname::text AS relname, con.conrelid, con.conname::text AS conname,
				c.relname::text || '_' || a.attname::text || '_not_null' AS wanted
			FROM pg_constraint AS con
			JOIN pg_class AS c ON c.oid = con.conrelid
			JOIN pg_namespace AS n ON n.oid = c.relnamespace
			JOIN pg_attribute AS a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
			WHERE n.nspname = 'official' AND c.relkind = 'r' AND con.contype = 'n'
		) AS listed
		WHERE listed.conname <> listed.wanted
			AND octet_length(listed.wanted) <= 63
			AND NOT EXISTS (SELECT 1 FROM pg_constraint AS taken WHERE taken.conrelid = listed.conrelid AND taken.conname = listed.wanted)
		ORDER BY listed.relname, listed.conname
	LOOP
		EXECUTE format('ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I', 'official', item.relname, item.conname, item.wanted);
	END LOOP;
END
$$;
--> statement-breakpoint
CREATE SCHEMA "uke";--> statement-breakpoint
CREATE VIEW "uke"."uke_locations" AS
	SELECT "id", "region_id", "city", "address", "longitude", "latitude", "updatedAt", "createdAt", "point"
	FROM "official"."locations";
--> statement-breakpoint
CREATE VIEW "uke"."uke_stations" AS
	SELECT "id", "site_id" AS "station_id", "operator_id", "location_id", "updatedAt", "createdAt"
	FROM "official"."sites";
--> statement-breakpoint
CREATE VIEW "uke"."uke_permits" AS
	SELECT "id", "decision_number", "decision_type", "expiry_date", "band_id", "source", "updatedAt", "createdAt", "official_site_id" AS "uke_station_id"
	FROM "official"."permits";
--> statement-breakpoint
CREATE VIEW "uke"."uke_permit_sectors" AS
	SELECT "id", "permit_id", "azimuth", "elevation", "antenna_height", "antenna_type"
	FROM "official"."permit_sectors";
--> statement-breakpoint
CREATE VIEW "uke"."uke_operators" AS
	SELECT "id", "name" AS "full_name", "legal_name" AS "name", "brand_id"
	FROM "official"."licensees";
--> statement-breakpoint
CREATE VIEW "uke"."uke_radiolines" AS
	SELECT "id", "tx_longitude", "tx_latitude", "tx_height", "tx_city", "tx_province", "tx_street", "tx_location_description", "rx_longitude",
		"rx_latitude", "rx_height", "rx_city", "rx_province", "rx_street", "rx_location_description", "freq", "ch_num", "plan_symbol", "ch_width",
		"polarization", "modulation_type", "bandwidth", "tx_eirp", "tx_antenna_attenuation", "tx_transmitter_type_id", "tx_antenna_type_id",
		"tx_antenna_gain", "tx_antenna_height", "rx_antenna_type_id", "rx_antenna_gain", "rx_antenna_height", "rx_noise_figure",
		"rx_atpc_attenuation", "licensee_id" AS "operator_id", "permit_number", "decision_type", "issue_date", "expiry_date", "updatedAt",
		"createdAt", "physical_key", "specs_date"
	FROM "official"."microwave_links";
--> statement-breakpoint
CREATE VIEW "uke"."radiolines_manufacturers" AS
	SELECT "id", "name"
	FROM "official"."microwave_link_manufacturers";
--> statement-breakpoint
CREATE VIEW "uke"."radiolines_antenna_types" AS
	SELECT "id", "name", "manufacturer_id"
	FROM "official"."microwave_link_antenna_types";
--> statement-breakpoint
CREATE VIEW "uke"."radiolines_transmitter_types" AS
	SELECT "id", "name", "manufacturer_id"
	FROM "official"."microwave_link_transmitter_types";
--> statement-breakpoint
CREATE VIEW "uke"."uke_station_watches" AS
	SELECT "id", "user_id", "official_site_id" AS "uke_station_id", "createdAt"
	FROM "official"."site_watches";
--> statement-breakpoint
CREATE VIEW "uke"."uke_bands" AS
	SELECT "id", "rat", "value", "variant", "name"
	FROM "official"."uke_bands";
--> statement-breakpoint
CREATE VIEW "uke"."uke_import_metadata" AS
	SELECT "id", "import_type", "file_list", "last_import_date", "status"
	FROM "official"."uke_import_metadata";
