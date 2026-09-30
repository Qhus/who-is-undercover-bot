'use client';

import { useState, type ReactNode } from 'react';

export type SoupSheetRow = {
  id: string;
  label: ReactNode;
  content: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  current?: boolean;
};

export function SoupWorksheet({ rows, label }: { rows: SoupSheetRow[]; label: string }) {
  return <table className="soup-record-grid" aria-label={label}>
    <colgroup><col className="soup-col-number" /><col className="soup-col-label" /><col /><col className="soup-col-status" /><col className="soup-col-action" /></colgroup>
    <thead><tr><th aria-label="行号" />{['A', 'B', 'C', 'D'].map(letter => <th key={letter} scope="col">{letter}</th>)}</tr></thead>
    <tbody>
      <tr className="soup-grid-heading"><th scope="row">1</th><td>项目</td><td>内容</td><td>状态</td><td>操作</td></tr>
      {rows.map((row, i) => <tr key={row.id} className={row.current ? 'soup-current-row' : undefined} data-row-id={row.id}>
        <th scope="row">{i + 2}</th><td className="soup-row-label">{row.label}</td><td className="soup-row-content">{row.content}</td>
        <td className="soup-row-status" data-label="状态">{row.status ?? '—'}</td><td className="soup-row-action" data-label="操作">{row.action}</td>
      </tr>)}
      {Array.from({ length: Math.max(3, 28 - rows.length) }, (_, i) => <tr className="soup-blank-row" key={`blank-${i}`} aria-hidden="true"><th>{rows.length + i + 2}</th><td /><td /><td /><td /></tr>)}
    </tbody>
  </table>;
}

export function SoupCellText({ text, limit = 180 }: { text?: string | null; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span className="soup-muted">暂无内容</span>;
  const shortened = text.length > limit;
  return <div className="soup-cell-text"><p>{shortened && !expanded ? `${text.slice(0, limit)}…` : text}</p>{shortened && <button className="soup-text-button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起正文' : '展开全文'}</button>}</div>;
}
