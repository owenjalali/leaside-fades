DO $$ BEGIN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_price_override_nonnegative_check" CHECK ("bookings"."price_override_cents" is null or "bookings"."price_override_cents" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
