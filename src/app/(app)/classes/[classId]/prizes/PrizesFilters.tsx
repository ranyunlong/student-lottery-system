'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../../components/ui/button';
import { Field } from '../../../../../components/ui/field';
import { Input } from '../../../../../components/ui/input';
import { Select } from '../../../../../components/ui/select';

type SortField = 'name' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export function PrizesFilters({ classId, search, sort, order }: {
  classId: string; search: string; sort: SortField; order: SortOrder;
}) {
  const [searchValue, setSearchValue] = useState(search);
  const [sortValue, setSortValue] = useState(sort);
  const [orderValue, setOrderValue] = useState(order);

  return <form action={`/classes/${classId}/prizes`} method="get" className="admin-filter-form flex flex-wrap items-end gap-3 text-sm sm:gap-4">
    <Field label="搜索奖品名称" className="min-w-[12rem] flex-[2]">
      <Input type="search" name="q" maxLength={100} value={searchValue} clearable
        onChange={(event) => setSearchValue(event.currentTarget.value)}
        onClear={() => setSearchValue('')} placeholder="请输入奖品名称搜索" />
    </Field>
    <Field label="排序方式" className="min-w-[10rem] flex-1">
      <Select name="sort" value={sortValue} onChange={(event) => setSortValue(event.currentTarget.value as SortField)}>
        <option value="createdAt">添加顺序</option>
        <option value="name">名称</option>
      </Select>
    </Field>
    <Field label="排序方向" className="min-w-[9rem] flex-1">
      <Select name="order" value={orderValue} onChange={(event) => setOrderValue(event.currentTarget.value as SortOrder)}>
        <option value="asc">升序</option>
        <option value="desc">降序</option>
      </Select>
    </Field>
    <Button type="submit" variant="brand"><Search aria-hidden="true" className="size-4" />查找</Button>
  </form>;
}
