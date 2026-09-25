import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '学生抽奖系统',
  description: '班级抽奖管理',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
