-- merged from 20260403191055_wild_bromley
CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "submissions";
--> statement-breakpoint
CREATE TYPE "antenna_type" AS ENUM('indoor', 'outdoor');--> statement-breakpoint
CREATE TYPE "band_variant" AS ENUM('commercial', 'railway');--> statement-breakpoint
CREATE TYPE "duplex" AS ENUM('FDD', 'TDD');--> statement-breakpoint
CREATE TYPE "nr_type" AS ENUM('nsa', 'sa');--> statement-breakpoint
CREATE TYPE "permits_source" AS ENUM('permits', 'device_registry');--> statement-breakpoint
CREATE TYPE "station_status" AS ENUM('published', 'inactive', 'pending');--> statement-breakpoint
CREATE TYPE "uke_permission_type" AS ENUM('zmP', 'P');--> statement-breakpoint
CREATE TYPE "rat" AS ENUM('GSM', 'CDMA', 'UMTS', 'LTE', 'NR', 'IOT');--> statement-breakpoint
CREATE TYPE "api_token_tier" AS ENUM('basic', 'pro', 'unlimited');--> statement-breakpoint
CREATE TYPE "audit_action" AS ENUM('stations.create', 'stations.update', 'stations.delete', 'cells.create', 'cells.update', 'cells.delete', 'locations.create', 'locations.update', 'locations.delete', 'operators.create', 'operators.update', 'operators.delete', 'bands.create', 'bands.update', 'bands.delete', 'regions.create', 'regions.update', 'regions.delete', 'submissions.create', 'submissions.update', 'submissions.delete', 'submissions.approve', 'submissions.reject', 'submissions.cleanup', 'settings.update', 'station_comments.create', 'station_comments.update', 'station_comments.delete', 'station_photos.create', 'station_photos.update', 'station_photos.delete', 'location_photos.create', 'location_photos.update', 'location_photos.delete', 'submission_photos.create', 'submission_photos.update', 'submission_photos.delete', 'user_lists.create', 'user_lists.update', 'user_lists.delete', 'uke_import.start');--> statement-breakpoint
CREATE TYPE "audit_source" AS ENUM('api', 'import', 'system');--> statement-breakpoint
CREATE TYPE "comment_status" AS ENUM('pending', 'approved');--> statement-breakpoint
CREATE TYPE "notification_type" AS ENUM('submission_approved', 'submission_rejected', 'new_submission');--> statement-breakpoint
CREATE TYPE "role" AS ENUM('user', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "cell_operation" AS ENUM('add', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "station_operation" AS ENUM('add', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "submission_type" AS ENUM('new', 'update', 'delete');--> statement-breakpoint
CREATE TABLE "bands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"value" integer,
	"rat" "rat" NOT NULL,
	"name" varchar(15) NOT NULL CONSTRAINT "bands_name_unique" UNIQUE,
	"duplex" "duplex",
	"variant" "band_variant" DEFAULT 'commercial'::"band_variant" NOT NULL,
	CONSTRAINT "bands_rat_value_unique" UNIQUE NULLS NOT DISTINCT("rat","value","duplex","variant")
);
--> statement-breakpoint
CREATE TABLE "cells" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cells_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" integer NOT NULL,
	"band_id" integer NOT NULL,
	"rat" "rat" NOT NULL,
	"notes" text,
	"is_confirmed" boolean DEFAULT false,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deleted_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deleted_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_table" varchar(50) NOT NULL,
	"source_id" integer NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"data" jsonb NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_id" integer
);
--> statement-breakpoint
CREATE TABLE "extra_identificators" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "extra_identificators_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" integer NOT NULL,
	"networks_id" integer,
	"networks_name" varchar(50),
	"mno_name" varchar(50),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extra_identificators_networks_id_unique" UNIQUE NULLS NOT DISTINCT("station_id","networks_id")
);
--> statement-breakpoint
CREATE TABLE "gsm_cells" (
	"cell_id" integer PRIMARY KEY,
	"lac" integer NOT NULL,
	"cid" integer NOT NULL,
	"e_gsm" boolean DEFAULT false,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gsm_cells_lac_cid_unique" UNIQUE("cell_id","lac","cid"),
	CONSTRAINT "gsm_lac_check" CHECK ("lac" BETWEEN 0 AND 65535),
	CONSTRAINT "gsm_cid_check" CHECK ("cid" BETWEEN 0 AND 65535)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"region_id" integer NOT NULL,
	"city" varchar(100),
	"address" text,
	"longitude" double precision NOT NULL,
	"latitude" double precision NOT NULL,
	"point" geometry(point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("locations"."longitude", "locations"."latitude"), 4326)) STORED NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_lonlat_unique" UNIQUE("longitude","latitude"),
	CONSTRAINT "locations_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
	CONSTRAINT "locations_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "lte_cells" (
	"cell_id" integer PRIMARY KEY,
	"tac" integer,
	"enbid" integer NOT NULL,
	"clid" integer NOT NULL,
	"ecid" integer GENERATED ALWAYS AS (("lte_cells"."enbid" * 256) + "lte_cells"."clid") STORED NOT NULL,
	"pci" integer,
	"earfcn" integer,
	"supports_iot" boolean DEFAULT false,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lte_cells_enbid_clid_unique" UNIQUE("cell_id","enbid","clid"),
	CONSTRAINT "lte_tac_check" CHECK ("tac" BETWEEN 0 AND 65535),
	CONSTRAINT "clid_check" CHECK ("clid" BETWEEN 0 AND 255),
	CONSTRAINT "lte_enbid_check" CHECK ("enbid" BETWEEN 0 AND 1048575),
	CONSTRAINT "pci_check" CHECK ("pci" BETWEEN 0 AND 503),
	CONSTRAINT "lte_earfcn_check" CHECK ("earfcn" BETWEEN 0 AND 262143)
);
--> statement-breakpoint
CREATE TABLE "nr_cells" (
	"cell_id" integer PRIMARY KEY,
	"nrtac" integer,
	"gnbid" integer,
	"gnbid_length" integer DEFAULT 24,
	"clid" integer,
	"nci" bigint GENERATED ALWAYS AS (("nr_cells"."gnbid"::bigint * power(2, 36 - "nr_cells"."gnbid_length")::bigint) + "nr_cells"."clid"::bigint) STORED,
	"pci" integer,
	"arfcn" integer,
	"type" "nr_type" NOT NULL,
	"supports_nr_redcap" boolean DEFAULT false,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nr_nrtac_check" CHECK ("nrtac" BETWEEN 0 AND 16777215),
	CONSTRAINT "nr_gnbid_check" CHECK ("gnbid" BETWEEN 0 AND 4294967295),
	CONSTRAINT "nr_clid_check" CHECK ("clid" BETWEEN 0 AND 16383),
	CONSTRAINT "nr_pci_check" CHECK ("pci" BETWEEN 0 AND 1007),
	CONSTRAINT "nr_arfcn_check" CHECK ("arfcn" BETWEEN 0 AND 3279165)
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "operators_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL UNIQUE,
	"full_name" varchar(250) NOT NULL,
	"parent_id" integer,
	"mnc" integer UNIQUE
);
--> statement-breakpoint
CREATE TABLE "radiolines_manufacturers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "radiolines_manufacturers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "radiolines_antenna_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "radiolines_antenna_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL UNIQUE,
	"manufacturer_id" integer
);
--> statement-breakpoint
CREATE TABLE "radiolines_transmitter_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "radiolines_transmitter_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL UNIQUE,
	"manufacturer_id" integer
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "regions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL UNIQUE,
	"code" varchar(3) NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" varchar(16) NOT NULL,
	"location_id" integer,
	"operator_id" integer,
	"notes" text,
	"extra_address" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"is_confirmed" boolean DEFAULT false,
	"status" "station_status" DEFAULT 'pending'::"station_status" NOT NULL,
	CONSTRAINT "stations_station_id_operator_unique" UNIQUE("station_id","operator_id"),
	CONSTRAINT "stations_station_id_16_length" CHECK ("station_id" ~ '(^.{1,16}$)')
);
--> statement-breakpoint
CREATE TABLE "stations_permits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stations_permits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"permit_id" integer,
	"station_id" integer,
	CONSTRAINT "stations_permits_pair_unique" UNIQUE("station_id","permit_id")
);
--> statement-breakpoint
CREATE TABLE "stats_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stats_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"snapshot_date" timestamp with time zone NOT NULL,
	"operator_id" integer NOT NULL,
	"band_id" integer NOT NULL,
	"unique_stations_count" integer NOT NULL,
	"permits_count" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stats_snapshots_date_operator_band_unique" UNIQUE("snapshot_date","operator_id","band_id")
);
--> statement-breakpoint
CREATE TABLE "uke_import_metadata" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uke_import_metadata_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"import_type" varchar(20) NOT NULL,
	"file_list" text NOT NULL,
	"last_import_date" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uke_locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uke_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"region_id" integer NOT NULL,
	"city" varchar(100),
	"address" text,
	"longitude" double precision NOT NULL,
	"latitude" double precision NOT NULL,
	"point" geometry(point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("uke_locations"."longitude", "uke_locations"."latitude"), 4326)) STORED NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uke_locations_lonlat_unique" UNIQUE("longitude","latitude"),
	CONSTRAINT "uke_locations_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
	CONSTRAINT "uke_locations_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "uke_operators" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uke_operators_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"full_name" varchar(150) NOT NULL,
	"name" varchar(250) NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "uke_permit_sectors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uke_permit_sectors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"permit_id" integer NOT NULL,
	"azimuth" integer,
	"elevation" integer,
	"antenna_height" double precision,
	"antenna_type" "antenna_type",
	CONSTRAINT "uke_permit_sectors_unique" UNIQUE("permit_id","azimuth","elevation","antenna_height","antenna_type")
);
--> statement-breakpoint
CREATE TABLE "uke_permits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uke_permits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" varchar(16) NOT NULL,
	"operator_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"decision_number" varchar(100) NOT NULL,
	"decision_type" "uke_permission_type" NOT NULL,
	"expiry_date" timestamp with time zone NOT NULL,
	"band_id" integer NOT NULL,
	"source" "permits_source" DEFAULT 'permits'::"permits_source" NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uke_permits_unique_permit" UNIQUE("station_id","operator_id","location_id","band_id","decision_number","decision_type","expiry_date")
);
--> statement-breakpoint
CREATE TABLE "uke_radiolines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uke_radiolines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tx_longitude" double precision NOT NULL,
	"tx_latitude" double precision NOT NULL,
	"tx_height" double precision NOT NULL,
	"tx_city" varchar(100),
	"tx_province" varchar(50),
	"tx_street" varchar(200),
	"tx_location_description" text,
	"rx_longitude" double precision NOT NULL,
	"rx_latitude" double precision NOT NULL,
	"rx_height" double precision NOT NULL,
	"rx_city" varchar(100),
	"rx_province" varchar(50),
	"rx_street" varchar(200),
	"rx_location_description" text,
	"freq" integer NOT NULL,
	"ch_num" integer,
	"plan_symbol" varchar(50),
	"ch_width" double precision,
	"polarization" varchar(10),
	"modulation_type" varchar(50),
	"bandwidth" varchar(100),
	"tx_eirp" double precision,
	"tx_antenna_attenuation" double precision,
	"tx_transmitter_type_id" integer,
	"tx_antenna_type_id" integer,
	"tx_antenna_gain" double precision,
	"tx_antenna_height" double precision,
	"rx_antenna_type_id" integer,
	"rx_antenna_gain" double precision,
	"rx_antenna_height" double precision,
	"rx_noise_figure" double precision,
	"rx_atpc_attenuation" double precision,
	"operator_id" integer,
	"permit_number" varchar(100) NOT NULL,
	"decision_type" "uke_permission_type" NOT NULL,
	"issue_date" timestamp with time zone,
	"expiry_date" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uke_radiolines_natural_key" UNIQUE("permit_number","operator_id","freq","tx_longitude","tx_latitude","rx_longitude","rx_latitude","polarization","ch_num")
);
--> statement-breakpoint
CREATE TABLE "umts_cells" (
	"cell_id" integer PRIMARY KEY,
	"lac" integer,
	"arfcn" integer,
	"rnc" integer NOT NULL,
	"cid" integer NOT NULL,
	"cid_long" integer GENERATED ALWAYS AS (("umts_cells"."rnc" * 65536) + "umts_cells"."cid") STORED NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "umts_cells_rnc_cid_unique" UNIQUE("cell_id","rnc","cid"),
	CONSTRAINT "umts_lac_check" CHECK ("lac" BETWEEN 0 AND 65535),
	CONSTRAINT "umts_rnc_check" CHECK ("rnc" BETWEEN 0 AND 65535),
	CONSTRAINT "umts_cid_check" CHECK ("cid" BETWEEN 0 AND 65535),
	CONSTRAINT "umts_arfcn_check" CHECK ("arfcn" BETWEEN 0 AND 16383)
);
--> statement-breakpoint
CREATE TABLE "auth"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"provider_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"id_token" text,
	"scope" text,
	"password" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."apikeys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"config_id" varchar(255) DEFAULT 'default' NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text DEFAULT '{"tier":"basic"}'
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attachments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"author_id" uuid NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_size_nonneg" CHECK ("size" >= 0),
	CONSTRAINT "attachments_mime_format" CHECK ("mime_type" ~ '^[\w.+-]+/[\w.+-]+')
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"action" "audit_action" NOT NULL,
	"table_name" varchar(100) NOT NULL,
	"record_id" integer,
	"old_values" jsonb,
	"new_values" jsonb,
	"metadata" jsonb,
	"source" "audit_source",
	"ip_address" varchar(60),
	"user_agent" text,
	"invoked_by" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_photos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "location_photos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"location_id" integer NOT NULL,
	"attachment_id" integer NOT NULL,
	"submission_id" uuid,
	"uploaded_by" uuid,
	"note" varchar(100),
	"taken_at" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_photos_location_attachment_unique" UNIQUE("location_id","attachment_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"submission_id" uuid,
	"metadata" jsonb,
	"action_url" text,
	"readAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."passkeys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text,
	"public_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL UNIQUE,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"preferences" jsonb DEFAULT '{}' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_comments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"station_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"attachments" jsonb,
	"content" text NOT NULL,
	"status" "comment_status" DEFAULT 'approved'::"comment_status" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_comments_content_len" CHECK (char_length("content") BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "station_photo_selections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "station_photo_selections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" integer NOT NULL,
	"location_photo_id" integer NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	CONSTRAINT "station_photo_selections_unique" UNIQUE("station_id","location_photo_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."two_factors" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_lists" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_lists_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"uuid" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false,
	"created_by" uuid NOT NULL,
	"stations" jsonb NOT NULL,
	"radiolines" jsonb DEFAULT '[]' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_lists_creator_name_unique" UNIQUE("created_by","name"),
	CONSTRAINT "user_lists_stations_is_object" CHECK (jsonb_typeof("stations") = 'object'),
	CONSTRAINT "user_lists_radiolines_is_array" CHECK (jsonb_typeof("radiolines") = 'array')
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"username" varchar(25) UNIQUE,
	"displayUsername" varchar(32),
	"email" varchar(100) NOT NULL UNIQUE,
	"image" text,
	"name" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"banned" boolean DEFAULT false,
	"banReason" text,
	"banExpires" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false,
	"force_totp" boolean DEFAULT false,
	"locale" varchar(10) DEFAULT 'pl-PL'
);
--> statement-breakpoint
CREATE TABLE "auth"."verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"identifier" text NOT NULL,
	"value" text NOT NULL UNIQUE,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions"."proposed_cells" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "submissions"."proposed_cells_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"submission_id" uuid,
	"operation" "cell_operation" DEFAULT 'add'::"cell_operation" NOT NULL,
	"target_cell_id" integer,
	"station_id" integer,
	"band_id" integer,
	"rat" "rat",
	"notes" text,
	"is_confirmed" boolean DEFAULT false,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposed_cells_unique" UNIQUE("submission_id","target_cell_id")
);
--> statement-breakpoint
CREATE TABLE "submissions"."proposed_gsm_cells" (
	"proposed_cell_id" integer PRIMARY KEY,
	"lac" integer NOT NULL,
	"cid" integer NOT NULL,
	"e_gsm" boolean DEFAULT false,
	CONSTRAINT "gsm_lac_check" CHECK ("lac" BETWEEN 0 AND 65535),
	CONSTRAINT "gsm_cid_check" CHECK ("cid" BETWEEN 0 AND 65535)
);
--> statement-breakpoint
CREATE TABLE "submissions"."proposed_lte_cells" (
	"proposed_cell_id" integer PRIMARY KEY,
	"tac" integer,
	"enbid" integer NOT NULL,
	"clid" integer NOT NULL,
	"pci" integer,
	"earfcn" integer,
	"supports_iot" boolean DEFAULT false,
	CONSTRAINT "lte_tac_check" CHECK ("tac" BETWEEN 0 AND 65535),
	CONSTRAINT "clid_check" CHECK ("clid" BETWEEN 0 AND 255),
	CONSTRAINT "lte_enbid_check" CHECK ("enbid" BETWEEN 0 AND 1048575),
	CONSTRAINT "pci_check" CHECK ("pci" BETWEEN 0 AND 503),
	CONSTRAINT "lte_earfcn_check" CHECK ("earfcn" BETWEEN 0 AND 262143)
);
--> statement-breakpoint
CREATE TABLE "submissions"."proposed_locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "submissions"."proposed_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"submission_id" uuid,
	"region_id" integer NOT NULL,
	"city" varchar(100),
	"address" text,
	"longitude" double precision NOT NULL,
	"latitude" double precision NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions"."proposed_nr_cells" (
	"proposed_cell_id" integer PRIMARY KEY,
	"nrtac" integer,
	"gnbid" integer,
	"gnbid_length" integer DEFAULT 24,
	"clid" integer,
	"pci" integer,
	"arfcn" integer,
	"type" "nr_type" NOT NULL,
	"supports_nr_redcap" boolean DEFAULT false,
	CONSTRAINT "nr_nrtac_check" CHECK ("nrtac" BETWEEN 0 AND 16777215),
	CONSTRAINT "nr_gnbid_check" CHECK ("gnbid" BETWEEN 0 AND 4294967295),
	CONSTRAINT "nr_clid_check" CHECK ("clid" BETWEEN 0 AND 16383),
	CONSTRAINT "nr_pci_check" CHECK ("pci" BETWEEN 0 AND 1007),
	CONSTRAINT "nr_arfcn_check" CHECK ("arfcn" BETWEEN 0 AND 3279165)
);
--> statement-breakpoint
CREATE TABLE "submissions"."proposed_stations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "submissions"."proposed_stations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"submission_id" uuid,
	"operation" "station_operation" DEFAULT 'add'::"station_operation" NOT NULL,
	"target_station_id" integer,
	"station_id" varchar(16),
	"operator_id" integer NOT NULL,
	"notes" text,
	"networks_id" integer,
	"networks_name" varchar(50),
	"mno_name" varchar(50),
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"is_confirmed" boolean DEFAULT false,
	CONSTRAINT "proposed_stations_submission_station_unique" UNIQUE("submission_id","station_id")
);
--> statement-breakpoint
CREATE TABLE "submissions"."proposed_umts_cells" (
	"proposed_cell_id" integer PRIMARY KEY,
	"lac" integer,
	"arfcn" integer,
	"rnc" integer NOT NULL,
	"cid" integer NOT NULL,
	CONSTRAINT "umts_lac_check" CHECK ("lac" BETWEEN 0 AND 65535),
	CONSTRAINT "umts_rnc_check" CHECK ("rnc" BETWEEN 0 AND 65535),
	CONSTRAINT "umts_cid_check" CHECK ("cid" BETWEEN 0 AND 65535),
	CONSTRAINT "umts_arfcn_check" CHECK ("arfcn" BETWEEN 0 AND 16383)
);
--> statement-breakpoint
CREATE TABLE "submissions"."submission_location_photo_selections" (
	"submission_id" uuid,
	"location_photo_id" integer,
	CONSTRAINT "submission_location_photo_selections_pkey" PRIMARY KEY("submission_id","location_photo_id")
);
--> statement-breakpoint
CREATE TABLE "submissions"."submission_photos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "submissions"."submission_photos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"submission_id" uuid NOT NULL,
	"attachment_id" integer NOT NULL,
	"note" varchar(100),
	"taken_at" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_photos_unique" UNIQUE("submission_id","attachment_id")
);
--> statement-breakpoint
CREATE TABLE "submissions"."submissions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"station_id" integer,
	"submitter_id" uuid NOT NULL,
	"status" "submission_status" DEFAULT 'pending'::"submission_status" NOT NULL,
	"type" "submission_type" DEFAULT 'new'::"submission_type" NOT NULL,
	"reviewer_id" uuid,
	"review_notes" text,
	"submitter_note" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"pending_photos" integer
);
--> statement-breakpoint
CREATE INDEX "bands_value_idx" ON "bands" ("value");--> statement-breakpoint
CREATE INDEX "bands_rat_idx" ON "bands" ("rat");--> statement-breakpoint
CREATE INDEX "cells_station_band_rat_idx" ON "cells" ("station_id","band_id","rat");--> statement-breakpoint
CREATE INDEX "cells_station_rat_idx" ON "cells" ("station_id","rat");--> statement-breakpoint
CREATE INDEX "deleted_entries_source_table_idx" ON "deleted_entries" ("source_table");--> statement-breakpoint
CREATE INDEX "deleted_entries_source_type_idx" ON "deleted_entries" ("source_type");--> statement-breakpoint
CREATE INDEX "deleted_entries_deleted_at_idx" ON "deleted_entries" ("deleted_at");--> statement-breakpoint
CREATE INDEX "deleted_entries_source_table_type_idx" ON "deleted_entries" ("source_table","source_type");--> statement-breakpoint
CREATE INDEX "deleted_entries_source_table_deleted_at_idx" ON "deleted_entries" ("source_table","deleted_at");--> statement-breakpoint
CREATE INDEX "extra_identificators_station_idx" ON "extra_identificators" ("station_id");--> statement-breakpoint
CREATE INDEX "extra_identificators_networks_id_trgm_idx" ON "extra_identificators" USING gin (("networks_id"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "extra_identificators_networks_name_trgm_idx" ON "extra_identificators" USING gin (("networks_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "gsm_cells_cid_idx" ON "gsm_cells" ("cid");--> statement-breakpoint
CREATE INDEX "gsm_cells_cid_trgm_idx" ON "gsm_cells" USING gin (("cid"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "locations_region_id_idx" ON "locations" ("region_id");--> statement-breakpoint
CREATE INDEX "locations_point_gist" ON "locations" USING gist ("point");--> statement-breakpoint
CREATE INDEX "locations_idx" ON "locations" ("id");--> statement-breakpoint
CREATE INDEX "locations_created_at_idx" ON "locations" ("createdAt");--> statement-breakpoint
CREATE INDEX "locations_updated_at_idx" ON "locations" ("updatedAt");--> statement-breakpoint
CREATE INDEX "lte_cells_iot_true_idx" ON "lte_cells" ("enbid","clid") WHERE "supports_iot" = true;--> statement-breakpoint
CREATE INDEX "lte_cells_enbid_trgm_idx" ON "lte_cells" USING gin (("enbid"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "lte_cells_ecid_trgm_idx" ON "lte_cells" USING gin (("ecid"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "nr_cells_redcap_true_idx" ON "nr_cells" ("gnbid","clid") WHERE "supports_nr_redcap" = true;--> statement-breakpoint
CREATE INDEX "nr_cells_gnbid_trgm_idx" ON "nr_cells" USING gin (("gnbid"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "nr_cells_nci_trgm_idx" ON "nr_cells" USING gin (("nci"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "operator_parent_id_idx" ON "operators" ("parent_id");--> statement-breakpoint
CREATE INDEX "station_location_id_idx" ON "stations" ("location_id");--> statement-breakpoint
CREATE INDEX "stations_operator_id_idx" ON "stations" ("operator_id");--> statement-breakpoint
CREATE INDEX "stations_operator_location_id_idx" ON "stations" ("operator_id","location_id","id");--> statement-breakpoint
CREATE INDEX "stations_station_id_trgm_idx" ON "stations" USING gin (("station_id") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "stations_station_id_idx" ON "stations" ("station_id");--> statement-breakpoint
CREATE INDEX "stations_updated_at_idx" ON "stations" ("updatedAt");--> statement-breakpoint
CREATE INDEX "stations_created_at_idx" ON "stations" ("createdAt");--> statement-breakpoint
CREATE INDEX "stations_permits_station_id_idx" ON "stations_permits" ("station_id");--> statement-breakpoint
CREATE INDEX "stations_permits_permit_id_idx" ON "stations_permits" ("permit_id");--> statement-breakpoint
CREATE INDEX "stats_snapshots_date_idx" ON "stats_snapshots" ("snapshot_date");--> statement-breakpoint
CREATE INDEX "stats_snapshots_operator_id_idx" ON "stats_snapshots" ("operator_id");--> statement-breakpoint
CREATE INDEX "stats_snapshots_date_operator_band_idx" ON "stats_snapshots" ("snapshot_date","operator_id","band_id");--> statement-breakpoint
CREATE INDEX "uke_locations_region_id_idx" ON "uke_locations" ("region_id");--> statement-breakpoint
CREATE INDEX "uke_locations_point_gist" ON "uke_locations" USING gist ("point");--> statement-breakpoint
CREATE INDEX "uke_locations_created_at_idx" ON "uke_locations" ("createdAt");--> statement-breakpoint
CREATE INDEX "uke_locations_updated_at_idx" ON "uke_locations" ("updatedAt");--> statement-breakpoint
CREATE INDEX "uke_locations_last_touch_idx" ON "uke_locations" (GREATEST("createdAt", "updatedAt"));--> statement-breakpoint
CREATE INDEX "uke_permit_sectors_permit_id_idx" ON "uke_permit_sectors" ("permit_id");--> statement-breakpoint
CREATE INDEX "uke_permits_station_id_idx" ON "uke_permits" ("station_id");--> statement-breakpoint
CREATE INDEX "uke_permits_location_id_idx" ON "uke_permits" ("location_id");--> statement-breakpoint
CREATE INDEX "uke_permits_operator_id_idx" ON "uke_permits" ("operator_id");--> statement-breakpoint
CREATE INDEX "uke_permits_band_id_idx" ON "uke_permits" ("band_id");--> statement-breakpoint
CREATE INDEX "uke_permits_decision_type_idx" ON "uke_permits" ("decision_type");--> statement-breakpoint
CREATE INDEX "uke_permits_decision_number_trgm_idx" ON "uke_permits" USING gin (("decision_number") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "uke_permits_station_id_trgm_idx" ON "uke_permits" USING gin (("station_id") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "uke_permits_operator_band_idx" ON "uke_permits" ("operator_id","band_id");--> statement-breakpoint
CREATE INDEX "uke_permits_operator_location_idx" ON "uke_permits" ("operator_id","location_id");--> statement-breakpoint
CREATE INDEX "uke_permits_source_idx" ON "uke_permits" ("source");--> statement-breakpoint
CREATE INDEX "uke_permits_location_operator_band_idx" ON "uke_permits" ("location_id","operator_id","band_id");--> statement-breakpoint
CREATE INDEX "uke_permits_location_band_idx" ON "uke_permits" ("location_id","band_id");--> statement-breakpoint
CREATE INDEX "uke_permits_operator_band_location_idx" ON "uke_permits" ("operator_id","band_id","location_id");--> statement-breakpoint
CREATE INDEX "uke_radiolines_operator_id_idx" ON "uke_radiolines" ("operator_id");--> statement-breakpoint
CREATE INDEX "uke_radiolines_permit_number_idx" ON "uke_radiolines" ("permit_number");--> statement-breakpoint
CREATE INDEX "uke_radiolines_permit_number_trgm_idx" ON "uke_radiolines" USING gin (("permit_number") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "uke_radiolines_tx_point_gist" ON "uke_radiolines" USING gist ((ST_SetSRID(ST_MakePoint("tx_longitude", "tx_latitude"), 4326)));--> statement-breakpoint
CREATE INDEX "uke_radiolines_rx_point_gist" ON "uke_radiolines" USING gist ((ST_SetSRID(ST_MakePoint("rx_longitude", "rx_latitude"), 4326)));--> statement-breakpoint
CREATE INDEX "uke_radiolines_freq_idx" ON "uke_radiolines" ("freq");--> statement-breakpoint
CREATE INDEX "umts_cells_cid_idx" ON "umts_cells" ("cid");--> statement-breakpoint
CREATE INDEX "umts_cells_cid_trgm_idx" ON "umts_cells" USING gin (("cid"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "umts_cells_cid_long_trgm_idx" ON "umts_cells" USING gin (("cid_long"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "auth"."accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "apikeys_key_idx" ON "auth"."apikeys" ("key");--> statement-breakpoint
CREATE INDEX "apikeys_referenceId_idx" ON "auth"."apikeys" ("reference_id");--> statement-breakpoint
CREATE INDEX "apikeys_configId_idx" ON "auth"."apikeys" ("config_id");--> statement-breakpoint
CREATE INDEX "attachment_author_id_idx" ON "attachments" ("author_id");--> statement-breakpoint
CREATE INDEX "attachments_created_at_idx" ON "attachments" ("createdAt");--> statement-breakpoint
CREATE INDEX "audit_logs_record_id_idx" ON "audit_logs" ("record_id");--> statement-breakpoint
CREATE INDEX "audit_logs_invoked_by_idx" ON "audit_logs" ("invoked_by");--> statement-breakpoint
CREATE INDEX "audit_logs_table_name_idx" ON "audit_logs" ("table_name");--> statement-breakpoint
CREATE INDEX "audit_logs_date_created_idx" ON "audit_logs" ("createdAt");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_table_name_created_idx" ON "audit_logs" ("table_name","createdAt");--> statement-breakpoint
CREATE INDEX "audit_logs_action_created_idx" ON "audit_logs" ("action","createdAt");--> statement-breakpoint
CREATE INDEX "audit_logs_invoked_by_created_idx" ON "audit_logs" ("invoked_by","createdAt");--> statement-breakpoint
CREATE INDEX "location_photos_location_id_idx" ON "location_photos" ("location_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" ("createdAt");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" ("user_id","readAt");--> statement-breakpoint
CREATE INDEX "passkeys_userId_idx" ON "auth"."passkeys" ("user_id");--> statement-breakpoint
CREATE INDEX "passkeys_credentialID_idx" ON "auth"."passkeys" ("credential_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" ("user_id");--> statement-breakpoint
CREATE INDEX "station_comments_station_id_idx" ON "station_comments" ("station_id");--> statement-breakpoint
CREATE INDEX "station_comments_user_id_idx" ON "station_comments" ("user_id");--> statement-breakpoint
CREATE INDEX "station_comments_station_created_idx" ON "station_comments" ("station_id","createdAt");--> statement-breakpoint
CREATE INDEX "station_photo_selections_station_id_idx" ON "station_photo_selections" ("station_id");--> statement-breakpoint
CREATE INDEX "twoFactors_secret_idx" ON "auth"."two_factors" ("secret");--> statement-breakpoint
CREATE INDEX "twoFactors_userId_idx" ON "auth"."two_factors" ("user_id");--> statement-breakpoint
CREATE INDEX "user_lists_created_by_idx" ON "user_lists" ("created_by");--> statement-breakpoint
CREATE INDEX "user_lists_radiolines_gin" ON "user_lists" USING gin ("radiolines");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "auth"."users" ("email");--> statement-breakpoint
CREATE INDEX "proposed_cells_submission_id_idx" ON "submissions"."proposed_cells" ("submission_id");--> statement-breakpoint
CREATE INDEX "proposed_locations_submission_id_idx" ON "submissions"."proposed_locations" ("submission_id");--> statement-breakpoint
CREATE INDEX "proposed_stations_submission_id_idx" ON "submissions"."proposed_stations" ("submission_id");--> statement-breakpoint
CREATE INDEX "proposed_stations_target_station_id_idx" ON "submissions"."proposed_stations" ("target_station_id");--> statement-breakpoint
CREATE INDEX "submission_photos_submission_id_idx" ON "submissions"."submission_photos" ("submission_id");--> statement-breakpoint
CREATE INDEX "submission_station_id_idx" ON "submissions"."submissions" ("station_id");--> statement-breakpoint
CREATE INDEX "submission_submitter_id_idx" ON "submissions"."submissions" ("submitter_id");--> statement-breakpoint
CREATE INDEX "submission_reviewer_id_idx" ON "submissions"."submissions" ("reviewer_id");--> statement-breakpoint
CREATE INDEX "submission_status_idx" ON "submissions"."submissions" ("status");--> statement-breakpoint
CREATE INDEX "submission_created_at_idx" ON "submissions"."submissions" ("createdAt");--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "deleted_entries" ADD CONSTRAINT "deleted_entries_import_id_uke_import_metadata_id_fkey" FOREIGN KEY ("import_id") REFERENCES "uke_import_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "extra_identificators" ADD CONSTRAINT "extra_identificators_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "gsm_cells" ADD CONSTRAINT "gsm_cells_cell_id_cells_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "lte_cells" ADD CONSTRAINT "lte_cells_cell_id_cells_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nr_cells" ADD CONSTRAINT "nr_cells_cell_id_cells_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "operators" ADD CONSTRAINT "operators_parent_id_operators_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "radiolines_antenna_types" ADD CONSTRAINT "radiolines_antenna_types_TuOPp7ql9804_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "radiolines_manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "radiolines_transmitter_types" ADD CONSTRAINT "radiolines_transmitter_types_8oEyuaF5SmFi_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "radiolines_manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stations_permits" ADD CONSTRAINT "stations_permits_permit_id_uke_permits_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "uke_permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stations_permits" ADD CONSTRAINT "stations_permits_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stats_snapshots" ADD CONSTRAINT "stats_snapshots_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stats_snapshots" ADD CONSTRAINT "stats_snapshots_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke_locations" ADD CONSTRAINT "uke_locations_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke_permit_sectors" ADD CONSTRAINT "uke_permit_sectors_permit_id_uke_permits_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "uke_permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke_permits" ADD CONSTRAINT "uke_permits_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke_permits" ADD CONSTRAINT "uke_permits_location_id_uke_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "uke_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke_permits" ADD CONSTRAINT "uke_permits_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke_radiolines" ADD CONSTRAINT "uke_radiolines_xpP9wLlwGhu5_fkey" FOREIGN KEY ("tx_transmitter_type_id") REFERENCES "radiolines_transmitter_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke_radiolines" ADD CONSTRAINT "uke_radiolines_uhDc8hacOF2B_fkey" FOREIGN KEY ("tx_antenna_type_id") REFERENCES "radiolines_antenna_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke_radiolines" ADD CONSTRAINT "uke_radiolines_VhBmnsa9wuqD_fkey" FOREIGN KEY ("rx_antenna_type_id") REFERENCES "radiolines_antenna_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke_radiolines" ADD CONSTRAINT "uke_radiolines_operator_id_uke_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "uke_operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "umts_cells" ADD CONSTRAINT "umts_cells_cell_id_cells_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_invoked_by_users_id_fkey" FOREIGN KEY ("invoked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "location_photos" ADD CONSTRAINT "location_photos_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "location_photos" ADD CONSTRAINT "location_photos_attachment_id_attachments_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "location_photos" ADD CONSTRAINT "location_photos_uploaded_by_users_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_comments" ADD CONSTRAINT "station_comments_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "station_comments" ADD CONSTRAINT "station_comments_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "station_photo_selections" ADD CONSTRAINT "station_photo_selections_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_photo_selections" ADD CONSTRAINT "station_photo_selections_DlZfTLiFS2ZA_fkey" FOREIGN KEY ("location_photo_id") REFERENCES "location_photos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_lists" ADD CONSTRAINT "user_lists_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD CONSTRAINT "proposed_cells_submission_id_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"."submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD CONSTRAINT "proposed_cells_target_cell_id_cells_id_fkey" FOREIGN KEY ("target_cell_id") REFERENCES "cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD CONSTRAINT "proposed_cells_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD CONSTRAINT "proposed_cells_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_gsm_cells" ADD CONSTRAINT "proposed_gsm_cells_proposed_cell_id_proposed_cells_id_fkey" FOREIGN KEY ("proposed_cell_id") REFERENCES "submissions"."proposed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_lte_cells" ADD CONSTRAINT "proposed_lte_cells_proposed_cell_id_proposed_cells_id_fkey" FOREIGN KEY ("proposed_cell_id") REFERENCES "submissions"."proposed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD CONSTRAINT "proposed_locations_submission_id_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"."submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD CONSTRAINT "proposed_locations_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_nr_cells" ADD CONSTRAINT "proposed_nr_cells_proposed_cell_id_proposed_cells_id_fkey" FOREIGN KEY ("proposed_cell_id") REFERENCES "submissions"."proposed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD CONSTRAINT "proposed_stations_submission_id_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"."submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD CONSTRAINT "proposed_stations_target_station_id_stations_id_fkey" FOREIGN KEY ("target_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD CONSTRAINT "proposed_stations_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_umts_cells" ADD CONSTRAINT "proposed_umts_cells_proposed_cell_id_proposed_cells_id_fkey" FOREIGN KEY ("proposed_cell_id") REFERENCES "submissions"."proposed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."submission_location_photo_selections" ADD CONSTRAINT "submission_location_photo_selections_SehhFYcBuZac_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"."submissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."submission_location_photo_selections" ADD CONSTRAINT "submission_location_photo_selections_ZpF2y9rVXtAs_fkey" FOREIGN KEY ("location_photo_id") REFERENCES "location_photos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."submission_photos" ADD CONSTRAINT "submission_photos_submission_id_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"."submissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."submissions" ADD CONSTRAINT "submissions_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."submissions" ADD CONSTRAINT "submissions_submitter_id_users_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."submissions" ADD CONSTRAINT "submissions_reviewer_id_users_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
-- merged from 20260424121311_small_jane_foster
ALTER TABLE "auth"."two_factors" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- merged from 20260427160637_lush_sauron
ALTER TABLE "stats_snapshots" ALTER COLUMN "band_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stats_snapshots" ALTER COLUMN "permits_count" SET DEFAULT 0;--> statement-breakpoint
CREATE UNIQUE INDEX "stats_snapshots_date_operator_null_band_unique" ON "stats_snapshots" ("snapshot_date","operator_id") WHERE "band_id" IS NULL;
--> statement-breakpoint
-- merged from 20260505201153_normal_rafael_vega
ALTER TABLE "cells" ALTER COLUMN "is_confirmed" SET NOT NULL;
--> statement-breakpoint
-- merged from 20260505202406_cynical_black_cat
ALTER TABLE "submissions"."proposed_cells" ALTER COLUMN "is_confirmed" SET NOT NULL;
--> statement-breakpoint
-- merged from 20260508174826_loose_trauma
ALTER TABLE "auth"."users" ADD COLUMN "bio" varchar(500);--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "contact_info" jsonb;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "profile_visibility" text DEFAULT 'private' NOT NULL;
--> statement-breakpoint
-- merged from 20260511012330_married_moonstone
ALTER TABLE "submissions"."submission_location_photo_selections" ADD COLUMN "is_main" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- merged from 20260612205804_lively_ronan
CREATE TABLE "station_sectors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "station_sectors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" integer NOT NULL,
	"azimuth" integer NOT NULL,
	CONSTRAINT "station_sectors_station_azimuth_unique" UNIQUE("station_id","azimuth"),
	CONSTRAINT "station_sectors_azimuth_range" CHECK ("azimuth" BETWEEN 0 AND 359)
);
--> statement-breakpoint
ALTER TABLE "cells" ADD COLUMN "sector_id" integer;--> statement-breakpoint
CREATE INDEX "station_sectors_station_id_idx" ON "station_sectors" ("station_id");--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_sector_id_station_sectors_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "station_sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "station_sectors" ADD CONSTRAINT "station_sectors_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
-- merged from 20260613022019_cultured_sumo
CREATE TABLE "submissions"."proposed_sectors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "submissions"."proposed_sectors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"submission_id" uuid,
	"target_sector_id" integer,
	"local_id" text NOT NULL,
	"azimuth" integer NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposed_sectors_submission_local_unique" UNIQUE("submission_id","local_id"),
	CONSTRAINT "proposed_sectors_azimuth_range" CHECK ("azimuth" BETWEEN 0 AND 359)
);
--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD COLUMN "target_sector_id" integer;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD COLUMN "sector_local_id" text;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD COLUMN "sector_unassigned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "proposed_sectors_submission_id_idx" ON "submissions"."proposed_sectors" ("submission_id");--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD CONSTRAINT "proposed_cells_target_sector_id_station_sectors_id_fkey" FOREIGN KEY ("target_sector_id") REFERENCES "station_sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_sectors" ADD CONSTRAINT "proposed_sectors_submission_id_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"."submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_sectors" ADD CONSTRAINT "proposed_sectors_target_sector_id_station_sectors_id_fkey" FOREIGN KEY ("target_sector_id") REFERENCES "station_sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
-- merged from 20260614011129_fair_blonde_phantom
CREATE INDEX "stations_published_location_idx" ON "stations" ("location_id","id") WHERE "status" = 'published';--> statement-breakpoint
CREATE INDEX "stations_published_location_operator_idx" ON "stations" ("location_id","operator_id","id") WHERE "status" = 'published';--> statement-breakpoint
CREATE INDEX "uke_permits_location_id_id_idx" ON "uke_permits" ("location_id","id");--> statement-breakpoint
CREATE INDEX "uke_permits_location_created_at_idx" ON "uke_permits" ("location_id","createdAt");--> statement-breakpoint
CREATE INDEX "uke_permits_created_at_location_idx" ON "uke_permits" ("createdAt","location_id");--> statement-breakpoint
CREATE INDEX "uke_permits_location_operator_band_id_idx" ON "uke_permits" ("location_id","operator_id","band_id","id");
--> statement-breakpoint
-- merged from 20260619201210_strong_old_lace
ALTER TABLE "stations" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "stations_inactive_status_changed_at_idx" ON "stations" ("status_changed_at") WHERE "status" = 'inactive';
--> statement-breakpoint
-- merged from 20260623233228_brown_ravenous
ALTER TABLE "submissions"."submission_location_photo_selections" ADD COLUMN "is_removal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."submission_location_photo_selections" ADD CONSTRAINT "is_main_not_removal" CHECK (NOT ("is_main" = true AND "is_removal" = true));
--> statement-breakpoint
-- merged from 20260624001414_smart_dagger
ALTER TABLE "auth"."users" ADD COLUMN "cloud_preferences" jsonb;
--> statement-breakpoint
-- merged from 20260625150200_brown_squadron_supreme
ALTER TABLE "uke_radiolines" ADD COLUMN "physical_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "uke_radiolines" DROP CONSTRAINT "uke_radiolines_natural_key";--> statement-breakpoint
ALTER TABLE "uke_radiolines" ADD CONSTRAINT "uke_radiolines_natural_key" UNIQUE("permit_number","physical_key");--> statement-breakpoint
CREATE INDEX "uke_radiolines_physical_key_idx" ON "uke_radiolines" ("physical_key");
--> statement-breakpoint
-- merged from 20260627023658_tiny_post
CREATE SCHEMA "uke";
--> statement-breakpoint
CREATE TABLE "uke"."uke_stations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uke"."uke_stations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" varchar(16) NOT NULL,
	"operator_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uke_stations_station_operator_location_unique" UNIQUE("station_id","operator_id","location_id"),
	CONSTRAINT "uke_stations_station_id_16_length" CHECK ("station_id" ~ '(^.{1,16}$)')
);
--> statement-breakpoint
ALTER TABLE "radiolines_manufacturers" SET SCHEMA "uke";
--> statement-breakpoint
ALTER TABLE "radiolines_antenna_types" SET SCHEMA "uke";
--> statement-breakpoint
ALTER TABLE "radiolines_transmitter_types" SET SCHEMA "uke";
--> statement-breakpoint
ALTER TABLE "uke_import_metadata" SET SCHEMA "uke";
--> statement-breakpoint
ALTER TABLE "uke_locations" SET SCHEMA "uke";
--> statement-breakpoint
ALTER TABLE "uke_operators" SET SCHEMA "uke";
--> statement-breakpoint
ALTER TABLE "uke_permit_sectors" SET SCHEMA "uke";
--> statement-breakpoint
ALTER TABLE "uke_permits" SET SCHEMA "uke";
--> statement-breakpoint
ALTER TABLE "uke_radiolines" SET SCHEMA "uke";
--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" DROP CONSTRAINT "uke_permits_operator_id_operators_id_fkey";--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" DROP CONSTRAINT "uke_permits_location_id_uke_locations_id_fkey";--> statement-breakpoint
INSERT INTO "uke"."uke_stations" ("station_id", "operator_id", "location_id", "updatedAt", "createdAt")
SELECT
	"station_id",
	"operator_id",
	"location_id",
	MAX("updatedAt") AS "updatedAt",
	MIN("createdAt") AS "createdAt"
FROM "uke"."uke_permits"
GROUP BY "station_id", "operator_id", "location_id";
--> statement-breakpoint
DROP INDEX "uke"."uke_permits_station_id_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_location_id_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_operator_id_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_station_id_trgm_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_operator_band_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_operator_location_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_location_id_id_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_location_created_at_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_created_at_location_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_location_operator_band_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_location_operator_band_id_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_location_band_idx";--> statement-breakpoint
DROP INDEX "uke"."uke_permits_operator_band_location_idx";--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" ADD COLUMN "uke_station_id" integer;--> statement-breakpoint
UPDATE "uke"."uke_permits" p
SET "uke_station_id" = s."id"
FROM "uke"."uke_stations" s
WHERE p."station_id" = s."station_id"
	AND p."operator_id" = s."operator_id"
	AND p."location_id" = s."location_id";
--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" ALTER COLUMN "uke_station_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" DROP CONSTRAINT "uke_permits_unique_permit";--> statement-breakpoint
ALTER TABLE "uke"."uke_locations" DROP COLUMN "point";--> statement-breakpoint
ALTER TABLE "uke"."uke_locations" ADD COLUMN "point" geometry(point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("uke"."uke_locations"."longitude", "uke"."uke_locations"."latitude"), 4326)) STORED;--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" DROP COLUMN "station_id";--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" DROP COLUMN "operator_id";--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" DROP COLUMN "location_id";--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" ADD CONSTRAINT "uke_permits_unique_permit" UNIQUE("uke_station_id","band_id","decision_number","decision_type","expiry_date");--> statement-breakpoint
CREATE INDEX "uke_permits_uke_station_id_idx" ON "uke"."uke_permits" ("uke_station_id");--> statement-breakpoint
CREATE INDEX "uke_permits_uke_station_band_id_idx" ON "uke"."uke_permits" ("uke_station_id","band_id","id");--> statement-breakpoint
CREATE INDEX "uke_permits_uke_station_id_id_idx" ON "uke"."uke_permits" ("uke_station_id","id");--> statement-breakpoint
CREATE INDEX "uke_permits_uke_station_created_at_idx" ON "uke"."uke_permits" ("uke_station_id","createdAt");--> statement-breakpoint
CREATE INDEX "uke_permits_created_at_uke_station_idx" ON "uke"."uke_permits" ("createdAt","uke_station_id");--> statement-breakpoint
CREATE INDEX "uke_permits_updated_at_uke_station_idx" ON "uke"."uke_permits" ("updatedAt","uke_station_id");--> statement-breakpoint
CREATE INDEX "uke_stations_station_id_idx" ON "uke"."uke_stations" ("station_id");--> statement-breakpoint
CREATE INDEX "uke_stations_station_id_trgm_idx" ON "uke"."uke_stations" USING gin (("station_id") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "uke_stations_operator_id_idx" ON "uke"."uke_stations" ("operator_id");--> statement-breakpoint
CREATE INDEX "uke_stations_location_id_idx" ON "uke"."uke_stations" ("location_id");--> statement-breakpoint
CREATE INDEX "uke_stations_location_operator_id_idx" ON "uke"."uke_stations" ("location_id","operator_id","id");--> statement-breakpoint
CREATE INDEX "uke_stations_updated_at_idx" ON "uke"."uke_stations" ("updatedAt");--> statement-breakpoint
CREATE INDEX "uke_stations_created_at_idx" ON "uke"."uke_stations" ("createdAt");--> statement-breakpoint
CREATE INDEX "uke_locations_point_gist" ON "uke"."uke_locations" USING gist ("point");--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" ADD CONSTRAINT "uke_permits_uke_station_id_uke_stations_id_fkey" FOREIGN KEY ("uke_station_id") REFERENCES "uke"."uke_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke"."uke_stations" ADD CONSTRAINT "uke_stations_operator_id_operators_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke"."uke_stations" ADD CONSTRAINT "uke_stations_location_id_uke_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "uke"."uke_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
-- merged from 20260627194444_neat_khan
ALTER TABLE "auth"."users" ADD COLUMN "hunter_listing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "hunter_regions" jsonb DEFAULT '[]';
--> statement-breakpoint
-- merged from 20260628184352_sweet_loki
ALTER TYPE "notification_type" ADD VALUE 'station_cells_changed';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'station_photos_added';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'station_comment_approved';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'station_uke_permit_added';--> statement-breakpoint
CREATE TABLE "station_watches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"station_id" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_watches_user_station_unique" UNIQUE("user_id","station_id")
);
--> statement-breakpoint
CREATE TABLE "uke"."uke_station_watches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"uke_station_id" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uke_station_watches_user_station_unique" UNIQUE("user_id","uke_station_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "station_id" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "uke_station_id" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "push_queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "push_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_lists" ADD COLUMN "notifications_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_station_type_unread_unique" ON "notifications" ("user_id","station_id","type") WHERE "readAt" IS NULL AND "station_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_uke_station_type_unread_unique" ON "notifications" ("user_id","uke_station_id","type") WHERE "readAt" IS NULL AND "uke_station_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_station_watch_push_queue_idx" ON "notifications" ("push_queued_at") WHERE "push_queued_at" IS NOT NULL AND "push_sent_at" IS NULL;--> statement-breakpoint
CREATE INDEX "station_watches_user_id_idx" ON "station_watches" ("user_id");--> statement-breakpoint
CREATE INDEX "station_watches_station_id_idx" ON "station_watches" ("station_id");--> statement-breakpoint
CREATE INDEX "uke_station_watches_user_id_idx" ON "uke"."uke_station_watches" ("user_id");--> statement-breakpoint
CREATE INDEX "uke_station_watches_uke_station_id_idx" ON "uke"."uke_station_watches" ("uke_station_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_uke_station_id_uke_stations_id_fkey" FOREIGN KEY ("uke_station_id") REFERENCES "uke"."uke_stations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_watches" ADD CONSTRAINT "station_watches_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_watches" ADD CONSTRAINT "station_watches_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "uke"."uke_station_watches" ADD CONSTRAINT "uke_station_watches_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "uke"."uke_station_watches" ADD CONSTRAINT "uke_station_watches_uke_station_id_uke_stations_id_fkey" FOREIGN KEY ("uke_station_id") REFERENCES "uke"."uke_stations"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- merged from 20260629120000_detect_uke_station_moves
CREATE INDEX "uke_stations_station_operator_id_idx" ON "uke"."uke_stations" ("station_id","operator_id");
--> statement-breakpoint
-- merged from 20260629181157_stale_skullbuster
CREATE SCHEMA "statistics";
--> statement-breakpoint
CREATE TABLE "statistics"."analyzer_usage" (
	"date" date PRIMARY KEY,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statistics"."contribution_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "statistics"."contribution_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"snapshot_date" timestamp with time zone NOT NULL CONSTRAINT "contribution_snapshots_date_unique" UNIQUE,
	"total_stations" integer DEFAULT 0 NOT NULL,
	"total_sectors" integer DEFAULT 0 NOT NULL,
	"total_extra_ids" integer DEFAULT 0 NOT NULL,
	"total_cells" integer DEFAULT 0 NOT NULL,
	"total_cells_with_pci" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stats_snapshots" SET SCHEMA "statistics";
--> statement-breakpoint
CREATE INDEX "contribution_snapshots_date_idx" ON "statistics"."contribution_snapshots" ("snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "uke_stations_station_operator_id_idx" ON "uke"."uke_stations" ("station_id","operator_id");
--> statement-breakpoint
-- merged from 20260706142944_powerful_terror
ALTER TABLE "station_sectors" DROP CONSTRAINT "station_sectors_azimuth_range", ADD CONSTRAINT "station_sectors_azimuth_range" CHECK ("azimuth" BETWEEN 0 AND 360);--> statement-breakpoint
ALTER TABLE "submissions"."proposed_sectors" DROP CONSTRAINT "proposed_sectors_azimuth_range", ADD CONSTRAINT "proposed_sectors_azimuth_range" CHECK ("azimuth" BETWEEN 0 AND 360);
--> statement-breakpoint
-- merged from 20260710191225_mean_sauron
ALTER TABLE "auth"."two_factors" ADD COLUMN "failed_verification_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."two_factors" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "last_refill_at" SET DATA TYPE timestamp with time zone USING "last_refill_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "last_request" SET DATA TYPE timestamp with time zone USING "last_request"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."passkeys" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;
--> statement-breakpoint
-- merged from 20260713102638_talented_sue_storm
CREATE INDEX "uke_stations_operator_location_id_idx" ON "uke"."uke_stations" ("operator_id","location_id");
--> statement-breakpoint
-- merged from 20260727194724_normal_frog_thor
ALTER TABLE "submissions"."submission_photos" ADD COLUMN "is_main" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- merged from 20260820133328_loving_rhodey
ALTER TABLE "auth"."accounts" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "auth"."accounts"
SET "issuer" = CASE "provider_id"
	WHEN 'credential' THEN 'local:credential'
	WHEN 'google' THEN 'https://accounts.google.com'
	WHEN 'github' THEN 'local:oauth:github'
	ELSE 'local:oauth:' || "provider_id"
END;--> statement-breakpoint
ALTER TABLE "auth"."accounts" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "accounts_issuer_account_id_unique" UNIQUE("issuer","account_id");
--> statement-breakpoint
-- merged from 20260827165130_demonic_corsair
CREATE TABLE "auth"."jwks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"token" text UNIQUE,
	"client_id" varchar(255) NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"refresh_id" uuid,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_client_assertions" (
	"id" varchar(255) PRIMARY KEY,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_client_resources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"client_id" varchar(255) NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "oauth_client_resources_client_resource_unique" UNIQUE("client_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"client_id" varchar(255) NOT NULL UNIQUE,
	"client_secret" text,
	"client_discovery_id" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"client_credentials_scopes" text[],
	"user_id" uuid,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"backchannel_logout_uri" text,
	"backchannel_logout_session_required" boolean,
	"token_endpoint_auth_method" text,
	"application_type" text,
	"jwks" text,
	"jwks_uri" text,
	"grant_types" text[],
	"response_types" text[],
	"require_pkce" boolean,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"reference_id" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_consents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"client_id" varchar(255) NOT NULL,
	"user_id" uuid,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"token" text NOT NULL UNIQUE,
	"client_id" varchar(255) NOT NULL,
	"session_id" uuid,
	"user_id" uuid NOT NULL,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_resources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"identifier" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"token" varchar(255) NOT NULL UNIQUE,
	"user_id" uuid NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(60),
	"user_agent" text,
	"impersonated_by" uuid
);
--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_client_id_idx" ON "auth"."oauth_access_tokens" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_session_id_idx" ON "auth"."oauth_access_tokens" ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_user_id_idx" ON "auth"."oauth_access_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_authorization_code_id_idx" ON "auth"."oauth_access_tokens" ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_refresh_id_idx" ON "auth"."oauth_access_tokens" ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resources_client_id_idx" ON "auth"."oauth_client_resources" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resources_resource_id_idx" ON "auth"."oauth_client_resources" ("resource_id");--> statement-breakpoint
CREATE INDEX "oauth_clients_user_id_idx" ON "auth"."oauth_clients" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_consents_client_id_idx" ON "auth"."oauth_consents" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_consents_user_id_idx" ON "auth"."oauth_consents" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_client_id_idx" ON "auth"."oauth_refresh_tokens" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_session_id_idx" ON "auth"."oauth_refresh_tokens" ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_user_id_idx" ON "auth"."oauth_refresh_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_authorization_code_id_idx" ON "auth"."oauth_refresh_tokens" ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "auth"."sessions" ("user_id");--> statement-breakpoint
ALTER TABLE "auth"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "auth"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_refresh_id_oauth_refresh_tokens_id_fkey" FOREIGN KEY ("refresh_id") REFERENCES "auth"."oauth_refresh_tokens"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_client_id_oauth_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_CxFm94nYigrM_fkey" FOREIGN KEY ("resource_id") REFERENCES "auth"."oauth_resources"("identifier") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_clients" ADD CONSTRAINT "oauth_clients_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_client_id_oauth_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_oauth_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "auth"."oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fkey" FOREIGN KEY ("impersonated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- merged from 20260827175214_migrate_list_uke_locations_to_stations
UPDATE "user_lists" ul
SET "stations" = jsonb_set(
	ul."stations",
	'{uke}',
	COALESCE(
		(
			SELECT jsonb_agg(DISTINCT s."id")
			FROM jsonb_array_elements_text(ul."stations"->'uke') AS loc(id)
			JOIN "uke"."uke_stations" s ON s."location_id" = loc."id"::integer
		),
		'[]'::jsonb
	)
)
WHERE jsonb_array_length(COALESCE(ul."stations"->'uke', '[]'::jsonb)) > 0;
--> statement-breakpoint
-- merged from 20260827175917_round_the_anarchist
-- Custom SQL migration file, put your code below! --
CREATE INDEX "user_lists_stations_internal_gin" ON "user_lists" USING gin (("stations" -> 'internal'));--> statement-breakpoint
CREATE INDEX "user_lists_stations_uke_gin" ON "user_lists" USING gin (("stations" -> 'uke'));
--> statement-breakpoint
-- merged from 20260827212355_sharp_firebird
CREATE TYPE "cell_type" AS ENUM('MACROCELL', 'MICROCELL', 'PICOCELL', 'FEMTOCELL', 'SMALLCELL');--> statement-breakpoint
ALTER TABLE "cells" ADD COLUMN "type" "cell_type";--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD COLUMN "type" "cell_type";
--> statement-breakpoint
-- merged from 20260831204952_little_the_hand
ALTER TABLE "attachments" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."submissions" ALTER COLUMN "submitter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_author_id_users_id_fkey", ADD CONSTRAINT "attachments_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "submissions"."submissions" DROP CONSTRAINT "submissions_submitter_id_users_id_fkey", ADD CONSTRAINT "submissions_submitter_id_users_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
-- merged from 20260831221730_even_purple_man
-- Custom SQL migration file, put your code below! --
CREATE INDEX "uke_permits_decision_fragment_idx" ON "uke"."uke_permits" USING btree (split_part("decision_number", '/', 3));
--> statement-breakpoint
-- merged from 20260913135625_third_zeigeist
ALTER TABLE "cells" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "cell_type";--> statement-breakpoint
CREATE TYPE "cell_type" AS ENUM('MACROCELL', 'MICROCELL', 'PICOCELL', 'FEMTOCELL');--> statement-breakpoint
ALTER TABLE "cells" ALTER COLUMN "type" SET DATA TYPE "cell_type" USING "type"::"cell_type";--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ALTER COLUMN "type" SET DATA TYPE "cell_type" USING "type"::"cell_type";
--> statement-breakpoint
-- merged from 20260914202904_audit_operations_expand
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TYPE "audit_op" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TABLE "audit"."audit_operations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit"."audit_operations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_key" uuid UNIQUE,
	"kind" varchar(64) NOT NULL,
	"actor_id" uuid,
	"performed_by" uuid,
	"source" "audit_source" DEFAULT 'api'::"audit_source" NOT NULL,
	"ip_address" varchar(60),
	"user_agent" text,
	"metadata" jsonb,
	"reverts_operation_id" integer,
	"reverted_by_operation_id" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" SET SCHEMA "audit";
--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" ADD COLUMN "operation_id" integer;--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" ADD COLUMN "entity" varchar(40);--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" ADD COLUMN "op" "audit_op";--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" ADD COLUMN "station_id" integer;--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" ALTER COLUMN "record_id" SET DATA TYPE text USING "record_id"::text;--> statement-breakpoint
CREATE INDEX "audit_operations_created_at_id_idx" ON "audit"."audit_operations" ("createdAt","id");--> statement-breakpoint
CREATE INDEX "audit_operations_actor_id_idx" ON "audit"."audit_operations" ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_operations_performed_by_idx" ON "audit"."audit_operations" ("performed_by");--> statement-breakpoint
CREATE INDEX "audit_operations_kind_idx" ON "audit"."audit_operations" ("kind");--> statement-breakpoint
CREATE INDEX "audit_operations_reverts_operation_id_idx" ON "audit"."audit_operations" ("reverts_operation_id");--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" ADD CONSTRAINT "audit_logs_operation_id_audit_operations_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "audit"."audit_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit"."audit_operations" ADD CONSTRAINT "audit_operations_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit"."audit_operations" ADD CONSTRAINT "audit_operations_performed_by_users_id_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit"."audit_operations" ADD CONSTRAINT "audit_operations_reverts_operation_id_audit_operations_id_fkey" FOREIGN KEY ("reverts_operation_id") REFERENCES "audit"."audit_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit"."audit_operations" ADD CONSTRAINT "audit_operations_vjek360cGPcj_fkey" FOREIGN KEY ("reverted_by_operation_id") REFERENCES "audit"."audit_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
-- merged from 20260914202919_audit_operations_backfill
SET LOCAL effective_io_concurrency = 0;--> statement-breakpoint

CREATE TEMP TABLE "_audit_backfill_rows" ON COMMIT DROP AS
WITH normalized AS (
	SELECT
		logs."id",
		logs."action"::text AS "legacy_action",
		logs."table_name",
		logs."record_id",
		logs."old_values",
		logs."new_values",
		logs."metadata",
		logs."source",
		logs."ip_address",
		logs."user_agent",
		logs."invoked_by",
		logs."createdAt",
		NULLIF(logs."metadata"->>'submission_id', '') AS "submission_id",
		NULLIF(logs."metadata"->>'reason', '') AS "reason",
		logs."table_name" = 'stations'
			AND logs."action"::text = 'stations.update'
			AND jsonb_typeof(logs."new_values") = 'object'
			AND logs."new_values" - 'updatedAt' = CASE
				WHEN jsonb_typeof(logs."old_values") = 'object' THEN logs."old_values" - 'updatedAt'
				ELSE '{}'::jsonb
			END AS "is_touch",
		logs."action"::text = 'uke_import.start'
			OR logs."action"::text = 'submissions.cleanup'
			OR (
				logs."action"::text = 'submission_photos.delete'
				AND logs."record_id" IS NULL
				AND logs."old_values" IS NULL
				AND logs."new_values" IS NULL
			) AS "is_op_only",
		(
			logs."table_name" = 'cells'
			AND (
				jsonb_typeof(logs."old_values"->'cells') = 'array'
				OR jsonb_typeof(logs."new_values"->'cells') = 'array'
			)
		)
			OR (
				logs."table_name" IN ('location_photos', 'station_photos', 'submission_photos')
				AND jsonb_typeof(logs."new_values") = 'array'
			) AS "is_array"
	FROM "audit"."audit_logs" AS logs
)
SELECT
	normalized.*,
	CASE
		WHEN normalized."table_name" IN ('stations', 'station_sectors', 'extra_identificators', 'station_photo_selections')
			AND normalized."record_id" ~ '^[0-9]+$'
			THEN normalized."record_id"::integer
		WHEN normalized."table_name" = 'cells' THEN COALESCE(
			CASE
				WHEN normalized."metadata"->>'station_id' ~ '^[0-9]+$' THEN (normalized."metadata"->>'station_id')::integer
			END,
			CASE
				WHEN normalized."new_values"->>'station_id' ~ '^[0-9]+$' THEN (normalized."new_values"->>'station_id')::integer
			END,
			CASE
				WHEN normalized."old_values"->>'station_id' ~ '^[0-9]+$' THEN (normalized."old_values"->>'station_id')::integer
			END
		)
		WHEN normalized."table_name" IN ('locations', 'submissions')
			AND normalized."metadata"->>'station_id' ~ '^[0-9]+$'
			THEN (normalized."metadata"->>'station_id')::integer
		WHEN normalized."table_name" = 'station_comments' THEN COALESCE(
			CASE
				WHEN normalized."new_values"->>'station_id' ~ '^[0-9]+$' THEN (normalized."new_values"->>'station_id')::integer
			END,
			CASE
				WHEN normalized."old_values"->>'station_id' ~ '^[0-9]+$' THEN (normalized."old_values"->>'station_id')::integer
			END
		)
	END AS "station_id",
	CASE
		WHEN normalized."table_name" = 'station_photos' THEN 'location_photos'
		ELSE normalized."table_name"
	END AS "entity",
	(
		CASE
			WHEN normalized."table_name" IN ('station_sectors', 'station_photo_selections') THEN 'update'
			WHEN normalized."table_name" = 'extra_identificators' AND normalized."old_values" IS NULL THEN 'create'
			WHEN normalized."table_name" = 'extra_identificators' AND normalized."new_values" IS NULL THEN 'delete'
			WHEN normalized."legacy_action" = 'stations.delete' THEN 'update'
			WHEN normalized."legacy_action" IN ('submissions.approve', 'submissions.reject') THEN 'update'
			WHEN normalized."legacy_action" LIKE '%.create' THEN 'create'
			WHEN normalized."legacy_action" LIKE '%.delete' THEN 'delete'
			ELSE 'update'
		END
	)::"audit_op" AS "op",
	CASE
		WHEN normalized."table_name" IN ('station_sectors', 'station_photo_selections') THEN NULL
		WHEN normalized."is_array" THEN NULL
		WHEN normalized."table_name" = 'extra_identificators' THEN COALESCE(
			normalized."new_values"->>'id',
			normalized."old_values"->>'id'
		)
		WHEN normalized."table_name" = 'station_comments' THEN COALESCE(
			normalized."new_values"->>'id',
			normalized."old_values"->>'id',
			normalized."metadata"->>'comment_id'
		)
		WHEN normalized."table_name" = 'submissions' THEN COALESCE(
			normalized."submission_id",
			normalized."new_values"->>'id',
			normalized."old_values"->>'id',
			normalized."record_id"
		)
		ELSE normalized."record_id"
	END AS "record_key"
FROM normalized;--> statement-breakpoint

ANALYZE "_audit_backfill_rows";--> statement-breakpoint

CREATE TEMP TABLE "_audit_backfill_grouped" ON COMMIT DROP AS
WITH parent_events AS (
	SELECT
		rows."id" AS "event_id",
		rows."invoked_by",
		event.*
	FROM "_audit_backfill_rows" AS rows
	CROSS JOIN LATERAL (
		SELECT
			'cells'::text AS "family",
			CASE WHEN rows."is_touch" THEN rows."reason" ELSE rows."legacy_action" END AS "action_key",
			rows."station_id" AS "station_key",
			NULL::text AS "record_key",
			CASE WHEN rows."is_touch" THEN NULL::integer ELSE rows."id" END AS "candidate_id",
			rows."is_touch" AS "is_touch_event"
		WHERE rows."station_id" IS NOT NULL
			AND (
				(rows."is_touch" AND rows."reason" LIKE 'cells.%')
				OR (NOT rows."is_touch" AND rows."legacy_action" LIKE 'cells.%')
			)

		UNION ALL

		SELECT
			'locations'::text,
			NULL::text,
			NULL::integer,
			CASE
				WHEN rows."is_touch" THEN rows."metadata"->>'location_id'
				ELSE rows."record_key"
			END,
			CASE WHEN rows."is_touch" THEN NULL::integer ELSE rows."id" END,
			rows."is_touch"
		WHERE (
				(rows."is_touch" AND rows."reason" = 'locations.update')
				OR (NOT rows."is_touch" AND rows."table_name" = 'locations')
			)
			AND CASE
				WHEN rows."is_touch" THEN rows."metadata"->>'location_id'
				ELSE rows."record_key"
			END IS NOT NULL

		UNION ALL

		SELECT
			'analyzer'::text,
			NULL::text,
			rows."station_id",
			NULL::text,
			CASE WHEN rows."is_touch" THEN NULL::integer ELSE rows."id" END,
			rows."is_touch"
		WHERE rows."station_id" IS NOT NULL
			AND (
				(rows."is_touch" AND rows."reason" = 'analyzer')
				OR (NOT rows."is_touch" AND rows."metadata"->>'source' = 'analyzer')
			)
	) AS event
), ranked_events AS (
	SELECT
		parent_events."event_id",
		parent_events."is_touch_event",
		MAX(parent_events."candidate_id") OVER (
			PARTITION BY
				parent_events."family",
				parent_events."invoked_by",
				parent_events."action_key",
				parent_events."station_key",
				parent_events."record_key"
			ORDER BY parent_events."event_id"
			ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
		) AS "parent_id"
	FROM parent_events
), parents AS (
	SELECT ranked_events."event_id", ranked_events."parent_id"
	FROM ranked_events
	WHERE ranked_events."is_touch_event"
)
SELECT
	rows.*,
	parents."parent_id",
	CASE
		WHEN rows."submission_id" IS NOT NULL
			AND (
				rows."legacy_action" = 'submissions.approve'
				OR rows."table_name" IN (
					'stations',
					'cells',
					'locations',
					'station_sectors',
					'extra_identificators',
					'station_photo_selections',
					'station_photos',
					'location_photos'
				)
			)
			THEN 'sub:' || rows."submission_id"
		ELSE 'row:' || COALESCE(parents."parent_id", rows."id")::text
	END AS "group_key"
FROM "_audit_backfill_rows" AS rows
LEFT JOIN parents ON parents."event_id" = rows."id";--> statement-breakpoint

CREATE INDEX "_audit_backfill_grouped_anchor_idx" ON "_audit_backfill_grouped" ("group_key", "is_touch", "id");--> statement-breakpoint

ANALYZE "_audit_backfill_grouped";--> statement-breakpoint

CREATE TEMP TABLE "_audit_backfill_groups" ON COMMIT DROP AS
WITH aggregates AS (
	SELECT
		grouped."group_key",
		MIN(grouped."id") AS "first_id",
		MIN(grouped."createdAt") AS "created_at",
		MAX(grouped."submission_id") AS "submission_id",
		MAX(grouped."metadata"->>'type') AS "metadata_submission_type",
		BOOL_OR(grouped."is_op_only") AS "has_op_only",
		(MIN(grouped."invoked_by"::text) FILTER (
			WHERE grouped."legacy_action" <> 'submissions.approve' AND NOT grouped."is_touch"
		))::uuid AS "engine_actor_id",
		(ARRAY_AGG(grouped."invoked_by" ORDER BY grouped."id" DESC) FILTER (
			WHERE grouped."legacy_action" = 'submissions.approve' AND grouped."invoked_by" IS NOT NULL
		))[1] AS "approval_performer_id",
		JSONB_AGG(DISTINCT grouped."station_id" ORDER BY grouped."station_id") FILTER (
			WHERE grouped."is_touch"
				AND grouped."reason" = 'locations.update'
				AND grouped."station_id" IS NOT NULL
		) AS "station_ids",
		BOOL_OR(
			(grouped."is_touch" OR grouped."is_op_only" OR grouped."is_array") IS NOT TRUE
			OR CASE
				WHEN grouped."is_array" IS TRUE
					AND grouped."entity" = 'cells'
					AND grouped."op" = 'create' THEN EXISTS (
						SELECT 1
						FROM jsonb_array_elements(grouped."new_values"->'cells') AS cell("value")
					)
				WHEN grouped."is_array" IS TRUE
					AND grouped."entity" = 'cells'
					AND grouped."op" = 'delete' THEN EXISTS (
						SELECT 1
						FROM jsonb_array_elements(grouped."old_values"->'cells') AS cell("value")
					)
				WHEN grouped."is_array" IS TRUE
					AND grouped."entity" = 'cells'
					AND grouped."op" = 'update' THEN EXISTS (
						SELECT 1
						FROM jsonb_array_elements(grouped."old_values"->'cells')
							WITH ORDINALITY AS old_cell("value", "position")
						JOIN LATERAL jsonb_array_elements(grouped."new_values"->'cells')
							WITH ORDINALITY AS new_cell("value", "position")
							ON new_cell."position" = old_cell."position"
					)
				WHEN grouped."is_array" IS TRUE
					AND grouped."entity" IN ('location_photos', 'submission_photos')
					AND grouped."op" = 'create' THEN EXISTS (
						SELECT 1
						FROM jsonb_array_elements(grouped."new_values") AS photo("value")
					)
				ELSE FALSE
			END
		) AS "has_retained_log"
	FROM "_audit_backfill_grouped" AS grouped
	GROUP BY grouped."group_key"
), anchors AS (
	SELECT DISTINCT ON (grouped."group_key") grouped.*
	FROM "_audit_backfill_grouped" AS grouped
	ORDER BY grouped."group_key", grouped."is_touch", grouped."id"
), details AS (
	SELECT
		aggregates.*,
		anchors."legacy_action",
		anchors."table_name",
		anchors."old_values" AS "anchor_old_values",
		anchors."new_values" AS "anchor_new_values",
		anchors."metadata" AS "anchor_metadata",
		anchors."invoked_by" AS "anchor_invoked_by",
		first_rows."source",
		first_rows."ip_address",
		first_rows."user_agent",
		submission."submitter_id",
		submission."reviewer_id",
		submission."type"::text AS "submission_type"
	FROM aggregates
	JOIN anchors ON anchors."group_key" = aggregates."group_key"
	JOIN "_audit_backfill_grouped" AS first_rows ON first_rows."id" = aggregates."first_id"
	LEFT JOIN "submissions"."submissions" AS submission ON submission."id" = CASE
		WHEN aggregates."submission_id" ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
			THEN aggregates."submission_id"::uuid
	END
), kinded AS (
	SELECT
		details.*,
		CASE
			WHEN details."group_key" LIKE 'sub:%' THEN 'submission.approve'
			WHEN details."has_op_only" AND details."legacy_action" = 'uke_import.start' THEN 'uke.import'
			WHEN details."has_op_only" THEN 'submission.cleanup'
			WHEN details."anchor_metadata"->>'source' = 'analyzer' THEN 'analyzer.apply'
			WHEN details."legacy_action" = 'stations.create' THEN 'station.create'
			WHEN details."legacy_action" = 'stations.delete' THEN 'station.delete'
			WHEN details."legacy_action" = 'stations.update' AND details."table_name" = 'station_photo_selections' THEN 'station.photos'
			WHEN details."legacy_action" = 'stations.update' THEN 'station.edit'
			WHEN details."legacy_action" LIKE 'cells.%' THEN details."legacy_action"
			WHEN details."legacy_action" = 'locations.update' THEN 'location.edit'
			WHEN details."legacy_action" LIKE 'locations.%' THEN REPLACE(details."legacy_action", 'locations.', 'location.')
			WHEN details."legacy_action" LIKE 'submissions.%' THEN REPLACE(details."legacy_action", 'submissions.', 'submission.')
			WHEN details."legacy_action" LIKE 'submission_photos.%' THEN 'submission.photos'
			WHEN details."legacy_action" LIKE 'location_photos.%' OR details."legacy_action" LIKE 'station_photos.%' THEN 'location.photos'
			WHEN details."legacy_action" LIKE 'station_comments.%' THEN REPLACE(details."legacy_action", 'station_comments.', 'comment.')
			WHEN details."legacy_action" LIKE 'operators.%' THEN REPLACE(details."legacy_action", 'operators.', 'operator.')
			WHEN details."legacy_action" LIKE 'bands.%' THEN REPLACE(details."legacy_action", 'bands.', 'band.')
			WHEN details."legacy_action" LIKE 'regions.%' THEN REPLACE(details."legacy_action", 'regions.', 'region.')
			WHEN details."legacy_action" LIKE 'user_lists.%' THEN REPLACE(details."legacy_action", 'user_lists.', 'list.')
			WHEN details."legacy_action" = 'settings.update' THEN 'settings.update'
		END AS "kind"
	FROM details
)
SELECT
	kinded."group_key",
	kinded."first_id",
	kinded."created_at",
	kinded."has_retained_log",
	kinded."kind",
	CASE
		WHEN kinded."group_key" LIKE 'sub:%' THEN COALESCE(
			kinded."submitter_id",
			kinded."engine_actor_id",
			kinded."approval_performer_id"
		)
		ELSE kinded."anchor_invoked_by"
	END AS "actor_id",
	CASE
		WHEN kinded."group_key" LIKE 'sub:%' THEN COALESCE(kinded."approval_performer_id", kinded."reviewer_id")
		ELSE kinded."anchor_invoked_by"
	END AS "performed_by",
	COALESCE(kinded."source", 'api'::"audit_source") AS "source",
	kinded."ip_address",
	kinded."user_agent",
	(
		CASE
			WHEN kinded."has_op_only" THEN COALESCE(kinded."anchor_metadata", '{}'::jsonb)
			ELSE '{}'::jsonb
		END
	) || jsonb_strip_nulls(
		jsonb_build_object(
			'legacy', true,
			'legacy_group', kinded."group_key",
			'submission_id', kinded."submission_id",
			'submission_type', COALESCE(kinded."submission_type", kinded."metadata_submission_type"),
			'station_ids', CASE
				WHEN kinded."kind" = 'location.edit' THEN kinded."station_ids"
			END,
			'submitter_id', CASE
				WHEN kinded."kind" = 'submission.reject' THEN COALESCE(
					kinded."submitter_id"::text,
					kinded."anchor_old_values"->>'submitter_id',
					kinded."anchor_new_values"->>'submitter_id'
				)
			END
		)
	) AS "metadata"
FROM kinded;--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "_audit_backfill_groups"
		WHERE "kind" IS NULL OR "kind" NOT IN (
			'station.create',
			'station.edit',
			'station.delete',
			'station.photos',
			'cells.create',
			'cells.update',
			'cells.delete',
			'location.create',
			'location.edit',
			'location.delete',
			'location.photos',
			'submission.create',
			'submission.update',
			'submission.delete',
			'submission.approve',
			'submission.reject',
			'submission.cleanup',
			'submission.photos',
			'analyzer.apply',
			'comment.create',
			'comment.update',
			'comment.delete',
			'operator.create',
			'operator.update',
			'operator.delete',
			'band.create',
			'band.update',
			'band.delete',
			'region.create',
			'region.update',
			'region.delete',
			'list.create',
			'list.update',
			'list.delete',
			'settings.update',
			'uke.import',
			'system.inactive_cleanup',
			'system.submission_cleanup',
			'revert'
		)
	) THEN
		RAISE EXCEPTION 'Legacy audit backfill produced an unsupported operation kind';
	END IF;
END
$$;--> statement-breakpoint

INSERT INTO "audit"."audit_operations" (
	"kind",
	"actor_id",
	"performed_by",
	"source",
	"ip_address",
	"user_agent",
	"metadata",
	"createdAt"
)
SELECT
	groups."kind",
	groups."actor_id",
	groups."performed_by",
	groups."source",
	groups."ip_address",
	groups."user_agent",
	groups."metadata",
	groups."created_at"
FROM "_audit_backfill_groups" AS groups
WHERE groups."has_retained_log"
	OR groups."kind" IN ('uke.import', 'submission.cleanup')
ORDER BY groups."created_at", groups."first_id";--> statement-breakpoint

CREATE INDEX "audit_operations_legacy_group_idx" ON "audit"."audit_operations" (("metadata"->>'legacy_group'));--> statement-breakpoint

ANALYZE "audit"."audit_operations";--> statement-breakpoint

UPDATE "audit"."audit_logs" AS logs
SET
	"operation_id" = operations."id",
	"entity" = grouped."entity",
	"op" = grouped."op",
	"record_id" = grouped."record_key",
	"station_id" = grouped."station_id"
FROM "_audit_backfill_grouped" AS grouped
JOIN "audit"."audit_operations" AS operations ON operations."metadata"->>'legacy_group' = grouped."group_key"
WHERE logs."id" = grouped."id";--> statement-breakpoint

ANALYZE "audit"."audit_logs" ("operation_id", "entity", "op", "station_id");--> statement-breakpoint

WITH operation_stations AS (
	SELECT logs."operation_id", MIN(logs."station_id") AS "station_id"
	FROM "audit"."audit_logs" AS logs
	WHERE logs."station_id" IS NOT NULL
	GROUP BY logs."operation_id"
)
UPDATE "audit"."audit_logs" AS logs
SET "station_id" = operation_stations."station_id"
FROM operation_stations
JOIN "audit"."audit_operations" AS operations ON operations."id" = operation_stations."operation_id"
WHERE logs."operation_id" = operation_stations."operation_id"
	AND operations."kind" = 'submission.approve'
	AND logs."entity" IN ('locations', 'submissions')
	AND logs."station_id" IS NULL;--> statement-breakpoint

INSERT INTO "audit"."audit_logs" (
	"operation_id",
	"entity",
	"op",
	"record_id",
	"station_id",
	"old_values",
	"new_values",
	"metadata",
	"action",
	"table_name",
	"source",
	"ip_address",
	"user_agent",
	"invoked_by",
	"createdAt"
)
SELECT
	logs."operation_id",
	logs."entity",
	logs."op",
	cell."value"->>'id',
	COALESCE(
		logs."station_id",
		CASE
			WHEN cell."value"->>'station_id' ~ '^[0-9]+$' THEN (cell."value"->>'station_id')::integer
		END
	),
	NULL,
	cell."value",
	logs."metadata",
	logs."action",
	logs."table_name",
	logs."source",
	logs."ip_address",
	logs."user_agent",
	logs."invoked_by",
	logs."createdAt"
FROM "audit"."audit_logs" AS logs
JOIN "_audit_backfill_rows" AS backfill ON backfill."id" = logs."id" AND backfill."is_array"
CROSS JOIN LATERAL jsonb_array_elements(logs."new_values"->'cells') AS cell("value")
WHERE logs."entity" = 'cells' AND logs."op" = 'create';--> statement-breakpoint

INSERT INTO "audit"."audit_logs" (
	"operation_id",
	"entity",
	"op",
	"record_id",
	"station_id",
	"old_values",
	"new_values",
	"metadata",
	"action",
	"table_name",
	"source",
	"ip_address",
	"user_agent",
	"invoked_by",
	"createdAt"
)
SELECT
	logs."operation_id",
	logs."entity",
	logs."op",
	cell."value"->>'id',
	COALESCE(
		logs."station_id",
		CASE
			WHEN cell."value"->>'station_id' ~ '^[0-9]+$' THEN (cell."value"->>'station_id')::integer
		END
	),
	cell."value",
	NULL,
	logs."metadata",
	logs."action",
	logs."table_name",
	logs."source",
	logs."ip_address",
	logs."user_agent",
	logs."invoked_by",
	logs."createdAt"
FROM "audit"."audit_logs" AS logs
JOIN "_audit_backfill_rows" AS backfill ON backfill."id" = logs."id" AND backfill."is_array"
CROSS JOIN LATERAL jsonb_array_elements(logs."old_values"->'cells') AS cell("value")
WHERE logs."entity" = 'cells' AND logs."op" = 'delete';--> statement-breakpoint

INSERT INTO "audit"."audit_logs" (
	"operation_id",
	"entity",
	"op",
	"record_id",
	"station_id",
	"old_values",
	"new_values",
	"metadata",
	"action",
	"table_name",
	"source",
	"ip_address",
	"user_agent",
	"invoked_by",
	"createdAt"
)
SELECT
	logs."operation_id",
	logs."entity",
	logs."op",
	COALESCE(new_cell."value"->>'id', old_cell."value"->>'id'),
	COALESCE(
		logs."station_id",
		CASE
			WHEN new_cell."value"->>'station_id' ~ '^[0-9]+$' THEN (new_cell."value"->>'station_id')::integer
		END,
		CASE
			WHEN old_cell."value"->>'station_id' ~ '^[0-9]+$' THEN (old_cell."value"->>'station_id')::integer
		END
	),
	old_cell."value",
	new_cell."value",
	logs."metadata",
	logs."action",
	logs."table_name",
	logs."source",
	logs."ip_address",
	logs."user_agent",
	logs."invoked_by",
	logs."createdAt"
FROM "audit"."audit_logs" AS logs
JOIN "_audit_backfill_rows" AS backfill ON backfill."id" = logs."id" AND backfill."is_array"
CROSS JOIN LATERAL jsonb_array_elements(logs."old_values"->'cells') WITH ORDINALITY AS old_cell("value", "position")
JOIN LATERAL jsonb_array_elements(logs."new_values"->'cells') WITH ORDINALITY AS new_cell("value", "position")
	ON new_cell."position" = old_cell."position"
WHERE logs."entity" = 'cells' AND logs."op" = 'update';--> statement-breakpoint

INSERT INTO "audit"."audit_logs" (
	"operation_id",
	"entity",
	"op",
	"record_id",
	"station_id",
	"old_values",
	"new_values",
	"metadata",
	"action",
	"table_name",
	"source",
	"ip_address",
	"user_agent",
	"invoked_by",
	"createdAt"
)
SELECT
	logs."operation_id",
	logs."entity",
	logs."op",
	photo."value"->>'id',
	logs."station_id",
	NULL,
	photo."value",
	logs."metadata",
	logs."action",
	logs."table_name",
	logs."source",
	logs."ip_address",
	logs."user_agent",
	logs."invoked_by",
	logs."createdAt"
FROM "audit"."audit_logs" AS logs
JOIN "_audit_backfill_rows" AS backfill ON backfill."id" = logs."id" AND backfill."is_array"
CROSS JOIN LATERAL jsonb_array_elements(logs."new_values") AS photo("value")
WHERE logs."entity" IN ('location_photos', 'submission_photos') AND logs."op" = 'create';--> statement-breakpoint

DELETE FROM "audit"."audit_logs" AS logs
USING "_audit_backfill_rows" AS backfill
WHERE logs."id" = backfill."id"
	AND (backfill."is_touch" OR backfill."is_op_only" OR backfill."is_array");--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (
		SELECT operations."id"
		FROM "audit"."audit_operations" AS operations
		WHERE operations."kind" NOT IN ('uke.import', 'submission.cleanup')

		EXCEPT

		SELECT logs."operation_id"
		FROM "audit"."audit_logs" AS logs
		WHERE logs."operation_id" IS NOT NULL
	) THEN
		RAISE EXCEPTION 'Legacy audit backfill created an operation without entries';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "audit"."audit_logs"
		WHERE "operation_id" IS NULL OR "entity" IS NULL OR "op" IS NULL
	) THEN
		RAISE EXCEPTION 'Legacy audit backfill left entries without their required operation contract';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "audit"."audit_logs"
		WHERE "entity" = 'cells' AND "record_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Legacy cell audit backfill left entries without record IDs';
	END IF;
END
$$;--> statement-breakpoint

DROP INDEX "audit"."audit_operations_legacy_group_idx";
--> statement-breakpoint
-- merged from 20260914203127_audit_operations_contract
ALTER TABLE "audit"."audit_logs" DROP CONSTRAINT "audit_logs_invoked_by_users_id_fkey";--> statement-breakpoint
DROP INDEX "audit"."audit_logs_record_id_idx";--> statement-breakpoint
DROP INDEX "audit"."audit_logs_invoked_by_idx";--> statement-breakpoint
DROP INDEX "audit"."audit_logs_table_name_idx";--> statement-breakpoint
DROP INDEX "audit"."audit_logs_action_idx";--> statement-breakpoint
DROP INDEX "audit"."audit_logs_table_name_created_idx";--> statement-breakpoint
DROP INDEX "audit"."audit_logs_action_created_idx";--> statement-breakpoint
DROP INDEX "audit"."audit_logs_invoked_by_created_idx";--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" DROP COLUMN "action";--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" DROP COLUMN "table_name";--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" DROP COLUMN "ip_address";--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" DROP COLUMN "user_agent";--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" DROP COLUMN "invoked_by";--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" ALTER COLUMN "operation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" ALTER COLUMN "entity" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit"."audit_logs" ALTER COLUMN "op" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_logs_operation_id_idx" ON "audit"."audit_logs" ("operation_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_op_idx" ON "audit"."audit_logs" ("entity","op");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_record_id_idx" ON "audit"."audit_logs" ("entity","record_id");--> statement-breakpoint
CREATE INDEX "audit_logs_station_operation_idx" ON "audit"."audit_logs" ("station_id","operation_id");--> statement-breakpoint
DROP TYPE "audit_action";
--> statement-breakpoint
-- merged from 20260914233609_migrate_legacy_permissions
CREATE OR REPLACE FUNCTION "auth"."_migrate_legacy_permission_array_20260914"(current_permissions text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
STRICT
AS $function$
	SELECT ARRAY(
		SELECT deduplicated.permission
		FROM (
			SELECT candidates.permission, MIN(candidates.position) AS first_position
			FROM (
				SELECT original.permission, original.position
				FROM unnest(current_permissions) WITH ORDINALITY AS original(permission, position)
				WHERE original.permission IS NULL
					OR original.permission <> ALL (
						ARRAY[
							'write:bands',
							'write:cells',
							'write:operators',
							'write:regions',
							'write:locations',
							'write:stations',
							'write:submissions',
							'read:audit_logs',
							'write:audit_operations',
							'write:uke_permits',
							'write:uke_radiolines',
							'read:uke_permits_orphaned',
							'ban:users'
						]::text[]
					)

				UNION ALL

				SELECT derived.permission, cardinality(current_permissions) + derived.position
				FROM unnest(
					ARRAY[
						CASE WHEN 'write:bands' = ANY (current_permissions) THEN 'create:bands' END,
						CASE WHEN 'write:bands' = ANY (current_permissions) THEN 'update:bands' END,
						CASE
							WHEN 'write:cells' = ANY (current_permissions)
								OR 'write:stations' = ANY (current_permissions)
							THEN 'create:cells'
						END,
						CASE
							WHEN 'write:cells' = ANY (current_permissions)
								OR 'write:stations' = ANY (current_permissions)
							THEN 'update:cells'
						END,
						CASE WHEN 'write:operators' = ANY (current_permissions) THEN 'create:operators' END,
						CASE WHEN 'write:operators' = ANY (current_permissions) THEN 'update:operators' END,
						CASE WHEN 'write:regions' = ANY (current_permissions) THEN 'create:regions' END,
						CASE WHEN 'write:regions' = ANY (current_permissions) THEN 'update:regions' END,
						CASE WHEN 'write:locations' = ANY (current_permissions) THEN 'create:locations' END,
						CASE WHEN 'write:locations' = ANY (current_permissions) THEN 'update:locations' END,
						CASE WHEN 'write:stations' = ANY (current_permissions) THEN 'create:stations' END,
						CASE WHEN 'write:stations' = ANY (current_permissions) THEN 'update:stations' END,
						CASE WHEN 'write:submissions' = ANY (current_permissions) THEN 'create:submissions' END,
						CASE WHEN 'read:audit_logs' = ANY (current_permissions) THEN 'read:audit_operations' END,
						CASE WHEN 'write:audit_operations' = ANY (current_permissions) THEN 'revert:audit_operations' END,
						CASE
							WHEN 'create:cells' = ANY (current_permissions)
								AND 'update:cells' = ANY (current_permissions)
								AND 'write:stations' = ANY (current_permissions)
							THEN 'apply:analyzer'
						END,
						CASE
							WHEN 'write:uke_permits' = ANY (current_permissions)
								AND 'write:uke_radiolines' = ANY (current_permissions)
							THEN 'read:uke_import'
						END,
						CASE
							WHEN 'write:uke_permits' = ANY (current_permissions)
								AND 'write:uke_radiolines' = ANY (current_permissions)
							THEN 'run:uke_import'
						END,
						CASE WHEN 'read:uke_permits_orphaned' = ANY (current_permissions) THEN 'read_unassigned:uke_permits' END,
						CASE WHEN 'update:user' = ANY (current_permissions) THEN 'resend-verification:user' END,
						CASE WHEN 'ban:users' = ANY (current_permissions) THEN 'delete-avatar:user' END
					]::text[]
				) WITH ORDINALITY AS derived(permission, position)
				WHERE derived.permission IS NOT NULL
			) AS candidates
			GROUP BY candidates.permission
		) AS deduplicated
		ORDER BY deduplicated.first_position
	)
$function$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "auth"."_migrate_legacy_api_key_permissions_20260914"(serialized_permissions text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $function$
DECLARE
	permission_object jsonb;
	flattened_permissions text[];
	migrated_permissions text[];
	empty_resources jsonb;
	grouped_permissions jsonb;
	migrated_object jsonb;
BEGIN
	BEGIN
		permission_object := serialized_permissions::jsonb;
	EXCEPTION
		WHEN data_exception THEN
			RETURN serialized_permissions;
	END;

	IF jsonb_typeof(permission_object) IS DISTINCT FROM 'object' THEN
		RETURN serialized_permissions;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_each(permission_object) AS resources(resource, actions)
		WHERE strpos(resources.resource, ':') > 0
			OR jsonb_typeof(resources.actions) <> 'array'
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(
					CASE
						WHEN jsonb_typeof(resources.actions) = 'array' THEN resources.actions
						ELSE '[]'::jsonb
					END
				) AS entries(action)
				WHERE jsonb_typeof(entries.action) <> 'string'
					OR strpos(entries.action #>> '{}', ':') > 0
			)
	) THEN
		RETURN serialized_permissions;
	END IF;

	SELECT COALESCE(
		array_agg(entries.action || ':' || resources.resource ORDER BY resources.position, entries.position),
		ARRAY[]::text[]
	)
	INTO flattened_permissions
	FROM jsonb_each(permission_object) WITH ORDINALITY AS resources(resource, actions, position)
	CROSS JOIN LATERAL jsonb_array_elements_text(resources.actions) WITH ORDINALITY AS entries(action, position);

	migrated_permissions := "auth"."_migrate_legacy_permission_array_20260914"(flattened_permissions);

	SELECT COALESCE(jsonb_object_agg(resources.resource, '[]'::jsonb), '{}'::jsonb)
	INTO empty_resources
	FROM jsonb_each(permission_object) AS resources(resource, actions)
	WHERE jsonb_array_length(resources.actions) = 0;

	SELECT COALESCE(jsonb_object_agg(grouped.resource, grouped.actions), '{}'::jsonb)
	INTO grouped_permissions
	FROM (
		SELECT
			split_part(entries.permission, ':', 2) AS resource,
			jsonb_agg(split_part(entries.permission, ':', 1) ORDER BY entries.position) AS actions
		FROM unnest(migrated_permissions) WITH ORDINALITY AS entries(permission, position)
		GROUP BY split_part(entries.permission, ':', 2)
	) AS grouped;

	migrated_object := empty_resources || grouped_permissions;

	IF migrated_object = permission_object THEN
		RETURN serialized_permissions;
	END IF;

	RETURN migrated_object::text;
END
$function$;--> statement-breakpoint
UPDATE "auth"."oauth_clients"
SET
	"scopes" = "auth"."_migrate_legacy_permission_array_20260914"("scopes"),
	"client_credentials_scopes" = "auth"."_migrate_legacy_permission_array_20260914"("client_credentials_scopes")
WHERE "scopes" IS DISTINCT FROM "auth"."_migrate_legacy_permission_array_20260914"("scopes")
	OR "client_credentials_scopes" IS DISTINCT FROM "auth"."_migrate_legacy_permission_array_20260914"("client_credentials_scopes");--> statement-breakpoint
UPDATE "auth"."oauth_resources"
SET "allowed_scopes" = "auth"."_migrate_legacy_permission_array_20260914"("allowed_scopes")
WHERE "allowed_scopes" IS DISTINCT FROM "auth"."_migrate_legacy_permission_array_20260914"("allowed_scopes");--> statement-breakpoint
UPDATE "auth"."oauth_refresh_tokens"
SET "scopes" = "auth"."_migrate_legacy_permission_array_20260914"("scopes")
WHERE "scopes" IS DISTINCT FROM "auth"."_migrate_legacy_permission_array_20260914"("scopes");--> statement-breakpoint
UPDATE "auth"."oauth_access_tokens"
SET "scopes" = "auth"."_migrate_legacy_permission_array_20260914"("scopes")
WHERE "scopes" IS DISTINCT FROM "auth"."_migrate_legacy_permission_array_20260914"("scopes");--> statement-breakpoint
UPDATE "auth"."oauth_consents"
SET "scopes" = "auth"."_migrate_legacy_permission_array_20260914"("scopes")
WHERE "scopes" IS DISTINCT FROM "auth"."_migrate_legacy_permission_array_20260914"("scopes");--> statement-breakpoint
UPDATE "auth"."apikeys"
SET "permissions" = "auth"."_migrate_legacy_api_key_permissions_20260914"("permissions")
WHERE "permissions" IS DISTINCT FROM "auth"."_migrate_legacy_api_key_permissions_20260914"("permissions");--> statement-breakpoint
DROP FUNCTION IF EXISTS "auth"."_migrate_legacy_api_key_permissions_20260914"(text);--> statement-breakpoint
DROP FUNCTION IF EXISTS "auth"."_migrate_legacy_permission_array_20260914"(text[]);
--> statement-breakpoint
-- merged from 20260915152341_submission_photo_upload_failed
ALTER TYPE "notification_type" ADD VALUE 'submission_photo_upload_failed' BEFORE 'new_submission';
--> statement-breakpoint
-- merged from 20260916190050_eminent_rocket_raccoon
ALTER TABLE "auth"."accounts" DROP CONSTRAINT "accounts_issuer_account_id_unique";--> statement-breakpoint
ALTER TABLE "auth"."accounts" DROP COLUMN "issuer";--> statement-breakpoint
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "accounts_provider_id_account_id_unique" UNIQUE("provider_id","account_id");
--> statement-breakpoint
-- merged from 20260925141318_silly_wild_pack
ALTER TABLE "uke"."uke_radiolines" ADD COLUMN "specs_date" timestamp with time zone;--> statement-breakpoint
UPDATE "uke"."uke_radiolines" SET "specs_date" = (SELECT max("updatedAt") FROM "uke"."uke_radiolines");
--> statement-breakpoint
-- merged from 20260927022906_curved_lizard
CREATE TYPE "uplink_type" AS ENUM('fiber', 'microwave');--> statement-breakpoint
CREATE TABLE "station_uplinks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "station_uplinks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" integer NOT NULL CONSTRAINT "station_uplinks_station_id_unique" UNIQUE,
	"type" "uplink_type" NOT NULL,
	"speed" integer,
	"model" varchar(100)
);
--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD COLUMN "uplink_type" "uplink_type";--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD COLUMN "uplink_speed" integer;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD COLUMN "uplink_model" varchar(100);--> statement-breakpoint
ALTER TABLE "station_uplinks" ADD CONSTRAINT "station_uplinks_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
-- merged from 20260927051634_worried_weapon_omega
ALTER TABLE "attachments" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "has_thumb" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "has_full" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- merged from 20260927092423_true_mad_thinker
ALTER TABLE "station_uplinks" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
-- merged from 20260927183728_submission_true_diff
CREATE TYPE "proposed_location_field" AS ENUM('region_id', 'city', 'address', 'longitude', 'latitude');--> statement-breakpoint
CREATE TYPE "proposed_station_field" AS ENUM('station_id', 'operator_id', 'notes', 'networks_id', 'networks_name', 'mno_name', 'uplink_type', 'uplink_speed', 'uplink_model');--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ADD COLUMN "changed_fields" "proposed_location_field"[];--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ADD COLUMN "changed_fields" "proposed_station_field"[];--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ALTER COLUMN "region_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ALTER COLUMN "longitude" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_locations" ALTER COLUMN "latitude" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions"."proposed_stations" ALTER COLUMN "operator_id" DROP NOT NULL;
--> statement-breakpoint
-- merged from 20260927220345_uplink_type_satellite
ALTER TYPE "uplink_type" ADD VALUE 'satellite';
--> statement-breakpoint
-- merged from 20260928161903_bumpy_layla_miller
CREATE TYPE "sector_operation" AS ENUM('add', 'update', 'delete');--> statement-breakpoint
ALTER TABLE "submissions"."proposed_sectors" ADD COLUMN "operation" "sector_operation";
--> statement-breakpoint
-- merged from 20260930052133_red_eternity
DROP INDEX "notifications_user_station_type_unread_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_station_type_unread_unique" ON "notifications" ("user_id","station_id","type") WHERE "readAt" IS NULL AND "station_id" IS NOT NULL AND "type" IN ('station_cells_changed', 'station_photos_added', 'station_comment_approved', 'station_uke_permit_added');
