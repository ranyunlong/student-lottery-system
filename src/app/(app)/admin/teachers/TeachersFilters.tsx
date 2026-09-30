'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { Field } from '../../../../components/ui/field';
import { Input } from '../../../../components/ui/input';
import { Select } from '../../../../components/ui/select';

export function TeachersFilters({ search: initialSearch, status: initialStatus }: {
  search: string; status: 'all' | 'active' | 'disabled';
}) {
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);

  return <form action="/admin/teachers" method="get" className="admin-filter-form flex flex-wrap items-end gap-3 text-sm sm:gap-4">
    <Field label="搜索姓名或邮箱" className="min-w-[14rem] flex-[2]"><Input type="search" name="q" maxLength={100} value={search}
      onChange={(event) => { setSearch(event.currentTarget.value); if (!event.currentTarget.value) setStatus('all'); }} onClear={() => { setSearch(''); setStatus('all'); }} clearable placeholder="输入老师名称或邮箱搜索" /></Field>
    <Field label="账号状态" className="min-w-[11rem] flex-1"><Select name="status" value={status} onChange={(event) => setStatus(event.currentTarget.value as typeof status)}>
      <option value="all">全部账号</option><option value="active">启用中</option><option value="disabled">已停用</option>
    </Select></Field>
    <Button type="submit" variant="brand"><Search aria-hidden="true" className="size-4" />查找</Button>

  </form>;
}
