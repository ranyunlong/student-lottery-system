export type ModeOneConfig = { mode: 'student-prize'; title?: string | null; studentIds: number[]; prizes: { prizeId: string; quantity: number }[]; perStudentLimit: number };
export type ModeTwoConfig = { mode: 'prize-student'; title?: string | null; studentIds: number[]; prizeId: string; roundCount: number };
export type SessionConfig = ModeOneConfig | ModeTwoConfig;
export type DrawResult = { winId: string; studentId: number; studentName: string; prizeId: string; prizeName: string };
export type SessionView = SessionConfig & { title: string | null; id: string; classId: string; status: 'draft' | 'active' | 'completed'; createdAt: Date; startedAt: Date | null; completedAt: Date | null };
