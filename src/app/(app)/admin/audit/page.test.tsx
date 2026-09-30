import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import AuditPage from './page';
import { AppShell } from '../../../../components/app-shell';
import { listAdminAuditPage } from '../../../../features/classes/service';
import { findRedeemedWinForCorrection, listRedemptionAudit } from '../../../../features/redemptions/service';

const actorMocks = vi.hoisted(() => ({
  listAuditActorNames: vi.fn(async () => new Map([['admin-one', '陈老师']])),
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

vi.mock('../../../../features/classes/audit-actors', () => ({
  listAuditActorNames: actorMocks.listAuditActorNames,
}));

function expectCellsToHaveLabelAndValue(table: HTMLElement) {
  const cells = Array.from(table.querySelectorAll('tbody td'));
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) {
    expect(cell).toHaveClass('grid');
    expect(cell.children).toHaveLength(2);
    expect(cell.children[0]).toHaveClass('max-[1024px]:block', 'min-[1025px]:hidden');
    expect(cell.children[1]).toHaveClass('min-w-0');
  }
}

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/audit', useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../../../lib/workspace-guard', () => ({ requireAdminPage: async () => {} }));
vi.mock('../../../../features/classes/service', () => ({ listAdminAuditPage: vi.fn(async () => ({
  items: [
    { id: 'management-one', action: 'class.create', actorId: 'admin-one', classId: 'class-one', targetUserId: null,
      details: { state: 'pending' }, createdAt: new Date('2026-09-01T00:00:00Z') },
    { id: 'management-primary', action: 'class.teacher.primary.set', actorId: 'admin-one', classId: 'class-one', targetUserId: 'teacher-one',
      details: { state: 'completed' }, createdAt: new Date('2026-09-01T00:00:00Z') },
  ],
  nextCursor: 'management-older', previousCursor: 'management-newer',
})) }));
vi.mock('../../../../features/redemptions/actions', () => ({ correctRedemptionAction: async () => ({ ok: true, message: '已纠正' }) }));
vi.mock('../../../../features/redemptions/service', () => ({
  listRedemptionAudit: vi.fn(async (cursor?: string) => cursor === 'older-cursor' ? {
    events: [{ id: 'old-event', classId: 'old-class', winningRecordId: 'old-win',
      studentNumberSnapshot: '001', studentNameSnapshot: '历史姓名', prizeNameSnapshot: '历史奖品',
      actorName: '老师', createdAt: new Date('2026-09-01T00:00:00Z'), previousStatus: 'pending',
      newStatus: 'redeemed', currentStatus: 'redeemed', reason: 'R'.repeat(120) }], nextCursor: 'even-older', previousCursor: 'newer',
  } : { events: [], nextCursor: null, previousCursor: null }),
  findRedeemedWinForCorrection: vi.fn(async (id: string) => id === 'random text' ? Promise.reject(new Error('中奖记录编号无效')) : id === 'old-win' ? {
    id, classId: 'old-class', studentNumberSnapshot: '001', studentNameSnapshot: '历史姓名',
    prizeNameSnapshot: '历史奖品', redeemedAt: new Date('2026-09-01T00:00:00Z'),
  } : null),
}));

test('invalid winning ID shows an inline error instead of crashing the audit page', async () => {
  render(await AuditPage({ searchParams: Promise.resolve({ winId: 'random text' }) }));
  expect(screen.getByRole('alert')).toHaveTextContent('中奖记录编号无效');
  expect(document.querySelector('input[name="winId"]')).toHaveValue('random text');
  expect(findRedeemedWinForCorrection).toHaveBeenCalledWith('random text');
  expect(screen.getByRole('heading', { name: '审计记录' })).toBeInTheDocument();
});

test('invalid audit date is explained without broadening the displayed results', async () => {
  render(await AuditPage({ searchParams: Promise.resolve({ date: '2026-02-30' }) }));
  expect(screen.getByRole('alert')).toHaveTextContent('日期格式无效');
  expect(listRedemptionAudit).toHaveBeenCalledWith(undefined, 'next', { date: '2026-02-30', keyword: '' });
});

test('date and student filters retain the correction ID and paging context', async () => {
  render(await AuditPage({ searchParams: Promise.resolve({
    cursor: 'older-cursor', date: '2026-09-01', keyword: '001', winId: 'old-win',
  }) }));
  expect(listRedemptionAudit).toHaveBeenCalledWith('older-cursor', 'next', { date: '2026-09-01', keyword: '001' });
  expect(screen.getByLabelText('日期')).toHaveValue('2026-09-01');
  expect(screen.getByRole('textbox', { name: '学生学号或姓名' })).toHaveValue('001');
  const form = screen.getByRole('button', { name: '查找' }).closest('form')!;
  expect(new FormData(form).get('winId')).toBe('old-win');
  expect(form.querySelector('input[name="winId"]')).toHaveAttribute('type', 'hidden');
  expect(screen.getByRole('link', { name: '下一页' })).toHaveAttribute('href',
    '/admin/audit?view=redemptions&winId=old-win&date=2026-09-01&keyword=001&cursor=even-older&direction=next');
});

test('older redemption page keeps the correction target and exposes navigation', async () => {
  const user = userEvent.setup();
  render(await AuditPage({ searchParams: Promise.resolve({ cursor: 'older-cursor', winId: 'old-win' }) }));
  expect(screen.getAllByText(/历史姓名.*历史奖品/)).toHaveLength(2);
  expect(screen.getByRole('link', { name: '下一页' })).toHaveAttribute('href',
    '/admin/audit?view=redemptions&winId=old-win&cursor=even-older&direction=next');
  expect(screen.getByRole('link', { name: '上一页' })).toHaveAttribute('href',
    '/admin/audit?view=redemptions&winId=old-win&cursor=newer&direction=prev');
  expect(document.querySelector('input[name="winId"]')).toHaveValue('old-win');
  expect(screen.queryByText('粘贴中奖记录 ID，可直接定位到已兑记录。')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查找' }).closest('form')).toHaveClass('items-end');
  expect(within(screen.getByRole('table', { name: '兑换与纠错记录' })).queryByText('old-win')).not.toBeInTheDocument();
  expect(screen.getByRole('table', { name: '\u5151\u6362\u4e0e\u7ea0\u9519\u8bb0\u5f55' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '\u7ea0\u9519\u539f\u56e0' })).toBeInTheDocument();
  const table = screen.getByRole('table', { name: '\u5151\u6362\u4e0e\u7ea0\u9519\u8bb0\u5f55' });
  expect(table).toHaveClass('w-full', 'table-fixed', 'border-collapse', 'max-[1024px]:block');
  expect(table.closest('[data-slot="card"]')).toHaveClass('overflow-hidden');
  expect(table.closest('[data-slot="card"]')?.querySelector('[data-slot="card-content"]')).toHaveClass('p-0');
  expect(table.querySelector('thead')).toHaveClass('bg-workspace', 'text-left', 'max-[1024px]:sr-only');
  expect(table.querySelector('tbody')).toHaveClass('max-[1024px]:block', 'max-[1024px]:w-full');
  expect(table.querySelector('tbody tr')).toHaveClass('bg-workspace-surface', 'align-middle', 'max-[1024px]:block', 'max-[1024px]:w-full', 'hover:bg-workspace-accent-soft/55');
  expect(table.querySelector('thead th')).toHaveClass('bg-workspace');
  expect(table.querySelector('tbody tr td')).toHaveClass('px-4', 'py-3', 'max-[1024px]:py-2');
  expectCellsToHaveLabelAndValue(table);
  expect(screen.getByText('R'.repeat(120)).closest('td')).toHaveClass('[overflow-wrap:anywhere]');
  expect(table.querySelector('tbody tr')).not.toHaveTextContent('old-win');
  expect(table.querySelector('tbody tr')).not.toHaveTextContent('ID');
  expect(screen.getByRole('link', { name: '定位纠错' })).toHaveAttribute('href', '/admin/audit?view=redemptions&winId=old-win');
  expect(document.querySelector<HTMLInputElement>('input[name="winId"]')).toHaveAttribute('type', 'hidden');
  expect(screen.getByRole('heading', { name: '\u5ba1\u8ba1\u8bb0\u5f55' })).toHaveClass('admin-page-title');
  expect(screen.getByRole('heading', { name: '\u5ba1\u8ba1\u8bb0\u5f55' }).closest('header')).toHaveClass('admin-page-heading');
  expect(screen.getByText('\u5151\u6362\u4e0e\u7ea0\u9519 \u00b7 \u6bcf\u9875 25 \u6761')).toHaveClass('admin-page-subtitle');
  expect(within(screen.getByRole('navigation', { name: '\u5217\u8868\u5206\u9875' })).getByText(/25/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '纠正误标' })).toBeInTheDocument();
  const reason = screen.getByLabelText('纠错原因');
  expect(reason).toBeRequired();
  expect(reason).toHaveClass('pr-11');
  await user.type(reason, '误标原因');
  expect(screen.getAllByRole('button', { name: '\u6e05\u7a7a\u8f93\u5165\u5185\u5bb9' })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: '\u6e05\u7a7a\u8f93\u5165\u5185\u5bb9' }));
  expect(reason).toHaveValue('');
  expect(screen.getByRole('link', { name: '定位纠错' })).toHaveAttribute(
    'href', '/admin/audit?view=redemptions&winId=old-win');
  expect(screen.getByRole('link', { name: '查看记录' })).toHaveAttribute('href', '/classes/old-class/winnings');
  expect(screen.getByRole('link', { name: '兑换与纠错' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: '管理操作' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('link', { name: '兑换与纠错' })).toHaveClass('min-h-10', 'px-2', 'focus-visible:outline-workspace-accent');
  expect(screen.getByRole('link', { name: '兑换与纠错' })).toHaveClass('border-b-2', 'border-workspace-accent', 'text-workspace-accent-strong');
  expect(screen.getByRole('link', { name: '管理操作' })).toHaveClass('border-b-2', 'border-transparent', 'text-workspace-muted');
  const tabs = screen.getByRole('navigation', { name: '审计类型' });
  expect(tabs).toHaveClass('flex', 'min-w-0', 'flex-wrap', 'border-b', 'border-workspace-line');
  expect(tabs).not.toHaveClass('overflow-x-auto');
  expect(screen.getByRole('link', { name: '兑换与纠错' })).toHaveAttribute('href', '/admin/audit?view=redemptions');
  expect(screen.getByRole('link', { name: '管理操作' })).toHaveAttribute('href', '/admin/audit?view=management');
  expect(screen.getByRole('button', { name: '查找' })).toHaveClass('border-workspace-accent', 'bg-workspace-accent');
  expect(screen.getByRole('button', { name: '查找' }).closest('form')?.closest('[data-slot="card"]')).toHaveClass('admin-filter-panel');
  expect(screen.getByRole('button', { name: '查找' }).closest('form')).toHaveClass('admin-filter-form');
  expect(screen.getByRole('button', { name: '查找' }).closest('form')?.parentElement).toHaveClass('p-4', 'sm:p-5');
  expect(screen.getByRole('button', { name: '纠正误标' })).toHaveClass('bg-workspace-accent');
  expect(screen.getByRole('button', { name: '纠正误标' }).closest('section')).toHaveClass('rounded-md', 'border', 'bg-workspace-surface');
  expect(table.closest('[data-slot="card"]')?.querySelector('[data-slot="card-content"]')).toHaveClass('p-0');
  expect(table.parentElement).toHaveClass('relative', 'w-full', 'overflow-x-auto');
});

test('pending historical redemption and correction events show current status without correction links', async () => {
  vi.mocked(listRedemptionAudit).mockResolvedValueOnce({
    events: [
      { id: 'redeemed-then-corrected', classId: 'class-one', winningRecordId: 'win-one', actorId: 'admin-one',
        studentNumberSnapshot: '001', studentNameSnapshot: '\u5b66\u751f\u7532', prizeNameSnapshot: '\u5956\u54c1\u7532',
        actorName: '\u7ba1\u7406\u5458', createdAt: new Date('2026-09-02T00:00:00Z'), previousStatus: 'pending',
        newStatus: 'redeemed', currentStatus: 'pending', reason: null },
      { id: 'correction-event', classId: 'class-one', winningRecordId: 'win-two', actorId: 'admin-one',
        studentNumberSnapshot: '002', studentNameSnapshot: '\u5b66\u751f\u4e59', prizeNameSnapshot: '\u5956\u54c1\u4e59',
        actorName: '\u7ba1\u7406\u5458', createdAt: new Date('2026-09-03T00:00:00Z'), previousStatus: 'redeemed',
        newStatus: 'pending', currentStatus: 'pending', reason: '\u8bef\u6807\u7ea0\u6b63' },
    ], nextCursor: null, previousCursor: null,
  });

  render(await AuditPage({ searchParams: Promise.resolve({}) }));
  const table = screen.getByRole('table', { name: '\u5151\u6362\u4e0e\u7ea0\u9519\u8bb0\u5f55' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('\u5b66\u751f\u7532 \u00b7 \u5956\u54c1\u7532');
  expect(rows[0]).toHaveTextContent('\u5f85\u5151 \u2192 \u5df2\u5151');
  expect(rows[0]).toHaveTextContent('\u5f53\u524d\u5f85\u5151');
  expect(rows[1]).toHaveTextContent('\u5b66\u751f\u4e59 \u00b7 \u5956\u54c1\u4e59');
  expect(rows[1]).toHaveTextContent('\u5df2\u5151 \u2192 \u5f85\u5151');
  expect(rows[1]).toHaveTextContent('\u5f53\u524d\u5f85\u5151');
  expect(rows[0]).not.toHaveTextContent('win-one');
  expect(rows[1]).not.toHaveTextContent('win-two');
  expect(within(rows[0]).getByRole('link', { name: '\u67e5\u770b\u8bb0\u5f55' })).toHaveAttribute('href', '/classes/class-one/winnings');
  expect(within(rows[1]).getByRole('link', { name: '\u67e5\u770b\u8bb0\u5f55' })).toHaveAttribute('href', '/classes/class-one/winnings');
  expect(within(table).queryByRole('link', { name: '\u5b9a\u4f4d\u7ea0\u9519' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '\u7ea0\u6b63\u8bef\u6807' })).not.toBeInTheDocument();
});

test('management audit view does not show redemption search or correction controls', async () => {
  render(await AuditPage({ searchParams: Promise.resolve({ view: 'management' }) }));
  expect(listRedemptionAudit).not.toHaveBeenCalled();
  expect(screen.getByText('创建班级')).toBeInTheDocument();
  expect(screen.getByRole('table', { name: '\u7ba1\u7406\u64cd\u4f5c\u8bb0\u5f55' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '操作人' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: '对象' })).not.toBeInTheDocument();
  const table = screen.getByRole('table', { name: '\u7ba1\u7406\u64cd\u4f5c\u8bb0\u5f55' });
  expect(actorMocks.listAuditActorNames).toHaveBeenCalledWith(['admin-one', 'admin-one']);
  expect(within(table).getAllByText('陈老师')).toHaveLength(2);
  expect(within(table).queryByText('admin-one')).not.toBeInTheDocument();
  expect(table).toHaveClass('table-fixed', 'border-collapse', 'max-[1024px]:block');
  expect(table.closest('[data-slot="card"]')).toHaveClass('overflow-hidden');
  expect(table.closest('[data-slot="card"]')?.querySelector('[data-slot="card-content"]')).toHaveClass('p-0');
  expect(table.querySelector('thead')).toHaveClass('bg-workspace', 'text-left', 'max-[1024px]:sr-only');
  expect(table.querySelector('tbody')).toHaveClass('max-[1024px]:block', 'max-[1024px]:w-full');
  expect(table.querySelector('tbody tr')).toHaveClass('bg-workspace-surface', 'align-middle', 'max-[1024px]:block', 'max-[1024px]:w-full', 'hover:bg-workspace-accent-soft/55');
  expect(table.querySelector('thead th')).toHaveClass('bg-workspace');
  expect(table.querySelector('tbody tr td')).toHaveClass('px-4', 'py-3', 'max-[1024px]:py-2');
  expectCellsToHaveLabelAndValue(table);
  expect(screen.getByText('处理中')).toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: '\u5217\u8868\u5206\u9875' })).getByText(/25/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '下一页' })).toHaveAttribute('href',
    '/admin/audit?view=management&cursor=management-older&direction=next');
  expect(screen.getByRole('link', { name: '上一页' })).toHaveAttribute('href',
    '/admin/audit?view=management&cursor=management-newer&direction=prev');
  expect(screen.queryByLabelText('学生学号或姓名')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '纠正误标' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '兑换与纠错' })).toHaveAttribute('href', '/admin/audit?view=redemptions');
  expect(screen.getByRole('link', { name: '管理操作' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('heading', { name: '\u5ba1\u8ba1\u8bb0\u5f55' }).closest('header')).toHaveClass('admin-page-heading');
  expect(screen.getByText('\u7ba1\u7406\u64cd\u4f5c \u00b7 \u6bcf\u9875 25 \u6761')).toHaveClass('admin-page-subtitle');
  expect(screen.getByRole('link', { name: '兑换与纠错' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('link', { name: '管理操作' })).toHaveClass('min-h-10', 'px-2', 'focus-visible:outline-workspace-accent');
  expect(screen.getByRole('link', { name: '管理操作' })).toHaveClass('border-b-2', 'border-workspace-accent', 'text-workspace-accent-strong');
  expect(screen.getByText('设置主负责老师')).toBeInTheDocument();
});

test('administrator and teacher workspaces use the responsive sidebar navigation', () => {
  const admin = render(<AppShell role="admin" name="管理员" email="admin@example.com"><p>管理内容</p></AppShell>);
  const adminNav = screen.getByRole('navigation', { name: '工作区' });
  expect(adminNav).toHaveClass('flex', 'w-full', 'overflow-x-auto', 'md:flex-col');
  expect(within(adminNav).getByRole('link', { name: '老师账号' })).toHaveAttribute('href', '/admin/teachers');
  expect(within(adminNav).getByRole('link', { name: '班级管理' })).toHaveAttribute('href', '/admin/classes');
  expect(within(adminNav).getByRole('link', { name: '审计记录' })).toHaveAttribute('href', '/admin/audit');
  expect(screen.getByRole('main')).toHaveClass('min-w-0');
  expect(adminNav.parentElement).toHaveClass('md:grid-cols-[13rem_minmax(0,1fr)]');

  admin.unmount();
  render(<AppShell role="teacher" name="老师" email="teacher@example.com"><p>老师内容</p></AppShell>);
  expect(screen.getByRole('navigation', { name: '工作区' }).parentElement).toHaveClass('md:grid-cols-[13rem_minmax(0,1fr)]');
});

test('empty audit views retain clear view selection and empty-state labels', async () => {
  vi.mocked(listAdminAuditPage).mockResolvedValueOnce({ items: [], nextCursor: null, previousCursor: null });
  vi.mocked(listRedemptionAudit).mockResolvedValueOnce({ events: [], nextCursor: null, previousCursor: null });

  const redemptions = render(await AuditPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('暂无兑换记录。')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '兑换与纠错' })).toHaveAttribute('aria-current', 'page');

  redemptions.unmount();
  render(await AuditPage({ searchParams: Promise.resolve({ view: 'management' }) }));
  expect(screen.getByText('暂无管理操作。')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '管理操作' })).toHaveAttribute('aria-current', 'page');
});
