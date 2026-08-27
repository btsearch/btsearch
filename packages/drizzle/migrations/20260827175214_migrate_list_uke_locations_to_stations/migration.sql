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
