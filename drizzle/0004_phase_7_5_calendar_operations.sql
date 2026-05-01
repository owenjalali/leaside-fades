ALTER TYPE "public"."booking_source" ADD VALUE 'walk_in' BEFORE 'imported';--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone_e164" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL;