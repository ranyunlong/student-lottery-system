CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"target_user_id" text,
	"class_id" uuid,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_teachers" (
	"class_id" uuid NOT NULL,
	"teacher_id" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_teachers_class_id_teacher_id_pk" PRIMARY KEY("class_id","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emblem_path" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"start_token" text NOT NULL,
	"stop_token" text,
	"student_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"started_by" text NOT NULL,
	"stopped_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	CONSTRAINT "lottery_rounds_start_token_unique" UNIQUE("start_token"),
	CONSTRAINT "lottery_rounds_stop_token_unique" UNIQUE("stop_token"),
	CONSTRAINT "lottery_rounds_class_id_unique" UNIQUE("class_id","id"),
	CONSTRAINT "lottery_rounds_status_check" CHECK ("lottery_rounds"."status" in ('active', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "lottery_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"student_draw_limit" integer,
	"fixed_prize_id" uuid,
	"round_limit" integer,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "lottery_sessions_class_id_unique" UNIQUE("class_id","id"),
	CONSTRAINT "lottery_sessions_mode_check" CHECK ("lottery_sessions"."mode" in ('student_prize', 'prize_student')),
	CONSTRAINT "lottery_sessions_status_check" CHECK ("lottery_sessions"."status" in ('draft', 'active', 'completed')),
	CONSTRAINT "lottery_sessions_limits_positive" CHECK (("lottery_sessions"."student_draw_limit" is null or "lottery_sessions"."student_draw_limit" > 0) and ("lottery_sessions"."round_limit" is null or "lottery_sessions"."round_limit" > 0))
);
--> statement-breakpoint
CREATE TABLE "prizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prizes_class_id_unique" UNIQUE("class_id","id"),
	CONSTRAINT "prizes_stock_nonnegative" CHECK ("prizes"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "redemption_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"winning_record_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemption_audit_status_check" CHECK ("redemption_audit"."previous_status" in ('pending', 'redeemed') and "redemption_audit"."new_status" in ('pending', 'redeemed'))
);
--> statement-breakpoint
CREATE TABLE "session_prizes" (
	"class_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"prize_id" uuid NOT NULL,
	"quantity_limit" integer NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "session_prizes_session_id_prize_id_pk" PRIMARY KEY("session_id","prize_id"),
	CONSTRAINT "session_prizes_quantities_check" CHECK ("session_prizes"."quantity_limit" > 0 and "session_prizes"."used_count" >= 0 and "session_prizes"."used_count" <= "session_prizes"."quantity_limit")
);
--> statement-breakpoint
CREATE TABLE "session_students" (
	"class_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" integer NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "session_students_session_id_student_id_pk" PRIMARY KEY("session_id","student_id"),
	CONSTRAINT "session_students_used_nonnegative" CHECK ("session_students"."used_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"prize_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"winning_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_events_winning_record_id_unique" UNIQUE("winning_record_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "students_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"class_id" uuid NOT NULL,
	"student_number" text NOT NULL,
	"name" text NOT NULL,
	"gender" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_class_number_unique" UNIQUE("class_id","student_number"),
	CONSTRAINT "students_class_id_unique" UNIQUE("class_id","id"),
	CONSTRAINT "students_gender_check" CHECK ("students"."gender" in ('male', 'female'))
);
--> statement-breakpoint
CREATE TABLE "winning_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"student_id" integer NOT NULL,
	"student_number_snapshot" text NOT NULL,
	"student_name_snapshot" text NOT NULL,
	"prize_id" uuid NOT NULL,
	"prize_name_snapshot" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redemption_status" text DEFAULT 'pending' NOT NULL,
	"redeemed_by" text,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "winning_records_round_id_unique" UNIQUE("round_id"),
	CONSTRAINT "winning_records_class_id_unique" UNIQUE("class_id","id"),
	CONSTRAINT "winning_records_redemption_status_check" CHECK ("winning_records"."redemption_status" in ('pending', 'redeemed'))
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"must_change_password" boolean DEFAULT false,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_rounds" ADD CONSTRAINT "lottery_rounds_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_rounds" ADD CONSTRAINT "lottery_rounds_stopped_by_user_id_fk" FOREIGN KEY ("stopped_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_rounds" ADD CONSTRAINT "lottery_rounds_class_id_session_id_lottery_sessions_class_id_id_fk" FOREIGN KEY ("class_id","session_id") REFERENCES "public"."lottery_sessions"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_rounds" ADD CONSTRAINT "lottery_rounds_class_id_student_id_students_class_id_id_fk" FOREIGN KEY ("class_id","student_id") REFERENCES "public"."students"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_sessions" ADD CONSTRAINT "lottery_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_sessions" ADD CONSTRAINT "lottery_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_sessions" ADD CONSTRAINT "lottery_sessions_class_id_fixed_prize_id_prizes_class_id_id_fk" FOREIGN KEY ("class_id","fixed_prize_id") REFERENCES "public"."prizes"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_audit" ADD CONSTRAINT "redemption_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_audit" ADD CONSTRAINT "redemption_audit_class_id_winning_record_id_winning_records_class_id_id_fk" FOREIGN KEY ("class_id","winning_record_id") REFERENCES "public"."winning_records"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_prizes" ADD CONSTRAINT "session_prizes_class_id_session_id_lottery_sessions_class_id_id_fk" FOREIGN KEY ("class_id","session_id") REFERENCES "public"."lottery_sessions"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_prizes" ADD CONSTRAINT "session_prizes_class_id_prize_id_prizes_class_id_id_fk" FOREIGN KEY ("class_id","prize_id") REFERENCES "public"."prizes"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_students" ADD CONSTRAINT "session_students_class_id_session_id_lottery_sessions_class_id_id_fk" FOREIGN KEY ("class_id","session_id") REFERENCES "public"."lottery_sessions"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_students" ADD CONSTRAINT "session_students_class_id_student_id_students_class_id_id_fk" FOREIGN KEY ("class_id","student_id") REFERENCES "public"."students"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_class_id_prize_id_prizes_class_id_id_fk" FOREIGN KEY ("class_id","prize_id") REFERENCES "public"."prizes"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_class_id_winning_record_id_winning_records_class_id_id_fk" FOREIGN KEY ("class_id","winning_record_id") REFERENCES "public"."winning_records"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_records" ADD CONSTRAINT "winning_records_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_records" ADD CONSTRAINT "winning_records_redeemed_by_user_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_records" ADD CONSTRAINT "winning_records_class_id_session_id_lottery_sessions_class_id_id_fk" FOREIGN KEY ("class_id","session_id") REFERENCES "public"."lottery_sessions"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_records" ADD CONSTRAINT "winning_records_class_id_round_id_lottery_rounds_class_id_id_fk" FOREIGN KEY ("class_id","round_id") REFERENCES "public"."lottery_rounds"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_records" ADD CONSTRAINT "winning_records_class_id_student_id_students_class_id_id_fk" FOREIGN KEY ("class_id","student_id") REFERENCES "public"."students"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_records" ADD CONSTRAINT "winning_records_class_id_prize_id_prizes_class_id_id_fk" FOREIGN KEY ("class_id","prize_id") REFERENCES "public"."prizes"("class_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_teachers_teacher_idx" ON "class_teachers" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_rounds_one_active_per_session" ON "lottery_rounds" USING btree ("session_id") WHERE "lottery_rounds"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "prizes_active_name_unique" ON "prizes" USING btree ("class_id","name") WHERE "prizes"."archived" = false;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
--> statement-breakpoint
CREATE FUNCTION protect_winning_record() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'winning records cannot be deleted';
  END IF;
  IF ROW(NEW.id, NEW.class_id, NEW.session_id, NEW.round_id, NEW.student_id,
         NEW.student_number_snapshot, NEW.student_name_snapshot, NEW.prize_id,
         NEW.prize_name_snapshot, NEW.actor_id, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.class_id, OLD.session_id, OLD.round_id, OLD.student_id,
         OLD.student_number_snapshot, OLD.student_name_snapshot, OLD.prize_id,
         OLD.prize_name_snapshot, OLD.actor_id, OLD.created_at) THEN
    RAISE EXCEPTION 'winning results are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER protect_winning_record_trigger
BEFORE UPDATE OR DELETE ON winning_records
FOR EACH ROW EXECUTE FUNCTION protect_winning_record();
