import { sql } from 'drizzle-orm';
import {
  boolean, check, index, integer, jsonb, pgTable, primaryKey, text,
  timestamp, unique, uniqueIndex, uuid, foreignKey,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const classes = pgTable('classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  emblemPath: text('emblem_path'),
  archived: boolean('archived').notNull().default(false),
  createdAt: createdAt(),
});

export const classTeachers = pgTable('class_teachers', {
  classId: uuid('class_id').notNull().references(() => classes.id),
  teacherId: text('teacher_id').notNull().references(() => user.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.classId, t.teacherId] }), index('class_teachers_teacher_idx').on(t.teacherId)]);

export const students = pgTable('students', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  classId: uuid('class_id').notNull().references(() => classes.id),
  studentNumber: text('student_number').notNull(),
  name: text('name').notNull(),
  gender: text('gender'),
  archived: boolean('archived').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  unique('students_class_number_unique').on(t.classId, t.studentNumber),
  unique('students_class_id_unique').on(t.classId, t.id),
  check('students_gender_check', sql`${t.gender} in ('male', 'female')`),
]);

export const prizes = pgTable('prizes', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull().references(() => classes.id),
  name: text('name').notNull(),
  stock: integer('stock').notNull().default(0),
  archived: boolean('archived').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  unique('prizes_class_id_unique').on(t.classId, t.id),
  uniqueIndex('prizes_active_name_unique').on(t.classId, t.name).where(sql`${t.archived} = false`),
  check('prizes_stock_nonnegative', sql`${t.stock} >= 0`),
]);

export const lotterySessions = pgTable('lottery_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull().references(() => classes.id),
  mode: text('mode').notNull(),
  status: text('status').notNull().default('draft'),
  studentDrawLimit: integer('student_draw_limit'),
  fixedPrizeId: uuid('fixed_prize_id'),
  roundLimit: integer('round_limit'),
  createdBy: text('created_by').notNull().references(() => user.id),
  createdAt: createdAt(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  unique('lottery_sessions_class_id_unique').on(t.classId, t.id),
  foreignKey({ columns: [t.classId, t.fixedPrizeId], foreignColumns: [prizes.classId, prizes.id] }),
  check('lottery_sessions_mode_check', sql`${t.mode} in ('student_prize', 'prize_student')`),
  check('lottery_sessions_status_check', sql`${t.status} in ('draft', 'active', 'completed')`),
  check('lottery_sessions_limits_positive', sql`(${t.studentDrawLimit} is null or ${t.studentDrawLimit} > 0) and (${t.roundLimit} is null or ${t.roundLimit} > 0)`),
]);

export const sessionStudents = pgTable('session_students', {
  classId: uuid('class_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  studentId: integer('student_id').notNull(),
  usedCount: integer('used_count').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.sessionId, t.studentId] }),
  foreignKey({ columns: [t.classId, t.sessionId], foreignColumns: [lotterySessions.classId, lotterySessions.id] }),
  foreignKey({ columns: [t.classId, t.studentId], foreignColumns: [students.classId, students.id] }),
  check('session_students_used_nonnegative', sql`${t.usedCount} >= 0`),
]);

export const sessionPrizes = pgTable('session_prizes', {
  classId: uuid('class_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  prizeId: uuid('prize_id').notNull(),
  quantityLimit: integer('quantity_limit').notNull(),
  usedCount: integer('used_count').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.sessionId, t.prizeId] }),
  foreignKey({ columns: [t.classId, t.sessionId], foreignColumns: [lotterySessions.classId, lotterySessions.id] }),
  foreignKey({ columns: [t.classId, t.prizeId], foreignColumns: [prizes.classId, prizes.id] }),
  check('session_prizes_quantities_check', sql`${t.quantityLimit} > 0 and ${t.usedCount} >= 0 and ${t.usedCount} <= ${t.quantityLimit}`),
]);

export const lotteryRounds = pgTable('lottery_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  startToken: text('start_token').notNull().unique(),
  stopToken: text('stop_token').unique(),
  studentId: integer('student_id'),
  status: text('status').notNull().default('active'),
  startedBy: text('started_by').notNull().references(() => user.id),
  stoppedBy: text('stopped_by').references(() => user.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  stoppedAt: timestamp('stopped_at', { withTimezone: true }),
}, (t) => [
  unique('lottery_rounds_class_id_unique').on(t.classId, t.id),
  uniqueIndex('lottery_rounds_one_active_per_session').on(t.sessionId).where(sql`${t.status} = 'active'`),
  foreignKey({ columns: [t.classId, t.sessionId], foreignColumns: [lotterySessions.classId, lotterySessions.id] }),
  foreignKey({ columns: [t.classId, t.studentId], foreignColumns: [students.classId, students.id] }),
  check('lottery_rounds_status_check', sql`${t.status} in ('active', 'completed', 'cancelled')`),
]);

export const winningRecords = pgTable('winning_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  roundId: uuid('round_id').notNull().unique(),
  studentId: integer('student_id').notNull(),
  studentNumberSnapshot: text('student_number_snapshot').notNull(),
  studentNameSnapshot: text('student_name_snapshot').notNull(),
  prizeId: uuid('prize_id').notNull(),
  prizeNameSnapshot: text('prize_name_snapshot').notNull(),
  actorId: text('actor_id').notNull().references(() => user.id),
  createdAt: createdAt(),
  redemptionStatus: text('redemption_status').notNull().default('pending'),
  redeemedBy: text('redeemed_by').references(() => user.id),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
}, (t) => [
  unique('winning_records_class_id_unique').on(t.classId, t.id),
  foreignKey({ columns: [t.classId, t.sessionId], foreignColumns: [lotterySessions.classId, lotterySessions.id] }),
  foreignKey({ columns: [t.classId, t.roundId], foreignColumns: [lotteryRounds.classId, lotteryRounds.id] }),
  foreignKey({ columns: [t.classId, t.studentId], foreignColumns: [students.classId, students.id] }),
  foreignKey({ columns: [t.classId, t.prizeId], foreignColumns: [prizes.classId, prizes.id] }),
  check('winning_records_redemption_status_check', sql`${t.redemptionStatus} in ('pending', 'redeemed')`),
]);

export const stockEvents = pgTable('stock_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull(),
  prizeId: uuid('prize_id').notNull(),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  actorId: text('actor_id').notNull().references(() => user.id),
  winningRecordId: uuid('winning_record_id').unique(),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.classId, t.prizeId], foreignColumns: [prizes.classId, prizes.id] }),
  foreignKey({ columns: [t.classId, t.winningRecordId], foreignColumns: [winningRecords.classId, winningRecords.id] }),
]);

export const redemptionAudit = pgTable('redemption_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull(),
  winningRecordId: uuid('winning_record_id').notNull(),
  actorId: text('actor_id').notNull().references(() => user.id),
  previousStatus: text('previous_status').notNull(),
  newStatus: text('new_status').notNull(),
  reason: text('reason'),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.classId, t.winningRecordId], foreignColumns: [winningRecords.classId, winningRecords.id] }),
  check('redemption_audit_status_check', sql`${t.previousStatus} in ('pending', 'redeemed') and ${t.newStatus} in ('pending', 'redeemed')`),
]);

export const adminAudit = pgTable('admin_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: text('actor_id').notNull().references(() => user.id),
  targetUserId: text('target_user_id').references(() => user.id),
  classId: uuid('class_id').references(() => classes.id),
  action: text('action').notNull(),
  details: jsonb('details'),
  createdAt: createdAt(),
});
