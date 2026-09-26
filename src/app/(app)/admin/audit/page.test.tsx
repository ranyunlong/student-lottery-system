import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import AuditPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../../../lib/workspace-guard', () => ({ requireAdminPage: async () => {} }));
vi.mock('../../../../features/classes/service', () => ({ listAdminAudit: async () => [] }));
vi.mock('../../../../features/redemptions/actions', () => ({ correctRedemptionAction: async () => ({ ok: true, message: '已纠正' }) }));
vi.mock('../../../../features/redemptions/service', () => ({
  listRedemptionAudit: async (cursor?: string) => cursor === 'older-cursor' ? {
    events: [{ id: 'old-event', classId: 'old-class', winningRecordId: 'old-win',
      studentNumberSnapshot: '001', studentNameSnapshot: '历史姓名', prizeNameSnapshot: '历史奖品',
      actorName: '老师', createdAt: new Date('2026-09-01T00:00:00Z'), previousStatus: 'pending',
      newStatus: 'redeemed', currentStatus: 'redeemed', reason: null }], nextCursor: 'even-older',
  } : { events: [], nextCursor: null },
  findRedeemedWinForCorrection: async (id: string) => id === 'old-win' ? {
    id, classId: 'old-class', studentNumberSnapshot: '001', studentNameSnapshot: '历史姓名',
    prizeNameSnapshot: '历史奖品', redeemedAt: new Date('2026-09-01T00:00:00Z'),
  } : null,
}));

test('older audit page exposes a cursor, record ID and a reachable correction form', async () => {
  render(await AuditPage({ searchParams: Promise.resolve({ cursor: 'older-cursor', winId: 'old-win' }) }));
  expect(screen.getAllByText(/历史姓名.*历史奖品/)).toHaveLength(2);
  expect(screen.getByRole('link', { name: '更早记录' })).toHaveAttribute('href', '/admin/audit?cursor=even-older');
  expect(screen.getByRole('link', { name: '返回最新' })).toHaveAttribute('href', '/admin/audit');
  expect(screen.getByText('old-win')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '纠正误标' })).toBeInTheDocument();
  expect(screen.getByLabelText('纠错原因')).toBeRequired();
});
