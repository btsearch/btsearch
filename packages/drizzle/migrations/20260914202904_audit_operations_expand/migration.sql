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