// 판 상태 변화로 읽는 음성: 각자 공약, 트릭 가져감, 내 차례, 5초 남음. (서버 시스템 안내로 읽는 것은 Room.tsx)

import type { GameView, RoomView } from '@mighty/protocol';
import { useEffect, useRef } from 'react';
import { bidText } from '../panels.js';
import { speak } from '../voice.js';

export function useGameVoice(room: RoomView, game: GameView) {
  const me = room.me.seat;
  const prev = useRef<{ deal: number; log: number; trickDone: string | null; req: number | null } | null>(null);
  const complete = game.phase === 'play' && !!game.lastTrick && !!game.trick && game.trick.cards.length === game.active.length;

  useEffect(() => {
    const log = game.election?.log ?? [];
    const now = { deal: game.dealNo, log: log.length, trickDone: complete ? `${game.dealNo}:${game.turn}` : null, req: game.myRequestId };
    const p = prev.current;
    prev.current = now;
    if (!p) return; // 처음 그릴 때는 조용히
    // 각자 공약 (내 것과 딜 미스는 빼고: 딜 미스는 서버 안내로 읽는다)
    // (선거가 끝나는 마지막 공약은 당선 안내가 먼저 오므로 읽지 않는다)
    if (now.deal === p.deal && now.log > p.log && game.phase === 'election' && game.master === null)
      for (const e of log.slice(p.log)) if (e.seat !== me && e.bid.type !== 'dealMiss') speak('bid', `${room.seats[e.seat]?.nickname}, ${bidText(e.bid)}`);
    // 트릭 가져감
    if (now.trickDone && now.trickDone !== p.trickDone) speak('trick', game.lastTrick!.winner === me ? '내가 가져감' : `${room.seats[game.lastTrick!.winner]?.nickname}님 가져감`);
    // 내 차례
    const kind = game.myRequest?.kind;
    if (now.req !== null && now.req !== p.req && (kind === 'play' || kind === 'bid' || kind === 'final' || kind === 'kill')) speak('turn', '내 차례입니다');
  });

  // 남은 시간 5초: 요청을 받은 순간 남은 시간으로 한 번 맞춰 둔다 (일시정지면 남은 시간이 없어 취소)
  const w = me !== null ? game.waitingFor.find((x) => x.seat === me) : undefined;
  const ms = w?.remainingMs ?? null;
  useEffect(() => {
    if (ms === null || ms <= 5000) return;
    const t = setTimeout(() => speak('turn', '5초 남았습니다'), ms - 5000);
    return () => clearTimeout(t);
    // ms 는 메시지마다 조금씩 줄어 들어오므로, 요청이 바뀌거나 멈춤/재개될 때만 다시 맞춘다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.myRequestId, ms === null]);
}
