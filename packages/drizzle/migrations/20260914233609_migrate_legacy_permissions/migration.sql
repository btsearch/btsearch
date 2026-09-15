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
