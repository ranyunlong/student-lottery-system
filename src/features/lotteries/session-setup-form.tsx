'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle, Save } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { StatusMessage } from '../../components/ui/status-message';
import { activateSessionAction, saveSessionAction } from './actions';

export function SessionSetupForm({ classId, mode, sessionId, children }: {
  classId: string;
  mode: 'student-prize' | 'prize-student';
  sessionId?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [createdSessionId, setCreatedSessionId] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    const studentCount = data.getAll('studentIds').length;
    if (studentCount === 0) { setError('请至少选择一名学生'); return; }

    if (mode === 'student-prize') {
      const prizeIds = data.getAll('prizeIds').map(String);
      if (prizeIds.length === 0) { setError('请至少选择一个奖品'); return; }
      let quantityTotal = 0;
      for (const prizeId of prizeIds) {
        const quantityRaw = data.get(`quantity:${prizeId}`);
        const stockRaw = data.get(`stock:${prizeId}`);
        const quantity = typeof quantityRaw === 'string' && /^\d+$/.test(quantityRaw) ? Number(quantityRaw) : NaN;
        const stock = typeof stockRaw === 'string' && /^\d+$/.test(stockRaw) ? Number(stockRaw) : NaN;
        if (!Number.isSafeInteger(quantity) || quantity < 1) { setError('请为每个奖品填写有效数量'); return; }
        if (!Number.isSafeInteger(stock) || quantity > stock) { setError('奖品配置数量不能超过可用库存，请调整后重试'); return; }
        quantityTotal += quantity;
      }
      if (!Number.isSafeInteger(quantityTotal) || quantityTotal <= studentCount) {
        setError('奖品数量总和必须大于已选学生人数');
        return;
      }
    } else {
      const roundRaw = data.get('roundCount');
      const stockRaw = data.get('prizeStock');
      const rounds = typeof roundRaw === 'string' && /^\d+$/.test(roundRaw) ? Number(roundRaw) : NaN;
      const stock = typeof stockRaw === 'string' && /^\d+$/.test(stockRaw) ? Number(stockRaw) : NaN;
      if (!Number.isSafeInteger(rounds) || rounds < 1) { setError('抽取轮数必须是正整数'); return; }
      if (!Number.isSafeInteger(stock) || rounds > stock) { setError('抽取轮数不能超过所选奖品的可用库存'); return; }
    }
    startTransition(async () => {
      try {
        if (sessionId) {
          const saved = await saveSessionAction(data);
          if (!saved.ok) { setError(saved.message); return; }
          router.push(`/classes/${classId}/lotteries`);
          return;
        }

        let targetId = createdSessionId;
        if (!targetId) {
          const saved = await saveSessionAction(data);
          if (!saved.ok) { setError(saved.message); return; }
          if (!saved.sessionId) { setError('场次已保存，但未能读取场次编号，请返回场次列表重试。'); return; }
          targetId = saved.sessionId;
          setCreatedSessionId(targetId);
        }

        const activation = new FormData();
        activation.set('sessionId', targetId);
        const started = await activateSessionAction(activation);
        if (!started.ok) { setError(started.message); return; }
        router.push(`/classes/${classId}/lotteries/${targetId}`);
      } catch {
        setError('操作失败，请重试');
      }
    });
  }

  const label = sessionId ? '保存草稿' : createdSessionId ? '重试进入现场' : '创建并进入现场抽奖';
  return <form onSubmit={submit} className="flex flex-wrap items-end gap-4">
    <input type="hidden" name="classId" value={classId} />
    <input type="hidden" name="mode" value={mode} />
    {sessionId && <input type="hidden" name="sessionId" value={sessionId} />}
    {children}
    <Button type="submit" disabled={pending} icon={pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : sessionId ? <Save aria-hidden="true" className="size-4" /> : <ArrowRight aria-hidden="true" className="size-4" />}>
      {pending ? '正在处理…' : label}
    </Button>
    {error && <StatusMessage role="alert" tone="error" className="w-full">{error}</StatusMessage>}
  </form>;
}
