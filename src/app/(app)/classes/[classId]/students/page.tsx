import { eq } from 'drizzle-orm';
import { StudentImport } from '../../../../../components/student-import';
import { db } from '../../../../../db/client';
import { classes } from '../../../../../db/schema';
import { listStudents } from '../../../../../features/students/service';
import { requireClassAccess } from '../../../../../lib/access';

export default async function StudentsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  await requireClassAccess(classId);
  const [roster, [target]] = await Promise.all([
    listStudents(classId), db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1),
  ]);
  return <section className="min-w-0 space-y-6">
    <div className="border-b border-slate-200 pb-4"><h1 className="break-words text-2xl font-semibold">{target?.name} · 学生</h1></div>
    <StudentImport classId={classId} students={roster} />
  </section>;
}
