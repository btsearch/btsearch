ALTER TABLE "auth"."accounts" DROP CONSTRAINT "accounts_issuer_account_id_unique";--> statement-breakpoint
ALTER TABLE "auth"."accounts" DROP COLUMN "issuer";--> statement-breakpoint
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "accounts_provider_id_account_id_unique" UNIQUE("provider_id","account_id");