import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '协作数据表',
  description: '轻量成员流程与选择同步页面',
  metadataBase: new URL('https://qhus.github.io/who-is-undercover-bot/'),
  openGraph: {
    title: '协作数据表',
    description: '轻量成员流程与选择同步页面',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
