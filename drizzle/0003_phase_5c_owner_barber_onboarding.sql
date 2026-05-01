CREATE TABLE "user_invite_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_invite_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "user_invite_tokens" ADD CONSTRAINT "user_invite_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invite_tokens" ADD CONSTRAINT "user_invite_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_invite_tokens_user_idx" ON "user_invite_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_invite_tokens_expires_idx" ON "user_invite_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_invite_tokens_unused_idx" ON "user_invite_tokens" USING btree ("token_hash","used_at");