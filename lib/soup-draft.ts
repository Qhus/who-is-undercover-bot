import type { SoupPrivateRound, SoupRoom } from './soup-game.ts';

export type SoupDraftStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
export interface SoupDraftSnapshot { text: string; status: SoupDraftStatus; }
export interface SoupDraftSaveResult { accepted: boolean; privateRound: SoupPrivateRound; }

export function soupRoundScope(room: Pick<SoupRoom, 'code' | 'sessionNo' | 'round'>, playerId: string) {
  return `${room.code}:${room.sessionNo}:${room.round}:${playerId}`;
}

export function acceptSoupRoom(current: SoupRoom | null, incoming: SoupRoom): SoupRoom {
  return current?.code === incoming.code && current.version > incoming.version ? current : incoming;
}

export function canEditSoupDraft(room: SoupRoom, playerId: string) {
  return room.round > 0 && room.hostId !== playerId && room.players.some((p) => p.id === playerId)
    && !['lobby', 'feedback', 'finished'].includes(room.status);
}

// One queue per player and round. Responses acknowledge snapshots, never replace newer typing.
export function createSoupDraftController(options: {
  save: (text: string, revision: number) => Promise<SoupDraftSaveResult>;
  onChange: (snapshot: SoupDraftSnapshot) => void;
  cache: (text: string | null) => void;
}) {
  let text = '';
  let savedText = '';
  let revision = 0;
  let ready = false;
  let disposed = false;
  let saving = false;
  let enabled = true;
  let conflict: SoupPrivateRound | null = null;
  const emit = (status: SoupDraftStatus) => { if (!disposed) options.onChange({ text, status }); };
  const cache = () => options.cache(text === savedText ? null : text);

  const flush = async (): Promise<void> => {
    if (disposed || !enabled || !ready || saving || conflict || text === savedText) return;
    saving = true;
    emit('saving');
    const sent = text;
    try {
      const result = await options.save(sent, revision);
      if (disposed) return;
      revision = result.privateRound.draftRevision ?? 0;
      if (!result.accepted && result.privateRound.draftText !== sent) {
        conflict = result.privateRound;
        emit('conflict');
        return;
      }
      savedText = sent;
      cache();
      emit(text === savedText ? 'saved' : 'idle');
    } catch {
      if (!disposed) { cache(); emit('error'); }
      return;
    } finally { saving = false; }
    if (!disposed && text !== savedText) await flush();
  };

  return {
    hydrate(packet: SoupPrivateRound, localText: string | null = null) {
      if (disposed || ready) return;
      ready = true;
      revision = packet.draftRevision ?? 0;
      savedText = packet.draftText;
      text = localText ?? savedText;
      // A restored unsaved draft is never silently written over a newer device's draft.
      if (localText !== null && localText !== savedText) conflict = packet;
      emit(conflict ? 'conflict' : 'saved');
    },
    update(value: string) {
      if (!ready || disposed || !enabled) return;
      text = value;
      cache();
      emit(conflict ? 'conflict' : saving ? 'saving' : 'idle');
    },
    resolveConflict(useLocal: boolean) {
      if (!conflict || disposed) return;
      savedText = conflict.draftText;
      revision = conflict.draftRevision ?? 0;
      if (!useLocal) text = savedText;
      conflict = null;
      cache();
      emit(text === savedText ? 'saved' : 'idle');
      if (useLocal) void flush();
    },
    setEnabled(value: boolean) { enabled = value; },
    flush,
    dispose() { disposed = true; },
  };
}
