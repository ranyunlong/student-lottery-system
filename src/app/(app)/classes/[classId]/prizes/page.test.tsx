import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import PrizesPage from './page';
import { adjustStockAction, archivePrizeAction } from '../../../../../features/prizes/actions';
import { listPrizes, listStockEvents } from '../../../../../features/prizes/service';

vi.mock('../../../../../db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ name: '七年级一班' }]) }) }) }) } }));
vi.mock('../../../../../features/prizes/actions', () => ({ createPrizeAction: vi.fn(), adjustStockAction: vi.fn(), archivePrizeAction: vi.fn() }));
vi.mock('../../../../../features/prizes/service', () => ({ listPrizes: vi.fn(), listStockEvents: vi.fn() }));
vi.mock('../../../../../lib/access', () => ({ requireClassAccess: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(cleanup);

test('renders prize stock as a responsive table and opens stock adjustment in a dialog', async () => {
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'prize-1', name: '文具盒', stock: 8, archived: false }] as never);
  vi.mocked(listStockEvents).mockResolvedValue([] as never);
  render(await PrizesPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  const table = screen.getByRole('table', { name: '奖品库存' });
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['奖品', '库存', '库存调整', '库存流水']);
  expect(table).toHaveClass('min-w-[56rem]');
  expect(table).not.toHaveClass('max-[1024px]:block');
  expect(table.closest('div.overflow-x-auto')).toBeInTheDocument();
  expect(table.querySelector('thead')).not.toHaveClass('max-[1024px]:sr-only');
  const row = within(table).getByRole('row', { name: /文具盒/ });
  expect(within(row).getByText('库存 8')).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: '调整库存' })).toBeInTheDocument();
  expect(within(row).queryByLabelText('增减数量')).not.toBeInTheDocument();
  fireEvent.click(within(row).getByRole('button', { name: '调整库存' }));
  const stockDialog = screen.getByRole('dialog', { name: '调整库存：文具盒' });
  expect(within(stockDialog).getByText('当前库存')).toBeInTheDocument();
  expect(within(stockDialog).getByText('8')).toBeInTheDocument();
  expect(within(stockDialog).getByLabelText('增减数量')).toBeInTheDocument();
  expect(within(stockDialog).getByLabelText('原因')).toBeInTheDocument();
  fireEvent.click(within(stockDialog).getByRole('button', { name: '关闭对话框' }));
  const createTrigger = screen.getByRole('button', { name: '创建奖品' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(createTrigger);
  expect(screen.getByRole('dialog', { name: '创建奖品' })).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByLabelText('奖品名称')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByLabelText('初始库存')).toBeInTheDocument();
  expect(screen.queryByText('管理奖品、库存调整和库存流水。')).not.toBeInTheDocument();
});

test('uses custom number inputs for prize creation and stock adjustment', async () => {
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'prize-1', name: '文具盒', stock: 8, archived: false }] as never);
  vi.mocked(listStockEvents).mockResolvedValue([] as never);
  render(await PrizesPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  fireEvent.click(screen.getByRole('button', { name: '调整库存' }));
  const stockDialog = screen.getByRole('dialog', { name: '调整库存：文具盒' });
  const delta = within(stockDialog).getByLabelText('增减数量');
  expect(delta).toHaveAttribute('type', 'text');
  expect(delta).toHaveAttribute('inputmode', 'numeric');
  fireEvent.click(within(stockDialog).getByRole('button', { name: '减少数量' }));
  fireEvent.click(within(stockDialog).getByRole('button', { name: '增加数量' }));
  fireEvent.click(within(stockDialog).getByRole('button', { name: '减少数量' }));
  fireEvent.click(within(stockDialog).getByRole('button', { name: '减少数量' }));
  const stockForm = within(stockDialog).getByRole('button', { name: '确认调整' }).closest('form')!;
  expect(new FormData(stockForm).get('delta')).toBe('-2');
  fireEvent.click(within(stockDialog).getByRole('button', { name: '关闭对话框' }));

  fireEvent.click(screen.getByRole('button', { name: '创建奖品' }));
  const createDialog = screen.getByRole('dialog', { name: '创建奖品' });
  const openingStock = within(createDialog).getByLabelText('初始库存');
  expect(openingStock).toHaveAttribute('type', 'text');
  expect(openingStock).toHaveAttribute('inputmode', 'numeric');
  fireEvent.click(within(createDialog).getByRole('button', { name: '增加数量' }));
  const createForm = within(createDialog).getByRole('button', { name: '创建奖品' }).closest('form')!;
  expect(new FormData(createForm).get('openingStock')).toBe('1');
});

test('keeps stock adjustment controls out of the table cell and preserves accessible history', async () => {
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'prize-1', name: '文具盒', stock: 8, archived: false }] as never);
  vi.mocked(listStockEvents).mockResolvedValue([] as never);
  render(await PrizesPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  const row = within(screen.getByRole('table', { name: '奖品库存' })).getByRole('row', { name: /文具盒/ });
  const adjustmentCell = within(row).getByRole('button', { name: '调整库存' }).closest('td');
  expect(adjustmentCell).toHaveClass('min-w-[12rem]');
  expect(adjustmentCell).not.toHaveClass('max-[1024px]:block');
  expect(within(row).queryByLabelText('增减数量')).not.toBeInTheDocument();
  expect(within(row).getByRole('button', { name: /查看流水/ })).toBeInTheDocument();
});

test('opens a paginated stock history table with actor names rather than identifiers', async () => {
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'prize-1', name: '文具盒', stock: 8, archived: false }] as never);
  vi.mocked(listStockEvents).mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({
    prizeId: 'prize-1', delta: 1, reason: `补货${index + 1}`, actorId: 'opaque-user-id', actorName: '王老师',
    createdAt: new Date('2026-09-30T12:00:00Z'),
  })) as never);
  render(await PrizesPage({ params: Promise.resolve({ classId: 'class-1' }) }));
  fireEvent.click(screen.getByRole('button', { name: /查看流水/ }));
  const dialog = screen.getByRole('dialog', { name: '文具盒 · 库存流水' });
  expect(within(dialog).getByRole('table')).toBeInTheDocument();
  expect(within(dialog).getAllByText('王老师')).toHaveLength(10);
  expect(within(dialog).queryByText('opaque-user-id')).not.toBeInTheDocument();
  expect(within(dialog).getByText('第 1 / 2 页')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '下一页' }));
  expect(within(dialog).getByText('补货12')).toBeInTheDocument();
});

test('prize import dialog offers template download and file preview', async () => {
  vi.mocked(listPrizes).mockResolvedValue([] as never);
  render(await PrizesPage({ params: Promise.resolve({ classId: 'class-1' }) }));
  fireEvent.click(screen.getByRole('button', { name: '导入奖品' }));
  const dialog = screen.getByRole('dialog', { name: '导入奖品' });
  expect(within(dialog).getByRole('link', { name: '下载 Excel 模板' })).toHaveAttribute('href', '/api/classes/class-1/prizes/import');
  expect(within(dialog).getByLabelText('选择 Excel 文件')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '预览' })).toBeDisabled();
});

test('previews imported prizes and confirms the same file before refreshing', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [{ name: '铅笔', quantity: 4 }], errors: [] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ inserted: 1, updated: 0 })));
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(listPrizes).mockResolvedValue([] as never);
  try {
    render(await PrizesPage({ params: Promise.resolve({ classId: 'class-1' }) }));
    fireEvent.click(screen.getByRole('button', { name: '导入奖品' }));
    const file = new File(['xlsx'], 'prizes.xlsx');
    fireEvent.change(screen.getByLabelText('选择 Excel 文件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    expect(await screen.findByText('铅笔')).toBeInTheDocument();
    expect((fetchMock.mock.calls[0][1].body as FormData).get('file')).toBe(file);
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '导入奖品' })).not.toBeInTheDocument());
    expect((fetchMock.mock.calls[1][1].body as FormData).get('file')).toBe(file);
  } finally { vi.unstubAllGlobals(); }
});

test('a stale preview cannot be confirmed after switching the selected Excel file', async () => {
  let finishOld!: (response: Response) => void;
  const pendingOld = new Promise<Response>((resolve) => { finishOld = resolve; });
  const fetchMock = vi.fn().mockReturnValueOnce(pendingOld)
    .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [{ name: '新奖品', quantity: 2 }], errors: [] })));
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(listPrizes).mockResolvedValue([] as never);
  try {
    render(await PrizesPage({ params: Promise.resolve({ classId: 'class-1' }) }));
    fireEvent.click(screen.getByRole('button', { name: '导入奖品' }));
    const input = screen.getByLabelText('选择 Excel 文件');
    fireEvent.change(input, { target: { files: [new File(['old'], 'old.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    fireEvent.change(input, { target: { files: [new File(['new'], 'new.xlsx')] } });
    await act(async () => finishOld(new Response(JSON.stringify({ rows: [{ name: '旧奖品', quantity: 1 }], errors: [] }))));
    expect(screen.queryByText('旧奖品')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    expect(await screen.findByText('新奖品')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});

test('submits the prize stock change and closes the dialog after success', async () => {
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'prize-1', name: '文具盒', stock: 8, archived: false }] as never);
  vi.mocked(listStockEvents).mockResolvedValue([] as never);
  vi.mocked(adjustStockAction).mockResolvedValue({ ok: true, message: '库存已调整' } as never);
  render(await PrizesPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  fireEvent.click(screen.getByRole('button', { name: '调整库存' }));
  const dialog = screen.getByRole('dialog', { name: '调整库存：文具盒' });
  fireEvent.change(within(dialog).getByLabelText('增减数量'), { target: { value: '-2' } });
  fireEvent.change(within(dialog).getByLabelText('原因'), { target: { value: '活动发放' } });
  fireEvent.submit(within(dialog).getByRole('button', { name: '确认调整' }).closest('form')!);

  await waitFor(() => expect(adjustStockAction).toHaveBeenCalledOnce());
  const submitted = vi.mocked(adjustStockAction).mock.calls[0][0] as FormData;
  expect(submitted.get('classId')).toBe('class-1');
  expect(submitted.get('prizeId')).toBe('prize-1');
  expect(submitted.get('delta')).toBe('-2');
  expect(submitted.get('reason')).toBe('活动发放');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '调整库存：文具盒' })).not.toBeInTheDocument());
});

test('archives a prize only after confirming in a custom dialog', async () => {
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'prize-1', name: '文具盒', stock: 8, archived: false }] as never);
  vi.mocked(listStockEvents).mockResolvedValue([] as never);
  vi.mocked(archivePrizeAction).mockResolvedValue({ ok: true, message: '奖品已归档' } as never);
  const nativeConfirm = vi.spyOn(window, 'confirm');
  render(await PrizesPage({ params: Promise.resolve({ classId: 'class-1' }) }));
  fireEvent.click(screen.getByRole('button', { name: '归档' }));
  const dialog = screen.getByRole('dialog', { name: '归档奖品：文具盒' });
  const explanation = within(dialog).getByText(/归档后/);
  expect(explanation).toBeInTheDocument();
  expect(explanation.closest('.border-b')).toBeNull();
  expect(explanation.previousElementSibling).toHaveClass('border-b');
  expect(archivePrizeAction).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog', { name: '归档奖品：文具盒' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '归档' }));
  fireEvent.submit(within(screen.getByRole('dialog', { name: '归档奖品：文具盒' })).getByRole('button', { name: '确认' }).closest('form')!);
  await waitFor(() => expect(archivePrizeAction).toHaveBeenCalledOnce());
  expect(nativeConfirm).not.toHaveBeenCalled();
  nativeConfirm.mockRestore();
});
