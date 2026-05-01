CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
CREATE TYPE "public"."blocked_time_scope" AS ENUM('barber', 'location', 'business');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('public', 'manual', 'imported');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_event_type" AS ENUM('booking_confirmation', 'reminder_24h', 'reminder_2h', 'cancellation_confirmation', 'reschedule_confirmation');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."price_type" AS ENUM('fixed', 'from');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('customer', 'barber', 'admin');--> statement-breakpoint
CREATE TYPE "public"."shift_override_type" AS ENUM('add', 'remove', 'not_working');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'barber');--> statement-breakpoint
CREATE TABLE "barber_locations" (
	"barber_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barber_locations_barber_id_location_id_pk" PRIMARY KEY("barber_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "barber_services" (
	"barber_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barber_services_barber_id_service_id_pk" PRIMARY KEY("barber_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "barbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"phone_e164" varchar(32),
	"email" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barbers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blocked_times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "blocked_time_scope" NOT NULL,
	"barber_id" uuid,
	"location_id" uuid,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_times_time_check" CHECK ("blocked_times"."start_time" < "blocked_times"."end_time"),
	CONSTRAINT "blocked_times_scope_check" CHECK (("blocked_times"."scope" = 'business' AND "blocked_times"."barber_id" IS NULL AND "blocked_times"."location_id" IS NULL) OR ("blocked_times"."scope" = 'location' AND "blocked_times"."barber_id" IS NULL AND "blocked_times"."location_id" IS NOT NULL) OR ("blocked_times"."scope" = 'barber' AND "blocked_times"."barber_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "booking_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"service_id" uuid,
	"service_name" varchar(200) NOT NULL,
	"category_name" varchar(160) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"price_type" "price_type" NOT NULL,
	"display_price" varchar(80) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_services_duration_positive_check" CHECK ("booking_services"."duration_minutes" > 0),
	CONSTRAINT "booking_services_price_nonnegative_check" CHECK ("booking_services"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"barber_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"source" "booking_source" DEFAULT 'public' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"total_duration_minutes" integer NOT NULL,
	"customer_notes" text,
	"internal_notes" text,
	"cancellation_token_hash" text,
	"reschedule_token_hash" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_time_check" CHECK ("bookings"."start_time" < "bookings"."end_time"),
	CONSTRAINT "bookings_duration_positive_check" CHECK ("bookings"."total_duration_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_confirmed_overlap" EXCLUDE USING gist ("barber_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&) WHERE ("status" = 'confirmed');--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" time NOT NULL,
	"close_time" time NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_hours_location_day_unique" UNIQUE("location_id","day_of_week"),
	CONSTRAINT "business_hours_day_check" CHECK ("business_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "business_hours_time_check" CHECK ("business_hours"."closed" = true OR "business_hours"."open_time" < "business_hours"."close_time")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"phone_e164" varchar(32) NOT NULL,
	"email" varchar(255) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"address_line_1" varchar(200) NOT NULL,
	"city" varchar(120) NOT NULL,
	"province" varchar(80) NOT NULL,
	"postal_code" varchar(20) NOT NULL,
	"phone_e164" varchar(32) NOT NULL,
	"phone_display" varchar(40) NOT NULL,
	"timezone" varchar(80) DEFAULT 'America/Toronto' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"recipient_type" "recipient_type" NOT NULL,
	"recipient_phone" varchar(32),
	"recipient_email" varchar(255),
	"channel" "notification_channel" NOT NULL,
	"event_type" "notification_event_type" NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"provider_message_id" varchar(200),
	"error_message" text,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "notifications_recipient_check" CHECK ("notifications"."recipient_phone" IS NOT NULL OR "notifications"."recipient_email" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(160) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" varchar(200) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"price_type" "price_type" NOT NULL,
	"display_price" varchar(80) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug"),
	CONSTRAINT "services_duration_positive_check" CHECK ("services"."duration_minutes" > 0),
	CONSTRAINT "services_price_nonnegative_check" CHECK ("services"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shift_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barber_id" uuid NOT NULL,
	"location_id" uuid,
	"override_date" date NOT NULL,
	"override_type" "shift_override_type" NOT NULL,
	"start_time" time,
	"end_time" time,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_overrides_time_check" CHECK (("shift_overrides"."override_type" = 'not_working' AND "shift_overrides"."start_time" IS NULL AND "shift_overrides"."end_time" IS NULL) OR ("shift_overrides"."start_time" IS NOT NULL AND "shift_overrides"."end_time" IS NOT NULL AND "shift_overrides"."start_time" < "shift_overrides"."end_time"))
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barber_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_day_check" CHECK ("shifts"."day_of_week" between 0 and 6),
	CONSTRAINT "shifts_time_check" CHECK ("shifts"."start_time" < "shifts"."end_time"),
	CONSTRAINT "shifts_effective_dates_check" CHECK ("shifts"."effective_from" is null OR "shifts"."effective_to" is null OR "shifts"."effective_from" <= "shifts"."effective_to")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"role" "user_role" NOT NULL,
	"barber_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "barber_locations" ADD CONSTRAINT "barber_locations_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barber_locations" ADD CONSTRAINT "barber_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barber_services" ADD CONSTRAINT "barber_services_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barber_services" ADD CONSTRAINT "barber_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_times" ADD CONSTRAINT "blocked_times_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_times" ADD CONSTRAINT "blocked_times_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_times" ADD CONSTRAINT "blocked_times_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_overrides" ADD CONSTRAINT "shift_overrides_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_overrides" ADD CONSTRAINT "shift_overrides_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "barber_locations_location_idx" ON "barber_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "barber_services_service_idx" ON "barber_services" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "barbers_active_sort_idx" ON "barbers" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "barbers_email_unique" ON "barbers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "blocked_times_scope_time_idx" ON "blocked_times" USING btree ("scope","start_time","end_time");--> statement-breakpoint
CREATE INDEX "blocked_times_barber_time_idx" ON "blocked_times" USING btree ("barber_id","start_time","end_time");--> statement-breakpoint
CREATE INDEX "blocked_times_location_time_idx" ON "blocked_times" USING btree ("location_id","start_time","end_time");--> statement-breakpoint
CREATE INDEX "booking_services_booking_idx" ON "booking_services" USING btree ("booking_id","sort_order");--> statement-breakpoint
CREATE INDEX "bookings_barber_time_idx" ON "bookings" USING btree ("barber_id","start_time","end_time");--> statement-breakpoint
CREATE INDEX "bookings_location_time_idx" ON "bookings" USING btree ("location_id","start_time","end_time");--> statement-breakpoint
CREATE INDEX "bookings_customer_time_idx" ON "bookings" USING btree ("customer_id","start_time");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_cancellation_token_hash_unique" ON "bookings" USING btree ("cancellation_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_reschedule_token_hash_unique" ON "bookings" USING btree ("reschedule_token_hash");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "locations_active_sort_idx" ON "locations" USING btree ("active","sort_order");--> statement-breakpoint
CREATE INDEX "notifications_booking_idx" ON "notifications" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "notifications_status_scheduled_idx" ON "notifications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "service_categories_sort_idx" ON "service_categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "services_category_sort_idx" ON "services" USING btree ("category_id","sort_order");--> statement-breakpoint
CREATE INDEX "services_active_featured_idx" ON "services" USING btree ("active","is_featured","sort_order");--> statement-breakpoint
CREATE INDEX "shift_overrides_barber_date_idx" ON "shift_overrides" USING btree ("barber_id","override_date");--> statement-breakpoint
CREATE INDEX "shift_overrides_location_date_idx" ON "shift_overrides" USING btree ("location_id","override_date");--> statement-breakpoint
CREATE INDEX "shifts_barber_day_idx" ON "shifts" USING btree ("barber_id","day_of_week","active");--> statement-breakpoint
CREATE INDEX "shifts_location_day_idx" ON "shifts" USING btree ("location_id","day_of_week","active");--> statement-breakpoint
CREATE INDEX "users_role_active_idx" ON "users" USING btree ("role","active");--> statement-breakpoint
CREATE INDEX "users_barber_idx" ON "users" USING btree ("barber_id");
