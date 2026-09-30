import Link from 'next/link';
import { ArrowLeft, ArrowRight, Award } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import type { WinningRecord } from '../redemptions/service';
import styles from './onsite-screen.module.css';

const formatDate = (value: Date) => value.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

export function SessionResults({ classId, className, sessionId, sessionTitle, sessionStatus, mode, wins }: {
  classId: string;
  className: string;
  sessionId: string;
  sessionTitle?: string | null;
  sessionStatus: 'active' | 'completed';
  mode: 'student-prize' | 'prize-student';
  wins: WinningRecord[];
}) {
  const records = wins.filter((item) => item.sessionId === sessionId);
  return <section role="region" aria-label="本场中奖记录" className={`${styles.screen} fixed inset-0 z-[100] overflow-y-auto`}>
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-5 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#e7c873]"><Award aria-hidden="true" className="size-4" />{className} · 抽奖{sessionStatus === 'active' ? '进行中' : '已结束'}</p>
          <h1 className="mt-2 break-words text-2xl font-semibold text-white">{sessionTitle ? `${sessionTitle} · 中奖记录` : '本场中奖记录'}</h1>
          <p className="mt-1 text-sm text-white/65">{mode === 'student-prize' ? '指定学生 · 随机奖品' : '指定奖品 · 随机学生'}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {sessionStatus === 'active' && <Button asChild variant="secondary"><Link className="min-h-11" href={`/classes/${classId}/lotteries/${sessionId}`}><ArrowRight aria-hidden="true" className="size-4" />返回现场抽奖</Link></Button>}
          <Button asChild variant={sessionStatus === 'active' ? 'quiet' : 'secondary'}><Link className="min-h-11" href={`/classes/${classId}/lotteries`}><ArrowLeft aria-hidden="true" className="size-4" />返回场次列表</Link></Button>
        </div>
      </header>
      <section aria-label="中奖记录" className="mt-6 min-w-0 flex-1">
        {records.length ? <div className="overflow-x-auto rounded-md border border-white/15 bg-white text-workspace-ink shadow-2xl">
          <Table>
            <TableCaption className="sr-only">本场中奖记录</TableCaption>
            <TableHeader><TableRow><TableHead>序号</TableHead><TableHead>学生</TableHead><TableHead>奖品</TableHead><TableHead>中奖时间</TableHead></TableRow></TableHeader>
            <TableBody>{records.map((record, index) => <TableRow key={record.id}>
              <TableCell>{String(index + 1).padStart(2, '0')}</TableCell>
              <TableCell><span className="font-semibold">{record.studentNameSnapshot}</span><span className="ml-2 text-sm text-workspace-muted">{record.studentNumberSnapshot}</span></TableCell>
              <TableCell className="font-semibold">{record.prizeNameSnapshot}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{formatDate(record.createdAt)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div> : <p className="border-y border-white/15 py-8 text-center text-sm text-white/70">本场暂无中奖记录</p>}
      </section>
    </div>
  </section>;
}
