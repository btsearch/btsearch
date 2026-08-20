ALTER TABLE "auth"."accounts" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "auth"."accounts"
SET "issuer" = CASE "provider_id"
	WHEN 'credential' THEN 'local:credential'
	WHEN 'google' THEN 'https://accounts.google.com'
	WHEN 'github' THEN 'local:oauth:github'
	ELSE 'local:oauth:' || "provider_id"
END;--> statement-breakpoint
ALTER TABLE "auth"."accounts" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "accounts_issuer_account_id_unique" UNIQUE("issuer","account_id");
