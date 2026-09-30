'use client';

import type { ReactNode } from 'react';
import { TableCell, TableRow } from './ui/table';

export function AdminTableRow({ cells, actions, label, fieldLabels = ['姓名', '邮箱', '状态', '创建时间'] }: {
  cells: readonly [ReactNode, ReactNode, ReactNode, ReactNode]; actions: ReactNode; label: string;
  fieldLabels?: readonly [string, string, string, string];
}) {
  return <TableRow aria-label={label} className="bg-workspace-surface align-middle max-[1024px]:block max-[1024px]:w-full">
    {cells.map((cell, index) => <TableCell key={index} className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2 px-4 py-3 text-sm text-workspace-ink max-[1024px]:py-2 min-[1025px]:table-cell min-[1025px]:align-middle">
      <span aria-hidden="true" className="font-medium text-workspace-muted max-[1024px]:block min-[1025px]:hidden">{fieldLabels[index]}</span><span className="min-w-0">{cell}</span>
    </TableCell>)}
    <TableCell className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 px-4 py-2 text-right text-workspace-ink max-[1024px]:text-left min-[1025px]:table-cell min-[1025px]:align-middle"><span aria-hidden="true" className="font-medium text-workspace-muted max-[1024px]:block min-[1025px]:hidden">操作</span><span className="min-w-0">{actions}</span></TableCell>
  </TableRow>;
}
