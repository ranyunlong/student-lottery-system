export type ModeOneConfig = { mode: 'student-prize'; studentIds: number[]; prizes: { prizeId: string; quantity: number }[]; perStudentLimit: number };
export type ModeTwoConfig = { mode: 'prize-student'; studentIds: number[]; prizeId: string; roundCount: number };
export type SessionConfig = ModeOneConfig | ModeTwoConfig;
export type DrawResult = { winId: string; studentId: number; studentName: string; prizeId: string; prizeName: string };
export type SessionView = SessionConfig & { id: string; classId: string; status: 'draft' | 'active' | 'completed'; createdAt: Date; startedAt: Date | null; completedAt: Date | null };
