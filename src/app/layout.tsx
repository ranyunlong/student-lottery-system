import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '幸运游园会',
  description: '班级抽奖管理',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
