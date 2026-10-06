import { expect, test, vi } from 'vitest';

const roster = vi.hoisted(() => ([
  { id: 1, classId: 'class-id', studentNumber: '10', name: '十号', gender: null, archived: false, createdAt: new Date() },
  { id: 2, classId: 'class-id', studentNumber: '2', name: '二号', gender: null, archived: false, createdAt: new Date() },
  { id: 3, classId: 'class-id', studentNumber: '001', name: '一号', gender: null, archived: false, createdAt: new Date() },
  { id: 4, classId: 'class-id', studentNumber: 'A10', name: '字母十号', gender: null, archived: false, createdAt: new Date() },
  { id: 5, classId: 'class-id', studentNumber: 'A2', name: '字母二号', gender: null, archived: false, createdAt: new Date() },
]));

vi.mock('../../db/client', () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          orderBy: async () => roster,
        }),
      }),
    })),
  },
}));
vi.mock('../../lib/access', () => ({ requireClassAccess: vi.fn(async () => 'teacher-id') }));

const { listStudents } = await import('./service');

test('lists students by student number in natural ascending order', async () => {
  expect((await listStudents('class-id')).map((student) => student.studentNumber))
    .toEqual(['001', '2', '10', 'A2', 'A10']);
});
