CREATE TABLE "cell_plmns" (
	"cell_id" integer,
	"plmn_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cell_plmns_pkey" PRIMARY KEY("cell_id","plmn_id")
);
--> statement-breakpoint
ALTER TABLE "submissions"."proposed_cells" ADD COLUMN "plmns" text[];--> statement-breakpoint
CREATE INDEX "cell_plmns_plmn_id_idx" ON "cell_plmns" ("plmn_id");--> statement-breakpoint
ALTER TABLE "cell_plmns" ADD CONSTRAINT "cell_plmns_cell_id_cells_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cell_plmns" ADD CONSTRAINT "cell_plmns_plmn_id_plmns_id_fkey" FOREIGN KEY ("plmn_id") REFERENCES "plmns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE OR REPLACE FUNCTION "sync_primary_plmn"() RETURNS trigger
	LANGUAGE plpgsql SET search_path = public
	AS $$
	BEGIN
		DELETE FROM plmns WHERE operator_id = NEW.id AND role = 'primary' AND code IS DISTINCT FROM NEW.mnc::text
			AND NOT EXISTS (SELECT 1 FROM cell_plmns WHERE cell_plmns.plmn_id = plmns.id);
		UPDATE plmns SET role = 'secondary', updated_at = now() WHERE operator_id = NEW.id AND role = 'primary' AND code IS DISTINCT FROM NEW.mnc::text;
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
