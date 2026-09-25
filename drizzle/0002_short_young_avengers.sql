ALTER TABLE "lottery_rounds" ADD CONSTRAINT "lottery_rounds_class_session_id_unique" UNIQUE("class_id","session_id","id");
--> statement-breakpoint
ALTER TABLE "winning_records" DROP CONSTRAINT "winning_records_class_id_round_id_lottery_rounds_class_id_id_fk";
--> statement-breakpoint
ALTER TABLE "winning_records" ADD CONSTRAINT "winning_records_class_id_session_id_round_id_lottery_rounds_class_id_session_id_id_fk" FOREIGN KEY ("class_id","session_id","round_id") REFERENCES "public"."lottery_rounds"("class_id","session_id","id") ON DELETE no action ON UPDATE no action;
