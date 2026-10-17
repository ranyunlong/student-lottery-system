ALTER TABLE "session_students" ADD COLUMN "draw_limit" integer;--> statement-breakpoint
UPDATE "session_students" AS ss
SET "draw_limit" = COALESCE(ls."student_draw_limit", 1)
FROM "lottery_sessions" AS ls
WHERE ls."id" = ss."session_id";--> statement-breakpoint
ALTER TABLE "session_students" ALTER COLUMN "draw_limit" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "session_students" ALTER COLUMN "draw_limit" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session_students" ADD CONSTRAINT "session_students_draw_limit_positive" CHECK ("draw_limit" > 0);
