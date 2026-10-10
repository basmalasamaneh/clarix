CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_version" integer DEFAULT 0 NOT NULL,
	"platform_admin" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"tour_completed" boolean DEFAULT false NOT NULL,
	"test_account" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "factories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_language" text DEFAULT 'ar' NOT NULL,
	"settings" jsonb DEFAULT '{"timeZone":"Asia/Hebron"}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" text NOT NULL,
	"factory_id" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"recovery_required" boolean DEFAULT false NOT NULL,
	"last_login" timestamp with time zone,
	"login_success_count" integer DEFAULT 0 NOT NULL,
	"login_failure_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "memberships_user_id_factory_id_pk" PRIMARY KEY("user_id","factory_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"factory_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "account_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"factory_id" text NOT NULL,
	"actor_id" text,
	"subject_id" text,
	"action" text NOT NULL,
	"role" text,
	"event_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "column_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"source_name" text NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"version" integer NOT NULL,
	"mapping" jsonb NOT NULL,
	CONSTRAINT "column_mappings_factory_id_source_name_version_unique" UNIQUE("factory_id","source_name","version"),
	CONSTRAINT "column_mappings_factory_id_source_name_id_unique" UNIQUE("factory_id","source_name","id"),
	CONSTRAINT "mapping_version_positive" CHECK ("column_mappings"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"source_name" text NOT NULL,
	"file_names" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mapping" jsonb,
	"result" jsonb,
	"counts" jsonb,
	"decision_audit" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"replaced_orders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"finalized" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp,
	"uploaded_by" text NOT NULL,
	"mapping_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "imports_factory_id_id_unique" UNIQUE("factory_id","id"),
	CONSTRAINT "imports_factory_id_source_name_id_unique" UNIQUE("factory_id","source_name","id")
);
--> statement-breakpoint
CREATE TABLE "raw_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"source_name" text NOT NULL,
	"import_id" uuid NOT NULL,
	"file" text NOT NULL,
	"line_number" integer NOT NULL,
	"record_end_line" integer,
	"start_line" integer GENERATED ALWAYS AS (line_number) STORED,
	"end_line" integer GENERATED ALWAYS AS (coalesce(record_end_line, line_number)) STORED,
	"cells" jsonb NOT NULL,
	CONSTRAINT "raw_rows_factory_id_id_unique" UNIQUE("factory_id","id"),
	CONSTRAINT "raw_rows_factory_id_import_id_id_unique" UNIQUE("factory_id","import_id","id"),
	CONSTRAINT "raw_rows_factory_id_source_name_id_unique" UNIQUE("factory_id","source_name","id"),
	CONSTRAINT "raw_rows_factory_id_import_id_file_line_number_unique" UNIQUE("factory_id","import_id","file","line_number"),
	CONSTRAINT "raw_line_positive" CHECK ("raw_rows"."line_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_order_id" text NOT NULL,
	"current_import_id" uuid,
	"metrics" jsonb,
	"product" text,
	"line" text,
	"machine" text,
	"mold" text,
	CONSTRAINT "orders_factory_id_source_name_source_order_id_unique" UNIQUE("factory_id","source_name","source_order_id"),
	CONSTRAINT "orders_factory_id_source_name_id_unique" UNIQUE("factory_id","source_name","id"),
	CONSTRAINT "orders_factory_id_id_unique" UNIQUE("factory_id","id")
);
--> statement-breakpoint
CREATE TABLE "production_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"source_name" text NOT NULL,
	"record_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"shift" text,
	"date" date,
	"input" numeric,
	"good" numeric,
	"scrap" numeric,
	"unit" text,
	"raw_row_id" uuid NOT NULL,
	CONSTRAINT "production_records_factory_id_source_name_record_id_unique" UNIQUE("factory_id","source_name","record_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"source_name" text NOT NULL,
	"event_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"event_code" text,
	"type" text,
	"start" timestamp,
	"end" timestamp,
	"duration_min" numeric,
	"reason" text,
	"raw_row_id" uuid NOT NULL,
	CONSTRAINT "events_factory_id_source_name_event_id_unique" UNIQUE("factory_id","source_name","event_id")
);
--> statement-breakpoint
CREATE TABLE "data_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"import_id" uuid NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"order_id" uuid,
	"source_order_id" text,
	"group" text NOT NULL,
	"raw_row_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"note" text,
	CONSTRAINT "issue_severity_valid" CHECK ("data_issues"."severity" IN ('info','warning','error')),
	CONSTRAINT "issue_status_valid" CHECK ("data_issues"."status" IN ('new','reviewed','accepted-with-note'))
);
--> statement-breakpoint
CREATE TABLE "events_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"original_import_id" uuid NOT NULL,
	"raw_row_id" uuid,
	"superseded_by_import_id" uuid NOT NULL,
	"superseded_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'superseded' NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "events_history_superseded" CHECK ("events_history"."status" = 'superseded')
);
--> statement-breakpoint
CREATE TABLE "orders_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"original_import_id" uuid NOT NULL,
	"raw_row_id" uuid,
	"superseded_by_import_id" uuid NOT NULL,
	"superseded_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'superseded' NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "orders_history_superseded" CHECK ("orders_history"."status" = 'superseded')
);
--> statement-breakpoint
CREATE TABLE "production_records_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"original_import_id" uuid NOT NULL,
	"raw_row_id" uuid,
	"superseded_by_import_id" uuid NOT NULL,
	"superseded_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'superseded' NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "production_records_history_superseded" CHECK ("production_records_history"."status" = 'superseded')
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_audit" ADD CONSTRAINT "account_audit_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_audit" ADD CONSTRAINT "account_audit_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_audit" ADD CONSTRAINT "account_audit_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "column_mappings" ADD CONSTRAINT "column_mappings_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_factory_id_source_name_mapping_id_column_mappings_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","mapping_id") REFERENCES "public"."column_mappings"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_rows" ADD CONSTRAINT "raw_rows_factory_id_source_name_import_id_imports_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","import_id") REFERENCES "public"."imports"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_factory_id_source_name_current_import_id_imports_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","current_import_id") REFERENCES "public"."imports"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_records" ADD CONSTRAINT "production_records_factory_id_source_name_order_id_orders_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","order_id") REFERENCES "public"."orders"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_records" ADD CONSTRAINT "production_records_factory_id_source_name_raw_row_id_raw_rows_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","raw_row_id") REFERENCES "public"."raw_rows"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_factory_id_source_name_order_id_orders_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","order_id") REFERENCES "public"."orders"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_factory_id_source_name_raw_row_id_raw_rows_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","raw_row_id") REFERENCES "public"."raw_rows"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_issues" ADD CONSTRAINT "data_issues_factory_id_import_id_imports_factory_id_id_fk" FOREIGN KEY ("factory_id","import_id") REFERENCES "public"."imports"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_issues" ADD CONSTRAINT "data_issues_factory_id_order_id_orders_factory_id_id_fk" FOREIGN KEY ("factory_id","order_id") REFERENCES "public"."orders"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events_history" ADD CONSTRAINT "events_history_factory_id_source_name_order_id_orders_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","order_id") REFERENCES "public"."orders"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events_history" ADD CONSTRAINT "events_history_factory_id_source_name_original_import_id_imports_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","original_import_id") REFERENCES "public"."imports"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events_history" ADD CONSTRAINT "events_history_factory_id_source_name_superseded_by_import_id_imports_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","superseded_by_import_id") REFERENCES "public"."imports"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events_history" ADD CONSTRAINT "events_history_factory_id_original_import_id_raw_row_id_raw_rows_factory_id_import_id_id_fk" FOREIGN KEY ("factory_id","original_import_id","raw_row_id") REFERENCES "public"."raw_rows"("factory_id","import_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_history" ADD CONSTRAINT "orders_history_factory_id_source_name_order_id_orders_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","order_id") REFERENCES "public"."orders"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_history" ADD CONSTRAINT "orders_history_factory_id_source_name_original_import_id_imports_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","original_import_id") REFERENCES "public"."imports"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_history" ADD CONSTRAINT "orders_history_factory_id_source_name_superseded_by_import_id_imports_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","superseded_by_import_id") REFERENCES "public"."imports"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_history" ADD CONSTRAINT "orders_history_factory_id_original_import_id_raw_row_id_raw_rows_factory_id_import_id_id_fk" FOREIGN KEY ("factory_id","original_import_id","raw_row_id") REFERENCES "public"."raw_rows"("factory_id","import_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_records_history" ADD CONSTRAINT "production_records_history_factory_id_source_name_order_id_orders_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","order_id") REFERENCES "public"."orders"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_records_history" ADD CONSTRAINT "production_records_history_factory_id_source_name_original_import_id_imports_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","original_import_id") REFERENCES "public"."imports"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_records_history" ADD CONSTRAINT "production_records_history_factory_id_source_name_superseded_by_import_id_imports_factory_id_source_name_id_fk" FOREIGN KEY ("factory_id","source_name","superseded_by_import_id") REFERENCES "public"."imports"("factory_id","source_name","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_records_history" ADD CONSTRAINT "production_records_history_factory_id_original_import_id_raw_row_id_raw_rows_factory_id_import_id_id_fk" FOREIGN KEY ("factory_id","original_import_id","raw_row_id") REFERENCES "public"."raw_rows"("factory_id","import_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_factory_pending" ON "invitations" USING btree ("factory_id","created_at") WHERE "invitations"."revoked_at" IS NULL AND "invitations"."accepted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_email" ON "invitations" USING btree ("factory_id","email") WHERE "invitations"."revoked_at" IS NULL AND "invitations"."accepted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "account_audit_factory_date" ON "account_audit" USING btree ("factory_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_expire_idx" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "imports_hash_lookup_idx" ON "imports" USING btree ("factory_id","content_hash");--> statement-breakpoint
CREATE INDEX "imports_factory_id_status_created_at_index" ON "imports" USING btree ("factory_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_factory_id_machine_index" ON "orders" USING btree ("factory_id","machine");--> statement-breakpoint
CREATE INDEX "orders_factory_id_mold_index" ON "orders" USING btree ("factory_id","mold");--> statement-breakpoint
CREATE INDEX "orders_factory_id_line_index" ON "orders" USING btree ("factory_id","line");--> statement-breakpoint
CREATE INDEX "orders_current_import_idx" ON "orders" USING btree ("factory_id","current_import_id");--> statement-breakpoint
CREATE INDEX "orders_factory_order_idx" ON "orders" USING btree ("factory_id","source_order_id");--> statement-breakpoint
CREATE INDEX "orders_factory_quality_idx" ON "orders" USING btree ("factory_id",("metrics"->>'overall'),"source_order_id");--> statement-breakpoint
CREATE INDEX "production_records_factory_id_order_id_index" ON "production_records" USING btree ("factory_id","order_id");--> statement-breakpoint
CREATE INDEX "production_records_factory_id_shift_date_index" ON "production_records" USING btree ("factory_id","shift","date");--> statement-breakpoint
CREATE INDEX "production_records_factory_id_date_index" ON "production_records" USING btree ("factory_id","date");--> statement-breakpoint
CREATE INDEX "production_records_factory_id_raw_row_id_index" ON "production_records" USING btree ("factory_id","raw_row_id");--> statement-breakpoint
CREATE INDEX "events_factory_id_order_id_start_index" ON "events" USING btree ("factory_id","order_id","start");--> statement-breakpoint
CREATE INDEX "events_factory_id_start_index" ON "events" USING btree ("factory_id","start");--> statement-breakpoint
CREATE INDEX "events_factory_id_raw_row_id_index" ON "events" USING btree ("factory_id","raw_row_id");--> statement-breakpoint
CREATE INDEX "data_issues_factory_id_import_id_index" ON "data_issues" USING btree ("factory_id","import_id");--> statement-breakpoint
CREATE INDEX "data_issues_factory_id_order_id_index" ON "data_issues" USING btree ("factory_id","order_id");--> statement-breakpoint
CREATE INDEX "data_issues_factory_id_status_severity_index" ON "data_issues" USING btree ("factory_id","status","severity");--> statement-breakpoint
CREATE INDEX "events_history_factory_id_source_name_source_id_index" ON "events_history" USING btree ("factory_id","source_name","source_id");--> statement-breakpoint
CREATE INDEX "events_history_factory_id_order_id_superseded_at_index" ON "events_history" USING btree ("factory_id","order_id","superseded_at");--> statement-breakpoint
CREATE INDEX "events_history_factory_id_superseded_by_import_id_index" ON "events_history" USING btree ("factory_id","superseded_by_import_id");--> statement-breakpoint
CREATE INDEX "events_history_factory_id_original_import_id_index" ON "events_history" USING btree ("factory_id","original_import_id");--> statement-breakpoint
CREATE INDEX "orders_history_factory_id_source_name_source_id_index" ON "orders_history" USING btree ("factory_id","source_name","source_id");--> statement-breakpoint
CREATE INDEX "orders_history_factory_id_order_id_superseded_at_index" ON "orders_history" USING btree ("factory_id","order_id","superseded_at");--> statement-breakpoint
CREATE INDEX "orders_history_factory_id_superseded_by_import_id_index" ON "orders_history" USING btree ("factory_id","superseded_by_import_id");--> statement-breakpoint
CREATE INDEX "orders_history_factory_id_original_import_id_index" ON "orders_history" USING btree ("factory_id","original_import_id");--> statement-breakpoint
CREATE INDEX "production_records_history_factory_id_source_name_source_id_index" ON "production_records_history" USING btree ("factory_id","source_name","source_id");--> statement-breakpoint
CREATE INDEX "production_records_history_factory_id_order_id_superseded_at_index" ON "production_records_history" USING btree ("factory_id","order_id","superseded_at");--> statement-breakpoint
CREATE INDEX "production_records_history_factory_id_superseded_by_import_id_index" ON "production_records_history" USING btree ("factory_id","superseded_by_import_id");--> statement-breakpoint
CREATE INDEX "production_records_history_factory_id_original_import_id_index" ON "production_records_history" USING btree ("factory_id","original_import_id");