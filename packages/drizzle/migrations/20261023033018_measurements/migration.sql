CREATE SCHEMA "observations";--> statement-breakpoint
CREATE TYPE "country_tool" AS ENUM('analyzer', 'measurements');--> statement-breakpoint
CREATE TYPE "attestation_revocation_status" AS ENUM('revoked', 'suspended');--> statement-breakpoint
CREATE TYPE "attestation_security_level" AS ENUM('software', 'trustedEnvironment', 'strongBox');--> statement-breakpoint
CREATE TYPE "modem_family" AS ENUM('qualcomm', 'samsung', 'mediatek', 'unisoc', 'hisilicon', 'other');--> statement-breakpoint
CREATE TYPE "raw_store" AS ENUM('disk', 's3');--> statement-breakpoint
CREATE TYPE "upload_encoding" AS ENUM('zstd', 'gzip');--> statement-breakpoint
CREATE TYPE "upload_status" AS ENUM('received', 'processing', 'processed', 'rejected', 'withdrawn', 'excluded');--> statement-breakpoint
CREATE TYPE "verified_boot_state" AS ENUM('verified', 'selfSigned', 'unverified', 'failed');--> statement-breakpoint
CREATE TYPE "batch_value_field" AS ENUM('latitude', 'longitude', 'altitudeMeters', 'speedMetersPerSecond', 'bearingDegrees', 'lac', 'cid', 'longCid', 'eci', 'nci', 'tac', 'arfcn', 'uarfcn', 'earfcn', 'bsic', 'psc', 'pci', 'bandwidthKhz', 'ulArfcn', 'ulEarfcn', 'ulBandwidthKhz', 'bands', 'rsrpDbm', 'rsrqDb', 'rssnrDb', 'rssiDbm', 'cqi', 'ssRsrpDbm', 'ssRsrqDb', 'ssSinrDb', 'csiRsrpDbm', 'csiRsrqDb', 'csiSinrDb', 'subcarrierSpacingKhz', 'ssbIndex', 'rscpDbm', 'ecNoDb', 'bitErrorRate', 'timingAdvance');--> statement-breakpoint
CREATE TYPE "cell_value_field" AS ENUM('areaCode', 'pci', 'channel', 'bandwidth', 'reportedBand', 'ulChannel', 'ulBandwidth', 'endcAvailable', 'accessClosed', 'barred', 'reserved');--> statement-breakpoint
CREATE TYPE "engine_run_kind" AS ENUM('subtract', 'restore', 'refold', 'rebuild', 'reestimate', 'recalibrate', 'evaluate', 'rebuildTrails', 'rebuildReadModels');--> statement-breakpoint
CREATE TYPE "engine_run_outcome" AS ENUM('done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "reader_source" AS ENUM('api', 'modemLog', 'modemPoll');--> statement-breakpoint
CREATE TYPE "reading_block_field" AS ENUM('pci', 'channel', 'areaCode', 'bandwidth', 'timingAdvance', 'signal');--> statement-breakpoint
CREATE TYPE "reading_block_mode" AS ENUM('drop', 'corroborate');--> statement-breakpoint
CREATE TYPE "reading_block_role" AS ENUM('serving', 'neighbour', 'nsa');--> statement-breakpoint
CREATE TYPE "sample_drop_reason" AS ENUM('mockLocation', 'poorAccuracy', 'implausibleFix', 'noPosition', 'badTime', 'tooOld', 'duplicate', 'implausible', 'closedCountry', 'readingBlock', 'noLevel', 'noIdentity');--> statement-breakpoint
CREATE TYPE "cell_match_kind" AS ENUM('cell', 'cellByLac', 'station');--> statement-breakpoint
CREATE TYPE "network_match" AS ENUM('own', 'extraCode', 'partner', 'missingCode');--> statement-breakpoint
CREATE TYPE "site_link_kind" AS ENUM('matched', 'suggested');--> statement-breakpoint
CREATE TYPE "area_class" AS ENUM('town', 'suburb', 'country');--> statement-breakpoint
CREATE TYPE "candidate_source" AS ENUM('osm', 'official');--> statement-breakpoint
CREATE TYPE "cell_copy_basis" AS ENUM('broadcastList', 'sameReading', 'ourCell');--> statement-breakpoint
CREATE TYPE "cell_edge_kind" AS ENUM('handedOver', 'faded', 'otherLayer', 'unmeasured');--> statement-breakpoint
CREATE TYPE "confirmation_basis" AS ENUM('twoPeople', 'vouched', 'twoTrips');--> statement-breakpoint
CREATE TYPE "coordinates_from" AS ENUM('estimate', 'snapped', 'editor');--> statement-breakpoint
CREATE TYPE "evaluation_dimension" AS ENUM('all', 'rat', 'areaClass', 'evidenceClass', 'taGroup', 'reader', 'country');--> statement-breakpoint
CREATE TYPE "evidence_class" AS ENUM('littleTaOnePerson', 'littleTaPeople', 'coarseTaOnePerson', 'coarseTaPeople', 'muchTaOnePerson', 'muchTaPeople');--> statement-breakpoint
CREATE TYPE "snap_candidate_kind" AS ENUM('location', 'officialSite', 'officialSiteByIdentity', 'observedSite', 'candidate', 'none');--> statement-breakpoint
CREATE TYPE "station_half" AS ENUM('even', 'odd');--> statement-breakpoint
CREATE TYPE "observation_flag_kind" AS ENUM('cellMissing', 'valueDiffers', 'valueMissing', 'networkMissing', 'networkNotSeen', 'bandNotInPlan', 'readerQuirk', 'deviceRevoked', 'untrustedContributor', 'unmatchedSite', 'positionShifts', 'suggestedSite', 'positionDiffers', 'renumbered', 'bearingDiffers', 'possiblyDecommissioned', 'nodeSpansPlaces', 'gnbLengthSuggestion', 'siteIdKnown');--> statement-breakpoint
CREATE TYPE "observation_flag_closed_reason" AS ENUM('applied', 'fixedElsewhere', 'evidenceGone', 'dismissed');--> statement-breakpoint
CREATE TYPE "observation_flag_dismissed_reason" AS ENUM('notAnIssue', 'cannotVerify', 'needsSurvey');--> statement-breakpoint
CREATE TYPE "value_pattern" AS ENUM('bytesSwapped', 'factor', 'offset', 'constant');--> statement-breakpoint
CREATE TABLE "observations"."app_signing_keys" (
	"digest" bytea PRIMARY KEY,
	"package" varchar(255) NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "observations"."attestation_revocations" (
	"serial" bytea PRIMARY KEY,
	"status" "attestation_revocation_status" NOT NULL,
	"reason" varchar(64),
	"listed_on" date DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."boot_key_lists" (
	"os" varchar(32) PRIMARY KEY,
	"list_timestamp" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."contributor_blocks" (
	"user_id" uuid PRIMARY KEY,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_by_id" uuid,
	"reason" varchar(500) NOT NULL,
	"until" timestamp with time zone,
	CONSTRAINT "contributor_blocks_until_after_start" CHECK ("until" > "blocked_at")
);
--> statement-breakpoint
CREATE TABLE "observations"."contributors" (
	"user_id" uuid PRIMARY KEY,
	"listed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."crowd_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1,
	"raw_retention_days" integer DEFAULT 365 NOT NULL,
	"raw_storage_budget_gb" integer DEFAULT 100 NOT NULL,
	"min_app_version_code" integer DEFAULT 1 NOT NULL,
	"terms_version" integer DEFAULT 1 NOT NULL,
	"published_algorithm_version" smallint DEFAULT 1 NOT NULL,
	"public_radius_max_m" integer DEFAULT 1000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid,
	CONSTRAINT "crowd_settings_single_row" CHECK ("id" = 1),
	CONSTRAINT "crowd_settings_raw_retention_days_positive" CHECK ("raw_retention_days" > 0),
	CONSTRAINT "crowd_settings_raw_storage_budget_gb_positive" CHECK ("raw_storage_budget_gb" > 0),
	CONSTRAINT "crowd_settings_min_app_version_code_positive" CHECK ("min_app_version_code" > 0),
	CONSTRAINT "crowd_settings_terms_version_positive" CHECK ("terms_version" > 0),
	CONSTRAINT "crowd_settings_published_algorithm_version_positive" CHECK ("published_algorithm_version" > 0),
	CONSTRAINT "crowd_settings_public_radius_max_m_positive" CHECK ("public_radius_max_m" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."device_attestations" (
	"device_id" uuid PRIMARY KEY,
	"root" varchar(32) NOT NULL,
	"security_level" "attestation_security_level" NOT NULL,
	"keymint_security_level" "attestation_security_level" NOT NULL,
	"verified_boot_state" "verified_boot_state",
	"is_bootloader_locked" boolean,
	"verified_boot_key" bytea,
	"os_version" integer,
	"os_patch_level" integer,
	"vendor_patch_level" integer,
	"boot_patch_level" integer,
	"attested_package" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "observations"."device_attested_signatures" (
	"device_id" uuid,
	"digest" bytea,
	CONSTRAINT "device_attested_signatures_pkey" PRIMARY KEY("device_id","digest")
);
--> statement-breakpoint
CREATE TABLE "observations"."device_certificates" (
	"device_id" uuid,
	"position" smallint,
	"serial" bytea NOT NULL,
	"der" bytea NOT NULL,
	CONSTRAINT "device_certificates_pkey" PRIMARY KEY("device_id","position"),
	CONSTRAINT "device_certificates_position_nonnegative" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."device_models" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."device_models_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"manufacturer" varchar(64) NOT NULL,
	"model" varchar(64) NOT NULL,
	"board" varchar(64),
	"soc_id" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_models_manufacturer_model_soc_unique" UNIQUE NULLS NOT DISTINCT("manufacturer","model","soc_id")
);
--> statement-breakpoint
CREATE TABLE "observations"."device_revocations" (
	"device_id" uuid PRIMARY KEY,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by_id" uuid,
	"reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "observations"."devices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid,
	"model_id" integer NOT NULL,
	"public_key" bytea NOT NULL CONSTRAINT "devices_public_key_unique" UNIQUE,
	"phone_hmac" bytea,
	"label" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_label_not_blank" CHECK (btrim("label") <> '')
);
--> statement-breakpoint
CREATE TABLE "observations"."known_boot_keys" (
	"verified_boot_key" bytea PRIMARY KEY,
	"os" varchar(32) NOT NULL,
	"device_name" varchar(64),
	"added_on" date DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."socs" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."socs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"manufacturer" varchar(64) NOT NULL,
	"model" varchar(64) NOT NULL,
	"modem_family" "modem_family" DEFAULT 'other'::"modem_family" NOT NULL,
	CONSTRAINT "socs_manufacturer_model_unique" UNIQUE("manufacturer","model")
);
--> statement-breakpoint
CREATE TABLE "observations"."terms_acceptances" (
	"user_id" uuid,
	"version" integer,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY("user_id","version"),
	CONSTRAINT "terms_acceptances_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."uploads" (
	"id" uuid PRIMARY KEY,
	"device_id" uuid NOT NULL,
	"encoding" "upload_encoding" NOT NULL,
	"seal_key_id" varchar(16) NOT NULL,
	"body_bytes" integer NOT NULL,
	"body_sha256" bytea NOT NULL,
	"store" "raw_store" NOT NULL,
	"app_version_code" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "upload_status" DEFAULT 'received'::"upload_status" NOT NULL,
	"status_reason" varchar(500),
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"excluded_by_id" uuid,
	"claimed_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"object_deleted_at" timestamp with time zone,
	CONSTRAINT "uploads_body_bytes_positive" CHECK ("body_bytes" > 0),
	CONSTRAINT "uploads_body_sha256_length" CHECK (octet_length("body_sha256") = 32),
	CONSTRAINT "uploads_attempts_nonnegative" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."board_socs" (
	"board" varchar(64) PRIMARY KEY,
	"soc_id" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."blocked_quirk_rules" (
	"quirk_rule_id" varchar(64) PRIMARY KEY,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_by_id" uuid,
	"reason" varchar(500) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."cell_bins" (
	"observed_cell_id" integer,
	"bin" bigint,
	"sample_count" integer NOT NULL,
	"weight_milli" bigint NOT NULL,
	"serving_weight_milli" bigint NOT NULL,
	"level_wsum" bigint NOT NULL,
	"level_wsq" bigint NOT NULL,
	"quality_weight_milli" bigint NOT NULL,
	"quality_wsum" bigint NOT NULL,
	"sinr_weight_milli" bigint NOT NULL,
	"sinr_wsum" bigint NOT NULL,
	"sinr_wsq" bigint NOT NULL,
	"offset_x_wsum" bigint NOT NULL,
	"offset_y_wsum" bigint NOT NULL,
	"stationary_count" integer NOT NULL,
	"contributor_bits" bigint NOT NULL,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "cell_bins_pkey" PRIMARY KEY("observed_cell_id","bin")
) PARTITION BY HASH ("observed_cell_id");
--> statement-breakpoint
CREATE TABLE "observations"."cell_contributors" (
	"observed_cell_id" integer,
	"device_id" uuid,
	"sample_count" integer NOT NULL,
	"trip_count" integer NOT NULL,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "cell_contributors_pkey" PRIMARY KEY("observed_cell_id","device_id")
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."cell_networks" (
	"observed_cell_id" integer,
	"plmn" varchar(6),
	"sample_count" integer NOT NULL,
	"contributor_bits" bigint NOT NULL,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "cell_networks_pkey" PRIMARY KEY("observed_cell_id","plmn")
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."cell_readers" (
	"observed_cell_id" integer,
	"reader_version_id" smallint,
	"sample_count" integer NOT NULL,
	CONSTRAINT "cell_readers_pkey" PRIMARY KEY("observed_cell_id","reader_version_id")
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."cell_ta_bins" (
	"observed_cell_id" integer,
	"bin" bigint,
	"ta_group_id" smallint,
	"timing_advance" smallint,
	"sample_count" integer NOT NULL,
	"weight_milli" bigint NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "cell_ta_bins_pkey" PRIMARY KEY("observed_cell_id","bin","ta_group_id","timing_advance")
) PARTITION BY HASH ("observed_cell_id");
--> statement-breakpoint
CREATE TABLE "observations"."cell_transitions" (
	"from_cell_id" integer,
	"to_cell_id" integer,
	"transition_count" integer NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "cell_transitions_pkey" PRIMARY KEY("from_cell_id","to_cell_id"),
	CONSTRAINT "cell_transitions_two_cells" CHECK ("from_cell_id" <> "to_cell_id")
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."cell_values" (
	"observed_cell_id" integer,
	"field" "cell_value_field",
	"value" integer,
	"held" boolean,
	"sample_count" integer NOT NULL,
	"contributor_bits" bigint NOT NULL,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "cell_values_pkey" PRIMARY KEY("observed_cell_id","field","value","held"),
	CONSTRAINT "cell_values_held_fields" CHECK (NOT "held" OR "field" IN ('pci', 'channel', 'areaCode', 'bandwidth'))
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."contributor_months" (
	"user_id" uuid,
	"country_code" char(2),
	"month" date,
	"sample_count" integer NOT NULL,
	"new_squares" integer NOT NULL,
	CONSTRAINT "contributor_months_pkey" PRIMARY KEY("user_id","country_code","month"),
	CONSTRAINT "contributor_months_first_day" CHECK (extract(day FROM "month") = 1)
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."country_outline_versions" (
	"version" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."country_outline_versions_version_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"source_fingerprint" bytea NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."country_outlines" (
	"version" smallint,
	"country_code" char(2),
	"outline" geometry(MultiPolygon,4326) NOT NULL,
	CONSTRAINT "country_outlines_pkey" PRIMARY KEY("version","country_code")
);
--> statement-breakpoint
CREATE TABLE "observations"."dirty_sites" (
	"observed_site_id" integer PRIMARY KEY,
	"dirty_since" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "dirty_sites_attempts_nonnegative" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."engine_heartbeats" (
	"instance" varchar(64) PRIMARY KEY,
	"started_at" timestamp with time zone NOT NULL,
	"seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."engine_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"kind" "engine_run_kind" NOT NULL,
	"params" jsonb DEFAULT '{}' NOT NULL,
	"requested_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"outcome" "engine_run_outcome",
	"progress" jsonb,
	"error" text,
	CONSTRAINT "engine_runs_finished_after_start" CHECK ("finished_at" >= "started_at"),
	CONSTRAINT "engine_runs_outcome_when_finished" CHECK (("finished_at" IS NULL) = ("outcome" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "observations"."handover_bins" (
	"from_cell_id" integer,
	"to_cell_id" integer,
	"bin" bigint,
	"handover_count" integer NOT NULL,
	"weight_milli" bigint NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "handover_bins_pkey" PRIMARY KEY("from_cell_id","to_cell_id","bin"),
	CONSTRAINT "handover_bins_two_cells" CHECK ("from_cell_id" <> "to_cell_id")
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."match_queue" (
	"observed_cell_id" integer PRIMARY KEY,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."neighbour_bins" (
	"plmn" varchar(6),
	"rat" "rat",
	"channel" integer,
	"pci" smallint,
	"bin" bigint,
	"held" boolean,
	"sample_count" integer NOT NULL,
	"weight_milli" bigint NOT NULL,
	"level_wsum" bigint NOT NULL,
	"contributor_bits" bigint NOT NULL,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "neighbour_bins_pkey" PRIMARY KEY("plmn","rat","channel","pci","bin","held")
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."nsa_links" (
	"anchor_cell_id" integer,
	"nr_arfcn" integer,
	"nr_pci" smallint,
	"held" boolean,
	"sample_count" integer NOT NULL,
	"weight_milli" bigint NOT NULL,
	"level_wsum" bigint NOT NULL,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "nsa_links_pkey" PRIMARY KEY("anchor_cell_id","nr_arfcn","nr_pci","held")
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."observed_cell_summaries" (
	"observed_cell_id" integer PRIMARY KEY,
	"sample_count" bigint NOT NULL,
	"contributor_count" integer NOT NULL,
	"person_count" integer NOT NULL,
	"square_count" integer DEFAULT 0 NOT NULL,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."observed_cells" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."observed_cells_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"plmn" varchar(6) NOT NULL,
	"rat" "rat" NOT NULL,
	"cell_key" bigint NOT NULL,
	"observed_site_id" integer,
	"first_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observed_cells_identity_unique" UNIQUE("plmn","rat","cell_key"),
	CONSTRAINT "observed_cells_plmn_format" CHECK ("plmn" ~ '^[0-9]{5,6}$'),
	CONSTRAINT "observed_cells_cell_key_nonnegative" CHECK ("cell_key" >= 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."observed_sites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."observed_sites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"plmn" varchar(6) NOT NULL,
	"rat" "rat",
	"node_id" bigint,
	"station_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "observed_sites_plmn_format" CHECK ("plmn" ~ '^[0-9]{5,6}$'),
	CONSTRAINT "observed_sites_node_id_nonnegative" CHECK ("node_id" >= 0),
	CONSTRAINT "observed_sites_one_identity" CHECK (("station_id" IS NULL AND "rat" IS NOT NULL AND "node_id" IS NOT NULL) OR ("station_id" IS NOT NULL AND "rat" IS NULL AND "node_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "observations"."person_trail_bins" (
	"user_id" uuid,
	"plmn" varchar(6),
	"rat" "rat",
	"bin" bigint,
	"sample_count" integer NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "person_trail_bins_pkey" PRIMARY KEY("user_id","plmn","rat","bin")
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."quirk_rules" (
	"id" varchar(64) PRIMARY KEY,
	"reader_name" varchar(32) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."reader_versions" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."reader_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"reader_name" varchar(32) NOT NULL,
	"version" varchar(64) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reader_versions_reader_version_unique" UNIQUE("reader_name","version")
);
--> statement-breakpoint
CREATE TABLE "observations"."readers" (
	"name" varchar(32) PRIMARY KEY,
	"source" "reader_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."reading_blocks" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."reading_blocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"modem_family" "modem_family",
	"soc_id" smallint,
	"device_model_id" integer,
	"reader_version_id" smallint,
	"rats" "rat"[],
	"roles" "reading_block_role"[],
	"sdk_int_min" smallint,
	"sdk_int_max" smallint,
	"radio_version_prefix" varchar(128),
	"fields" "reading_block_field"[],
	"mode" "reading_block_mode" NOT NULL,
	"reason" varchar(500) NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_by_id" uuid,
	CONSTRAINT "reading_blocks_one_kind_of_phone" CHECK (num_nonnulls("modem_family", "soc_id", "device_model_id", "reader_version_id") = 1),
	CONSTRAINT "reading_blocks_rats_not_empty" CHECK (cardinality("rats") > 0),
	CONSTRAINT "reading_blocks_roles_not_empty" CHECK (cardinality("roles") > 0),
	CONSTRAINT "reading_blocks_fields_not_empty" CHECK (cardinality("fields") > 0),
	CONSTRAINT "reading_blocks_sdk_int_ordered" CHECK ("sdk_int_min" <= "sdk_int_max"),
	CONSTRAINT "reading_blocks_radio_version_prefix_not_blank" CHECK (btrim("radio_version_prefix") <> ''),
	CONSTRAINT "reading_blocks_corroborate_fields" CHECK ("mode" <> 'corroborate' OR "fields" <@ ARRAY['pci', 'channel', 'areaCode', 'bandwidth']::"reading_block_field"[]),
	CONSTRAINT "reading_blocks_whole_readings_dropped" CHECK ("fields" IS NOT NULL OR ("mode" = 'drop' AND "rats" IS NULL AND "roles" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "observations"."same_reading_pairs" (
	"observed_cell_id" integer,
	"other_observed_cell_id" integer,
	"held" boolean,
	"sample_count" integer NOT NULL,
	CONSTRAINT "same_reading_pairs_pkey" PRIMARY KEY("observed_cell_id","other_observed_cell_id","held"),
	CONSTRAINT "same_reading_pairs_lower_id_first" CHECK ("observed_cell_id" < "other_observed_cell_id")
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."ta_groups" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."ta_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"source" "reader_source" NOT NULL,
	"modem_family" "modem_family",
	"device_model_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ta_groups_source_modem_family_unique" UNIQUE("source","modem_family"),
	CONSTRAINT "ta_groups_source_device_model_unique" UNIQUE("source","device_model_id"),
	CONSTRAINT "ta_groups_one_kind_of_phone" CHECK (num_nonnulls("modem_family", "device_model_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "observations"."trail_dirty_tiles" (
	"tile" bigint PRIMARY KEY,
	"dirty_since" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."trail_levels" (
	"plmn" varchar(6),
	"rat" "rat",
	"channel" integer,
	"zoom" smallint,
	"bin" bigint,
	"held" boolean,
	"level_bucket" smallint,
	"sample_count" integer NOT NULL,
	CONSTRAINT "trail_levels_pkey" PRIMARY KEY("plmn","zoom","bin","rat","channel","held","level_bucket"),
	CONSTRAINT "trail_levels_level_bucket_range" CHECK ("level_bucket" BETWEEN 0 AND 7)
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."trail_squares" (
	"plmn" varchar(6),
	"rat" "rat",
	"channel" integer,
	"zoom" smallint,
	"bin" bigint,
	"held" boolean,
	"contributor_bits" bigint NOT NULL,
	"last_seen_on" date NOT NULL,
	CONSTRAINT "trail_squares_pkey" PRIMARY KEY("plmn","zoom","bin","rat","channel","held"),
	CONSTRAINT "trail_squares_pyramid_zoom" CHECK ("zoom" IN (12, 14, 16, 18, 20))
) WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
--> statement-breakpoint
CREATE TABLE "observations"."upload_blocked_values" (
	"upload_id" uuid,
	"reading_block_id" smallint,
	"held_count" integer NOT NULL,
	"dropped_count" integer NOT NULL,
	CONSTRAINT "upload_blocked_values_pkey" PRIMARY KEY("upload_id","reading_block_id"),
	CONSTRAINT "upload_blocked_values_counts_nonnegative" CHECK (least("held_count", "dropped_count") >= 0),
	CONSTRAINT "upload_blocked_values_something_blocked" CHECK ("held_count" + "dropped_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_closed_countries" (
	"upload_id" uuid,
	"country_code" char(2),
	CONSTRAINT "upload_closed_countries_pkey" PRIMARY KEY("upload_id","country_code")
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_corrections" (
	"upload_id" uuid,
	"quirk_rule_id" varchar(64),
	"value_count" integer NOT NULL,
	CONSTRAINT "upload_corrections_pkey" PRIMARY KEY("upload_id","quirk_rule_id"),
	CONSTRAINT "upload_corrections_value_count_positive" CHECK ("value_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_dropped_values" (
	"upload_id" uuid,
	"field" "batch_value_field",
	"value_count" integer NOT NULL,
	CONSTRAINT "upload_dropped_values_pkey" PRIMARY KEY("upload_id","field"),
	CONSTRAINT "upload_dropped_values_value_count_positive" CHECK ("value_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_drops" (
	"upload_id" uuid,
	"reason" "sample_drop_reason",
	"sample_count" integer NOT NULL,
	CONSTRAINT "upload_drops_pkey" PRIMARY KEY("upload_id","reason"),
	CONSTRAINT "upload_drops_sample_count_positive" CHECK ("sample_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_folds" (
	"upload_id" uuid PRIMARY KEY,
	"fold_version" smallint NOT NULL,
	"weight_milli" smallint NOT NULL,
	"folded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"format_version" smallint NOT NULL,
	"sdk_int" smallint NOT NULL,
	"security_patch" date,
	"radio_version" varchar(128),
	"app_version_name" varchar(64) NOT NULL,
	"modem_family" "modem_family",
	"outline_version" smallint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"west" double precision NOT NULL,
	"south" double precision NOT NULL,
	"east" double precision NOT NULL,
	"north" double precision NOT NULL,
	"snapshot_count" integer NOT NULL,
	"sample_count" integer NOT NULL,
	"distance_only_count" integer DEFAULT 0 NOT NULL,
	"wall_clock_error_ms" bigint,
	"unfolded_at" timestamp with time zone,
	CONSTRAINT "upload_folds_weight_milli_positive" CHECK ("weight_milli" > 0),
	CONSTRAINT "upload_folds_span_ordered" CHECK ("started_at" <= "ended_at"),
	CONSTRAINT "upload_folds_bbox_south_north" CHECK ("south" <= "north"),
	CONSTRAINT "upload_folds_sample_count_positive" CHECK ("sample_count" > 0),
	CONSTRAINT "upload_folds_snapshot_count_positive" CHECK ("snapshot_count" > 0),
	CONSTRAINT "upload_folds_distance_only_count_range" CHECK ("distance_only_count" BETWEEN 0 AND "sample_count"),
	CONSTRAINT "upload_folds_unfolded_after_folded" CHECK ("unfolded_at" >= "folded_at")
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_new_squares" (
	"upload_id" uuid,
	"country_code" char(2),
	"month" date,
	"square_count" integer NOT NULL,
	CONSTRAINT "upload_new_squares_pkey" PRIMARY KEY("upload_id","country_code","month"),
	CONSTRAINT "upload_new_squares_first_day" CHECK (extract(day FROM "month") = 1),
	CONSTRAINT "upload_new_squares_square_count_positive" CHECK ("square_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_readers" (
	"upload_id" uuid,
	"reader_version_id" smallint,
	"rules_version" integer,
	"snapshot_count" integer NOT NULL,
	"derived_values" integer NOT NULL,
	"ta_on_confirmed" integer DEFAULT 0 NOT NULL,
	"ta_within_tolerance" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "upload_readers_pkey" PRIMARY KEY("upload_id","reader_version_id"),
	CONSTRAINT "upload_readers_counts_nonnegative" CHECK (least("snapshot_count", "derived_values", "ta_on_confirmed", "ta_within_tolerance") >= 0),
	CONSTRAINT "upload_readers_ta_within_confirmed" CHECK ("ta_within_tolerance" <= "ta_on_confirmed")
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_skipped_rules" (
	"upload_id" uuid,
	"quirk_rule_id" varchar(64),
	CONSTRAINT "upload_skipped_rules_pkey" PRIMARY KEY("upload_id","quirk_rule_id")
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_ta_groups" (
	"upload_id" uuid,
	"source" "reader_source",
	"ta_group_id" smallint NOT NULL,
	CONSTRAINT "upload_ta_groups_pkey" PRIMARY KEY("upload_id","source")
);
--> statement-breakpoint
CREATE TABLE "observations"."cell_matches" (
	"observed_cell_id" integer PRIMARY KEY,
	"kind" "cell_match_kind" NOT NULL,
	"network_match" "network_match" NOT NULL,
	"cell_id" integer,
	"station_id" integer,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cell_matches_one_target" CHECK (("kind" = 'station' AND "station_id" IS NOT NULL AND "cell_id" IS NULL) OR ("kind" <> 'station' AND "cell_id" IS NOT NULL AND "station_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "observations"."curated_cell_summaries" (
	"cell_id" integer PRIMARY KEY,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	"observed_cell_count" integer NOT NULL,
	"bandwidth_khz" integer
);
--> statement-breakpoint
CREATE TABLE "observations"."site_links" (
	"observed_site_id" integer PRIMARY KEY,
	"station_id" integer NOT NULL,
	"kind" "site_link_kind" NOT NULL,
	"linked_by_id" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."site_official_links" (
	"observed_site_id" integer,
	"official_site_id" integer,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_official_links_pkey" PRIMARY KEY("observed_site_id","official_site_id")
);
--> statement-breakpoint
CREATE TABLE "observations"."site_replacements" (
	"observed_site_id" integer,
	"replaced_by_site_id" integer,
	CONSTRAINT "site_replacements_pkey" PRIMARY KEY("observed_site_id","replaced_by_site_id"),
	CONSTRAINT "site_replacements_two_sites" CHECK ("observed_site_id" <> "replaced_by_site_id")
);
--> statement-breakpoint
CREATE TABLE "observations"."device_weights" (
	"device_id" uuid PRIMARY KEY,
	"weight" real NOT NULL,
	"reason" varchar(500) NOT NULL,
	"set_by_id" uuid,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_weights_weight_range" CHECK ("weight" BETWEEN 0 AND 2)
);
--> statement-breakpoint
CREATE TABLE "observations"."vouches" (
	"user_id" uuid PRIMARY KEY,
	"weight" real NOT NULL,
	"confirms_alone" boolean DEFAULT false NOT NULL,
	"reason" varchar(500) NOT NULL,
	"vouched_by_id" uuid,
	"vouched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"until" timestamp with time zone,
	CONSTRAINT "vouches_weight_range" CHECK ("weight" BETWEEN 0 AND 2),
	CONSTRAINT "vouches_until_after_start" CHECK ("until" > "vouched_at")
);
--> statement-breakpoint
CREATE TABLE "observations"."device_scores" (
	"device_id" uuid,
	"scored_on" date,
	"readings" integer NOT NULL,
	"ta_on_confirmed" integer NOT NULL,
	"ta_within_tolerance" integer NOT NULL,
	"dropped_implausible" integer NOT NULL,
	"mock_readings" integer NOT NULL,
	"phantom_cells" integer NOT NULL,
	"factor" real NOT NULL,
	CONSTRAINT "device_scores_pkey" PRIMARY KEY("device_id","scored_on"),
	CONSTRAINT "device_scores_counts_nonnegative" CHECK ("readings" >= 0 AND "ta_on_confirmed" >= 0 AND "ta_within_tolerance" BETWEEN 0 AND "ta_on_confirmed" AND "dropped_implausible" >= 0 AND "mock_readings" >= 0 AND "phantom_cells" >= 0),
	CONSTRAINT "device_scores_factor_range" CHECK ("factor" BETWEEN 0.2::real AND 1.2::real)
);
--> statement-breakpoint
CREATE TABLE "observations"."calibration_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."calibration_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"station_half" "station_half" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."candidate_sources" (
	"source" "candidate_source" PRIMARY KEY,
	"licence" varchar(255) NOT NULL,
	"may_copy_coordinates" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."candidates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."candidates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" "candidate_source" NOT NULL,
	"ref" varchar(128) NOT NULL,
	"point" geometry(point,4326) NOT NULL,
	"attributes" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_source_ref_unique" UNIQUE("source","ref")
);
--> statement-breakpoint
CREATE TABLE "observations"."cell_confirmations" (
	"observed_cell_id" integer PRIMARY KEY,
	"basis" "confirmation_basis" NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."cell_copies" (
	"observed_cell_id" integer PRIMARY KEY,
	"primary_cell_id" integer NOT NULL,
	"basis" "cell_copy_basis" NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cell_copies_two_cells" CHECK ("observed_cell_id" <> "primary_cell_id")
);
--> statement-breakpoint
CREATE TABLE "observations"."cell_edges" (
	"observed_cell_id" integer,
	"shape_version" smallint,
	"kind" "cell_edge_kind",
	"edge" geometry(MultiLineString,4326) NOT NULL,
	"length_m" integer NOT NULL,
	CONSTRAINT "cell_edges_pkey" PRIMARY KEY("observed_cell_id","shape_version","kind")
);
--> statement-breakpoint
CREATE TABLE "observations"."cell_level_profiles" (
	"observed_cell_id" integer,
	"shape_version" smallint,
	"distance_band" smallint,
	"mean_level_centi_db" integer NOT NULL,
	"mean_sinr_centi_db" integer,
	"sample_count" integer NOT NULL,
	CONSTRAINT "cell_level_profiles_pkey" PRIMARY KEY("observed_cell_id","shape_version","distance_band")
);
--> statement-breakpoint
CREATE TABLE "observations"."cell_shapes" (
	"observed_cell_id" integer,
	"shape_version" smallint,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bearing_deg" real NOT NULL,
	"spread_deg" real NOT NULL,
	"reach_m" integer NOT NULL,
	"reach_ta_m" integer,
	"mean_quality_centi_db" integer,
	"mean_sinr_centi_db" integer,
	"footprint" geometry(Polygon,4326) NOT NULL,
	CONSTRAINT "cell_shapes_pkey" PRIMARY KEY("observed_cell_id","shape_version")
);
--> statement-breakpoint
CREATE TABLE "observations"."error_models" (
	"calibration_run_id" integer,
	"ta_group_id" smallint,
	"rat" "rat",
	"area_class" "area_class",
	"sigma_m" real NOT NULL,
	"tail_mean_m" real NOT NULL,
	"outlier_share" real NOT NULL,
	"row_count" integer NOT NULL,
	CONSTRAINT "error_models_pkey" PRIMARY KEY("calibration_run_id","ta_group_id","rat","area_class"),
	CONSTRAINT "error_models_sizes" CHECK ("sigma_m" > 0 AND "tail_mean_m" > 0 AND "outlier_share" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "observations"."level_models" (
	"calibration_run_id" integer,
	"rat" "rat",
	"area_class" "area_class",
	"slope_db_per_decade" real NOT NULL,
	"scatter_db" real NOT NULL,
	"bin_count" integer NOT NULL,
	CONSTRAINT "level_models_pkey" PRIMARY KEY("calibration_run_id","rat","area_class"),
	CONSTRAINT "level_models_sizes" CHECK ("slope_db_per_decade" > 0 AND "scatter_db" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."evaluation_results" (
	"evaluation_run_id" integer,
	"algorithm_version" smallint,
	"dimension" "evaluation_dimension",
	"dimension_value" varchar(32),
	"site_count" integer NOT NULL,
	"error_p50_m" integer NOT NULL,
	"error_p80_m" integer NOT NULL,
	"error_p95_m" integer NOT NULL,
	"inside_radius_count" integer NOT NULL,
	"ambiguous_count" integer NOT NULL,
	CONSTRAINT "evaluation_results_pkey" PRIMARY KEY("evaluation_run_id","algorithm_version","dimension","dimension_value"),
	CONSTRAINT "evaluation_results_algorithm_version_nonnegative" CHECK ("algorithm_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."evaluation_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."evaluation_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calibration_run_id" integer,
	"station_half" "station_half" NOT NULL,
	"ground_truth_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."gnb_length_tests" (
	"evaluation_run_id" integer,
	"plmn" varchar(6),
	"length" smallint,
	"is_cut_length" boolean NOT NULL,
	"cells" integer NOT NULL,
	"together" integer NOT NULL,
	"apart" integer NOT NULL,
	"sites" integer NOT NULL,
	CONSTRAINT "gnb_length_tests_pkey" PRIMARY KEY("evaluation_run_id","plmn","length"),
	CONSTRAINT "gnb_length_tests_length_range" CHECK ("length" BETWEEN 22 AND 32)
);
--> statement-breakpoint
CREATE TABLE "observations"."group_estimates" (
	"lead_site_id" integer,
	"algorithm_version" smallint,
	"calibration_run_id" integer,
	"estimated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"point" geometry(point,4326) NOT NULL,
	"region_id" integer,
	"uncertainty_m" integer NOT NULL,
	"ellipse_major_m" integer NOT NULL,
	"ellipse_minor_m" integer NOT NULL,
	"ellipse_azimuth_deg" smallint NOT NULL,
	"alternative_point" geometry(point,4326),
	"is_consistent" boolean NOT NULL,
	"sample_count" bigint NOT NULL,
	"contributor_count" integer NOT NULL,
	"person_count" integer NOT NULL,
	"bin_count" integer NOT NULL,
	"ta_sample_count" bigint NOT NULL,
	"angular_coverage_deg" smallint NOT NULL,
	"distinct_days" integer NOT NULL,
	"max_distance_m" integer NOT NULL,
	CONSTRAINT "group_estimates_pkey" PRIMARY KEY("lead_site_id","algorithm_version"),
	CONSTRAINT "group_estimates_algorithm_version_positive" CHECK ("algorithm_version" > 0),
	CONSTRAINT "group_estimates_sizes_nonnegative" CHECK ("uncertainty_m" >= 0 AND "ellipse_minor_m" >= 0 AND "ellipse_major_m" >= "ellipse_minor_m" AND "max_distance_m" >= 0),
	CONSTRAINT "group_estimates_ellipse_azimuth_range" CHECK ("ellipse_azimuth_deg" BETWEEN 0 AND 179),
	CONSTRAINT "group_estimates_angular_coverage_range" CHECK ("angular_coverage_deg" BETWEEN 0 AND 360)
);
--> statement-breakpoint
CREATE TABLE "observations"."grouping_results" (
	"evaluation_run_id" integer,
	"algorithm_version" smallint,
	"groups" integer NOT NULL,
	"right" integer NOT NULL,
	"wrong" integer NOT NULL,
	"missed" integer NOT NULL,
	CONSTRAINT "grouping_results_pkey" PRIMARY KEY("evaluation_run_id","algorithm_version")
);
--> statement-breakpoint
CREATE TABLE "observations"."ellipse_scales" (
	"calibration_run_id" integer,
	"evidence_class" "evidence_class",
	"is_surrounded" boolean,
	"scale" real NOT NULL,
	"site_count" integer NOT NULL,
	CONSTRAINT "ellipse_scales_pkey" PRIMARY KEY("calibration_run_id","evidence_class","is_surrounded"),
	CONSTRAINT "ellipse_scales_scale_positive" CHECK ("scale" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."reader_scores" (
	"evaluation_run_id" integer,
	"reader_version_id" smallint,
	"uploads" integer NOT NULL,
	"ta_on_confirmed" integer NOT NULL,
	"ta_within_tolerance" integer NOT NULL,
	"values_agreed" integer NOT NULL,
	"values_differed" integer NOT NULL,
	"only_cells" integer NOT NULL,
	CONSTRAINT "reader_scores_pkey" PRIMARY KEY("evaluation_run_id","reader_version_id")
);
--> statement-breakpoint
CREATE TABLE "observations"."resolved_neighbours" (
	"plmn" varchar(6),
	"rat" "rat",
	"channel" integer,
	"pci" smallint,
	"bin" bigint,
	"observed_cell_id" integer NOT NULL,
	CONSTRAINT "resolved_neighbours_pkey" PRIMARY KEY("plmn","rat","channel","pci","bin")
);
--> statement-breakpoint
CREATE TABLE "observations"."site_confirmations" (
	"observed_site_id" integer PRIMARY KEY,
	"basis" "confirmation_basis" NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."site_estimates" (
	"observed_site_id" integer,
	"algorithm_version" smallint,
	"calibration_run_id" integer,
	"estimated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"point" geometry(point,4326) NOT NULL,
	"region_id" integer,
	"uncertainty_m" integer NOT NULL,
	"ellipse_major_m" integer NOT NULL,
	"ellipse_minor_m" integer NOT NULL,
	"ellipse_azimuth_deg" smallint NOT NULL,
	"alternative_point" geometry(point,4326),
	"is_consistent" boolean NOT NULL,
	"sample_count" bigint NOT NULL,
	"contributor_count" integer NOT NULL,
	"person_count" integer NOT NULL,
	"bin_count" integer NOT NULL,
	"ta_sample_count" bigint NOT NULL,
	"angular_coverage_deg" smallint NOT NULL,
	"distinct_days" integer NOT NULL,
	"max_distance_m" integer NOT NULL,
	"leave_out_shift_m" integer,
	"evidence_class" "evidence_class" NOT NULL,
	"ellipse_scale" real NOT NULL,
	CONSTRAINT "site_estimates_pkey" PRIMARY KEY("observed_site_id","algorithm_version"),
	CONSTRAINT "site_estimates_algorithm_version_positive" CHECK ("algorithm_version" > 0),
	CONSTRAINT "site_estimates_sizes_nonnegative" CHECK ("uncertainty_m" >= 0 AND "ellipse_minor_m" >= 0 AND "ellipse_major_m" >= "ellipse_minor_m" AND "max_distance_m" >= 0),
	CONSTRAINT "site_estimates_ellipse_azimuth_range" CHECK ("ellipse_azimuth_deg" BETWEEN 0 AND 179),
	CONSTRAINT "site_estimates_angular_coverage_range" CHECK ("angular_coverage_deg" BETWEEN 0 AND 360),
	CONSTRAINT "site_estimates_leave_out_shift_nonnegative" CHECK ("leave_out_shift_m" >= 0),
	CONSTRAINT "site_estimates_ellipse_scale_positive" CHECK ("ellipse_scale" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."site_evidence_grids" (
	"observed_site_id" integer,
	"algorithm_version" smallint,
	"origin" geometry(point,4326) NOT NULL,
	"cell_m" smallint NOT NULL,
	"columns" smallint NOT NULL,
	"rows" smallint NOT NULL,
	"cost" bytea NOT NULL,
	CONSTRAINT "site_evidence_grids_pkey" PRIMARY KEY("observed_site_id","algorithm_version"),
	CONSTRAINT "site_evidence_grids_size" CHECK ("cell_m" > 0 AND "columns" > 0 AND "rows" > 0 AND length("cost") = "columns" * "rows")
);
--> statement-breakpoint
CREATE TABLE "observations"."site_groups" (
	"observed_site_id" integer,
	"algorithm_version" smallint,
	"lead_site_id" integer NOT NULL,
	CONSTRAINT "site_groups_pkey" PRIMARY KEY("observed_site_id","algorithm_version")
);
--> statement-breakpoint
CREATE TABLE "observations"."snap_priors" (
	"calibration_run_id" integer,
	"kind" "snap_candidate_kind",
	"same_operator" boolean,
	"prior" real NOT NULL,
	CONSTRAINT "snap_priors_pkey" PRIMARY KEY("calibration_run_id","kind","same_operator"),
	CONSTRAINT "snap_priors_prior_positive" CHECK ("prior" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."snap_tests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."snap_tests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"observed_site_id" integer NOT NULL,
	"algorithm_version" smallint NOT NULL,
	"location_id" integer,
	"official_site_id" integer,
	"other_site_id" integer,
	"candidate_id" integer,
	"difference" real NOT NULL,
	"probability" real NOT NULL,
	"is_snap" boolean NOT NULL,
	CONSTRAINT "snap_tests_target_unique" UNIQUE NULLS NOT DISTINCT("observed_site_id","algorithm_version","location_id","official_site_id","other_site_id","candidate_id"),
	CONSTRAINT "snap_tests_one_target" CHECK (num_nonnulls("location_id", "official_site_id", "other_site_id", "candidate_id") = 1),
	CONSTRAINT "snap_tests_probability_range" CHECK ("probability" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "observations"."snapping_bands" (
	"evaluation_run_id" integer,
	"algorithm_version" smallint,
	"band" smallint,
	"snaps" integer NOT NULL,
	"right" integer NOT NULL,
	CONSTRAINT "snapping_bands_pkey" PRIMARY KEY("evaluation_run_id","algorithm_version","band"),
	CONSTRAINT "snapping_bands_band_range" CHECK ("band" BETWEEN 0 AND 9),
	CONSTRAINT "snapping_bands_right_within_snaps" CHECK ("right" BETWEEN 0 AND "snaps")
);
--> statement-breakpoint
CREATE TABLE "observations"."snapping_results" (
	"evaluation_run_id" integer,
	"algorithm_version" smallint,
	"kind" "snap_candidate_kind",
	"possible" integer NOT NULL,
	"right" integer NOT NULL,
	"wrong" integer NOT NULL,
	"missed" integer NOT NULL,
	CONSTRAINT "snapping_results_pkey" PRIMARY KEY("evaluation_run_id","algorithm_version","kind")
);
--> statement-breakpoint
CREATE TABLE "observations"."station_origins" (
	"station_id" integer PRIMARY KEY,
	"observed_site_id" integer,
	"coordinates_from" "coordinates_from" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations"."ta_calibrations" (
	"calibration_run_id" integer,
	"ta_group_id" smallint,
	"rat" "rat",
	"scale" real NOT NULL,
	"offset_m" real NOT NULL,
	"row_count" integer NOT NULL,
	"station_count" integer NOT NULL,
	CONSTRAINT "ta_calibrations_pkey" PRIMARY KEY("calibration_run_id","ta_group_id","rat"),
	CONSTRAINT "ta_calibrations_scale_positive" CHECK ("scale" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_ta_residuals" (
	"upload_id" uuid,
	"source" "reader_source",
	"rat" "rat",
	"station_id" integer,
	"timing_advance" smallint,
	"distance_bucket" smallint,
	"samples" integer NOT NULL,
	CONSTRAINT "upload_ta_residuals_pkey" PRIMARY KEY("upload_id","source","rat","station_id","timing_advance","distance_bucket"),
	CONSTRAINT "upload_ta_residuals_samples_positive" CHECK ("samples" > 0),
	CONSTRAINT "upload_ta_residuals_distance_bucket_nonnegative" CHECK ("distance_bucket" >= 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_value_checks" (
	"upload_id" uuid,
	"reader_version_id" smallint,
	"field" "cell_value_field",
	"agreed" integer NOT NULL,
	"differed" integer NOT NULL,
	CONSTRAINT "upload_value_checks_pkey" PRIMARY KEY("upload_id","reader_version_id","field"),
	CONSTRAINT "upload_value_checks_counts" CHECK ("agreed" >= 0 AND "differed" >= 0 AND "agreed" + "differed" > 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."observation_flags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations"."observation_flags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "observation_flag_kind" NOT NULL,
	"subject_key" varchar(96) NOT NULL,
	"observed_site_id" integer,
	"observed_cell_id" integer,
	"station_id" integer,
	"cell_id" integer,
	"sector_id" integer,
	"country_code" char(2),
	"region_id" integer,
	"band_id" integer,
	"device_id" uuid,
	"user_id" uuid,
	"reader_version_id" smallint,
	"device_model_id" integer,
	"evidence" jsonb NOT NULL,
	"suggestion" jsonb,
	"measure" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_reason" "observation_flag_closed_reason",
	"dismissed_reason" "observation_flag_dismissed_reason",
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"note" varchar(500),
	CONSTRAINT "observation_flags_resolved_at_when_closed" CHECK (("closed_reason" IS NULL) = ("resolved_at" IS NULL)),
	CONSTRAINT "observation_flags_resolver_when_closed" CHECK ("closed_reason" IS NOT NULL OR "resolved_by_id" IS NULL),
	CONSTRAINT "observation_flags_note_when_dismissed" CHECK ("note" IS NULL OR "closed_reason" IS NOT DISTINCT FROM 'dismissed'),
	CONSTRAINT "observation_flags_dismissed_reason_when_dismissed" CHECK (("dismissed_reason" IS NOT NULL) = ("closed_reason" IS NOT DISTINCT FROM 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "observations"."site_ignores" (
	"observed_site_id" integer PRIMARY KEY,
	"ignored_by_id" uuid,
	"reason" varchar(500) NOT NULL,
	"ignored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"observed_cell_ids" integer[] NOT NULL,
	"point" geometry(point,4326),
	"uncertainty_m" integer,
	CONSTRAINT "site_ignores_reason_present" CHECK (length(btrim("reason")) > 0),
	CONSTRAINT "site_ignores_cells_present" CHECK (cardinality("observed_cell_ids") > 0),
	CONSTRAINT "site_ignores_point_with_radius" CHECK (("point" IS NULL) = ("uncertainty_m" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "observations"."upload_value_patterns" (
	"upload_id" uuid,
	"reader_version_id" smallint,
	"field" "cell_value_field",
	"pattern" "value_pattern",
	"parameter" integer,
	"value_count" integer NOT NULL,
	"cell_count" integer NOT NULL,
	CONSTRAINT "upload_value_patterns_pkey" PRIMARY KEY("upload_id","reader_version_id","field","pattern","parameter"),
	CONSTRAINT "upload_value_patterns_counts" CHECK ("cell_count" > 0 AND "value_count" >= "cell_count"),
	CONSTRAINT "upload_value_patterns_swapped_parameter" CHECK ("pattern" <> 'bytesSwapped' OR "parameter" = 0)
);
--> statement-breakpoint
CREATE TABLE "observations"."leaderboard_months" (
	"user_id" uuid,
	"country_code" char(2),
	"month" date,
	"new_squares" integer NOT NULL,
	"new_confirmed_cells" integer NOT NULL,
	"new_sites" integer NOT NULL,
	"refreshed_on" date NOT NULL,
	CONSTRAINT "leaderboard_months_pkey" PRIMARY KEY("user_id","country_code","month"),
	CONSTRAINT "leaderboard_months_first_day" CHECK (extract(day FROM "month") = 1),
	CONSTRAINT "leaderboard_months_counts" CHECK ("new_squares" >= 0 AND "new_confirmed_cells" >= 0 AND "new_sites" >= 0 AND "new_squares" + "new_confirmed_cells" + "new_sites" > 0)
);
--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "tools" "country_tool"[] DEFAULT '{analyzer,measurements}'::"country_tool"[] NOT NULL;--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "observations_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "device_certificates_serial_idx" ON "observations"."device_certificates" ("serial");--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "observations"."devices" ("user_id");--> statement-breakpoint
CREATE INDEX "uploads_device_id_received_at_idx" ON "observations"."uploads" ("device_id","received_at");--> statement-breakpoint
CREATE INDEX "uploads_waiting_idx" ON "observations"."uploads" ("status","received_at") WHERE "status" IN ('received', 'processing');--> statement-breakpoint
CREATE INDEX "uploads_stored_idx" ON "observations"."uploads" ("received_at") WHERE "object_deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "devices_phone_hmac_idx" ON "observations"."devices" ("phone_hmac");--> statement-breakpoint
CREATE INDEX "uploads_subtractable_idx" ON "observations"."uploads" ("status_changed_at") WHERE "status" IN ('withdrawn', 'excluded') AND "object_deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cell_contributors_device_id_idx" ON "observations"."cell_contributors" ("device_id");--> statement-breakpoint
CREATE INDEX "cell_transitions_to_cell_id_idx" ON "observations"."cell_transitions" ("to_cell_id");--> statement-breakpoint
CREATE INDEX "dirty_sites_dirty_since_idx" ON "observations"."dirty_sites" ("dirty_since","observed_site_id");--> statement-breakpoint
CREATE INDEX "engine_runs_waiting_idx" ON "observations"."engine_runs" ("created_at") WHERE "started_at" IS NULL;--> statement-breakpoint
CREATE INDEX "handover_bins_to_cell_id_idx" ON "observations"."handover_bins" ("to_cell_id");--> statement-breakpoint
CREATE INDEX "observed_cells_observed_site_id_idx" ON "observations"."observed_cells" ("observed_site_id");--> statement-breakpoint
CREATE INDEX "observed_cells_first_upload_id_idx" ON "observations"."observed_cells" ("first_upload_id");--> statement-breakpoint
CREATE INDEX "same_reading_pairs_other_observed_cell_id_idx" ON "observations"."same_reading_pairs" ("other_observed_cell_id");--> statement-breakpoint
CREATE INDEX "upload_folds_outline_version_idx" ON "observations"."upload_folds" ("outline_version") WHERE "unfolded_at" IS NULL;--> statement-breakpoint
CREATE INDEX "upload_folds_unfolded_idx" ON "observations"."upload_folds" ("upload_id") WHERE "unfolded_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cell_matches_cell_id_idx" ON "observations"."cell_matches" ("cell_id");--> statement-breakpoint
CREATE INDEX "cell_matches_station_id_idx" ON "observations"."cell_matches" ("station_id");--> statement-breakpoint
CREATE UNIQUE INDEX "observed_sites_identity_unique" ON "observations"."observed_sites" ("plmn","rat","node_id") WHERE "retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "site_links_station_id_idx" ON "observations"."site_links" ("station_id");--> statement-breakpoint
CREATE INDEX "site_official_links_official_site_id_idx" ON "observations"."site_official_links" ("official_site_id");--> statement-breakpoint
CREATE INDEX "site_replacements_replaced_by_site_id_idx" ON "observations"."site_replacements" ("replaced_by_site_id");--> statement-breakpoint
CREATE INDEX "candidates_point_idx" ON "observations"."candidates" USING gist ("point");--> statement-breakpoint
CREATE INDEX "cell_copies_primary_cell_id_idx" ON "observations"."cell_copies" ("primary_cell_id");--> statement-breakpoint
CREATE INDEX "cell_shapes_footprint_idx" ON "observations"."cell_shapes" USING gist ("footprint");--> statement-breakpoint
CREATE INDEX "error_models_ta_group_id_idx" ON "observations"."error_models" ("ta_group_id");--> statement-breakpoint
CREATE INDEX "evaluation_runs_calibration_run_id_idx" ON "observations"."evaluation_runs" ("calibration_run_id");--> statement-breakpoint
CREATE INDEX "group_estimates_point_idx" ON "observations"."group_estimates" USING gist ("point");--> statement-breakpoint
CREATE INDEX "group_estimates_calibration_run_id_idx" ON "observations"."group_estimates" ("calibration_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "observed_sites_station_unique" ON "observations"."observed_sites" ("station_id","plmn") WHERE "retired_at" IS NULL AND "station_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "observed_sites_station_id_idx" ON "observations"."observed_sites" ("station_id") WHERE "station_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "reader_scores_reader_version_id_idx" ON "observations"."reader_scores" ("reader_version_id");--> statement-breakpoint
CREATE INDEX "resolved_neighbours_observed_cell_id_idx" ON "observations"."resolved_neighbours" ("observed_cell_id");--> statement-breakpoint
CREATE INDEX "site_estimates_point_idx" ON "observations"."site_estimates" USING gist ("point");--> statement-breakpoint
CREATE INDEX "site_estimates_calibration_run_id_idx" ON "observations"."site_estimates" ("calibration_run_id");--> statement-breakpoint
CREATE INDEX "site_groups_lead_site_id_idx" ON "observations"."site_groups" ("lead_site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snap_tests_one_snap" ON "observations"."snap_tests" ("observed_site_id","algorithm_version") WHERE "is_snap";--> statement-breakpoint
CREATE INDEX "snap_tests_location_id_idx" ON "observations"."snap_tests" ("location_id");--> statement-breakpoint
CREATE INDEX "snap_tests_official_site_id_idx" ON "observations"."snap_tests" ("official_site_id");--> statement-breakpoint
CREATE INDEX "snap_tests_other_site_id_idx" ON "observations"."snap_tests" ("other_site_id");--> statement-breakpoint
CREATE INDEX "snap_tests_candidate_id_idx" ON "observations"."snap_tests" ("candidate_id");--> statement-breakpoint
CREATE INDEX "station_origins_observed_site_id_idx" ON "observations"."station_origins" ("observed_site_id");--> statement-breakpoint
CREATE INDEX "ta_calibrations_ta_group_id_idx" ON "observations"."ta_calibrations" ("ta_group_id");--> statement-breakpoint
CREATE INDEX "upload_ta_residuals_station_id_idx" ON "observations"."upload_ta_residuals" ("station_id");--> statement-breakpoint
CREATE INDEX "group_estimates_estimated_at_idx" ON "observations"."group_estimates" ("algorithm_version","estimated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "observation_flags_one_open" ON "observations"."observation_flags" ("kind","subject_key") WHERE "closed_reason" IS NULL;--> statement-breakpoint
CREATE INDEX "observation_flags_subject_idx" ON "observations"."observation_flags" ("kind","subject_key","resolved_at");--> statement-breakpoint
CREATE INDEX "observation_flags_open_created_idx" ON "observations"."observation_flags" ("created_at","id") WHERE "closed_reason" IS NULL;--> statement-breakpoint
CREATE INDEX "observation_flags_updated_idx" ON "observations"."observation_flags" ("updated_at","id");--> statement-breakpoint
CREATE INDEX "observation_flags_station_id_idx" ON "observations"."observation_flags" ("station_id");--> statement-breakpoint
CREATE INDEX "observation_flags_cell_id_idx" ON "observations"."observation_flags" ("cell_id");--> statement-breakpoint
CREATE INDEX "observation_flags_sector_id_idx" ON "observations"."observation_flags" ("sector_id");--> statement-breakpoint
CREATE INDEX "observation_flags_observed_cell_id_idx" ON "observations"."observation_flags" ("observed_cell_id");--> statement-breakpoint
CREATE INDEX "observation_flags_observed_site_id_idx" ON "observations"."observation_flags" ("observed_site_id");--> statement-breakpoint
CREATE INDEX "observation_flags_country_code_idx" ON "observations"."observation_flags" ("country_code");--> statement-breakpoint
CREATE INDEX "observation_flags_region_id_idx" ON "observations"."observation_flags" ("region_id");--> statement-breakpoint
CREATE INDEX "observation_flags_band_id_idx" ON "observations"."observation_flags" ("band_id");--> statement-breakpoint
CREATE INDEX "observation_flags_device_id_idx" ON "observations"."observation_flags" ("device_id");--> statement-breakpoint
CREATE INDEX "observation_flags_user_id_idx" ON "observations"."observation_flags" ("user_id");--> statement-breakpoint
CREATE INDEX "observation_flags_reader_version_id_idx" ON "observations"."observation_flags" ("reader_version_id");--> statement-breakpoint
CREATE INDEX "observation_flags_device_model_id_idx" ON "observations"."observation_flags" ("device_model_id");--> statement-breakpoint
CREATE INDEX "site_estimates_estimated_at_idx" ON "observations"."site_estimates" ("algorithm_version","estimated_at");--> statement-breakpoint
CREATE INDEX "leaderboard_months_country_month_idx" ON "observations"."leaderboard_months" ("country_code","month");--> statement-breakpoint
CREATE INDEX "locations_point_geography_gist" ON "locations" USING gist (("point"::geography));--> statement-breakpoint
ALTER TABLE "observations"."contributor_blocks" ADD CONSTRAINT "contributor_blocks_user_id_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "observations"."contributors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."contributor_blocks" ADD CONSTRAINT "contributor_blocks_blocked_by_id_users_id_fkey" FOREIGN KEY ("blocked_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."contributors" ADD CONSTRAINT "contributors_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."crowd_settings" ADD CONSTRAINT "crowd_settings_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_attestations" ADD CONSTRAINT "device_attestations_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_attested_signatures" ADD CONSTRAINT "device_attested_signatures_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_certificates" ADD CONSTRAINT "device_certificates_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_models" ADD CONSTRAINT "device_models_soc_id_socs_id_fkey" FOREIGN KEY ("soc_id") REFERENCES "observations"."socs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_revocations" ADD CONSTRAINT "device_revocations_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_revocations" ADD CONSTRAINT "device_revocations_revoked_by_id_users_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."devices" ADD CONSTRAINT "devices_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."devices" ADD CONSTRAINT "devices_model_id_device_models_id_fkey" FOREIGN KEY ("model_id") REFERENCES "observations"."device_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "observations"."contributors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."uploads" ADD CONSTRAINT "uploads_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."board_socs" ADD CONSTRAINT "board_socs_soc_id_socs_id_fkey" FOREIGN KEY ("soc_id") REFERENCES "observations"."socs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."blocked_quirk_rules" ADD CONSTRAINT "blocked_quirk_rules_quirk_rule_id_quirk_rules_id_fkey" FOREIGN KEY ("quirk_rule_id") REFERENCES "observations"."quirk_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."blocked_quirk_rules" ADD CONSTRAINT "blocked_quirk_rules_blocked_by_id_users_id_fkey" FOREIGN KEY ("blocked_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_bins" ADD CONSTRAINT "cell_bins_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_contributors" ADD CONSTRAINT "cell_contributors_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_contributors" ADD CONSTRAINT "cell_contributors_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_networks" ADD CONSTRAINT "cell_networks_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_readers" ADD CONSTRAINT "cell_readers_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_readers" ADD CONSTRAINT "cell_readers_reader_version_id_reader_versions_id_fkey" FOREIGN KEY ("reader_version_id") REFERENCES "observations"."reader_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_ta_bins" ADD CONSTRAINT "cell_ta_bins_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_ta_bins" ADD CONSTRAINT "cell_ta_bins_ta_group_id_ta_groups_id_fkey" FOREIGN KEY ("ta_group_id") REFERENCES "observations"."ta_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_transitions" ADD CONSTRAINT "cell_transitions_from_cell_id_observed_cells_id_fkey" FOREIGN KEY ("from_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_transitions" ADD CONSTRAINT "cell_transitions_to_cell_id_observed_cells_id_fkey" FOREIGN KEY ("to_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_values" ADD CONSTRAINT "cell_values_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."contributor_months" ADD CONSTRAINT "contributor_months_user_id_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "observations"."contributors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."contributor_months" ADD CONSTRAINT "contributor_months_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."country_outlines" ADD CONSTRAINT "country_outlines_version_country_outline_versions_version_fkey" FOREIGN KEY ("version") REFERENCES "observations"."country_outline_versions"("version") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."country_outlines" ADD CONSTRAINT "country_outlines_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."dirty_sites" ADD CONSTRAINT "dirty_sites_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."engine_runs" ADD CONSTRAINT "engine_runs_requested_by_id_users_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."handover_bins" ADD CONSTRAINT "handover_bins_from_cell_id_observed_cells_id_fkey" FOREIGN KEY ("from_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."handover_bins" ADD CONSTRAINT "handover_bins_to_cell_id_observed_cells_id_fkey" FOREIGN KEY ("to_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."match_queue" ADD CONSTRAINT "match_queue_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."nsa_links" ADD CONSTRAINT "nsa_links_anchor_cell_id_observed_cells_id_fkey" FOREIGN KEY ("anchor_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observed_cell_summaries" ADD CONSTRAINT "observed_cell_summaries_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observed_cells" ADD CONSTRAINT "observed_cells_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observed_cells" ADD CONSTRAINT "observed_cells_first_upload_id_uploads_id_fkey" FOREIGN KEY ("first_upload_id") REFERENCES "observations"."uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."person_trail_bins" ADD CONSTRAINT "person_trail_bins_user_id_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "observations"."contributors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."quirk_rules" ADD CONSTRAINT "quirk_rules_reader_name_readers_name_fkey" FOREIGN KEY ("reader_name") REFERENCES "observations"."readers"("name") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."reader_versions" ADD CONSTRAINT "reader_versions_reader_name_readers_name_fkey" FOREIGN KEY ("reader_name") REFERENCES "observations"."readers"("name") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."reading_blocks" ADD CONSTRAINT "reading_blocks_soc_id_socs_id_fkey" FOREIGN KEY ("soc_id") REFERENCES "observations"."socs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."reading_blocks" ADD CONSTRAINT "reading_blocks_device_model_id_device_models_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "observations"."device_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."reading_blocks" ADD CONSTRAINT "reading_blocks_reader_version_id_reader_versions_id_fkey" FOREIGN KEY ("reader_version_id") REFERENCES "observations"."reader_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."reading_blocks" ADD CONSTRAINT "reading_blocks_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."same_reading_pairs" ADD CONSTRAINT "same_reading_pairs_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."same_reading_pairs" ADD CONSTRAINT "same_reading_pairs_sA8gGLBnqbEb_fkey" FOREIGN KEY ("other_observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."ta_groups" ADD CONSTRAINT "ta_groups_device_model_id_device_models_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "observations"."device_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."trail_levels" ADD CONSTRAINT "trail_levels_trail_squares_fkey" FOREIGN KEY ("plmn","rat","channel","zoom","bin","held") REFERENCES "observations"."trail_squares"("plmn","rat","channel","zoom","bin","held") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_blocked_values" ADD CONSTRAINT "upload_blocked_values_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_blocked_values" ADD CONSTRAINT "upload_blocked_values_reading_block_id_reading_blocks_id_fkey" FOREIGN KEY ("reading_block_id") REFERENCES "observations"."reading_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_closed_countries" ADD CONSTRAINT "upload_closed_countries_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_corrections" ADD CONSTRAINT "upload_corrections_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_corrections" ADD CONSTRAINT "upload_corrections_quirk_rule_id_quirk_rules_id_fkey" FOREIGN KEY ("quirk_rule_id") REFERENCES "observations"."quirk_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_dropped_values" ADD CONSTRAINT "upload_dropped_values_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_folds" ADD CONSTRAINT "upload_folds_upload_id_uploads_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_new_squares" ADD CONSTRAINT "upload_new_squares_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_new_squares" ADD CONSTRAINT "upload_new_squares_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_readers" ADD CONSTRAINT "upload_readers_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_readers" ADD CONSTRAINT "upload_readers_reader_version_id_reader_versions_id_fkey" FOREIGN KEY ("reader_version_id") REFERENCES "observations"."reader_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_skipped_rules" ADD CONSTRAINT "upload_skipped_rules_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_skipped_rules" ADD CONSTRAINT "upload_skipped_rules_quirk_rule_id_quirk_rules_id_fkey" FOREIGN KEY ("quirk_rule_id") REFERENCES "observations"."quirk_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_ta_groups" ADD CONSTRAINT "upload_ta_groups_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_ta_groups" ADD CONSTRAINT "upload_ta_groups_ta_group_id_ta_groups_id_fkey" FOREIGN KEY ("ta_group_id") REFERENCES "observations"."ta_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_matches" ADD CONSTRAINT "cell_matches_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_matches" ADD CONSTRAINT "cell_matches_cell_id_cells_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_matches" ADD CONSTRAINT "cell_matches_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."curated_cell_summaries" ADD CONSTRAINT "curated_cell_summaries_cell_id_cells_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_links" ADD CONSTRAINT "site_links_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_links" ADD CONSTRAINT "site_links_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_links" ADD CONSTRAINT "site_links_linked_by_id_users_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_official_links" ADD CONSTRAINT "site_official_links_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_official_links" ADD CONSTRAINT "site_official_links_official_site_id_sites_id_fkey" FOREIGN KEY ("official_site_id") REFERENCES "official"."sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_replacements" ADD CONSTRAINT "site_replacements_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_replacements" ADD CONSTRAINT "site_replacements_replaced_by_site_id_observed_sites_id_fkey" FOREIGN KEY ("replaced_by_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_weights" ADD CONSTRAINT "device_weights_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_weights" ADD CONSTRAINT "device_weights_set_by_id_users_id_fkey" FOREIGN KEY ("set_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."vouches" ADD CONSTRAINT "vouches_user_id_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "observations"."contributors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."vouches" ADD CONSTRAINT "vouches_vouched_by_id_users_id_fkey" FOREIGN KEY ("vouched_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."device_scores" ADD CONSTRAINT "device_scores_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."candidates" ADD CONSTRAINT "candidates_source_candidate_sources_source_fkey" FOREIGN KEY ("source") REFERENCES "observations"."candidate_sources"("source") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_confirmations" ADD CONSTRAINT "cell_confirmations_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_copies" ADD CONSTRAINT "cell_copies_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_copies" ADD CONSTRAINT "cell_copies_primary_cell_id_observed_cells_id_fkey" FOREIGN KEY ("primary_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_edges" ADD CONSTRAINT "cell_edges_shape_fkey" FOREIGN KEY ("observed_cell_id","shape_version") REFERENCES "observations"."cell_shapes"("observed_cell_id","shape_version") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_level_profiles" ADD CONSTRAINT "cell_level_profiles_shape_fkey" FOREIGN KEY ("observed_cell_id","shape_version") REFERENCES "observations"."cell_shapes"("observed_cell_id","shape_version") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."cell_shapes" ADD CONSTRAINT "cell_shapes_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."error_models" ADD CONSTRAINT "error_models_calibration_run_id_calibration_runs_id_fkey" FOREIGN KEY ("calibration_run_id") REFERENCES "observations"."calibration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."error_models" ADD CONSTRAINT "error_models_ta_group_id_ta_groups_id_fkey" FOREIGN KEY ("ta_group_id") REFERENCES "observations"."ta_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."evaluation_results" ADD CONSTRAINT "evaluation_results_evaluation_run_id_evaluation_runs_id_fkey" FOREIGN KEY ("evaluation_run_id") REFERENCES "observations"."evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."level_models" ADD CONSTRAINT "level_models_calibration_run_id_calibration_runs_id_fkey" FOREIGN KEY ("calibration_run_id") REFERENCES "observations"."calibration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."evaluation_runs" ADD CONSTRAINT "evaluation_runs_calibration_run_id_calibration_runs_id_fkey" FOREIGN KEY ("calibration_run_id") REFERENCES "observations"."calibration_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."gnb_length_tests" ADD CONSTRAINT "gnb_length_tests_evaluation_run_id_evaluation_runs_id_fkey" FOREIGN KEY ("evaluation_run_id") REFERENCES "observations"."evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."group_estimates" ADD CONSTRAINT "group_estimates_lead_site_id_observed_sites_id_fkey" FOREIGN KEY ("lead_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."group_estimates" ADD CONSTRAINT "group_estimates_calibration_run_id_calibration_runs_id_fkey" FOREIGN KEY ("calibration_run_id") REFERENCES "observations"."calibration_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."grouping_results" ADD CONSTRAINT "grouping_results_evaluation_run_id_evaluation_runs_id_fkey" FOREIGN KEY ("evaluation_run_id") REFERENCES "observations"."evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."ellipse_scales" ADD CONSTRAINT "ellipse_scales_calibration_run_id_calibration_runs_id_fkey" FOREIGN KEY ("calibration_run_id") REFERENCES "observations"."calibration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."reader_scores" ADD CONSTRAINT "reader_scores_evaluation_run_id_evaluation_runs_id_fkey" FOREIGN KEY ("evaluation_run_id") REFERENCES "observations"."evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."reader_scores" ADD CONSTRAINT "reader_scores_reader_version_id_reader_versions_id_fkey" FOREIGN KEY ("reader_version_id") REFERENCES "observations"."reader_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."resolved_neighbours" ADD CONSTRAINT "resolved_neighbours_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_confirmations" ADD CONSTRAINT "site_confirmations_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_estimates" ADD CONSTRAINT "site_estimates_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_estimates" ADD CONSTRAINT "site_estimates_calibration_run_id_calibration_runs_id_fkey" FOREIGN KEY ("calibration_run_id") REFERENCES "observations"."calibration_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_evidence_grids" ADD CONSTRAINT "site_evidence_grids_estimate_fkey" FOREIGN KEY ("observed_site_id","algorithm_version") REFERENCES "observations"."site_estimates"("observed_site_id","algorithm_version") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_groups" ADD CONSTRAINT "site_groups_lead_site_id_observed_sites_id_fkey" FOREIGN KEY ("lead_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_groups" ADD CONSTRAINT "site_groups_estimate_fkey" FOREIGN KEY ("observed_site_id","algorithm_version") REFERENCES "observations"."site_estimates"("observed_site_id","algorithm_version") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."snap_priors" ADD CONSTRAINT "snap_priors_calibration_run_id_calibration_runs_id_fkey" FOREIGN KEY ("calibration_run_id") REFERENCES "observations"."calibration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."snap_tests" ADD CONSTRAINT "snap_tests_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."snap_tests" ADD CONSTRAINT "snap_tests_official_site_id_sites_id_fkey" FOREIGN KEY ("official_site_id") REFERENCES "official"."sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."snap_tests" ADD CONSTRAINT "snap_tests_other_site_id_observed_sites_id_fkey" FOREIGN KEY ("other_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."snap_tests" ADD CONSTRAINT "snap_tests_candidate_id_candidates_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "observations"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."snap_tests" ADD CONSTRAINT "snap_tests_estimate_fkey" FOREIGN KEY ("observed_site_id","algorithm_version") REFERENCES "observations"."site_estimates"("observed_site_id","algorithm_version") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."snapping_bands" ADD CONSTRAINT "snapping_bands_evaluation_run_id_evaluation_runs_id_fkey" FOREIGN KEY ("evaluation_run_id") REFERENCES "observations"."evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."snapping_results" ADD CONSTRAINT "snapping_results_evaluation_run_id_evaluation_runs_id_fkey" FOREIGN KEY ("evaluation_run_id") REFERENCES "observations"."evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observed_sites" ADD CONSTRAINT "observed_sites_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."station_origins" ADD CONSTRAINT "station_origins_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."station_origins" ADD CONSTRAINT "station_origins_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."ta_calibrations" ADD CONSTRAINT "ta_calibrations_calibration_run_id_calibration_runs_id_fkey" FOREIGN KEY ("calibration_run_id") REFERENCES "observations"."calibration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."ta_calibrations" ADD CONSTRAINT "ta_calibrations_ta_group_id_ta_groups_id_fkey" FOREIGN KEY ("ta_group_id") REFERENCES "observations"."ta_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_ta_residuals" ADD CONSTRAINT "upload_ta_residuals_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_ta_residuals" ADD CONSTRAINT "upload_ta_residuals_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_value_checks" ADD CONSTRAINT "upload_value_checks_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_value_checks" ADD CONSTRAINT "upload_value_checks_reader_version_id_reader_versions_id_fkey" FOREIGN KEY ("reader_version_id") REFERENCES "observations"."reader_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_observed_cell_id_observed_cells_id_fkey" FOREIGN KEY ("observed_cell_id") REFERENCES "observations"."observed_cells"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_cell_id_cells_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_sector_id_station_sectors_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "station_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_band_id_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_device_id_devices_id_fkey" FOREIGN KEY ("device_id") REFERENCES "observations"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_user_id_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "observations"."contributors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_reader_version_id_reader_versions_id_fkey" FOREIGN KEY ("reader_version_id") REFERENCES "observations"."reader_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_device_model_id_device_models_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "observations"."device_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."observation_flags" ADD CONSTRAINT "observation_flags_resolved_by_id_users_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_ignores" ADD CONSTRAINT "site_ignores_observed_site_id_observed_sites_id_fkey" FOREIGN KEY ("observed_site_id") REFERENCES "observations"."observed_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_ignores" ADD CONSTRAINT "site_ignores_ignored_by_id_users_id_fkey" FOREIGN KEY ("ignored_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_value_patterns" ADD CONSTRAINT "upload_value_patterns_upload_id_upload_folds_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."upload_folds"("upload_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_value_patterns" ADD CONSTRAINT "upload_value_patterns_reader_version_id_reader_versions_id_fkey" FOREIGN KEY ("reader_version_id") REFERENCES "observations"."reader_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."leaderboard_months" ADD CONSTRAINT "leaderboard_months_user_id_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "observations"."contributors"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."leaderboard_months" ADD CONSTRAINT "leaderboard_months_country_code_countries_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_closed_countries" ADD CONSTRAINT "upload_closed_countries_upload_id_uploads_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."upload_drops" ADD CONSTRAINT "upload_drops_upload_id_uploads_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "observations"."uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."reading_blocks" ADD CONSTRAINT "reading_blocks_disabled_by_id_users_id_fkey" FOREIGN KEY ("disabled_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."uploads" ADD CONSTRAINT "uploads_excluded_by_id_users_id_fkey" FOREIGN KEY ("excluded_by_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."site_estimates" ADD CONSTRAINT "site_estimates_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "observations"."group_estimates" ADD CONSTRAINT "group_estimates_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
CREATE VIEW "observations"."device_tiers" AS (
  SELECT d.id AS device_id,
    CASE
      WHEN a.device_id IS NULL THEN 'none'
      WHEN a.security_level = 'software' OR a.root = 'unknown' OR EXISTS (
        SELECT 1 FROM observations.device_certificates c
        JOIN observations.attestation_revocations r ON r.serial = c.serial
        WHERE c.device_id = d.id
      ) THEN 'software'
      WHEN a.is_bootloader_locked IS NOT TRUE OR NOT coalesce(
        a.verified_boot_state = 'verified' OR (a.verified_boot_state = 'selfSigned' AND EXISTS (
          SELECT 1 FROM observations.known_boot_keys k WHERE k.verified_boot_key = a.verified_boot_key
        )),
        false
      ) THEN 'hardware'
      WHEN EXISTS (
        SELECT 1 FROM observations.device_attested_signatures s
        JOIN observations.app_signing_keys k ON k.digest = s.digest AND k.package = a.attested_package
        WHERE s.device_id = d.id
      ) THEN 'strong'
      ELSE 'software'
    END AS tier
  FROM observations.devices d
  LEFT JOIN observations.device_attestations a ON a.device_id = d.id
);--> statement-breakpoint
CREATE VIEW "observations"."device_weights_now" AS (
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
);--> statement-breakpoint
CREATE VIEW "observations"."site_copies" AS (
  SELECT c.observed_site_id, min(p.observed_site_id) AS primary_site_id
  FROM observations.observed_cells c
  LEFT JOIN observations.cell_copies k ON k.observed_cell_id = c.id
  LEFT JOIN observations.observed_cells p ON p.id = k.primary_cell_id
  WHERE c.observed_site_id IS NOT NULL
  GROUP BY c.observed_site_id
  HAVING bool_and(p.observed_site_id IS NOT NULL)
    AND min(p.observed_site_id) = max(p.observed_site_id)
    AND min(p.observed_site_id) <> c.observed_site_id
);--> statement-breakpoint
CREATE VIEW "observations"."observed_cell_values" AS (
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
);--> statement-breakpoint
DO $$
BEGIN
	FOR remainder IN 0..15 LOOP
		EXECUTE format(
			'CREATE TABLE "observations".%I PARTITION OF "observations"."cell_bins" FOR VALUES WITH (MODULUS 16, REMAINDER %s) '
				'WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01)',
			'cell_bins_' || lpad(remainder::text, 2, '0'),
			remainder
		);
		EXECUTE format(
			'CREATE TABLE "observations".%I PARTITION OF "observations"."cell_ta_bins" FOR VALUES WITH (MODULUS 16, REMAINDER %s) '
				'WITH (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01)',
			'cell_ta_bins_' || lpad(remainder::text, 2, '0'),
			remainder
		);
	END LOOP;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "assign_region_from_point"() RETURNS trigger
	LANGUAGE plpgsql SET search_path = public
	AS $$
	BEGIN
		NEW.region_id := region_at(ST_X(NEW.point), ST_Y(NEW.point));
		RETURN NEW;
	END
	$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "site_estimates_assign_region"
	BEFORE INSERT OR UPDATE OF "point" ON "observations"."site_estimates"
	FOR EACH ROW EXECUTE FUNCTION "assign_region_from_point"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "group_estimates_assign_region"
	BEFORE INSERT OR UPDATE OF "point" ON "observations"."group_estimates"
	FOR EACH ROW EXECUTE FUNCTION "assign_region_from_point"();
--> statement-breakpoint
INSERT INTO "observations"."crowd_settings" ("id") VALUES (1);--> statement-breakpoint
INSERT INTO "observations"."reading_blocks" ("modem_family", "fields", "mode", "reason")
VALUES ('samsung', '{pci,channel}', 'corroborate', 'Samsung modems, Exynos and Tensor, sometimes report the PCI or the channel of another cell');--> statement-breakpoint
DO $$
DECLARE
	problems text[] := '{}';
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'countries' AND column_name = 'observations_public') THEN
		problems := problems || 'countries.observations_public is missing'::text;
	END IF;

	IF cardinality(problems) > 0 THEN RAISE EXCEPTION 'measurements: %', array_to_string(problems, '; '); END IF;
END $$;
