// 다른 사람 자리 (가장자리에 뒷면 패) 와 관전 중인 아래 자리

import type { GameView, RoomView, SeatView } from '@mighty/protocol';
import type { CSSProperties } from 'react';
import { CardBackView } from '../cards.js';
import { send } from '../net.js';
import type { Side } from './layout.js';
import { NameTag, TakenPile, BidBubble } from './parts.js';

export function Opponent({ room, game, seat, side, scale, compact }: { room: RoomView; game: GameView; seat: SeatView; side: Side; scale: number; compact: boolean }) {
  const count = game.handCounts[seat.seat] ?? 0;
  // 세로 화면에서는 모두 가로로 촘촘하게
  const vertical = !compact && (side === 'left' || side === 'right');
  const step = compact ? 5 : Math.round((vertical ? 14 : 16) * scale);
  const canTake = room.me.seat === null && seat.occupant === 'bot';
  const out = game.killed === seat.seat;
  return (
    <div className={`opponent side-${side} ${out ? 'out' : ''}`} data-seat={seat.seat}>
      <div className={`stack ${vertical ? 'vertical' : ''}`} style={{ '--step': `${step}px`, '--count': count } as CSSProperties}>
        {Array.from({ length: count }, (_, i) => (
          <CardBackView key={i} small />
        ))}
      </div>
      <div className="meta">
        <NameTag room={room} game={game} seat={seat} />
        <TakenPile room={room} game={game} seat={seat.seat} />
        <BidBubble game={game} seat={seat.seat} room={room} />
        {canTake && (
          <button className="take" onClick={() => send({ t: 'sit', seat: seat.seat })}>
            이 자리 넘겨받기
          </button>
        )}
      </div>
    </div>
  );
}

/** 관전자는 아래 자리 사람의 패를 뒷면으로 본다 */
export function SpectatorSeat({ room, game, seat }: { room: RoomView; game: GameView; seat: SeatView }) {
  return (
    <div className="opponent side-bottom" data-seat={seat.seat}>
      <div className="stack" style={{ '--step': '18px', '--count': game.handCounts[seat.seat] } as CSSProperties}>
        {Array.from({ length: game.handCounts[seat.seat] ?? 0 }, (_, i) => (
          <CardBackView key={i} small />
        ))}
      </div>
      <NameTag room={room} game={game} seat={seat} />
      <BidBubble game={game} seat={seat.seat} room={room} />
      {seat.occupant === 'bot' && (
        <button className="take" onClick={() => send({ t: 'sit', seat: seat.seat })}>
          이 자리 넘겨받기
        </button>
      )}
    </div>
  );
}
