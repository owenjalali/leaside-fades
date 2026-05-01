ALTER TABLE "notifications" DROP CONSTRAINT "notifications_recipient_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "provider" varchar(40);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_check" CHECK ("notifications"."status" = 'skipped' OR "notifications"."recipient_phone" IS NOT NULL OR "notifications"."recipient_email" IS NOT NULL);