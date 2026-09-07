'use client';

import { useCallback, useId, useRef, useState } from 'react';

export type WorkbookNote = { title: string; text: string; scope?: string };

/** Explicit, public-text-only notes. Never scrape a cell, input or private packet. */
export function useWorkbookNotes(scope: string) {
  const [state, setState] = useState<{ scope: string; note: WorkbookNote | null }>({ scope, note: null });
  // Forget notes on any sheet/phase/session change, including a later return to that sheet.
  if (state.scope !== scope) setState({ scope, note: null });
  const setNote = (note: WorkbookNote | null) => setState({ scope, note });
  return { note: state.scope === scope ? state.note : null, setNote };
}

export function useWorkbookNotice(initial = '就绪') {
  const [state, setState] = useState({ text: initial, kind: 'info' as 'info' | 'error' });
  const setNotice = useCallback((text: string, kind: 'info' | 'error' = 'info') => setState({ text, kind }), []);
  return [state.text, setNotice, state.kind] as const;
}

/** Opt in only for already-public text. Never use for words, drafts or host-only material. */
export function WorkbookText({ text, title = '完整内容', onOpen }: { text: string; title?: string; onOpen: (note: WorkbookNote) => void }) {
  return <button type="button" className="workbook-text" aria-label={`查看${title}`} onClick={() => onOpen({ title, text })}>{text}</button>;
}

export function WorkbookFeedback({ note, onClose, status = '就绪', kind = 'info' }: {
  note: WorkbookNote | null;
  onClose: () => void;
  status?: string;
  kind?: 'info' | 'error';
}) {
  const contentId = useId();
  const [collapsed, setCollapsed] = useState<WorkbookNote | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const expanded = Boolean(note && note !== collapsed);
  return <section className="workbook-feedback" aria-label="工作表批注与状态">
    {note && <aside className="workbook-note" aria-label="完整批注">
      <div className="workbook-note-heading">
        <button ref={toggle} type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setCollapsed(expanded ? note : null)}>{expanded ? '▾' : '▸'} 批注 · {note.title}</button>
        <button type="button" onClick={onClose} aria-label="关闭完整批注">关闭</button>
      </div>
      {expanded && <div id={contentId} className="workbook-note-content" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Escape') { setCollapsed(note); toggle.current?.focus(); } }}>{note.text}</div>}
    </aside>}
    <div className={`workbook-status workbook-status--${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-atomic="true"><span>{kind === 'error' ? '需要处理' : '状态'}</span><p>{status}</p></div>
  </section>;
}

/** Column widths belong to the sheet layout, never to individual colSpan cells. */
export function WorkbookColumns({ count = 6 }: { count?: number }) {
  return <colgroup><col className="workbook-col-index" />{Array.from({ length: count }, (_, index) => <col className={`workbook-col-${'abcdefg'[index]}`} key={index} />)}</colgroup>;
}
