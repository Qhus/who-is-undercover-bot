import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '摸鱼游戏工作台',
  description: 'Excel 风格的轻量联机游戏入口，包含谁是卧底与离谱法堂。',
  metadataBase: new URL('https://qhus.github.io/who-is-undercover-bot/'),
  openGraph: {
    title: '摸鱼游戏工作台',
    description: 'Excel 风格的轻量联机游戏入口，包含谁是卧底与离谱法堂。',
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
