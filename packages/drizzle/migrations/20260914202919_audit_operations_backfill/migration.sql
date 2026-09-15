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
