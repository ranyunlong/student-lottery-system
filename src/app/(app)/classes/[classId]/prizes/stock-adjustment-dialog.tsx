'use client';

import { ActionForm } from '../../../../../components/action-form';
import { CreateDialog } from '../../../../../components/create-dialog';
import { Field } from '../../../../../components/ui/field';
import { Input } from '../../../../../components/ui/input';
import { adjustStockAction } from '../../../../../features/prizes/actions';

export function StockAdjustmentDialog({ classId, prizeId, prizeName, stock }: {
  classId: string;
  prizeId: string;
  prizeName: string;
  stock: number;
}) {
  return <CreateDialog
    title={`调整库存：${prizeName}`}
    trigger="调整库存"
    successMessage="库存已调整"
    variant="quiet"
  >
    <div className="space-y-5">
      <p className="text-sm leading-6 text-workspace-muted">为「{prizeName}」登记一笔库存变动。</p>
      <div className="flex items-center justify-between gap-4 rounded-md border border-workspace-line bg-workspace-surface-alt px-4 py-3">
        <span className="text-sm font-medium text-workspace-muted">当前库存</span>
        <span className="tabular-nums text-2xl font-semibold text-workspace-ink">{stock}<span className="ml-1 text-sm font-normal">件</span></span>
      </div>
      <ActionForm action={adjustStockAction} label="确认调整">
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="prizeId" value={prizeId} />
        <Field label="增减数量" description="正数为补充库存，负数为扣减库存。" className="w-full">
          <Input name="delta" type="number" step="1" min="-2147483647" max="2147483647" required placeholder="例如 -1 或 5" />
        </Field>
        <Field label="原因" className="w-full">
          <Input name="reason" required maxLength={500} placeholder="填写本次库存变动的原因" />
        </Field>
      </ActionForm>
    </div>
  </CreateDialog>;
}
