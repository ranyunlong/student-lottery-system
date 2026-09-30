import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

export function AdminPager({ basePath, params, previousCursor, nextCursor, pageSize }: {
  basePath: string;
  params: URLSearchParams;
  previousCursor: string | null;
  nextCursor: string | null;
  pageSize: number;
}) {
  function href(cursor: string, direction: 'prev' | 'next') {
    const query = new URLSearchParams(params);
    query.set('cursor', cursor);
    query.set('direction', direction);
    return `${basePath}?${query}`;
  }

  return <nav aria-label="列表分页" className="flex flex-wrap items-center justify-between gap-3 border-t border-workspace-line pt-4 text-sm">
    <span className="text-workspace-muted tabular-nums">每页 {pageSize} 条</span>
    <div className="flex gap-2">
      {previousCursor ? <Button asChild size="sm" variant="outline" className="min-h-11"><Link href={href(previousCursor, 'prev')}><ChevronLeft aria-hidden="true" className="size-4" />上一页</Link></Button>
        : <Button size="sm" variant="outline" disabled><ChevronLeft aria-hidden="true" className="size-4" />上一页</Button>}
      {nextCursor ? <Button asChild size="sm" variant="outline" className="min-h-11"><Link href={href(nextCursor, 'next')}>下一页<ChevronRight aria-hidden="true" className="size-4" /></Link></Button>
        : <Button size="sm" variant="outline" disabled>下一页<ChevronRight aria-hidden="true" className="size-4" /></Button>}
    </div>
  </nav>;
}
