 'use client';
import { useState } from 'react';
import GameApp from './game-app';
import CourtSpreadsheetMode from './court-spreadsheet-mode';

export default function Home() {
  const [court, setCourt] = useState<{ code?: string; playerId?: string } | null>(null);
  return court ? <CourtSpreadsheetMode onBack={() => setCourt(null)} initialCode={court.code} initialPlayerId={court.playerId} /> : <GameApp onOpenCourt={() => setCourt({})} onJoinCourt={(code, playerId) => setCourt({ code, playerId })} />;
}
