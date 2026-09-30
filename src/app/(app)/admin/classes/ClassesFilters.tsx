'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { Field } from '../../../../components/ui/field';
import { Input } from '../../../../components/ui/input';
import { Select } from '../../../../components/ui/select';

export function ClassesFilters({ search: initialSearch, status: initialStatus }: {
  search: string; status: 'all' | 'active' | 'archived';
}) {
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);

  return <form action="/admin/classes" method="get" className="admin-filter-form flex flex-wrap items-end gap-3 text-sm sm:gap-4">
    <Field label="搜索班级名称" className="min-w-[12rem] flex-[2]">
      <Input aria-label="搜索班级名称" type="search" name="q" maxLength={100} value={search} clearable
        onClear={() => { setSearch(''); setStatus('all'); }}
        onChange={(event) => { setSearch(event.currentTarget.value); if (!event.currentTarget.value) setStatus('all'); }} placeholder="请输入班级名称搜索" />
    </Field>
    <Field label="班级状态" className="min-w-[9rem] flex-1"><Select name="status" value={status} onChange={(event) => setStatus(event.currentTarget.value as typeof status)}>
      <option value="all">全部班级</option><option value="active">使用中</option><option value="archived">已归档</option>
    </Select></Field>
    <Button type="submit" variant="brand"><Search aria-hidden="true" className="size-4" />查找</Button>
  </form>;
}
