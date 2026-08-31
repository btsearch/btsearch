-- Custom SQL migration file, put your code below! --
CREATE INDEX "uke_permits_decision_fragment_idx" ON "uke"."uke_permits" USING btree (split_part("decision_number", '/', 3));
