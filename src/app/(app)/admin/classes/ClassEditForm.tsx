'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Star, X } from 'lucide-react';
import { searchPrimaryTeacherCandidatesAction, updateClassAction } from '../../../../features/classes/actions';
import type { ClassPageItem, TeacherSearchItem } from '../../../../features/classes/service';
import { useDialogActionResult } from '../../../../components/create-dialog';
import { DialogClose } from '../../../../components/ui/dialog';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Field } from '../../../../components/ui/field';
import { Input } from '../../../../components/ui/input';
import { StatusMessage } from '../../../../components/ui/status-message';

type Member = ClassPageItem['members'][number];

export function ClassEditForm({ classId, name: initialName, emblemPath, members: initialMembers }: {
  classId: string; name: string; emblemPath: string | null; members: Member[];
}) {
  const router = useRouter();
  const reportDialogResult = useDialogActionResult();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<TeacherSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'warning'; message: string } | null>(null);
  const primaryId = members.find((member) => member.role === 'primary')?.id ?? '';
  const teachingIds = members.filter((member) => member.role === 'teaching').map((member) => member.id);

  useEffect(() => {
    const term = search.trim();
    if (!term) return;
    let current = true;
    const timeout = window.setTimeout(async () => {
      try {
        const result = await searchPrimaryTeacherCandidatesAction(classId, term);
        if (current) { setCandidates(result); setSearching(false); }
      } catch {
        if (current) { setCandidates([]); setSearching(false); }
      }
    }, 250);
    return () => { current = false; window.clearTimeout(timeout); };
  }, [classId, search]);

  function setPrimary(teacher: { id: string; name: string }) {
    setMembers((current) => {
      const existing = current.find((member) => member.id === teacher.id);
      return [
        ...current.filter((member) => member.id !== teacher.id).map((member) =>
          member.role === 'primary' ? { ...member, role: 'teaching' as const } : member),
        { id: teacher.id, name: existing?.name ?? teacher.name, role: 'primary' },
      ];
    });
  }

  function addTeaching(teacher: { id: string; name: string }) {
    setMembers((current) => current.some((member) => member.id === teacher.id)
      ? current : [...current, { id: teacher.id, name: teacher.name, role: 'teaching' }]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem('emblemFile');
    const selectedFile = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : undefined;
    const emblemFile = selectedFile?.size ? selectedFile : null;
    const data = new FormData(form);
    data.delete('emblemFile');
    setFeedback(null);

    startTransition(async () => {
      let emblemUploaded = false;
      try {
        if (emblemFile) {
          const upload = new FormData();
          upload.set('file', emblemFile);
          const response = await fetch(`/api/classes/${classId}/emblem`, { method: 'POST', body: upload });
          if (!response.ok) {
            const detail = (await response.text()).trim();
            setFeedback({ tone: 'error', message: `班级资料及教师配置尚未保存。班徽更新失败：${detail || '请检查文件后重试。'}` });
            return;
          }
          emblemUploaded = true;
        }

        const result = await updateClassAction(data);
        if (!result.ok) {
          if (emblemUploaded) {
            setFeedback({ tone: 'warning', message: `班徽已更新，但班级资料和教师分配未保存：${result.message}` });
            router.refresh();
          } else {
            setFeedback({ tone: 'error', message: result.message });
          }
          reportDialogResult?.(result);
          return;
        }

        reportDialogResult?.(result);
        router.refresh();
      } catch {
        setFeedback({ tone: emblemUploaded ? 'warning' : 'error', message: emblemUploaded
          ? '班徽已更新，但资料保存结果未能确认。请刷新后核对班级和老师配置。'
          : '班级资料及教师配置未保存；上传结果未能确认，请刷新核对后重试。' });
        if (emblemUploaded) router.refresh();
      }
    });
  }

  return <form onSubmit={submit} className="space-y-5">
    <input type="hidden" name="classId" value={classId} />
    <input type="hidden" name="primaryTeacherId" value={primaryId} />
    {teachingIds.map((id) => <input key={id} type="hidden" name="teachingTeacherIds" value={id} />)}

    <section aria-labelledby={`class-details-${classId}`} className="space-y-4">
      <h3 id={`class-details-${classId}`} className="border-b border-workspace-line pb-2 text-sm font-semibold text-workspace-ink">班级资料</h3>
      <Field label="班级名称" required><Input name="name" defaultValue={initialName} required autoFocus clearable /></Field>
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        {emblemPath ? <Image unoptimized width={64} height={64} alt="当前班徽" src={`/api/classes/${classId}/emblem?v=${encodeURIComponent(emblemPath)}`}
          className="size-16 rounded-md border border-workspace-line bg-workspace-surface object-contain" />
          : <div aria-label="尚未设置班徽" className="flex size-16 items-center justify-center rounded-md border border-dashed border-workspace-line bg-workspace-surface-alt text-xl font-semibold text-workspace-muted">班</div>}
        <Field label="班徽" description="可选，PNG、JPEG 或 WebP，最大 2 MiB。上传成功后才提交其他班级设置。">
          <Input type="file" name="emblemFile" accept="image/png,image/jpeg,image/webp" disabled={pending} />
        </Field>
      </div>
    </section>

    <section aria-labelledby={`class-roster-${classId}`} className="space-y-4 border-t border-workspace-line pt-4">
      <div><h3 id={`class-roster-${classId}`} className="text-sm font-semibold text-workspace-ink">老师配置</h3>
        <p className="mt-1 text-xs text-workspace-muted">修改将在点击保存时与班级资料一并提交。</p></div>
      <Field label="搜索老师" description="按姓名或邮箱开头搜索启用中的老师。">
        <Input type="search" value={search} maxLength={100} disabled={pending} clearable
          onClear={() => { setSearch(''); setCandidates([]); setSearching(false); }}
          onChange={(event) => { setSearch(event.currentTarget.value); setCandidates([]); setSearching(Boolean(event.currentTarget.value.trim())); }}
          placeholder="姓名或邮箱" />
      </Field>
      {search.trim() && <div className="overflow-hidden rounded-md border border-workspace-line bg-workspace-surface-alt" aria-live="polite">
        {searching ? <p className="px-3 py-2 text-sm text-workspace-muted">正在搜索老师…</p>
          : candidates.length ? <ul className="divide-y divide-workspace-line">{candidates.map((teacher) => {
            const selected = members.some((member) => member.id === teacher.id);
            return <li key={teacher.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0"><strong className="block break-words text-sm font-medium text-workspace-ink">{teacher.name}</strong>
                <span className="break-all text-xs text-workspace-muted">{teacher.email}</span></span>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="quiet" disabled={pending || (selected && primaryId === teacher.id)}
                  onClick={() => setPrimary(teacher)}><Star aria-hidden="true" className="size-4" />设为班主任</Button>
                <Button type="button" size="sm" variant="quiet" disabled={pending || selected}
                  onClick={() => addTeaching(teacher)}>分配任课</Button>
              </div>
            </li>;
          })}</ul> : <p className="px-3 py-2 text-sm text-workspace-muted">没有匹配的启用老师。</p>}
      </div>}
      <ul className="divide-y divide-workspace-line border-y border-workspace-line">
        {members.length ? members.map((member) => <li key={member.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2.5">
          <span className="min-w-0 break-words text-sm font-medium text-workspace-ink">{member.name}
            <Badge className="ml-2 align-middle" tone={member.role === 'primary' ? 'accent' : 'neutral'}>{member.role === 'primary' ? '班主任' : '任课老师'}</Badge></span>
          <div className="flex gap-1">
            {member.role !== 'primary' && <Button type="button" size="sm" variant="quiet" disabled={pending}
              aria-label={`设为班主任：${member.name}`} onClick={() => setPrimary(member)}><Star aria-hidden="true" className="size-4" />设为班主任</Button>}
            <Button type="button" size="icon" variant="quiet" disabled={pending} aria-label={`移除${member.name}`}
              title={`移除${member.name}`} onClick={() => setMembers((current) => current.filter((entry) => entry.id !== member.id))}>
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </li>) : <li className="py-3 text-sm text-workspace-muted">尚未分配老师。</li>}
      </ul>
    </section>

    {feedback && <StatusMessage role="alert" tone={feedback.tone}>{feedback.message}</StatusMessage>}
    <div className="flex flex-wrap justify-end gap-2 border-t border-workspace-line pt-4">
      <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>取消</Button></DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? '正在保存…' : '确认'}
      </Button>
    </div>
  </form>;
}
