// 내 패: 고정 자리 배치, 카드 내기, 바닥패 받기, 조커·조커콜 선택

import { JOKER, NO_SUIT, isKiruda, jokercallOf, mightyOf, powerOf, suitOf, type Card, type Suit } from '@mighty/engine';
import type { GameView, RoomView } from '@mighty/protocol';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CardView, SUIT_NAME, SUIT_SYMBOL, shortName } from '../cards.js';
import { act } from '../net.js';
import { play as sfx } from '../sound.js';
import { Dsb } from './Dsb.js';
import { NameTag, TakenPile, BidBubble } from './parts.js';

/** 내가 낸 카드가 내 패의 어느 자리에서 날아가는지 (화면 좌표) */
export const flyFrom = new Map<Card, DOMRect>();

/** 카드를 내면서, 그 카드가 내 패에 있던 자리를 기억해 둔다 */
export function playCard(a: { kind: 'play'; card: Card; jokerSuit?: Suit; jokercall?: boolean }) {
  const el = document.querySelector(`.my-hand-cards [data-card="${a.card}"]`);
  if (el) flyFrom.set(a.card, el.getBoundingClientRect());
  act(a);
}

/** 무늬별로 묶어 고정 자리를 정한다 (무늬 사이에 틈). 마이티·조커는 맨 앞 묶음 */
/**
 * 내 패 정렬: 조커, 마이티, 마이티와 같은 무늬, 그다음은 앞 무늬와 색이 다른 무늬 순.
 * 마이티가 없으면 항상 ♠◆♣♥, 마이티가 ◆A면 ◆♠♥♣ (없는 무늬는 건너뜀). 같은 무늬는 센 카드부터.
 */
const SUIT_ORDER: Record<Suit, Suit[]> = {
  0: [1, 2, 4, 3],
  1: [1, 2, 4, 3], // ♠◆♣♥
  2: [2, 1, 3, 4], // ◆♠♥♣
  3: [3, 1, 2, 4], // ♥♠◆♣
  4: [4, 2, 1, 3], // ♣◆♠♥
};

export function handOrder(hand: readonly Card[], rules: RoomView['rules'], kiruda: Suit): Card[] {
  const mighty = mightyOf(rules, kiruda);
  const suits = SUIT_ORDER[hand.includes(mighty) ? suitOf(mighty) : NO_SUIT];
  const rank = (c: Card) => (c === JOKER ? -2 : c === mighty ? -1 : suits.indexOf(suitOf(c)) * 100 + (20 - powerOf(c)));
  return [...hand].sort((a, b) => rank(a) - rank(b));
}

export function handSlots(order: readonly Card[], rules: RoomView['rules'], cw: number, avail: number, kiruda: Suit = NO_SUIT): { x: Map<Card, number>; width: number } {
  const mighty = mightyOf(rules, kiruda);
  const groupOf = (c: Card) => (c === mighty || c === JOKER ? 0 : suitOf(c));
  let groups = 0;
  for (let i = 1; i < order.length; i++) if (groupOf(order[i]) !== groupOf(order[i - 1])) groups++;
  const gap = cw * 0.22;
  const n = order.length;
  const step = n > 1 ? Math.max(cw * 0.22, Math.min(cw + 2, (avail - cw - groups * gap) / (n - 1))) : cw;
  const x = new Map<Card, number>();
  let pos = 0;
  order.forEach((c, i) => {
    if (i > 0) pos += step + (groupOf(c) !== groupOf(order[i - 1]) ? gap : 0);
    x.set(c, pos);
  });
  return { x, width: n ? pos + cw : cw };
}

export function MyHand({ room, game, kiruda, boardWidth, cw, portrait, discards, setDiscards }: {
  room: RoomView;
  game: GameView;
  kiruda: Suit;
  boardWidth: number;
  cw: number;
  portrait: boolean;
  /** 주공 정리 중이면 고른 카드 (아니면 null) */
  discards: Card[] | null;
  setDiscards: (f: (d: Card[]) => Card[]) => void;
}) {
  const rules = room.rules;
  const req = game.myRequest?.kind === 'play' ? game.myRequest : null;
  const [ask, setAsk] = useState<'jokerSuit' | 'jokercall' | null>(null);
  const jc = jokercallOf(rules, kiruda);
  // 내 패 배치: 판 동안 처음 정렬 순서와 자리를 고정한다 (카드를 내도 나머지는 움직이지 않는다).
  // 다시 배치하는 때: 새 판, 바닥패를 받거나(카드가 늘어남) 버린 뒤 플레이가 시작될 때. 이때는 미끄러지듯 이동한다.
  const group = game.phase === 'final' ? 'final' : game.phase === 'play' || game.phase === 'result' ? 'play' : 'deal';
  const layoutKey = `${game.dealNo}:${group}`;
  const layoutRef = useRef<{ key: string; order: Card[] } | null>(null);
  // 당선 뒤 새로 받은 바닥패: 판 가운데에서 날아와 정리가 끝날 때까지 표시한다
  const freshRef = useRef<{ key: string; cards: Card[]; shown: boolean } | null>(null);
  let layout = layoutRef.current;
  if (!layout || layout.key !== layoutKey || game.myHand.some((c) => !layout!.order.includes(c))) {
    const before = layout;
    // 조커·마이티 → 마이티 무늬부터 검정·빨강 번갈아 (기루다가 정해지면 그 판의 마이티 기준). 다시 배치할 때까지 유지
    layout = { key: layoutKey, order: handOrder(game.myHand, rules, kiruda) };
    layoutRef.current = layout;
    if (group === 'final' && before?.key === `${game.dealNo}:deal`) {
      const cards = layout.order.filter((c) => !before.order.includes(c));
      if (cards.length > 0) freshRef.current = { key: layoutKey, cards, shown: false };
    }
  }
  const fresh = freshRef.current?.key === layoutKey ? freshRef.current : null;
  const handRef = useRef<HTMLDivElement>(null);
  const [receiving, setReceiving] = useState(false);
  useLayoutEffect(() => {
    if (!fresh || fresh.shown) return;
    fresh.shown = true;
    const box = handRef.current;
    const center = box?.closest('.board')?.querySelector('.center')?.getBoundingClientRect();
    if (!box || !center) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const START = 450; // 축하 상자가 먼저 뜨고 나서
    const GAP = 320;
    const FLY = 600;
    fresh.cards.forEach((c, i) => {
      const el = box.querySelector<HTMLElement>(`[data-slot="${c}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = center.left - (r.left + r.width / 2);
      const dy = center.top - (r.top + r.height / 2);
      const delay = START + i * GAP;
      if (!still) {
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(0.8) rotate(${(i - 1) * 10}deg)`, opacity: 0.6 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: FLY, delay, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' },
        );
      }
      setTimeout(() => sfx('deal'), delay);
    });
    setReceiving(true);
    const t = setTimeout(() => setReceiving(false), START + fresh.cards.length * GAP + FLY);
    return () => clearTimeout(t);
  }, [fresh]);
  // 넓은 화면은 내 패를 오른쪽 아래에 붙인다: 판 폭의 절반까지만 펼쳐 왼쪽 아래(채팅 창)를 비워 둔다
  // (6마는 영역이 36%부터라 그 폭에서 내 이름표 자리 약 240px 를 뺀 만큼)
  const wideAvail = boardWidth * (room.seats.length === 6 ? 0.64 : 0.76) - 8 - 240;
  const avail = portrait ? boardWidth - 8 : boardWidth > 900 ? Math.min(wideAvail, boardWidth * 0.5, 15 * cw) : Math.min(boardWidth * 0.86, 15 * cw);
  const slots = handSlots(layout.order, rules, cw, avail, kiruda);
  const inHand = new Set(game.myHand);
  // 내가 주공이면 내 패의 기루다를 분홍 테두리로 (노기루다면 없음)
  const showTrump = room.me.seat !== null && game.master === room.me.seat && kiruda !== NO_SUIT;
  const seat = room.seats[room.me.seat!];

  const play = (card: Card) => {
    if (!req) return;
    if (card === JOKER && req.mustDeclareJokerSuit) return setAsk('jokerSuit');
    if (card === jc && req.canJokercall) return setAsk('jokercall');
    playCard({ kind: 'play', card });
  };
  useEffect(() => setAsk(null), [game.myRequestId]);
  const toggleDiscard = (c: Card) => setDiscards((d) => (d.includes(c) ? d.filter((x) => x !== c) : d.length < 3 ? [...d, c] : d));
  const discarding = discards !== null;

  return (
    <div className={`my-area ${receiving ? 'receiving' : ''}`}>
      {req && !ask && <div className="my-prompt">내 차례입니다. 낼 카드를 고르세요</div>}
      {discarding && (
        <div className="my-prompt">
          {fresh && <span className="fresh-note">바닥패 {fresh.cards.length}장을 받았습니다 · </span>}버릴 카드 3장을 눌러 올리세요 ({discards.length}/3)
        </div>
      )}
      {ask === 'jokerSuit' && (
        <Dsb title="조커로 선을 잡습니다" className="dsb-inline">
          무늬를 부르세요{' '}
          {/* 기루다 컴을 맨 앞에 강조, 나머지 무늬는 '○○ 컴' (노기루다 판이면 기루다 컴 없음) */}
          {kiruda !== NO_SUIT && (
            <button className="primary kiruda-come" onClick={() => (setAsk(null), playCard({ kind: 'play', card: JOKER, jokerSuit: kiruda }))}>
              기루다 컴 ({SUIT_SYMBOL[kiruda]})
            </button>
          )}
          {[1, 2, 3, 4]
            .filter((s) => s !== kiruda)
            .map((s) => (
              <button key={s} onClick={() => (setAsk(null), playCard({ kind: 'play', card: JOKER, jokerSuit: s as Suit }))}>
                {SUIT_SYMBOL[s]} {SUIT_NAME[s]} 컴
              </button>
            ))}
          <button onClick={() => setAsk(null)}>취소</button>
        </Dsb>
      )}
      {ask === 'jokercall' && (
        <Dsb title="조커콜 카드입니다" className="dsb-inline">
          <button className="primary" onClick={() => (setAsk(null), playCard({ kind: 'play', card: jc, jokercall: true }))}>
            조커콜!
          </button>
          <button onClick={() => (setAsk(null), playCard({ kind: 'play', card: jc, jokercall: false }))}>조커콜 안 함</button>
          <button onClick={() => setAsk(null)}>취소</button>
        </Dsb>
      )}
      <div className="my-row">
        <div className="my-hand-cards" style={{ width: slots.width }} ref={handRef}>
          {layout.order.filter((c) => inHand.has(c)).map((c) => (
            <div key={c} className={`slot ${fresh?.cards.includes(c) ? 'fresh' : ''} ${showTrump && isKiruda(c, kiruda) ? 'trump' : ''}`} data-slot={c} style={{ left: slots.x.get(c) }}>
              <CardView
                card={c}
                rules={rules}
                kiruda={kiruda}
                onClick={discarding ? () => toggleDiscard(c) : req ? () => play(c) : undefined}
                disabled={!!req && !req.legal.includes(c)}
                selected={discarding && discards.includes(c)}
              />
            </div>
          ))}
        </div>
        <div className="my-tag" data-seat={seat.seat}>
          <NameTag room={room} game={game} seat={seat} />
          <TakenPile room={room} game={game} seat={seat.seat} />
          <BidBubble game={game} seat={seat.seat} room={room} />
        </div>
      </div>
      {game.myDiscards && game.myDiscards.length > 0 && game.phase === 'play' && (
        <div className="my-discards" title="내가 버린 카드">
          버린 카드 {game.myDiscards.map(shortName).join(' ')}
        </div>
      )}
    </div>
  );
}
