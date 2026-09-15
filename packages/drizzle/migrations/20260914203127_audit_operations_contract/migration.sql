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