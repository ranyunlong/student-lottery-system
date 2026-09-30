'use client';

import { useState } from 'react';
import { History } from 'lucide-react';
import type { StockEvent } from '../features/prizes/service';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const PAGE_SIZE = 10;

export function StockHistoryDialog({ prizeName, events }: { prizeName: string; events: StockEvent[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const shown = events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return <Dialog onOpenChange={(open) => { if (!open) setPage(0); }}>
    <DialogTrigger asChild><Button type="button" variant="ghost" icon={<History aria-hidden="true" className="size-4" />}>
      查看流水（{events.length}）
    </Button></DialogTrigger>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader><DialogTitle>{prizeName} · 库存流水</DialogTitle>
        <DialogDescription>共 {events.length} 条库存变动记录</DialogDescription></DialogHeader>
      {events.length ? <Table className="min-w-[36rem]">
        <TableCaption className="sr-only">{prizeName}库存流水</TableCaption>
        <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>变动</TableHead><TableHead>原因</TableHead><TableHead>操作人</TableHead></TableRow></TableHeader>
        <TableBody>{shown.map((event, index) => <TableRow key={`${page}-${index}`}>
          <TableCell><time dateTime={new Date(event.createdAt).toISOString()}>{new Date(event.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time></TableCell>
          <TableCell className="tabular-nums font-semibold">{event.delta > 0 ? '+' : ''}{event.delta}</TableCell>
          <TableCell className="max-w-56 break-words">{event.reason}</TableCell><TableCell>{event.actorName}</TableCell>
        </TableRow>)}</TableBody>
      </Table> : <p className="py-8 text-center text-sm text-workspace-muted">暂无库存流水</p>}
      <DialogFooter className="items-center">
        <span className="mr-auto text-sm text-workspace-muted">第 {page + 1} / {pages} 页</span>
        <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>上一页</Button>
        <Button type="button" variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>下一页</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
