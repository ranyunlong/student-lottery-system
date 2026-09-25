import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { pool, db } from './client';
import { user } from './auth-schema';
import { classes, lotteryRounds, lotterySessions, prizes, sessionStudents, students, winningRecords } from './schema';

const classId = randomUUID();

afterAll(async () => {
  await pool.end();
});

test('student numbers are unique within a class', async () => {
  await db.insert(classes).values({ id: classId, name: '测试班' });
  await db.insert(students).values({ classId, studentNumber: '001', name: '甲' });
  await expect(db.insert(students).values({
    classId, studentNumber: '001', name: '乙',
  })).rejects.toThrow();
});

test('student numbers can be reused in another class', async () => {
  const anotherClassId = randomUUID();
  await db.insert(classes).values({ id: anotherClassId, name: '另一班' });
  await db.insert(students).values({ classId: anotherClassId, studentNumber: '001', name: '丙' });
});

test('prize stock cannot become negative', async () => {
  const prizeClassId = randomUUID();
  await db.insert(classes).values({ id: prizeClassId, name: '库存班' });
  await expect(db.insert(prizes).values({ classId: prizeClassId, name: '贴纸', stock: -1 })).rejects.toThrow();
  const [prize] = await db.insert(prizes).values({ classId: prizeClassId, name: '贴纸', stock: 0 }).returning();
  await expect(db.update(prizes).set({ stock: -1 }).where(eq(prizes.id, prize.id))).rejects.toThrow();
});

test('only one round can be active in a session', async () => {
  const teacherId = randomUUID();
  const roundClassId = randomUUID();
  const sessionId = randomUUID();
  const firstRoundId = randomUUID();
  await db.insert(user).values({ id: teacherId, name: '老师', email: `${teacherId}@example.test` });
  await db.insert(classes).values({ id: roundClassId, name: '轮次班' });
  await db.insert(lotterySessions).values({ id: sessionId, classId: roundClassId, mode: 'prize_student', createdBy: teacherId });
  await db.insert(lotteryRounds).values({ id: firstRoundId, classId: roundClassId, sessionId, startToken: randomUUID(), startedBy: teacherId });
  await expect(db.insert(lotteryRounds).values({ classId: roundClassId, sessionId, startToken: randomUUID(), startedBy: teacherId })).rejects.toThrow();
  await db.update(lotteryRounds).set({ status: 'completed' }).where(eq(lotteryRounds.id, firstRoundId));
  await expect(db.insert(lotteryRounds).values({ classId: roundClassId, sessionId, startToken: randomUUID(), startedBy: teacherId })).resolves.toBeDefined();
});

test('session candidates cannot refer to another class student', async () => {
  const teacherId = randomUUID();
  const localClassId = randomUUID();
  const foreignClassId = randomUUID();
  const sessionId = randomUUID();
  await db.insert(user).values({ id: teacherId, name: '老师', email: `${teacherId}@example.test` });
  await db.insert(classes).values([{ id: localClassId, name: '本班' }, { id: foreignClassId, name: '外班' }]);
  const [foreignStudent] = await db.insert(students).values({ classId: foreignClassId, studentNumber: '001', name: '外班学生' }).returning();
  await db.insert(lotterySessions).values({ id: sessionId, classId: localClassId, mode: 'student_prize', createdBy: teacherId });
  await expect(db.insert(sessionStudents).values({ classId: localClassId, sessionId, studentId: foreignStudent.id })).rejects.toThrow();
});

test('a winning record must reference a round in its own session', async () => {
  const teacherId = randomUUID();
  const winClassId = randomUUID();
  const sessionA = randomUUID();
  const sessionB = randomUUID();
  const roundId = randomUUID();
  await db.insert(user).values({ id: teacherId, name: 'Teacher', email: `${teacherId}@example.test` });
  await db.insert(classes).values({ id: winClassId, name: 'Round class' });
  const [student] = await db.insert(students).values({ classId: winClassId, studentNumber: '001', name: 'Student' }).returning();
  const [prize] = await db.insert(prizes).values({ classId: winClassId, name: 'Prize', stock: 1 }).returning();
  await db.insert(lotterySessions).values([
    { id: sessionA, classId: winClassId, mode: 'student_prize', createdBy: teacherId },
    { id: sessionB, classId: winClassId, mode: 'student_prize', createdBy: teacherId },
  ]);
  await db.insert(lotteryRounds).values({ id: roundId, classId: winClassId, sessionId: sessionB, startToken: randomUUID(), startedBy: teacherId });
  const win = {
    classId: winClassId, roundId, studentId: student.id,
    studentNumberSnapshot: '001', studentNameSnapshot: 'Student', prizeId: prize.id,
    prizeNameSnapshot: 'Prize', actorId: teacherId,
  };
  await expect(db.insert(winningRecords).values({ ...win, sessionId: sessionA })).rejects.toThrow();
  await expect(db.insert(winningRecords).values({ ...win, sessionId: sessionB })).resolves.toBeDefined();
});

test('saved winner snapshots cannot be rewritten or deleted', async () => {
  const teacherId = randomUUID();
  const winnerClassId = randomUUID();
  const sessionId = randomUUID();
  const roundId = randomUUID();
  const winId = randomUUID();
  await db.insert(user).values({ id: teacherId, name: '老师', email: `${teacherId}@example.test` });
  await db.insert(classes).values({ id: winnerClassId, name: '中奖班' });
  const [student] = await db.insert(students).values({ classId: winnerClassId, studentNumber: '007', name: '甲' }).returning();
  const [prize] = await db.insert(prizes).values({ classId: winnerClassId, name: '奖品', stock: 1 }).returning();
  await db.insert(lotterySessions).values({ id: sessionId, classId: winnerClassId, mode: 'student_prize', createdBy: teacherId });
  await db.insert(lotteryRounds).values({ id: roundId, classId: winnerClassId, sessionId, startToken: randomUUID(), startedBy: teacherId });
  await db.insert(winningRecords).values({
    id: winId, classId: winnerClassId, sessionId, roundId, studentId: student.id,
    studentNumberSnapshot: '007', studentNameSnapshot: '甲', prizeId: prize.id,
    prizeNameSnapshot: '奖品', actorId: teacherId,
  });
  await expect(db.update(winningRecords).set({ studentNameSnapshot: '乙' }).where(eq(winningRecords.id, winId))).rejects.toThrow();
  await expect(db.delete(winningRecords).where(eq(winningRecords.id, winId))).rejects.toThrow();
  await expect(db.update(winningRecords).set({ redemptionStatus: 'redeemed', redeemedBy: teacherId, redeemedAt: new Date() }).where(eq(winningRecords.id, winId))).resolves.toBeDefined();
});
