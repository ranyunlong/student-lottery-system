import { eq } from 'drizzle-orm';
import { Plus } from 'lucide-react';
import { ClassWorkspaceNav } from '../../../../../components/class-workspace-nav';
import { ActionForm } from '../../../../../components/action-form';
import { CreateDialog } from '../../../../../components/create-dialog';
import { PrizeImportDialog } from '../../../../../components/prize-import-dialog';
import { PrizeArchiveDialog } from '../../../../../components/prize-archive-dialog';
import { StockHistoryDialog } from '../../../../../components/stock-history-dialog';
import { Badge } from '../../../../../components/ui/badge';
import { EmptyState } from '../../../../../components/ui/empty-state';
import { Field } from '../../../../../components/ui/field';
import { Input } from '../../../../../components/ui/input';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../../../../../components/ui/table';
import { db } from '../../../../../db/client';
import { classes } from '../../../../../db/schema';
import { createPrizeAction } from '../../../../../features/prizes/actions';
import { listPrizes, listStockEvents } from '../../../../../features/prizes/service';
import { requireClassAccess } from '../../../../../lib/access';
import { StockAdjustmentDialog } from './stock-adjustment-dialog';

export default async function PrizesPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  await requireClassAccess(classId);
  const [items, [target]] = await Promise.all([
    listPrizes(classId), db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1),
  ]);
  const histories = await Promise.all(items.map((item) => listStockEvents(item.id)));

  return <section className="route-enter min-w-0 space-y-5">
    <ClassWorkspaceNav classId={classId} active="prizes" />
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="min-w-0 break-words text-xl font-semibold text-workspace-ink">{target?.name} · 奖品与库存</h1>
      <Badge tone="accent">{items.length} 个奖品</Badge>
    </header>
    <section aria-label="奖品操作" className="flex flex-wrap justify-end gap-2">
      <PrizeImportDialog classId={classId} />
      <CreateDialog title="创建奖品" trigger="创建奖品" triggerIcon={<Plus aria-hidden="true" className="size-4" />} successMessage="奖品已创建">
        <ActionForm action={createPrizeAction} label="创建奖品">
          <input type="hidden" name="classId" value={classId} />
          <Field label="奖品名称" className="w-full"><Input name="name" required maxLength={200} /></Field>
          <Field label="初始库存" className="w-full"><Input name="openingStock" type="number" min="0" max="2147483647" step="1" required /></Field>
        </ActionForm>
      </CreateDialog>
    </section>
    <section aria-label="奖品库存">
      {items.length ? <div className="rounded-md border border-workspace-line bg-white">
        <Table className="min-w-[56rem]">
          <TableCaption className="sr-only">奖品库存</TableCaption>
          <TableHeader><TableRow className="bg-workspace-surface-alt"><TableHead>奖品</TableHead><TableHead>库存</TableHead><TableHead>库存调整</TableHead><TableHead>库存流水</TableHead></TableRow></TableHeader>
          <TableBody>{items.map((item, index) => <TableRow key={item.id}>
            <TableCell className="min-w-[12rem] break-words font-semibold">{item.name}</TableCell>
            <TableCell className="w-28"><span className="flex flex-wrap items-center gap-2"><Badge tone={item.stock > 0 ? 'success' : 'warning'}>库存 {item.stock}</Badge>{item.archived && <Badge>已归档</Badge>}</span></TableCell>
            <TableCell className="min-w-[12rem]">
              {!item.archived ? <div className="flex min-w-0 flex-wrap items-end gap-3">
                <StockAdjustmentDialog classId={classId} prizeId={item.id} prizeName={item.name} stock={item.stock} />
                <PrizeArchiveDialog classId={classId} prizeId={item.id} prizeName={item.name} />
              </div> : <span>已归档</span>}
            </TableCell>
            <TableCell className="min-w-[16rem]"><StockHistoryDialog prizeName={item.name} events={histories[index]} /></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div> : <EmptyState title="暂无奖品。" />}
    </section>
  </section>;
}
