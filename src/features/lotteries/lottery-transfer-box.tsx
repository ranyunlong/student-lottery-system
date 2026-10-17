'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NumberInput } from '../../components/ui/number-input';
import { cn } from '../../components/ui/utils';

type StudentItem = { id: number; label: string };
type PrizeItem = { id: string; name: string; stock: number };

function initialPrizeQuantities(items: PrizeItem[], initialQuantities: Record<string, number>) {
  return {
    ...Object.fromEntries(items.map((item) => [item.id, item.stock])),
    ...Object.fromEntries(items.flatMap((item) => {
      const quantity = initialQuantities[item.id];
      return quantity === undefined ? [] : [[item.id, Math.min(Math.max(quantity, 1), item.stock)] as [string, number]];
    })),
  };
}

function TransferPanel({ title, count, children, empty }: { title: string; count: number; children: React.ReactNode; empty: string }) {
  return <section className="min-w-0 rounded-lg border border-workspace-line bg-workspace-surface-alt/55 p-3" aria-label={title}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-workspace-ink">{title}</h4>
      <Badge tone="neutral">{count}</Badge>
    </div>
    <div className="min-h-32 max-h-72 space-y-2 overflow-y-auto" data-empty={count === 0 || undefined}>
      {count ? children : <p className="flex min-h-28 items-center justify-center px-3 text-center text-xs text-workspace-muted">{empty}</p>}
    </div>
  </section>;
}

function TransferRow({ children, selected, onClick, ariaLabel }: { children: React.ReactNode; selected?: boolean; onClick: () => void; ariaLabel: string }) {
  return <button type="button" className={cn(
    'flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-[background-color,border-color,transform] hover:-translate-y-px motion-reduce:transform-none',
    selected ? 'border-workspace-accent bg-workspace-accent-soft text-workspace-accent-strong' : 'border-workspace-line bg-workspace-surface text-workspace-ink hover:border-workspace-accent hover:bg-workspace-accent-soft/60',
  )} aria-label={ariaLabel} onClick={onClick}>{children}</button>;
}

export function StudentTransferBox({
  items,
  showLimitControls = true,
  initialSelectedIds = [],
  initialLimitMode = 'uniform',
  initialPerStudentLimit = 1,
  initialStudentLimits = {},
}: {
  items: StudentItem[];
  showLimitControls?: boolean;
  initialSelectedIds?: number[];
  initialLimitMode?: 'uniform' | 'individual';
  initialPerStudentLimit?: number;
  initialStudentLimits?: Record<number, number>;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);
  const [limitMode, setLimitMode] = useState<'uniform' | 'individual'>(initialLimitMode);
  const [perStudentLimit, setPerStudentLimit] = useState(initialPerStudentLimit);
  const [studentLimits, setStudentLimits] = useState<Record<number, number>>(initialStudentLimits);
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => items.filter((item) => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [items, query]);
  const available = filtered.filter((item) => !selected.has(item.id));
  const chosen = items.filter((item) => selected.has(item.id));

  const toggle = (id: number) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    if (selected.has(id)) {
      setStudentLimits((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } else if (limitMode === 'individual') {
      setStudentLimits((current) => ({ ...current, [id]: 1 }));
    }
  };

  const setMode = (nextMode: 'uniform' | 'individual') => {
    if (nextMode === limitMode) return;
    if (limitMode === 'uniform' && nextMode === 'individual') {
      setStudentLimits(Object.fromEntries(selectedIds.map((id) => [id, perStudentLimit])));
    }
    setLimitMode(nextMode);
  };

  return <div className="w-full space-y-3" data-testid="student-transfer-box">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="relative max-w-xl flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-workspace-muted" /><Input aria-label="搜索学生" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名或学号" className="pl-9" /></div>
      {showLimitControls && <><fieldset className="space-y-1">
        <legend className="text-xs font-semibold text-workspace-muted">学生抽奖次数</legend>
        <div role="group" aria-label="学生抽奖次数模式" className="flex rounded-md border border-workspace-line bg-workspace-surface p-1">
          <button type="button" aria-pressed={limitMode === 'uniform'} className={cn('min-h-9 rounded px-3 text-sm font-medium', limitMode === 'uniform' ? 'bg-workspace-accent text-white' : 'text-workspace-muted hover:bg-workspace-surface-alt')} onClick={() => setMode('uniform')}>统一设置</button>
          <button type="button" aria-pressed={limitMode === 'individual'} className={cn('min-h-9 rounded px-3 text-sm font-medium', limitMode === 'individual' ? 'bg-workspace-accent text-white' : 'text-workspace-muted hover:bg-workspace-surface-alt')} onClick={() => setMode('individual')}>分别设置</button>
        </div>
      </fieldset>
      {limitMode === 'uniform' && <label className="flex w-44 max-w-full flex-col gap-1 text-xs text-workspace-muted">
        <span>每人最多抽取次数</span>
        <Input aria-label="每人最多抽取次数" type="number" name="perStudentLimit" min="1" max="2147483647" step="1" required value={perStudentLimit} onChange={(event) => {
          const value = Number(event.currentTarget.value);
          setPerStudentLimit(Number.isSafeInteger(value) && value > 0 ? value : 1);
        }} />
      </label>}</>}
    </div>
    {showLimitControls && <input type="hidden" name="studentLimitMode" value={limitMode} />}
    <div className="grid min-w-0 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <TransferPanel title="可选学生" count={available.length} empty="没有匹配的学生">
        {available.map((item) => <TransferRow key={item.id} ariaLabel={`添加 ${item.label}`} onClick={() => toggle(item.id)}><span className="min-w-0 break-words">{item.label}</span><ArrowRight aria-hidden="true" className="size-4 shrink-0 text-workspace-accent" /></TransferRow>)}
      </TransferPanel>
      <div className="flex justify-center gap-2 md:flex-col"><Button type="button" variant="outline" size="sm" aria-label="添加全部匹配学生" onClick={() => {
        const additions = available.filter((item) => !selected.has(item.id)).map((item) => item.id);
        setSelectedIds((current) => [...current, ...additions.filter((id) => !current.includes(id))]);
        if (limitMode === 'individual') setStudentLimits((current) => ({ ...current, ...Object.fromEntries(additions.map((id) => [id, 1])) }));
      }}><ArrowRight aria-hidden="true" className="size-4 md:rotate-0" /></Button><Button type="button" variant="secondary" size="sm" aria-label="移除全部已选学生" onClick={() => { setSelectedIds([]); setStudentLimits({}); }}><ArrowLeft aria-hidden="true" className="size-4" /></Button></div>
      <TransferPanel title="已选学生" count={chosen.length} empty="点击左侧学生加入本场">
        <div data-testid="selected-students" className="space-y-2">{chosen.map((item) => showLimitControls && limitMode === 'individual' ? <div key={item.id} className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-workspace-accent bg-workspace-accent-soft px-3 py-2 text-sm text-workspace-accent-strong">
          <span className="min-w-0 break-words">{item.label}</span>
          <label className="flex w-36 shrink-0 flex-col gap-1 text-xs text-workspace-muted"><span>抽取次数</span>
            <NumberInput aria-label={`抽取次数 ${item.label}`} className="h-8 min-h-8" name={`studentLimit:${item.id}`} min={1} max={2147483647} step={1} required
              decrementLabel={`减少抽取次数 ${item.label}`} incrementLabel={`增加抽取次数 ${item.label}`}
              value={studentLimits[item.id] ?? 1}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                setStudentLimits((current) => ({ ...current, [item.id]: Number.isSafeInteger(value) ? Math.min(Math.max(value, 1), 2147483647) : 1 }));
              }} />
          </label>
          <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-workspace-accent-strong hover:bg-workspace-accent-soft focus-visible:outline-2 focus-visible:outline-workspace-accent" aria-label={`移除 ${item.label}`} onClick={() => toggle(item.id)}><X aria-hidden="true" className="size-4" /></button>
        </div> : <TransferRow key={item.id} selected ariaLabel={`移除 ${item.label}`} onClick={() => toggle(item.id)}><span className="min-w-0 break-words">{item.label}</span><X aria-hidden="true" className="size-4 shrink-0" /></TransferRow>)}</div>
      </TransferPanel>
    </div>
    {selectedIds.map((id) => <input key={id} type="hidden" name="studentIds" value={id} />)}
  </div>;
}

export function PrizeTransferBox({ items, initialQuantities = {}, single = false }: { items: PrizeItem[]; initialQuantities?: Record<string, number>; single?: boolean }) {
  const stockItems = useMemo(() => items.filter((item) => item.stock > 0), [items]);
  const initialIds = stockItems.filter((item) => item.id in initialQuantities).map((item) => item.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(single ? initialIds.slice(0, 1) : initialIds);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => initialPrizeQuantities(stockItems, initialQuantities));
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => stockItems.filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [stockItems, query]);
  const available = filtered.filter((item) => !selected.has(item.id));
  const chosen = stockItems.filter((item) => selected.has(item.id));
  const add = (id: string) => {
    const stock = stockItems.find((item) => item.id === id)?.stock;
    if (stock !== undefined) setQuantities((current) => ({ ...current, [id]: stock }));
    setSelectedIds((current) => single ? [id] : [...current, id]);
  };
  const remove = (id: string) => setSelectedIds((current) => current.filter((item) => item !== id));

  return <div className="w-full space-y-3" data-testid={single ? 'fixed-prize-picker' : 'prize-transfer-box'}>
    <div className="relative max-w-xl"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-workspace-muted" /><Input aria-label="搜索奖品" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索奖品名称" className="pl-9" /></div>
    <div className="grid min-w-0 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <TransferPanel title="可选奖品" count={available.length} empty="没有匹配的奖品">
        {available.map((item) => <TransferRow key={item.id} ariaLabel={`添加 ${item.name}`} onClick={() => add(item.id)}>
          <span className="min-w-0 flex-1 break-words">{item.name}</span>
          <Badge className="shrink-0" tone="success">{single ? `库存 ${item.stock} · 最多抽取 ${item.stock} 轮` : `库存 ${item.stock}`}</Badge>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-workspace-accent" />
        </TransferRow>)}
      </TransferPanel>
      <div className="flex justify-center gap-2 md:flex-col"><Button type="button" variant="outline" size="sm" aria-label="添加全部匹配奖品" onClick={() => {
        const additions = available.filter((item) => !selected.has(item.id));
        if (single) {
          if (additions[0]) {
            setQuantities((current) => ({ ...current, [additions[0].id]: additions[0].stock }));
            setSelectedIds([additions[0].id]);
          }
          return;
        }
        setQuantities((current) => ({
          ...current,
          ...Object.fromEntries(additions.map((item) => [item.id, item.stock])),
        }));
        setSelectedIds((current) => [...current, ...additions.map((item) => item.id)]);
      }}><ArrowRight aria-hidden="true" className="size-4" /></Button><Button type="button" variant="secondary" size="sm" aria-label="移除全部已选奖品" onClick={() => setSelectedIds([])}><ArrowLeft aria-hidden="true" className="size-4" /></Button></div>
      <TransferPanel title={single ? '已选奖品' : '已选奖品'} count={chosen.length} empty="点击左侧奖品加入本场">
        <div data-testid="selected-prizes" className="space-y-2">{chosen.map((item) => <div key={item.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border border-workspace-accent bg-workspace-accent-soft/60 p-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 break-words text-sm font-medium text-workspace-accent-strong">{item.name}</span>
            <Badge className="shrink-0" tone="success">{single ? `库存 ${item.stock} · 最多抽取 ${item.stock} 轮` : `库存 ${item.stock}`}</Badge>
          </span>
          {!single && <label className="flex w-36 shrink-0 flex-col gap-1 text-xs text-workspace-muted">
            <span>本场数量</span>
            <NumberInput aria-label={`本场数量 ${item.name}`} className="h-8 min-h-8" name={`quantity:${item.id}`} min={1} max={item.stock} step={1} required
              decrementLabel={`减少本场数量 ${item.name}`} incrementLabel={`增加本场数量 ${item.name}`}
              value={quantities[item.id] ?? item.stock}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                const next = Number.isSafeInteger(value) ? Math.min(Math.max(value, 1), item.stock) : 1;
                setQuantities((current) => ({ ...current, [item.id]: next }));
              }} />
          </label>}
          <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-workspace-accent-strong hover:bg-workspace-accent-soft focus-visible:outline-2 focus-visible:outline-workspace-accent" aria-label={`移除 ${item.name}`} onClick={() => remove(item.id)}><X aria-hidden="true" className="size-4" /></button>
        </div>)}</div>
      </TransferPanel>
    </div>
    {selectedIds.map((id) => <input key={id} type="hidden" name={single ? 'prizeId' : 'prizeIds'} value={id} />)}
    {chosen.map((item) => <input key={`stock:${item.id}`} type="hidden" name={single ? 'prizeStock' : `stock:${item.id}`} value={item.stock} />)}
  </div>;
}
