ALTER TABLE "auth"."two_factors" ADD COLUMN "failed_verification_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."two_factors" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "last_refill_at" SET DATA TYPE timestamp with time zone USING "last_refill_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "last_request" SET DATA TYPE timestamp with time zone USING "last_request"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."passkeys" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;