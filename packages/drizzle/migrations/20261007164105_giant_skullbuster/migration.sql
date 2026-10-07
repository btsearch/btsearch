CREATE TABLE "uke"."uke_bands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uke"."uke_bands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rat" "rat" NOT NULL,
	"value" integer NOT NULL,
	"variant" "band_variant" DEFAULT 'commercial'::"band_variant" NOT NULL,
	"name" varchar(15) NOT NULL CONSTRAINT "uke_bands_name_unique" UNIQUE,
	CONSTRAINT "uke_bands_rat_value_variant_unique" UNIQUE("rat","value","variant")
);
--> statement-breakpoint
INSERT INTO "uke"."uke_bands" ("id", "rat", "value", "variant", "name")
OVERRIDING SYSTEM VALUE
SELECT b."id", b."rat", b."value", b."variant", b."name"
FROM "bands" b
WHERE b."rat" NOT IN ('GSM', 'UMTS', 'LTE', 'NR')
	OR (b."rat" <> 'GSM' AND b."duplex" IS NULL AND b."value" IS DISTINCT FROM 0)
	OR EXISTS (SELECT 1 FROM "uke"."uke_permits" p WHERE p."band_id" = b."id")
	OR EXISTS (SELECT 1 FROM "statistics"."stats_snapshots" s WHERE s."band_id" = b."id");--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('uke.uke_bands', 'id'), COALESCE(max("id"), 1), max("id") IS NOT NULL) FROM "uke"."uke_bands";--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" DROP CONSTRAINT "stats_snapshots_band_id_bands_id_fkey";--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" DROP CONSTRAINT "uke_permits_band_id_bands_id_fkey";--> statement-breakpoint
ALTER TABLE "statistics"."stats_snapshots" ADD CONSTRAINT "stats_snapshots_band_id_uke_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "uke"."uke_bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "uke"."uke_permits" ADD CONSTRAINT "uke_permits_band_id_uke_bands_id_fkey" FOREIGN KEY ("band_id") REFERENCES "uke"."uke_bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
DO $$
DECLARE
	cells_on_labels bigint;
	proposed_cells_on_labels bigint;
BEGIN
	CREATE TEMP TABLE permit_band_labels ON COMMIT DROP AS
	SELECT
		label."id",
		count(cell_band."id") AS cell_band_count,
		COALESCE(
			CASE WHEN count(cell_band."id") = 1 THEN min(cell_band."id") END,
			min(cell_band."id") FILTER (WHERE cell_band."duplex"::text = register_duplex.duplex)
		) AS cell_band_id
	FROM "bands" label
	LEFT JOIN "bands" cell_band
		ON cell_band."rat" = label."rat" AND cell_band."value" = label."value" AND cell_band."variant" = label."variant"
		AND cell_band."rat" IN ('GSM', 'UMTS', 'LTE', 'NR')
		AND (cell_band."rat" = 'GSM' OR cell_band."duplex" IS NOT NULL)
	LEFT JOIN (
		VALUES
			('LTE', 700, 'FDD'),
			('LTE', 800, 'FDD'),
			('LTE', 900, 'FDD'),
			('LTE', 1800, 'FDD'),
			('LTE', 2100, 'FDD'),
			('LTE', 2600, 'FDD'),
			('NR', 700, 'FDD'),
			('NR', 2100, 'FDD'),
			('NR', 2600, 'TDD'),
			('NR', 3500, 'TDD')
	) AS register_duplex (rat, value, duplex)
		ON register_duplex.rat = label."rat"::text AND register_duplex.value = label."value"
	WHERE label."rat" NOT IN ('GSM', 'UMTS', 'LTE', 'NR')
		OR (label."rat" <> 'GSM' AND label."duplex" IS NULL AND label."value" IS DISTINCT FROM 0)
	GROUP BY label."id";

	UPDATE "cells" c
	SET "band_id" = label.cell_band_id
	FROM permit_band_labels label
	WHERE c."band_id" = label."id" AND label.cell_band_id IS NOT NULL;

	UPDATE "submissions"."proposed_cells" c
	SET "band_id" = label.cell_band_id
	FROM permit_band_labels label
	WHERE c."band_id" = label."id" AND label.cell_band_id IS NOT NULL;

	UPDATE "submissions"."proposed_cells" c
	SET "band_id" = NULL
	FROM permit_band_labels label, "submissions"."submissions" s
	WHERE c."band_id" = label."id" AND label.cell_band_count = 0
		AND s."id" = c."submission_id" AND s."status" <> 'pending';

	SELECT count(*) INTO cells_on_labels
	FROM "cells" c JOIN permit_band_labels label ON c."band_id" = label."id";
	SELECT count(*) INTO proposed_cells_on_labels
	FROM "submissions"."proposed_cells" c JOIN permit_band_labels label ON c."band_id" = label."id";

	IF cells_on_labels > 0 OR proposed_cells_on_labels > 0 THEN
		RAISE EXCEPTION 'Cannot move permit band labels: % cells and % proposed cells still reference labels without exactly one real band. Resolve them before retrying.',
			cells_on_labels, proposed_cells_on_labels;
	END IF;

	DELETE FROM "country_bands" cb USING permit_band_labels label WHERE cb."band_id" = label."id";
	DELETE FROM "bands" b USING permit_band_labels label WHERE b."id" = label."id";
END;
$$;--> statement-breakpoint
ALTER TABLE "bands" ADD CONSTRAINT "bands_real_band_check" CHECK ("rat" IN ('GSM', 'UMTS', 'LTE', 'NR') AND ("rat" = 'GSM' OR "duplex" IS NOT NULL OR "value" IS NOT DISTINCT FROM 0));
