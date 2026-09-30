'use client';

import { useState } from 'react';
import { Archive } from 'lucide-react';
import { archivePrizeAction } from '../features/prizes/actions';
import { ActionForm } from './action-form';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

export function PrizeArchiveDialog({ classId, prizeId, prizeName }: { classId: string; prizeId: string; prizeName: string }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="destructive" size="sm" icon={<Archive aria-hidden="true" className="size-4" />}>归档</Button></DialogTrigger>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>归档奖品：{prizeName}</DialogTitle></DialogHeader>
      <DialogDescription>归档后，该奖品将不再用于新抽奖。历史库存流水和中奖记录仍会保留。</DialogDescription>
      <ActionForm action={archivePrizeAction} label="确认" variant="destructive" cancelLabel="取消"
        onResult={(result) => { if (result.ok) setOpen(false); }}>
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="prizeId" value={prizeId} />
      </ActionForm>
    </DialogContent>
  </Dialog>;
}
