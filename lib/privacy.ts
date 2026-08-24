export const PRIVATE_REVEAL_MS = 4_000;
export const PRIVACY_IDLE_MS = 60_000;

export type PrivacyDismissReason = 'escape' | 'blur' | 'hidden' | 'idle' | 'sheet-change' | 'mode-change' | 'error';

type TimerHandle = ReturnType<typeof setTimeout>;

export interface PrivacyScheduler {
  set(callback: () => void, delay: number): TimerHandle;
  clear(handle: TimerHandle): void;
}

export interface PrivacyGuard {
  reveal(): void;
  activity(): void;
  mask(reason?: PrivacyDismissReason): void;
  dispose(): void;
}

const browserScheduler: PrivacyScheduler = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (handle) => clearTimeout(handle),
};

export function createPrivacyGuard(options: {
  onVisibilityChange: (visible: boolean, reason?: PrivacyDismissReason) => void;
  scheduler?: PrivacyScheduler;
  revealMs?: number;
  idleMs?: number;
}): PrivacyGuard {
  const scheduler = options.scheduler ?? browserScheduler;
  const revealMs = options.revealMs ?? PRIVATE_REVEAL_MS;
  const idleMs = options.idleMs ?? PRIVACY_IDLE_MS;
  let revealTimer: TimerHandle | undefined;
  let idleTimer: TimerHandle | undefined;

  const clearReveal = () => {
    if (revealTimer !== undefined) scheduler.clear(revealTimer);
    revealTimer = undefined;
  };
  const clearIdle = () => {
    if (idleTimer !== undefined) scheduler.clear(idleTimer);
    idleTimer = undefined;
  };
  const scheduleIdle = () => {
    clearIdle();
    idleTimer = scheduler.set(() => options.onVisibilityChange(false, 'idle'), idleMs);
  };
  const mask = (reason?: PrivacyDismissReason) => {
    clearReveal();
    options.onVisibilityChange(false, reason);
  };

  scheduleIdle();
  return {
    reveal() {
      clearReveal();
      options.onVisibilityChange(true);
      revealTimer = scheduler.set(() => options.onVisibilityChange(false, 'idle'), revealMs);
      scheduleIdle();
    },
    activity: scheduleIdle,
    mask,
    dispose() {
      clearReveal();
      clearIdle();
    },
  };
}

