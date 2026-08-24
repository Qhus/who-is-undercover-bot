import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '卧底裁判局',
  description: '不需要主持人的谁是卧底发牌与投票裁判器',
  metadataBase: new URL('https://qhus.github.io/who-is-undercover-bot/'),
  openGraph: {
    title: '卧底裁判局｜偷偷发牌，认真数票',
    description: '不需要主持人的谁是卧底发牌与投票裁判器',
    type: 'website',
    images: [{ url: 'social-preview.png', width: 1200, height: 630, alt: '卧底裁判局分享预览' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
