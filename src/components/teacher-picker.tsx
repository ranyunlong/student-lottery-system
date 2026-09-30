'use client';

import { useEffect, useRef, useState } from 'react';
import { searchAssignableTeachersAction, searchPrimaryTeacherCandidatesAction } from '../features/classes/actions';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Field } from './ui/field';
import { StatusMessage } from './ui/status-message';

type Choice = { id: string; name: string; email: string };

export function TeacherPicker({ classId, mode = 'teaching' }: {
  classId: string; mode?: 'primary' | 'teaching';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reset = () => { setSearch(''); setChoices([]); setBusy(false); setError(false); };
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, []);

  useEffect(() => {
    const term = search.trim();
    if (!term) return;
    let current = true;
    const timeout = setTimeout(async () => {
      try {
        const found = mode === 'primary'
          ? await searchPrimaryTeacherCandidatesAction(classId, term)
          : await searchAssignableTeachersAction(classId, term);
        if (current) { setChoices(found); setError(false); setBusy(false); }
      } catch {
        if (current) { setChoices([]); setError(true); setBusy(false); }
      }
    }, 250);
    return () => { current = false; clearTimeout(timeout); };
  }, [classId, mode, search]);

  function change(value: string) {
    setSearch(value);
    setChoices([]);
    setError(false);
    setBusy(Boolean(value.trim()));
  }

  return <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
    <Field label="搜索老师" className="min-w-[10rem] flex-1">
      <Input ref={inputRef} type="search" value={search} onChange={(event) => change(event.target.value)} maxLength={100} placeholder="姓名或邮箱开头" aria-busy={busy} />
    </Field>
    <Field label="选择老师" className="min-w-[12rem] flex-1">
      <Select name="teacherId" required defaultValue="" key={search}>
        <option value="">{busy ? '搜索中…' : choices.length ? '请选择' : '暂无候选老师'}</option>
        {choices.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.email})</option>)}
      </Select>
    </Field>
    {error && <StatusMessage role="alert" tone="error" className="w-full">搜索失败，请重试。</StatusMessage>}
  </div>;
}
