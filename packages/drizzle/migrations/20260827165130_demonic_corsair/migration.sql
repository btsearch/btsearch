CREATE TABLE "auth"."jwks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"token" text UNIQUE,
	"client_id" varchar(255) NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"refresh_id" uuid,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_client_assertions" (
	"id" varchar(255) PRIMARY KEY,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_client_resources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"client_id" varchar(255) NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "oauth_client_resources_client_resource_unique" UNIQUE("client_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"client_id" varchar(255) NOT NULL UNIQUE,
	"client_secret" text,
	"client_discovery_id" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"client_credentials_scopes" text[],
	"user_id" uuid,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"backchannel_logout_uri" text,
	"backchannel_logout_session_required" boolean,
	"token_endpoint_auth_method" text,
	"application_type" text,
	"jwks" text,
	"jwks_uri" text,
	"grant_types" text[],
	"response_types" text[],
	"require_pkce" boolean,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"reference_id" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_consents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"client_id" varchar(255) NOT NULL,
	"user_id" uuid,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"token" text NOT NULL UNIQUE,
	"client_id" varchar(255) NOT NULL,
	"session_id" uuid,
	"user_id" uuid NOT NULL,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_resources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"identifier" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"token" varchar(255) NOT NULL UNIQUE,
	"user_id" uuid NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(60),
	"user_agent" text,
	"impersonated_by" uuid
);
--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_client_id_idx" ON "auth"."oauth_access_tokens" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_session_id_idx" ON "auth"."oauth_access_tokens" ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_user_id_idx" ON "auth"."oauth_access_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_authorization_code_id_idx" ON "auth"."oauth_access_tokens" ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_refresh_id_idx" ON "auth"."oauth_access_tokens" ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resources_client_id_idx" ON "auth"."oauth_client_resources" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resources_resource_id_idx" ON "auth"."oauth_client_resources" ("resource_id");--> statement-breakpoint
CREATE INDEX "oauth_clients_user_id_idx" ON "auth"."oauth_clients" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_consents_client_id_idx" ON "auth"."oauth_consents" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_consents_user_id_idx" ON "auth"."oauth_consents" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_client_id_idx" ON "auth"."oauth_refresh_tokens" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_session_id_idx" ON "auth"."oauth_refresh_tokens" ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_user_id_idx" ON "auth"."oauth_refresh_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_authorization_code_id_idx" ON "auth"."oauth_refresh_tokens" ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "auth"."sessions" ("user_id");--> statement-breakpoint
ALTER TABLE "auth"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "auth"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_refresh_id_oauth_refresh_tokens_id_fkey" FOREIGN KEY ("refresh_id") REFERENCES "auth"."oauth_refresh_tokens"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_client_id_oauth_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_CxFm94nYigrM_fkey" FOREIGN KEY ("resource_id") REFERENCES "auth"."oauth_resources"("identifier") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_clients" ADD CONSTRAINT "oauth_clients_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_client_id_oauth_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_consents" ADD CONSTRAINT "oauth_consents_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_oauth_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."oauth_clients"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "auth"."oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fkey" FOREIGN KEY ("impersonated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;