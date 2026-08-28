import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '协作工作簿',
  description: 'Excel 风格的轻量多人协作流程入口。',
  metadataBase: new URL('https://qhus.github.io/who-is-undercover-bot/'),
  openGraph: {
    title: '协作工作簿',
    description: 'Excel 风格的轻量多人协作流程入口。',
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
