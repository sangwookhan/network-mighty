// 판 상태 변화로 읽는 음성: 각자 공약, 트릭 가져감, 내 차례, 5초 남음. (서버 시스템 안내로 읽는 것은 Room.tsx)

import type { GameView, RoomView } from '@mighty/protocol';
import { useEffect, useRef } from 'react';
import { bidText } from '../panels.js';
import { speak } from '../voice.js';

export function useGameVoice(room: RoomView, game: GameView) {
  const me = room.me.seat;
  const prev = useRef<{ deal: number; log: number; trickDone: string | null; req: number | null; result: boolean } | null>(null);
  const complete = game.phase === 'play' && !!game.lastTrick && !!game.trick && game.trick.cards.length === game.active.length;

  useEffect(() => {
    const log = game.election?.log ?? [];
    const now = { deal: game.dealNo, log: log.length, trickDone: complete ? `${game.dealNo}:${game.turn}` : null, req: game.myRequestId, result: game.phase === 'result' && !!game.result };
    const p = prev.current;
    prev.current = now;
    if (!p) return; // 처음 그릴 때는 조용히
    // 각자 공약 (내 것과 딜 미스는 빼고: 딜 미스는 서버 안내로 읽는다)
    // (선거가 끝나는 마지막 공약은 당선 안내가 먼저 오므로 읽지 않는다)
    if (now.deal === p.deal && now.log > p.log && game.phase === 'election' && game.master === null)
      for (const e of log.slice(p.log)) if (e.seat !== me && e.bid.type !== 'dealMiss') speak('bid', e.bid.type === 'pass' ? `${room.seats[e.seat]?.nickname}님 출마 포기` : `${room.seats[e.seat]?.nickname}님 ${bidText(e.bid)} 출마`);
    // 트릭 가져감
    if (now.trickDone && now.trickDone !== p.trickDone) speak('trick', game.lastTrick!.winner === me ? '내가 가져감' : `${room.seats[game.lastTrick!.winner]?.nickname}님 가져감`);
    // 판 결과: 런·빽런, 어느 편 승리, 내가 이겼으면 축하
    if (now.result && !(p.result && p.deal === now.deal)) {
      const r = game.result!;
      const s = r.settlement;
      const parts: string[] = [];
      if (s.defenderWon && s.defenderPoints >= 20) parts.push('런입니다!');
      else if (s.formula.includes('빽런')) parts.push('빽런입니다!');
      parts.push(`${s.defenderWon ? '여당' : '야당'} 승리입니다.`);
      if (me !== null && me !== game.killed) {
        const mine = me === r.master || me === r.friend;
        parts.push(mine === s.defenderWon ? '축하합니다!' : '아쉽습니다.');
      }
      speak('result', parts.join(' '));
    }
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
