'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { redeemWinAction } from '../../../../../features/redemptions/actions';
import type { ActionResult } from '../../../../../features/classes/actions';
import type { WinningRecord } from '../../../../../features/redemptions/service';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../../../../components/ui/dialog';
import { EmptyState } from '../../../../../components/ui/empty-state';
import { Field } from '../../../../../components/ui/field';
import { Input } from '../../../../../components/ui/input';
import { StatusMessage } from '../../../../../components/ui/status-message';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../../../../../components/ui/table';

type Status = 'pending' | 'redeemed';
const date = (value: Date) => value.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

function RedeemConfirmation({ classId, win }: { classId: string; win: WinningRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await redeemWinAction(data);
        setResult(response);
        if (response.ok) {
          setOpen(false);
          router.refresh();
        }
      } catch {
        setResult({ ok: false, message: '操作失败，请重试' });
      }
    });
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger className="min-h-10 px-3" onClick={() => setResult(null)}>标记已兑换</DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>确认兑换</DialogTitle>
        <DialogDescription>请确认已将以下奖品交给学生。标记后，该记录将移至已兑列表。</DialogDescription>
      </DialogHeader>
      <div className="rounded-md border border-workspace-line bg-workspace-surface-alt px-4 py-3 text-sm">
        <p className="font-medium text-workspace-ink">{win.studentNameSnapshot} · {win.studentNumberSnapshot}</p>
        <p className="mt-1 break-words text-workspace-muted">{win.prizeNameSnapshot}</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="winId" value={win.id} />
        {result && <StatusMessage role={result.ok ? 'status' : 'alert'} tone={result.ok ? 'success' : 'error'}>{result.message}</StatusMessage>}
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="secondary" disabled={pending}>取消</Button></DialogClose>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? '处理中…' : '确认'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function WinningsRecords({ classId, items, selected }: {
  classId: string; items: WinningRecord[]; selected: Status;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle || selected !== 'pending') return items;
    return items.filter((win) => win.studentNameSnapshot.toLocaleLowerCase().includes(needle)
      || win.studentNumberSnapshot.toLocaleLowerCase().includes(needle));
  }, [items, query, selected]);

  return <div className="space-y-3">
    {selected === 'pending' && <div className="grid gap-3 rounded-md border border-workspace-line bg-workspace-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
      <Field label="搜索学生姓名或学号" className="min-w-0 sm:max-w-md">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-workspace-muted" />
          <Input aria-label="搜索学生姓名或学号" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="输入姓名或学号" className="pl-9" />
        </div>
      </Field>
      {query && <Button type="button" variant="quiet" onClick={() => setQuery('')}>清空搜索</Button>}
      <p className="text-sm text-workspace-muted" aria-live="polite">显示 {filtered.length} / {items.length} 条</p>
    </div>}
    {filtered.length ? <div className="rounded-md border border-workspace-line bg-white">
      <Table className="min-w-[60rem]">
        <TableCaption className="sr-only">中奖记录</TableCaption>
        <TableHeader><TableRow><TableHead>学生</TableHead><TableHead>奖品</TableHead><TableHead>中奖时间</TableHead><TableHead>兑换状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
        <TableBody>{filtered.map((win) => <TableRow key={win.id}>
          <TableCell><span className="sr-only">学生</span><span className="break-words"><span className="font-mono">{win.studentNumberSnapshot}</span> · {win.studentNameSnapshot}</span></TableCell>
          <TableCell><span className="sr-only">奖品</span><span className="break-words">{win.prizeNameSnapshot}</span></TableCell>
          <TableCell><span className="sr-only">中奖时间</span><time className="whitespace-nowrap text-sm" dateTime={win.createdAt.toISOString()}>{date(win.createdAt)}</time></TableCell>
          <TableCell><span className="sr-only">兑换状态</span>
            <div className="space-y-1"><Badge tone={win.redeemedAt ? 'success' : 'warning'}>{win.redeemedAt ? '已兑换' : '待兑换'}</Badge>
              {win.redeemedAt && <p className="text-xs text-workspace-muted"><time dateTime={win.redeemedAt.toISOString()}>{date(win.redeemedAt)}</time> · 操作老师 {win.redeemedByName || '—'}</p>}
            </div>
          </TableCell>
          <TableCell><span className="sr-only">操作</span>
            {selected === 'pending' ? <RedeemConfirmation classId={classId} win={win} /> : <span className="text-sm text-workspace-muted">无</span>}
          </TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div> : <EmptyState title={items.length === 0
      ? selected === 'pending' ? '暂无待兑换记录。' : '暂无已兑换记录。'
      : '没有匹配的待兑换记录。'} />}
  </div>;
}
