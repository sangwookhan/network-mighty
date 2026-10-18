// 판의 변화에 맞춘 효과음

import type { GameView, RoomView } from '@mighty/protocol';
import { useEffect, useRef } from 'react';
import { play as sfx } from '../sound.js';

/** 판의 변화에 맞춰 효과음을 낸다 (처음 그릴 때는 조용히) */
export function useGameSounds(room: RoomView, game: GameView) {
  const prev = useRef<{ deal: number; phase: string; req: number | null; trick: string } | null>(null);
  useEffect(() => {
    const cards = game.trick?.cards.length ?? 0;
    const now = { deal: game.dealNo, phase: game.phase, req: game.myRequestId, trick: `${game.dealNo}:${game.turn}:${cards}` };
    const p = prev.current;
    prev.current = now;
    if (!p) return;
    if (now.deal !== p.deal) sfx('shuffle');
    if (now.trick !== p.trick && cards > 0) sfx('play');
    if (now.req !== null && now.req !== p.req) {
      const kind = game.myRequest?.kind;
      // 당선: 축하음 (바닥패 받는 소리는 내 패 애니메이션이 낸다)
      if (kind === 'final') sfx('elected');
      else if (kind === 'play' || kind === 'bid' || kind === 'kill') sfx('turn');
    }
    const me = room.me.seat;
    if (now.phase === 'result' && p.phase !== 'result' && game.result && me !== null) {
      sfx(game.result.after[me] >= game.result.before[me] ? 'win' : 'lose');
    }
  });
}
