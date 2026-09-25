import { ActionForm } from '../../../../components/action-form';
import { archiveClassAction, assignTeacherAction, createClassAction, removeTeacherAction, updateClassAction } from '../../../../features/classes/actions';
import { listAdminAudit, listClasses, listTeachers } from '../../../../features/classes/service';
import { requireAdminPage } from '../../../../lib/workspace-guard';

const actionLabels: Record<string, string> = {
  'teacher.create': '创建老师', 'teacher.update': '修改老师', 'teacher.disable': '停用老师',
  'teacher.password.reset': '重置密码', 'class.create': '创建班级', 'class.update': '修改班级',
  'class.archive': '归档班级', 'class.teacher.assign': '分配老师', 'class.teacher.remove': '移除老师',
};

export default async function ClassesPage() {
  await requireAdminPage();
  const [rows, teachers, audit] = await Promise.all([listClasses(), listTeachers(), listAdminAudit()]);
  const grouped = new Map<string, { name: string; archived: boolean; members: { id: string; name: string }[] }>();
  for (const row of rows) {
    if (!grouped.has(row.id)) grouped.set(row.id, { name: row.name, archived: row.archived, members: [] });
    if (row.teacherId) grouped.get(row.id)!.members.push({ id: row.teacherId, name: row.teacherName ?? '未知老师' });
  }
  const activeTeachers = teachers.filter((teacher) => !teacher.banned);
  const input = 'min-h-10 rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-700 focus:outline-none';
  return <section className="space-y-7">
    <div className="border-b border-slate-200 pb-4"><h1 className="text-2xl font-semibold">班级管理</h1></div>
    <section className="space-y-4 border-b border-slate-200 pb-7">
      <h2 className="text-lg font-semibold">创建班级</h2>
      <ActionForm action={createClassAction} label="创建班级">
        <label className="flex flex-col gap-1 text-sm font-medium">班级名称<input className={input} name="name" required /></label>
      </ActionForm>
    </section>
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">全部班级</h2>
      {grouped.size ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
        {[...grouped].map(([id, item]) => <li key={id} className="space-y-4 px-4 py-5">
          <div className="flex items-center gap-3"><h3 className="font-semibold">{item.name}</h3>
            {item.archived && <span className="text-xs text-slate-500">已归档</span>}</div>
          {!item.archived && <ActionForm action={updateClassAction} label="保存名称">
            <input type="hidden" name="classId" value={id} />
            <label className="flex flex-col gap-1 text-sm font-medium">班级名称
              <input className={input} name="name" defaultValue={item.name} required />
            </label>
          </ActionForm>}
          <div className="space-y-2">
            <p className="text-sm text-slate-600">负责老师</p>
            {item.members.length ? <ul className="flex flex-wrap gap-3">
              {item.members.map((member) => <li key={member.id} className="flex items-center gap-2 text-sm">
                <span>{member.name}</span>
                {!item.archived && <ActionForm action={removeTeacherAction} label="移除" confirm={`确定移除${member.name}的班级分配？`}>
                  <input type="hidden" name="classId" value={id} /><input type="hidden" name="teacherId" value={member.id} />
                </ActionForm>}
              </li>)}
            </ul> : <p className="text-sm text-slate-500">尚未分配老师</p>}
          </div>
          {!item.archived && <div className="flex flex-wrap items-end gap-5">
            <ActionForm action={assignTeacherAction} label="分配老师">
              <input type="hidden" name="classId" value={id} />
              <label className="flex flex-col gap-1 text-sm font-medium">选择老师
                <select name="teacherId" required defaultValue="" className={input}>
                  <option value="" disabled>请选择</option>
                  {activeTeachers.filter((teacher) => !item.members.some((member) => member.id === teacher.id))
                    .map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.email})</option>)}
                </select>
              </label>
            </ActionForm>
            <ActionForm action={archiveClassAction} label="归档班级" confirm={`确定归档${item.name}？`}>
              <input type="hidden" name="classId" value={id} />
            </ActionForm>
          </div>}
        </li>)}
      </ul> : <p className="text-sm text-slate-600">暂无班级。</p>}
    </section>
    <section className="space-y-4 border-t border-slate-200 pt-6">
      <h2 className="text-lg font-semibold">最近管理记录</h2>
      {audit.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white text-sm">
        {audit.map((event) => <li key={event.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
          <time dateTime={event.createdAt.toISOString()} className="text-slate-500">{event.createdAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time>
          <span className="font-medium">{actionLabels[event.action] ?? event.action}</span>
          <span className="break-all text-slate-500">操作人 {event.actorId}</span>
          {(event.classId || event.targetUserId) && <span className="break-all text-slate-500">对象 {event.classId ?? event.targetUserId}</span>}
        </li>)}
      </ul> : <p className="text-sm text-slate-600">暂无管理记录。</p>}
    </section>
  </section>;
}
