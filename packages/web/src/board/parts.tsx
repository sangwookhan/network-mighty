// 자리 주변의 작은 표시들: 이름표, 딴 점수카드, 공약 말풍선, 무늬 아이콘, 남은 시간

import { askRename } from '../net.js';
import { NO_SUIT, type Bid } from '@mighty/engine';
import type { GameView, RoomView, SeatView } from '@mighty/protocol';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CardBackView, CardView, SUIT_NAME, SUIT_SYMBOL } from '../cards.js';
import { Dsb } from './Dsb.js';

export function bidLabel(b: Bid): ReactNode {
  if (b.type === 'pass') return <><span className="icon">⊘</span> 포기</>;
  if (b.type === 'dealMiss') return <><span className="icon">✕</span> 딜 미스</>;
  return <><SuitIcon suit={b.kiruda} /> {b.kiruda === NO_SUIT ? '노기루다' : SUIT_NAME[b.kiruda]} {b.goal}</>;
}

export function SuitIcon({ suit }: { suit: number }) {
  if (suit === NO_SUIT) return <span className="icon">N</span>;
  return <span className={`icon ${suit === 2 || suit === 3 ? 'red' : ''}`}>{SUIT_SYMBOL[suit]}</span>;
}

export function seatBadges(game: GameView, seat: number) {
  return (
    <>
      {seat === game.master && <span className="badge master">주공</span>}
      {game.friendSeat === seat && <span className="badge friend">프렌드</span>}
      {game.killed === seat && <span className="badge">탈락</span>}
    </>
  );
}

export function NameTag({ room, game, seat }: { room: RoomView; game: GameView; seat: SeatView }) {
  const waiting = game.waitingFor.find((x) => x.seat === seat.seat && x.kind !== 'continue');
  // 원작: 여당(주공, 공개된 프렌드) 이름은 하늘색
  const defender = seat.seat === game.master || seat.seat === game.friendSeat;
  const mine = seat.playerId !== null && seat.playerId === room.me.playerId;
  return (
    <div
      className={`name-tag ${waiting ? 'turn' : ''} ${defender ? 'defender' : ''} ${mine ? 'mine' : ''}`}
      onClick={mine ? askRename : undefined}
      title={mine ? '눌러서 내 이름 바꾸기' : undefined}
    >
      <span className="nick">
        {seat.nickname}
        {seat.occupant === 'bot' && ' 🤖'}
        {seat.reserved && ' (끊김)'}
      </span>
      {seatBadges(game, seat.seat)}
      <span className="money">{seat.money}</span>
      {waiting?.remainingMs != null && <Countdown remainingMs={waiting.remainingMs} />}
    </div>
  );
}

/** 딴 점수카드 (규칙에 따라 뒤집어 놓음) */
export function TakenPile({ room, game, seat }: { room: RoomView; game: GameView; seat: number }) {
  const cards = game.taken[seat] ?? [];
  if (cards.length === 0) return null;
  const kiruda = game.contract?.kiruda ?? NO_SUIT;
  return (
    <div className="taken">
      {cards.map((c) =>
        room.rules.flipScoredCards ? <CardBackView key={c} small /> : <CardView key={c} card={c} rules={room.rules} kiruda={kiruda} small />,
      )}
    </div>
  );
}

/** 공약 중이면 그 사람의 마지막 공약을 상자로 보여준다 */
export function BidBubble({ game, seat, room }: { game: GameView; seat: number; room: RoomView }) {
  if (game.phase !== 'election' || !game.election) return null;
  const last = [...game.election.log].reverse().find((l) => l.seat === seat);
  if (!last) return null;
  return (
    <Dsb title={room.seats[seat].nickname} className="bid-bubble">
      {bidLabel(last.bid)}
    </Dsb>
  );
}

/** 남은 시간: 서버가 보낸 남은 밀리초를 받은 시점부터 이 기기 시계로 센다 (서버와 시계가 달라도 맞음) */
export function Countdown({ remainingMs }: { remainingMs: number }) {
  // 새 값을 받을 때마다 이 기기 기준 마감 시각을 다시 잡는다
  const deadline = useMemo(() => Date.now() + remainingMs, [remainingMs]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className={`countdown ${left <= 5 ? 'urgent' : ''}`}>{left}초</span>;
}
