'use client';

import { usePathname } from 'next/navigation';

export default function WorkspaceTemplate({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isLiveSession = /^\/classes\/[^/]+\/lotteries\/[^/]+$/.test(pathname);
  return <div className={isLiveSession ? 'min-w-0' : 'route-enter min-w-0'}>{children}</div>;
}
