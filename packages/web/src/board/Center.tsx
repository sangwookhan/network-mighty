// 판 가운데: 바닥패, 선거 표시, 트릭 카드 (날아오기·가져가기 애니메이션)

import { NO_SUIT, type Card, type Suit } from '@mighty/engine';
import type { GameView, RoomView } from '@mighty/protocol';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CardBackView, CardView, SUIT_NAME } from '../cards.js';
import { play as sfx } from '../sound.js';
import { flyFrom } from './MyHand.js';
import { type Side, type MySide, trickOffset, farOffset, offsetTransform } from './layout.js';
import { SuitIcon } from './parts.js';

/** 트릭이 끝난 뒤: 잠깐 보여 주고(show) → 가져간 사람 쪽으로 날아가고(fly) → 사라짐(gone) */
export type CollectStage = 'show' | 'fly' | 'gone';

export const SHOW_MS = 700;

export const FLY_MS = 550;

export function Center({ room, game, sideOf, kiruda }: { room: RoomView; game: GameView; sideOf: Map<number, Side | MySide>; kiruda: Suit }) {
  const n = room.seats.length;
  const trickCards = game.trick?.cards ?? [];
  // 마지막 카드가 나오면 서버는 trick(다 찬 상태)과 lastTrick 을 함께 보낸다
  const complete = game.phase === 'play' && !!game.lastTrick && trickCards.length > 0 && trickCards.length === game.active.length;
  const trickKey = `${game.dealNo}:${game.turn}`;
  const [collect, setCollect] = useState<{ key: string; stage: CollectStage; to?: [number, number] | null } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const winnerSeat = complete ? game.lastTrick!.winner : null;
  useEffect(() => {
    if (!complete) return;
    setCollect({ key: trickKey, stage: 'show' });
    // 가져간 사람의 실제 자리(이름표)로 날린다. 배치(6마, 휴대폰)가 달라도 그 사람에게 간다
    const t1 = setTimeout(() => (setCollect({ key: trickKey, stage: 'fly', to: seatPoint(box.current, winnerSeat) }), sfx('collect')), SHOW_MS);
    const t2 = setTimeout(() => setCollect({ key: trickKey, stage: 'gone' }), SHOW_MS + FLY_MS);
    return () => (clearTimeout(t1), clearTimeout(t2));
  }, [complete, trickKey, winnerSeat]);
  const stage: CollectStage | null = complete ? (collect?.key === trickKey ? collect.stage : 'show') : null;
  const winner = complete ? game.lastTrick!.winner : null;
  const cards = stage === 'gone' ? [] : trickCards;
  const winnerSide = winner !== null ? (sideOf.get(winner) ?? 'bottom') : null;

  return (
    <div className={`center ${stage === 'fly' ? 'collecting' : ''}`} ref={box}>
      {(game.phase === 'election' || game.phase === 'kill') && (
        <div className="kitty">
          <CardBackView />
        </div>
      )}
      {game.phase === 'election' && <div className="election-box">{game.dealNo === 1 ? '초대' : `${game.dealNo}대`} 선거</div>}
      {cards.map((c) => (
        <TrickCard
          key={`${trickKey}:${c.seat}`}
          card={c.card}
          room={room}
          kiruda={kiruda}
          at={trickOffset(sideOf.get(c.seat) ?? 'bottom', n)}
          from={farOffset(sideOf.get(c.seat) ?? 'bottom', n)}
          flyTo={stage === 'fly' && winnerSide ? (collect?.to ? pxTransform(collect.to) : offsetTransform(farOffset(winnerSide, n), ' scale(0.5)')) : null}
          winner={stage === 'show' && c.seat === winner}
        />
      ))}
      {game.trick?.jokercall && !complete && <div className="center-flash">조커콜!</div>}
      {game.trick && game.trick.jokerSuit !== NO_SUIT && !complete && (
        <div className="center-note">
          조커 · <SuitIcon suit={game.trick.jokerSuit} />{' '}
          {game.trick.jokerSuit === kiruda ? <b className="kiruda-come-text">기루다 컴!</b> : `${SUIT_NAME[game.trick.jokerSuit]} 컴`}
        </div>
      )}
      {winner !== null && stage !== 'gone' && <div className="center-note">{room.seats[winner].nickname} 님이 가져감</div>}
    </div>
  );
}

/** 그 좌석 이름표의 가운데 (판 가운데 기준 px). 못 찾으면 null */
function seatPoint(center: HTMLElement | null, seat: number | null): [number, number] | null {
  if (!center || seat === null) return null;
  const board = center.closest('.board');
  const el = board?.querySelector(`[data-seat="${seat}"]`);
  const target = el?.querySelector('.name-tag') ?? el;
  if (!target) return null;
  const r = target.getBoundingClientRect();
  const o = center.getBoundingClientRect();
  return [r.left + r.width / 2 - o.left, r.top + r.height / 2 - o.top];
}

const pxTransform = ([x, y]: [number, number]) => `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0.5)`;

/** 낸 카드: 자기 자리에서 가운데로 날아오고, 트릭이 끝나면 가져간 사람 쪽으로 날아간다 */
export function TrickCard({ card, room, kiruda, at, from, flyTo, winner }: {
  card: Card;
  room: RoomView;
  kiruda: Suit;
  at: [number, number];
  from: [number, number];
  /** 날아갈 곳의 transform (가져간 사람 자리) */
  flyTo: string | null;
  winner: boolean;
}) {
  const [arrived, setArrived] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // 내가 낸 카드는 내 패에 있던 자리에서 출발한다 (화면 좌표 → 가운데 기준 px)
  const [fromPx, setFromPx] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    const r = flyFrom.get(card);
    const origin = ref.current?.parentElement?.getBoundingClientRect();
    if (r && origin) {
      flyFrom.delete(card);
      setFromPx([r.left + r.width / 2 - origin.left, r.top + r.height / 2 - origin.top]);
    }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setArrived(true)));
    return () => cancelAnimationFrame(id);
  }, [card]);
  const start = fromPx ? `translate(calc(-50% + ${fromPx[0]}px), calc(-50% + ${fromPx[1]}px))` : offsetTransform(from, ' scale(0.8)');
  const style: CSSProperties = flyTo
    ? { transform: flyTo, opacity: 0 }
    : { transform: arrived ? offsetTransform(at) : start };
  return (
    <div ref={ref} className={`trick-card ${winner ? 'winner' : ''} ${flyTo ? 'flying' : ''}`} style={style}>
      <CardView card={card} rules={room.rules} kiruda={kiruda} />
    </div>
  );
}
