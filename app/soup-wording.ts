'use client';

import { useSyncExternalStore } from 'react';

export type SoupTextMode = 'clear' | 'discreet';
const storageKey = 'soup-text-mode-v1';
const changeEvent = 'soup-text-mode-change';
let sessionChoice: SoupTextMode | undefined;

function readMode(): SoupTextMode {
  if (sessionChoice) return sessionChoice;
  try { return window.localStorage.getItem(storageKey) === 'discreet' ? 'discreet' : 'clear'; }
  catch { return 'clear'; }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) { sessionChoice = undefined; onChange(); }
  };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(changeEvent, onChange); window.removeEventListener('storage', onStorage); };
}

const serverMode = () => null;

export function useSoupTextMode() {
  const saved = useSyncExternalStore(subscribe, readMode, serverMode);
  const setMode = (mode: SoupTextMode) => {
    sessionChoice = mode;
    try { window.localStorage.setItem(storageKey, mode); } catch { /* The choice still works for this page session. */ }
    window.dispatchEvent(new Event(changeEvent));
  };
  // Keep the initial static render neutral until the browser preference is known.
  return { mode: saved ?? 'discreet', ready: saved !== null, setMode };
}

export function soupWording(mode: SoupTextMode, clear: string, discreet: string) {
  return mode === 'clear' ? clear : discreet;
}
