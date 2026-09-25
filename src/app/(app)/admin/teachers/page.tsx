import { randomUUID } from 'node:crypto';
import { ActionForm } from '../../../../components/action-form';
import { createTeacherAction, disableTeacherAction, resetTeacherPasswordAction, updateTeacherAction } from '../../../../features/classes/actions';
import { listTeachers } from '../../../../features/classes/service';
import { requireAdminPage } from '../../../../lib/workspace-guard';

const field = 'block min-w-0 rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-700 focus:outline-none';
const label = 'flex min-w-[10rem] flex-1 flex-col gap-1 text-sm font-medium text-slate-700';

export default async function TeachersPage() {
  await requireAdminPage();
  const teachers = await listTeachers();
  return <section className="space-y-7">
    <div className="border-b border-slate-200 pb-4"><h1 className="text-2xl font-semibold">老师账号</h1></div>
    <section className="space-y-4 border-b border-slate-200 pb-7">
      <h2 className="text-lg font-semibold">创建老师</h2>
      <ActionForm action={createTeacherAction} label="创建账号" requestId={randomUUID()}>
        <label className={label}>姓名<input className={field} name="name" required /></label>
        <label className={label}>邮箱<input className={field} name="email" type="email" required /></label>
        <label className={label}>临时密码<input className={field} name="temporaryPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
      </ActionForm>
    </section>
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">账号列表</h2>
      {teachers.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
        {teachers.map((teacher) => <li key={teacher.id} className="space-y-4 px-4 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{teacher.name}</strong><span className="break-all text-sm text-slate-500">{teacher.email}</span>
            <span className={`text-xs ${teacher.banned ? 'text-red-700' : 'text-teal-800'}`}>{teacher.banned ? '已停用' : '启用中'}</span>
          </div>
          <ActionForm action={updateTeacherAction} label="保存资料">
            <input type="hidden" name="teacherId" value={teacher.id} />
            <label className={label}>姓名<input className={field} name="name" defaultValue={teacher.name} required /></label>
            <label className={label}>邮箱<input className={field} name="email" type="email" defaultValue={teacher.email} required /></label>
          </ActionForm>
          <div className="flex flex-wrap gap-6">
            <ActionForm action={resetTeacherPasswordAction} label="重置密码" confirm="确定重置这位老师的密码？" requestId={randomUUID()}>
              <input type="hidden" name="teacherId" value={teacher.id} />
              <label className={label}>新临时密码<input className={field} name="temporaryPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
            </ActionForm>
            {!teacher.banned && <ActionForm action={disableTeacherAction} label="停用账号" confirm="确定停用这位老师的账号？" requestId={randomUUID()}>
              <input type="hidden" name="teacherId" value={teacher.id} />
            </ActionForm>}
          </div>
        </li>)}
      </ul> : <p className="text-sm text-slate-600">暂无老师账号。</p>}
    </section>
  </section>;
}
