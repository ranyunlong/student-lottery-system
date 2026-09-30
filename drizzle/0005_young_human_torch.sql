CREATE INDEX "admin_audit_created_id_idx" ON "admin_audit" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "classes_created_id_idx" ON "classes" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "classes_name_prefix_idx" ON "classes" USING btree (lower("name") text_pattern_ops);--> statement-breakpoint
CREATE INDEX "redemption_audit_created_id_idx" ON "redemption_audit" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_teacher_created_id_idx" ON "user" USING btree ("role","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "user"."role" = 'user';--> statement-breakpoint
CREATE INDEX "user_teacher_name_prefix_idx" ON "user" USING btree (lower("name") text_pattern_ops) WHERE "user"."role" = 'user';--> statement-breakpoint
CREATE INDEX "user_teacher_email_prefix_idx" ON "user" USING btree (lower("email") text_pattern_ops) WHERE "user"."role" = 'user';
