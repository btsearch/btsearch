CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "fold_text"("value" text) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
	AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, "value")) $$;
--> statement-breakpoint
CREATE TYPE "contribution_mode" AS ENUM('closed', 'open');--> statement-breakpoint
CREATE TYPE "operator_link_kind" AS ENUM('jv_member');--> statement-breakpoint
CREATE TYPE "plmn_role" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TYPE "structure_type" AS ENUM('lattice_tower', 'tubular_tower', 'concrete_tower', 'tower', 'mast', 'rooftop_mast', 'rooftop', 'chimney', 'church', 'water_tower', 'silo', 'pole', 'mobile_mast', 'tunnel', 'indoor', 'other');--> statement-breakpoint
CREATE TYPE "grant_role" AS ENUM('editor', 'maintainer');--> statement-breakpoint
CREATE TYPE "location_move" AS ENUM('station', 'location');--> statement-breakpoint
CREATE TYPE "submission_origin" AS ENUM('manual', 'analyzer');--> statement-breakpoint
ALTER TYPE "duplex" ADD VALUE 'SDL';--> statement-breakpoint
ALTER TYPE "proposed_location_field" ADD VALUE 'structure_type';--> statement-breakpoint
ALTER TYPE "proposed_location_field" ADD VALUE 'structure_owner_id';--> statement-breakpoint
ALTER TYPE "proposed_location_field" ADD VALUE 'structure_note';--> statement-breakpoint
CREATE TABLE "brands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" varchar(64) NOT NULL UNIQUE,
	"name" varchar(100) NOT NULL,
	"color" char(7) NOT NULL,
	"logo_file" varchar(48),
	"logo_width" integer,
	"logo_height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "brands_color_format" CHECK ("color" ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "brands_logo_file_format" CHECK ("logo_file" ~ '^[0-9a-f-]{36}[.](svg|webp)$'),
	CONSTRAINT "brands_logo_complete" CHECK (num_nulls("logo_file", "logo_width", "logo_height") IN (0, 3))
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"code" char(2) PRIMARY KEY,
	"is_visible" boolean DEFAULT false NOT NULL,
	"contributions" "contribution_mode" DEFAULT 'closed'::"contribution_mode" NOT NULL,
	"view_west" double precision,
	"view_south" double precision,
	"view_east" double precision,
	"view_north" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "countries_code_format" CHECK ("code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "countries_view_complete" CHECK (num_nulls("view_west", "view_south", "view_east", "view_north") IN (0, 4)),
	CONSTRAINT "countries_view_south_north" CHECK ("view_south" < "view_north")
);
--> statement-breakpoint
INSERT INTO "countries" ("code", "is_visible", "contributions") VALUES ('PL', true, 'open');--> statement-breakpoint
CREATE TABLE "country_bands" (
	"country_code" char(2),
	"band_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_bands_pkey" PRIMARY KEY("country_code","band_id")
);
--> statement-breakpoint
CREATE TABLE "operator_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "operator_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"operator_id" integer NOT NULL,
	"related_operator_id" integer NOT NULL,
	"kind" "operator_link_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_links_unique" UNIQUE("operator_id","related_operator_id","kind"),
	CONSTRAINT "operator_links_not_self" CHECK ("operator_id" <> "related_operator_id")
);
--> statement-breakpoint
CREATE TABLE "plmns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "plmns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mcc" char(3) NOT NULL,
	"mnc" varchar(3) NOT NULL,
	"code" varchar(6) GENERATED ALWAYS AS ("plmns"."mcc" || "plmns"."mnc") STORED NOT NULL CONSTRAINT "plmns_code_unique" UNIQUE,
	"operator_id" integer NOT NULL,
	"role" "plmn_role" DEFAULT 'secondary'::"plmn_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plmns_mcc_format" CHECK ("mcc" ~ '^[0-9]{3}$'),
	CONSTRAINT "plmns_mnc_format" CHECK ("mnc" ~ '^[0-9]{2,3}$')
);
--> statement-breakpoint
CREATE TABLE "region_boundaries" (
	"region_id" integer PRIMARY KEY,
	"geom" geometry(MultiPolygon,4326) NOT NULL,
	"source" varchar(200) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region_lookup" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "region_lookup_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"region_id" integer NOT NULL,
	"geom" geometry(Polygon,4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structure_owners" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "structure_owners_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"country_code" char(2),
	"brand_id" integer,
	"operator_id" integer CONSTRAINT "structure_owners_operator_unique" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."role_grant_regions" (
	"grant_id" uuid,
	"region_id" integer,
	CONSTRAINT "role_grant_regions_pkey" PRIMARY KEY("grant_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."role_grants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"role" "grant_role" NOT NULL,
	"country_code" char(2) NOT NULL,
	"is_country_wide" boolean NOT NULL,
	"granted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_grants_user_role_country_unique" UNIQUE("user_id","role","country_code"),
	CONSTRAINT "role_grants_maintainer_country_wide" CHECK ("role" <> 'maintainer' OR "is_country_wide")
);
--> statement-breakpoint
ALTER TABLE "statistics"."contribution_snapshots" DROP CONSTRAINT "contribution_snapshots_date_unique";--> statement-breakpoint
ALTER TABLE "operators" DROP CONSTRAINT "operators_name_key";--> statement-breakpoint
ALTER TABLE "regions" DROP CONSTRAINT "regions_name_key";--> statement-breakpoint
ALTER TABLE "regions" DROP CONSTRAINT "regions_code_key";--> statement-breakpoint
DROP INDEX "statistics"."contribution_snapshots_date_idx";--> statement-breakpoint
ALTER TABLE "bands" ADD COLUMN "code" varchar(16);--> statement-breakpoint
ALTER TABLE "statistics"."contribution_snapshots" ADD COLUMN "country_code" char(2) DEFAULT 'PL' NOT NULL;--> statement-breakpoint
ALTER TABLE "gsm_cells" ADD COLUMN "bsic" integer;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "structure_type" "structure_type";--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "structure_owner_id" integer;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "structure_note" varchar(150);--> statement-breakpoint
ALTER TABLE "operators" ADD COLUMN "country_code" char(2) DEFAULT 'PL' NOT NULL;--> statement-breakpoint
ALTER TABLE "operators" ADD COLUMN "brand_id" integer;--> statement-breakpoint
ALTER TABLE "operators" ADD COLUMN "short_code" varchar(16);--> statement-breakpoint
ALTER TABLE "operators" ADD COLUMN "sort_priority" integer;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "country_code" char(2) DEFAULT 'PL' NOT NULL;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "iso_code" varchar(6);--> statement-breakpoint
ALTER TABLE "uke"."uke_operators" ADD COLUMN "brand_id" integer;--> statement-breakpoint
ALTER TABLE "umts_cells" ADD COLUMN "psc" integer;--> statement-breakpoint
ALTER TABLE "audit"."audit_operations" ADD COLUMN "country_code" char(2);--> statement-breakpoint
ALTER TABLE "submissions"."proposed_gsm_cells" ADD COLUMN "bsic" integer;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD COLUMN "structure_type" "structure_type";--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD COLUMN "structure_owner_id" integer;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD COLUMN "structure_owner_name" varchar(100);--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD COLUMN "structure_note" varchar(150);--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD COLUMN "move" "location_move" DEFAULT 'station'::"location_move" NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_umts_cells" ADD COLUMN "psc" integer;--> statement-breakpoint
ALTER TABLE "submissions"."submissions" ADD COLUMN "origin" "submission_origin" DEFAULT 'manual'::"submission_origin" NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."submissions" ADD COLUMN "country_code" char(2);--> statement-breakpoint
ALTER TABLE "statistics"."contribution_snapshots" ADD CONSTRAINT "contribution_snapshots_date_country_unique" UNIQUE("snapshot_date","country_code");--> statement-breakpoint
ALTER TABLE "operators" ADD CONSTRAINT "operators_country_name_unique" UNIQUE("country_code","name");--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_name_unique" UNIQUE("country_code","name");--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_code_unique" UNIQUE("country_code","code");--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_iso_code_key" UNIQUE("iso_code");--> statement-breakpoint
ALTER TABLE "bands" DROP CONSTRAINT "bands_rat_value_unique";--> statement-breakpoint
ALTER TABLE "bands" ADD CONSTRAINT "bands_rat_value_unique" UNIQUE NULLS NOT DISTINCT("rat","value","duplex","variant","code");--> statement-breakpoint
CREATE UNIQUE INDEX "bands_code_variant_unique" ON "bands" ("code","variant") WHERE "code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cells_created_at_idx" ON "cells" ("createdAt","id");--> statement-breakpoint
CREATE INDEX "cells_updated_at_idx" ON "cells" ("updatedAt","id");--> statement-breakpoint
CREATE INDEX "cells_sector_id_idx" ON "cells" ("sector_id") WHERE "sector_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "country_bands_band_id_idx" ON "country_bands" ("band_id");--> statement-breakpoint
CREATE INDEX "extra_identificators_mno_name_trgm_idx" ON "extra_identificators" USING gin (("mno_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "locations_structure_owner_id_idx" ON "locations" ("structure_owner_id");--> statement-breakpoint
CREATE INDEX "locations_city_fold_trgm_idx" ON "locations" USING gin (fold_text("city") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "locations_address_fold_trgm_idx" ON "locations" USING gin (fold_text("address") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "operator_links_related_operator_id_idx" ON "operator_links" ("related_operator_id");--> statement-breakpoint
CREATE INDEX "operators_brand_id_idx" ON "operators" ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plmns_operator_primary_unique" ON "plmns" ("operator_id") WHERE "role" = 'primary';--> statement-breakpoint
CREATE INDEX "plmns_operator_id_idx" ON "plmns" ("operator_id");--> statement-breakpoint
CREATE INDEX "region_lookup_geom_gist" ON "region_lookup" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "region_lookup_region_id_idx" ON "region_lookup" ("region_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structure_owners_country_name_unique" ON "structure_owners" ("country_code",lower("name")) WHERE "country_code" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "structure_owners_global_name_unique" ON "structure_owners" (lower("name")) WHERE "country_code" IS NULL;--> statement-breakpoint
CREATE INDEX "structure_owners_brand_id_idx" ON "structure_owners" ("brand_id");--> statement-breakpoint
CREATE INDEX "audit_operations_country_created_at_id_idx" ON "audit"."audit_operations" ("country_code","createdAt","id");--> statement-breakpoint
CREATE INDEX "role_grant_regions_region_id_idx" ON "auth"."role_grant_regions" ("region_id");--> statement-breakpoint
CREATE INDEX "role_grants_country_code_idx" ON "auth"."role_grants" ("country_code");--> statement-breakpoint
CREATE INDEX "submission_country_code_idx" ON "submissions"."submissions" ("country_code");--> statement-breakpoint
ALTER TABLE "statistics"."contribution_snapshots" ADD CONSTRAINT "contribution_snapshots_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "country_bands" ADD CONSTRAINT "country_bands_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "country_bands" ADD CONSTRAINT "country_bands_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_structure_owner_id_structure_owners_id_fkey" FOREIGN KEY ("structure_owner_id") REFERENCES "structure_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "operator_links" ADD CONSTRAINT "operator_links_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "operator_links" ADD CONSTRAINT "operator_links_related_operator_id_operators_id_fkey" FOREIGN KEY ("related_operator_id") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "operators" ADD CONSTRAINT "operators_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "operators" ADD CONSTRAINT "operators_brand_id_brands_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "plmns" ADD CONSTRAINT "plmns_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "region_boundaries" ADD CONSTRAINT "region_boundaries_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "region_lookup" ADD CONSTRAINT "region_lookup_region_id_region_boundaries_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region_boundaries"("region_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "structure_owners" ADD CONSTRAINT "structure_owners_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "structure_owners" ADD CONSTRAINT "structure_owners_brand_id_brands_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "structure_owners" ADD CONSTRAINT "structure_owners_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke"."uke_operators" ADD CONSTRAINT "uke_operators_brand_id_brands_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit"."audit_operations" ADD CONSTRAINT "audit_operations_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."role_grant_regions" ADD CONSTRAINT "role_grant_regions_grant_id_role_grants_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "auth"."role_grants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."role_grant_regions" ADD CONSTRAINT "role_grant_regions_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."role_grants" ADD CONSTRAINT "role_grants_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."role_grants" ADD CONSTRAINT "role_grants_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."role_grants" ADD CONSTRAINT "role_grants_granted_by_id_users_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD CONSTRAINT "proposed_locations_structure_owner_id_structure_owners_id_fkey" FOREIGN KEY ("structure_owner_id") REFERENCES "structure_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."submissions" ADD CONSTRAINT "submissions_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cells" DROP CONSTRAINT "cells_band_id_bands_id_fkey", ADD CONSTRAINT "cells_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "locations" DROP CONSTRAINT "locations_region_id_regions_id_fkey", ADD CONSTRAINT "locations_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" DROP CONSTRAINT "stats_snapshots_band_id_bands_id_fkey", ADD CONSTRAINT "stats_snapshots_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke"."uke_locations" DROP CONSTRAINT "uke_locations_region_id_regions_id_fkey", ADD CONSTRAINT "uke_locations_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" DROP CONSTRAINT "uke_permits_band_id_bands_id_fkey", ADD CONSTRAINT "uke_permits_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" DROP CONSTRAINT "proposed_cells_band_id_bands_id_fkey", ADD CONSTRAINT "proposed_cells_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" DROP CONSTRAINT "proposed_locations_region_id_regions_id_fkey", ADD CONSTRAINT "proposed_locations_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "gsm_cells" ADD CONSTRAINT "gsm_bsic_check" CHECK ("bsic" BETWEEN 0 AND 63);--> statement-breakpoint
ALTER TABLE "operators" ADD CONSTRAINT "operators_short_code_not_blank" CHECK (btrim("short_code") <> '');--> statement-breakpoint
ALTER TABLE "operators" ADD CONSTRAINT "operators_sort_priority_positive" CHECK ("sort_priority" > 0);--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_iso_code_format" CHECK ("iso_code" ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$');--> statement-breakpoint
ALTER TABLE "umts_cells" ADD CONSTRAINT "umts_psc_check" CHECK ("psc" BETWEEN 0 AND 511);--> statement-breakpoint
ALTER TABLE "submissions"."proposed_gsm_cells" ADD CONSTRAINT "gsm_bsic_check" CHECK ("bsic" BETWEEN 0 AND 63);--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD CONSTRAINT "proposed_locations_structure_owner_id_or_name" CHECK (num_nulls("structure_owner_id", "structure_owner_name") > 0);--> statement-breakpoint
ALTER TABLE "submissions"."proposed_umts_cells" ADD CONSTRAINT "umts_psc_check" CHECK ("psc" BETWEEN 0 AND 511);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "region_at"("lon" double precision, "lat" double precision, "claimed" integer DEFAULT NULL) RETURNS integer
	LANGUAGE sql STABLE PARALLEL SAFE SET search_path = public
	AS $$
		WITH nearby AS (
			SELECT piece.region_id,
				min(CASE WHEN ST_Covers(piece.geom, spot.point) THEN 0
					ELSE ST_Distance(piece.geom::geography, spot.point::geography, false) END) AS distance
			FROM (SELECT ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS point) AS spot
			CROSS JOIN (VALUES (-360), (0), (360)) AS turn (shift)
			JOIN region_lookup AS piece
				ON piece.geom && ST_Expand(
					ST_Translate(spot.point, turn.shift, 0),
					CASE WHEN abs(lat) > 89 THEN 180 ELSE 0.02 / cos(radians(lat)) END,
					0.02)
			GROUP BY piece.region_id
		), candidates AS (
			SELECT nearby.region_id, nearby.distance, regions.country_code
			FROM nearby
			JOIN regions ON regions.id = nearby.region_id
			WHERE nearby.distance <= 2000
		)
		SELECT candidates.region_id
		FROM candidates
		WHERE claimed IS NULL
			OR candidates.region_id = claimed
			OR candidates.distance = 0
			OR EXISTS (SELECT 1 FROM region_boundaries AS outline WHERE outline.region_id = claimed)
		ORDER BY
			(candidates.region_id IS NOT DISTINCT FROM claimed AND (
				candidates.distance = 0
				OR NOT EXISTS (
					SELECT 1 FROM candidates AS covering
					WHERE covering.distance = 0 AND covering.country_code <> candidates.country_code
				)
			)) DESC,
			candidates.distance,
			candidates.region_id
		LIMIT 1
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "assign_region"() RETURNS trigger
	LANGUAGE plpgsql SET search_path = public
	AS $$
	BEGIN
		NEW.region_id := COALESCE(region_at(NEW.longitude, NEW.latitude, NEW.region_id), NEW.region_id);
		RETURN NEW;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "locations_assign_region"
	BEFORE INSERT OR UPDATE OF "longitude", "latitude", "region_id" ON "locations"
	FOR EACH ROW EXECUTE FUNCTION "assign_region"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "proposed_locations_assign_region"
	BEFORE INSERT OR UPDATE OF "longitude", "latitude", "region_id" ON "submissions"."proposed_locations"
	FOR EACH ROW
	WHEN (NEW."longitude" IS NOT NULL AND NEW."latitude" IS NOT NULL AND NEW."region_id" IS NOT NULL)
	EXECUTE FUNCTION "assign_region"();
--> statement-breakpoint
INSERT INTO "auth"."role_grants" ("user_id", "role", "country_code", "is_country_wide")
	SELECT "id", 'editor'::"grant_role", 'PL', true FROM "auth"."users" WHERE "role" = 'editor';
--> statement-breakpoint
INSERT INTO "country_bands" ("country_code", "band_id") SELECT 'PL', "id" FROM "bands";--> statement-breakpoint
INSERT INTO "brands" ("slug", "name", "color") VALUES
	('plus', 'Plus', '#24B570'),
	('t-mobile', 'T-Mobile', '#E2007A'),
	('orange', 'Orange', '#F59E0B'),
	('play', 'Play', '#8549CE'),
	('networks', 'NetWorks', '#A2334C'),
	('pge-systemy', 'PGE Systemy', '#0E4AC0'),
	('pkp-plk', 'PKP PLK', '#0082F4');
--> statement-breakpoint
UPDATE "operators" SET "brand_id" = "brands"."id" FROM "brands"
	WHERE ("operators"."mnc", "brands"."slug") IN (
		(26001, 'plus'), (26002, 't-mobile'), (26003, 'orange'), (26006, 'play'), (26034, 'networks'), (26018, 'pge-systemy'), (26035, 'pkp-plk')
	);
--> statement-breakpoint
UPDATE "operators" SET "brand_id" = "brands"."id" FROM "brands"
	WHERE "operators"."brand_id" IS NULL AND (lower(btrim("operators"."name")), "brands"."slug") IN (
		('orange', 'orange'), ('orange polska', 'orange'), ('t-mobile', 't-mobile'), ('t-mobile polska', 't-mobile'),
		('polkomtel', 'plus'), ('plus', 'plus'), ('towerlink poland', 'plus'), ('p4', 'play'), ('play', 'play')
	);
--> statement-breakpoint
UPDATE "operators" SET "short_code" = "main"."short_code", "sort_priority" = "main"."sort_priority"
	FROM (VALUES (26001, 'Plus', 1), (26002, 'TMPL', 2), (26003, 'OPL', 3), (26006, 'Play', 4)) AS "main" ("mnc", "short_code", "sort_priority")
	WHERE "operators"."mnc" = "main"."mnc";
--> statement-breakpoint
UPDATE "uke"."uke_operators" AS "o" SET "brand_id" = "b"."id" FROM "brands" AS "b"
	WHERE (lower(btrim("o"."full_name")), "b"."slug") IN (
		('orange', 'orange'), ('orange polska', 'orange'), ('t-mobile', 't-mobile'), ('t-mobile polska', 't-mobile'),
		('plus', 'plus'), ('polkomtel', 'plus'), ('towerlink poland', 'plus'), ('play', 'play'), ('p4', 'play'),
		('networks', 'networks'), ('pge systemy', 'pge-systemy'), ('pkp plk', 'pkp-plk'), ('pkp polskie linie kolejowe', 'pkp-plk')
	);
--> statement-breakpoint
UPDATE "regions" SET "iso_code" = "iso"."iso_code"
	FROM (VALUES
		('DLN', 'PL-02'), ('KPM', 'PL-04'), ('LUB', 'PL-06'), ('LBS', 'PL-08'), ('LDZ', 'PL-10'), ('MLP', 'PL-12'), ('MAZ', 'PL-14'),
		('OPO', 'PL-16'), ('PDK', 'PL-18'), ('POD', 'PL-20'), ('PDL', 'PL-20'), ('POM', 'PL-22'), ('SLK', 'PL-24'), ('SWK', 'PL-26'),
		('WRM', 'PL-28'), ('WMZ', 'PL-28'), ('WKP', 'PL-30'), ('WLK', 'PL-30'), ('ZPM', 'PL-32')
	) AS "iso" ("code", "iso_code")
	WHERE "regions"."country_code" = 'PL' AND "regions"."code" = "iso"."code";
--> statement-breakpoint
INSERT INTO "plmns" ("mcc", "mnc", "operator_id", "role")
	SELECT left("mnc"::text, 3), substr("mnc"::text, 4), "id", 'primary'::"plmn_role" FROM "operators" WHERE "mnc" BETWEEN 10000 AND 999999;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sync_primary_plmn"() RETURNS trigger
	LANGUAGE plpgsql SET search_path = public
	AS $$
	BEGIN
		DELETE FROM plmns WHERE operator_id = NEW.id AND role = 'primary' AND code IS DISTINCT FROM NEW.mnc::text;
		IF NEW.mnc IS NULL OR NEW.mnc NOT BETWEEN 10000 AND 999999 THEN
			RETURN NULL;
		END IF;

		UPDATE plmns SET role = 'primary', updated_at = now() WHERE operator_id = NEW.id AND code = NEW.mnc::text;
		IF NOT FOUND THEN
			INSERT INTO plmns (mcc, mnc, operator_id, role)
				VALUES (left(NEW.mnc::text, 3), substr(NEW.mnc::text, 4), NEW.id, 'primary');
		END IF;
		RETURN NULL;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "operators_sync_primary_plmn"
	AFTER INSERT OR UPDATE OF "mnc" ON "operators"
	FOR EACH ROW EXECUTE FUNCTION "sync_primary_plmn"();
--> statement-breakpoint
INSERT INTO "operator_links" ("operator_id", "related_operator_id", "kind")
	SELECT "member"."id", "shared"."id", 'jv_member'::"operator_link_kind" FROM "operators" AS "member", "operators" AS "shared"
	WHERE "member"."mnc" IN (26002, 26003) AND "shared"."mnc" = 26034;
--> statement-breakpoint
UPDATE "submissions"."submissions" SET "origin" = 'analyzer'
	WHERE "origin" = 'manual' AND "submitter_note" LIKE '%System: Zgłoszono przez analizator.%';
--> statement-breakpoint
UPDATE "auth"."apikeys" SET "permissions" = ("permissions"::jsonb || '{"stats":["read"]}'::jsonb)::text
	WHERE "permissions" IS NOT NULL AND NOT ("permissions"::jsonb ? 'stats');
--> statement-breakpoint
UPDATE "submissions"."submissions" AS "s" SET "pending_photos" = NULL
	WHERE "s"."status" = 'rejected' AND "s"."pending_photos" IS NOT NULL
		AND NOT EXISTS (SELECT 1 FROM "submissions"."submission_photos" AS "p" WHERE "p"."submission_id" = "s"."id");
--> statement-breakpoint
UPDATE "submissions"."submissions" AS "s" SET "country_code" = COALESCE(
		(SELECT "r"."country_code" FROM "submissions"."proposed_locations" AS "pl"
			INNER JOIN "regions" AS "r" ON "r"."id" = "pl"."region_id"
			WHERE "pl"."submission_id" = "s"."id" LIMIT 1),
		(SELECT "r"."country_code" FROM "stations" AS "st"
			INNER JOIN "locations" AS "l" ON "l"."id" = "st"."location_id"
			INNER JOIN "regions" AS "r" ON "r"."id" = "l"."region_id"
			WHERE "st"."id" = "s"."station_id" LIMIT 1),
		(SELECT "o"."country_code" FROM "submissions"."proposed_stations" AS "ps"
			INNER JOIN "operators" AS "o" ON "o"."id" = "ps"."operator_id"
			WHERE "ps"."submission_id" = "s"."id" LIMIT 1),
		(SELECT "o"."country_code" FROM "stations" AS "st"
			INNER JOIN "operators" AS "o" ON "o"."id" = "st"."operator_id"
			WHERE "st"."id" = "s"."station_id" LIMIT 1)
	);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM "countries" WHERE "code" = 'PL' AND "is_visible" AND "contributions" = 'open') THEN
		RAISE EXCEPTION 'The PL row in countries is missing, hidden or closed';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "auth"."users" AS "editor"
		WHERE "editor"."role" = 'editor'
			AND NOT EXISTS (SELECT 1 FROM "auth"."role_grants" AS "g" WHERE "g"."user_id" = "editor"."id" AND "g"."country_code" = 'PL')
	) THEN
		RAISE EXCEPTION 'An editor has no grant for PL';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "bands" AS "b"
		WHERE NOT EXISTS (SELECT 1 FROM "country_bands" AS "planned" WHERE "planned"."band_id" = "b"."id" AND "planned"."country_code" = 'PL')
	) THEN
		RAISE EXCEPTION 'A band is missing from the band plan of PL';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "operators" AS "o"
		WHERE "o"."mnc" BETWEEN 10000 AND 999999
			AND NOT EXISTS (SELECT 1 FROM "plmns" AS "p" WHERE "p"."operator_id" = "o"."id" AND "p"."role" = 'primary')
	) THEN
		RAISE EXCEPTION 'An operator with a network code has no primary PLMN';
	END IF;
END
$$;