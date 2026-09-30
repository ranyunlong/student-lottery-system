import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ClassesPage from './page';
import { listTeacherClasses } from '../../../features/classes/service';

const emblemRows = vi.hoisted(() => [{ id: 'class-2', emblemPath: 'crest.png' as string | null }]);
vi.mock('../../../features/classes/service', () => ({ listTeacherClasses: vi.fn() }));
vi.mock('../../../lib/workspace-guard', () => ({ requireTeacherPage: vi.fn() }));
vi.mock('../../../db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => Promise.resolve(emblemRows) }) }) } }));
afterEach(cleanup);

test('shows captioned class table, mobile labels, and class destination', async () => {
  vi.mocked(listTeacherClasses).mockResolvedValue([{ id: 'class-2', name: '三年级二班' }] as never);
  render(await ClassesPage());
  expect(screen.getByRole('heading', { name: '园丁工作区' })).toBeInTheDocument();

  const table = screen.getByRole('table', { name: '班级' });
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['班级', '操作']);
  const row = within(table).getByRole('row', { name: /三年级二班/ });
  expect(within(row).getByRole('img', { name: '三年级二班班徽' })).toHaveAttribute('src', '/api/classes/class-2/emblem?v=crest.png');
  expect(within(row).getByText('班级')).toBeInTheDocument();
  expect(within(row).getByText('操作')).toBeInTheDocument();
  expect(within(row).getByRole('link', { name: /进入班级/ })).toHaveAttribute('href', '/classes/class-2');
});
