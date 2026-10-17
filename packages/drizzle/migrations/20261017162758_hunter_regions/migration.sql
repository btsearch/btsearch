CREATE TABLE "auth"."hunter_regions" (
	"user_id" uuid,
	"region_id" integer,
	CONSTRAINT "hunter_regions_pkey" PRIMARY KEY("user_id","region_id")
);
--> statement-breakpoint
INSERT INTO "auth"."hunter_regions" ("user_id", "region_id")
SELECT DISTINCT "users"."id", "regions"."id"
FROM "auth"."users"
CROSS JOIN LATERAL jsonb_array_elements(
	CASE WHEN jsonb_typeof("users"."hunter_regions") = 'array' THEN "users"."hunter_regions" ELSE '[]'::jsonb END
) AS "element"("value")
JOIN "regions" ON "regions"."id" = CASE WHEN jsonb_typeof("element"."value") = 'number' THEN ("element"."value")::integer END;--> statement-breakpoint
ALTER TABLE "auth"."users" DROP COLUMN "hunter_regions";--> statement-breakpoint
CREATE INDEX "hunter_regions_region_id_idx" ON "auth"."hunter_regions" ("region_id");--> statement-breakpoint
ALTER TABLE "auth"."hunter_regions" ADD CONSTRAINT "hunter_regions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."hunter_regions" ADD CONSTRAINT "hunter_regions_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;