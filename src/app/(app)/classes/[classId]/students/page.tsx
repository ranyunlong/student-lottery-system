import { eq } from 'drizzle-orm';
import { StudentImport } from '../../../../../components/student-import';
import { ClassWorkspaceNav } from '../../../../../components/class-workspace-nav';
import { Badge } from '../../../../../components/ui/badge';
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
  return <section className="route-enter min-w-0 space-y-6">
    <ClassWorkspaceNav classId={classId} active="students" />
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="min-w-0 break-words text-xl font-semibold text-workspace-ink">{target?.name} · 学生</h1>
      <Badge tone="accent">{roster.length} 人</Badge>
    </header>
    <StudentImport classId={classId} students={roster} />
  </section>;
}
