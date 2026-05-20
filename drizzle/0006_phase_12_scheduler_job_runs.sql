CREATE TABLE "scheduler_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" varchar(120) NOT NULL,
	"trigger" varchar(40) DEFAULT 'unknown' NOT NULL,
	"status" varchar(32) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"result" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduler_job_runs_status_check" CHECK ("scheduler_job_runs"."status" in ('success', 'failure')),
	CONSTRAINT "scheduler_job_runs_duration_check" CHECK ("scheduler_job_runs"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE INDEX "scheduler_job_runs_job_started_idx" ON "scheduler_job_runs" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE INDEX "scheduler_job_runs_job_status_started_idx" ON "scheduler_job_runs" USING btree ("job_name","status","started_at");