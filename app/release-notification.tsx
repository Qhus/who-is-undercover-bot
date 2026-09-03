'use client';

import { useState } from 'react';
import { CURRENT_RELEASE, RELEASE_NOTES } from '@/lib/release-notes';

export function ReleaseNotificationButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <button
    className={`sheet-notification-trigger${open ? ' is-active' : ''}`}
    aria-expanded={open}
    aria-controls="release-notification-panel"
    onClick={onToggle}
  >通知 · {CURRENT_RELEASE.version}</button>;
}

export function ReleaseNotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selectedReleaseVersion, setSelectedReleaseVersion] = useState(CURRENT_RELEASE.version);
  if (!open) return null;
  const selectedRelease = RELEASE_NOTES.find((release) => release.version === selectedReleaseVersion) ?? CURRENT_RELEASE;

  return <aside className="sheet-notification-panel" id="release-notification-panel" aria-labelledby="release-notification-title">
    <header>
      <div><span>版本通知</span><strong id="release-notification-title">更新说明</strong><small>当前版本 {CURRENT_RELEASE.version}</small></div>
      <button onClick={onClose} aria-label="关闭更新说明栏">×</button>
    </header>
    <p className="sheet-notification-policy">内容随版本发布自动更新；暂不记录已读状态，也不发送推送。</p>
    <div className="sheet-release-list" aria-label="版本列表">{RELEASE_NOTES.map((release) => <button
      className={selectedRelease.version === release.version ? 'is-selected' : ''}
      onClick={() => setSelectedReleaseVersion(release.version)}
      key={release.version}
    ><span>{release.version}</span><strong>{release.title}</strong><small>{release.date}</small><p>{release.summary}</p></button>)}</div>
    <section className="sheet-release-detail" aria-live="polite">
      <span>{selectedRelease.version} · {selectedRelease.date}</span>
      <h2>{selectedRelease.title}</h2>
      <p>{selectedRelease.summary}</p>
      <ul>{selectedRelease.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
    </section>
  </aside>;
}
