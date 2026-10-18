// 게임판: 원작(마이티 네트워크 3.2) 배치를 참고한 초록 판.
// 내 패는 아래에 앞면으로 펼치고, 다른 사람은 판 가장자리에 뒷면으로 둘러앉는다.
// 공약·안내는 원작의 반투명 상자(DSB)처럼 판 위에 띄운다.

import { JOKER, NO_SUIT, isKiruda, isValidBid, jokercallOf, mightyOf, plainCardName, suitOf, type Bid, type Card, type Suit } from '@mighty/engine';
import type { GameView, RoomView, SeatView } from '@mighty/protocol';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CardBackView, CardView, SUIT_NAME, SUIT_SYMBOL, contractText, shortName, sortHand } from './cards.js';
import { act, send } from './net.js';
import { BidPanel, FinalPanel, KillPanel, ResultPanel, recommendKiruda } from './panels.js';
import { play as sfx, setSoundEnabled, useSoundEnabled } from './sound.js';
import './fx.css';

type Side = 'bottom-left' | 'left' | 'top-left' | 'top' | 'top-right' | 'right';
type MySide = 'bottom' | 'bottom-right';

/** 나를 뺀 사람 수 → 시계 방향 자리 (원작 FUN_004073c0 배치를 참고, re/04_screen_layout.md) */
const SIDES: Record<number, Side[]> = {
  2: ['left', 'right'], // 3마: 좌우
  3: ['left', 'top', 'right'], // 4마
  4: ['left', 'top-left', 'top-right', 'right'], // 5마: 좌우는 아래쪽
  5: ['bottom-left', 'left', 'top-left', 'top-right', 'right'], // 6마: 내 패는 오른쪽 아래
};

/** 판 크기에 맞춘 카드 크기 */
function useBoardSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 1000, h: 700 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function Board({ room, game }: { room: RoomView; game: GameView }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useBoardSize(ref);
  // 세로로 긴 좁은 화면(휴대폰, 3분할 시험 화면): 카드를 폭 기준으로 크게 하고 다른 사람은 위쪽에 모은다
  const portrait = w < 760 && h > w * 1.1;
  // 원작처럼 창이 크면 카드도 키운다 (원작은 0.5배 단위, 여기서는 연속으로 최대 2배)
  const scale = portrait ? Math.min(1.25, Math.max(0.62, w / 4.4 / 71)) : Math.max(0.55, Math.min(2, w / 1000, h / 600));
  const cw = Math.round(71 * scale);
  const ch = Math.round(96 * scale);
  const kiruda: Suit = game.contract?.kiruda ?? NO_SUIT;
  const me = room.me.seat;
  const base = me ?? 0;
  const n = room.seats.length;
  const others = Array.from({ length: n - 1 }, (_, k) => (base + 1 + k) % n);
  const sideOf = new Map<number, Side | MySide>(others.map((s, k) => [s, SIDES[n - 1][k]]));
  sideOf.set(base, n === 6 ? 'bottom-right' : 'bottom');
  const req = game.myRequest;
  // 주공이 버릴 카드 (아래 내 패에서 눌러 고른다)
  const [discards, setDiscards] = useState<Card[]>([]);
  useEffect(() => setDiscards([]), [game.myRequestId]);
  // 공약할 기루다: 판마다 내 패에 맞는 무늬를 추천하고, 고른 것은 그 판 동안 유지한다
  const recommended = recommendKiruda(game.myHand, room.rules);
  const [bidKiruda, setBidKiruda] = useState<{ deal: number; kiruda: Suit } | null>(null);
  // 포기할 수 없는 첫 공약(예: 표준 5마의 딜러)은 '기노'(노기루다 + 기본 공약)를 기본으로 고른다
  const forcedFirst =
    req?.kind === 'bid' && !!game.election && game.election.best === null && !isValidBid(game.election, { type: 'pass' }, game.myHand, room.rules);
  const kirudaChoice = bidKiruda && bidKiruda.deal === game.dealNo ? bidKiruda.kiruda : forcedFirst ? NO_SUIT : recommended;

  useGameSounds(room, game);

  const style = { '--cw': `${cw}px`, '--ch': `${ch}px`, '--s': scale } as CSSProperties;
  return (
    <div className={`board players-${n} ${portrait ? 'portrait' : ''}`} ref={ref} style={style}>
      {others.map((s) => (
        <Opponent key={s} room={room} game={game} seat={room.seats[s]} side={sideOf.get(s) as Side} scale={scale} compact={portrait} />
      ))}
      {me === null && <SpectatorSeat room={room} game={game} seat={room.seats[base]} />}
      <Center room={room} game={game} sideOf={sideOf} kiruda={kiruda} />
      {game.contract && game.master !== null && <ContractBox room={room} game={game} />}
      {req?.kind === 'bid' && <Dsb title="공약을 정해 주세요" className="dsb-bid"><BidPanel room={room} game={game} kiruda={kirudaChoice} setKiruda={(k) => setBidKiruda({ deal: game.dealNo, kiruda: k })} recommended={recommended} /></Dsb>}
      {req?.kind === 'kill' && <Dsb title="탈락 지목" className="dsb-center dsb-low"><KillPanel game={game} /></Dsb>}
      {req?.kind === 'final' && <Dsb title="당선을 축하드립니다 !!" className="dsb-center"><FinalPanel room={room} game={game} discards={discards} /></Dsb>}
      {game.phase === 'result' && game.result && <Dsb className="dsb-center dsb-result"><ResultPanel room={room} game={game} /></Dsb>}
      {me !== null && (
        <MyHand room={room} game={game} kiruda={kiruda} boardWidth={w} cw={cw} portrait={portrait} discards={req?.kind === 'final' ? discards : null} setDiscards={setDiscards} />
      )}
      <StatusBar room={room} game={game} />
      {room.paused && (
        <div className="pause-overlay">
          <Dsb title="일시정지" className="pause-box">
            <div className="pause-text">{room.paused.by}님이 게임을 멈췄습니다</div>
            <div className="hint">차례 시간도 멈춰 있습니다. 다시 시작하면 남은 시간부터 이어집니다.</div>
            {(room.me.seat !== null || room.me.isHost) && (
              <div className="row text-buttons">
                <button className="confirm" onClick={() => send({ t: 'pause', paused: false })}>
                  ▶ 다시 시작
                </button>
              </div>
            )}
          </Dsb>
        </div>
      )}
    </div>
  );
}

/** 판의 변화에 맞춰 효과음을 낸다 (처음 그릴 때는 조용히) */
function useGameSounds(room: RoomView, game: GameView) {
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

/** 내가 낸 카드가 내 패의 어느 자리에서 날아가는지 (화면 좌표) */
const flyFrom = new Map<Card, DOMRect>();

/** 카드를 내면서, 그 카드가 내 패에 있던 자리를 기억해 둔다 */
function playCard(a: { kind: 'play'; card: Card; jokerSuit?: Suit; jokercall?: boolean }) {
  const el = document.querySelector(`.my-hand-cards [data-card="${a.card}"]`);
  if (el) flyFrom.set(a.card, el.getBoundingClientRect());
  act(a);
}

/** 무늬별로 묶어 고정 자리를 정한다 (무늬 사이에 틈). 마이티·조커는 맨 앞 묶음 */
function handSlots(order: readonly Card[], rules: RoomView['rules'], cw: number, avail: number): { x: Map<Card, number>; width: number } {
  const mighty = mightyOf(rules, NO_SUIT);
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

/** 공약 상자: 주공, 기루다·공약, 프렌드 조건(카드면 그림으로)과 공개된 프렌드를 한눈에 */
function ContractBox({ room, game }: { room: RoomView; game: GameView }) {
  const c = game.contract!;
  const rules = room.rules;
  const f = game.friendChoice;
  const name = (seat: number) => room.seats[seat].nickname;
  let friendLabel = '';
  if (f?.kind === 'card') {
    const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    if (f.card === mightyOf(rules, c.kiruda)) friendLabel = '마이티';
    else if (f.card === JOKER) friendLabel = '조커';
    else if (isKiruda(f.card, c.kiruda)) friendLabel = `기루다 ${RANK[((f.card - 1) % 13) + 1]}`;
    else friendLabel = plainCardName(f.card);
  }
  const revealed = game.friendSeat !== null && game.friendSeat >= 0 ? name(game.friendSeat) : null;
  // 누가 프렌드인가: 공개됐으면 이름, 없음이 확정이면 '없음', 아직 모르면 '?'
  const who =
    f?.kind === 'none' ? null : f?.kind === 'player' ? name(f.seat) : revealed ?? (game.friendSeat === -1 && f && game.phase !== 'final' ? '없음' : '?');
  const red = c.kiruda === 2 || c.kiruda === 3;
  return (
    <div className="dsb contract-box">
      {/* 1순위: 기루다 (가장 크게) */}
      <div className="contract-main">
        <span className={`kiruda-tile ${red ? 'red' : ''} ${c.kiruda === NO_SUIT ? 'nokiruda' : ''}`} title="기루다">
          {c.kiruda === NO_SUIT ? '노기' : SUIT_SYMBOL[c.kiruda]}
        </span>
        <div className="contract-text">
          <div className="kiruda-name">
            <span className="small-label">기루다</span> {c.kiruda === NO_SUIT ? '노기루다' : SUIT_NAME[c.kiruda]}
          </div>
          <div className="contract-sub">
            공약 <b className="contract-goal">{c.goal}</b> · 주공 <b className="contract-master">{name(game.master!)}</b>
          </div>
        </div>
      </div>
      {/* 2순위: 프렌드 (조건 → 누구) */}
      <div className="contract-friend">
        <span className="label">프렌드</span>
        {!f && <span className="friend-name">정하는 중…</span>}
        {f?.kind === 'card' && (
          <>
            <span className="mini-card">
              <CardView card={f.card} rules={rules} kiruda={c.kiruda} />
            </span>
            <span className="friend-name">{friendLabel}</span>
          </>
        )}
        {f?.kind === 'firstTrick' && <span className="friend-name">초구</span>}
        {f?.kind === 'none' && <span className="friend-name">노프렌드</span>}
        {f?.kind === 'player' && <span className="friend-name">지정</span>}
        {who !== null && f && (
          <span className={`friend-who ${who === '?' ? 'unknown' : who === '없음' ? 'none' : 'known'}`}>{who}</span>
        )}
      </div>
    </div>
  );
}

/** 원작의 반투명 메시지 상자 */
export function Dsb({ title, children, className, style }: { title?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`dsb ${className ?? ''}`} style={style}>
      {title && <div className="dsb-title">{title}</div>}
      <div className="dsb-body">{children}</div>
    </div>
  );
}

function bidLabel(b: Bid): ReactNode {
  if (b.type === 'pass') return <><span className="icon">⊘</span> 출마 포기</>;
  if (b.type === 'dealMiss') return <><span className="icon">✕</span> 딜 미스</>;
  return <><SuitIcon suit={b.kiruda} /> {b.kiruda === NO_SUIT ? '노기루다' : SUIT_NAME[b.kiruda]} {b.goal}</>;
}

function SuitIcon({ suit }: { suit: number }) {
  if (suit === NO_SUIT) return <span className="icon">N</span>;
  return <span className={`icon ${suit === 2 || suit === 3 ? 'red' : ''}`}>{SUIT_SYMBOL[suit]}</span>;
}

function seatBadges(game: GameView, seat: number) {
  return (
    <>
      {seat === game.master && <span className="badge master">주공</span>}
      {game.friendSeat === seat && <span className="badge friend">프렌드</span>}
      {game.killed === seat && <span className="badge">탈락</span>}
    </>
  );
}

function NameTag({ room, game, seat }: { room: RoomView; game: GameView; seat: SeatView }) {
  const waiting = game.waitingFor.find((x) => x.seat === seat.seat && x.kind !== 'continue');
  // 원작: 여당(주공, 공개된 프렌드) 이름은 하늘색
  const defender = seat.seat === game.master || seat.seat === game.friendSeat;
  return (
    <div className={`name-tag ${waiting ? 'turn' : ''} ${defender ? 'defender' : ''}`}>
      <span className="nick">
        {seat.nickname}
        {seat.occupant === 'bot' && ' 🤖'}
        {seat.reserved && ' (끊김)'}
      </span>
      {seatBadges(game, seat.seat)}
      <span className="money">{seat.money}</span>
      {waiting?.deadline && <Countdown deadline={waiting.deadline} />}
    </div>
  );
}

/** 딴 점수카드 (규칙에 따라 뒤집어 놓음) */
function TakenPile({ room, game, seat }: { room: RoomView; game: GameView; seat: number }) {
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
function BidBubble({ game, seat, room }: { game: GameView; seat: number; room: RoomView }) {
  if (game.phase !== 'election' || !game.election) return null;
  const last = [...game.election.log].reverse().find((l) => l.seat === seat);
  if (!last) return null;
  return (
    <Dsb title={room.seats[seat].nickname} className="bid-bubble">
      {bidLabel(last.bid)}
    </Dsb>
  );
}

function Opponent({ room, game, seat, side, scale, compact }: { room: RoomView; game: GameView; seat: SeatView; side: Side; scale: number; compact: boolean }) {
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
function SpectatorSeat({ room, game, seat }: { room: RoomView; game: GameView; seat: SeatView }) {
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

/** 낸 카드가 놓이는 위치: 판 가운데에서 그 사람 쪽으로 (단위: 카드 폭/높이) */
const TRICK_OFFSET: Record<Side | MySide, [number, number]> = {
  bottom: [0, 0.9],
  'bottom-right': [0.9, 0.8],
  'bottom-left': [-0.9, 0.8],
  left: [-1.45, 0.27],
  'top-left': [-0.9, -0.73],
  top: [0, -0.9],
  'top-right': [0.9, -0.73],
  right: [1.45, 0.27],
};

function trickOffset(side: Side | MySide, n: number): [number, number] {
  const [x, y] = TRICK_OFFSET[side];
  // 6마는 육각형: 좌우는 가운데 높이, 위쪽은 조금 더 위로
  if (n === 6) return side === 'left' || side === 'right' ? [x, 0] : side.startsWith('top') ? [x, -0.8] : [x, y];
  return [x, y];
}

/** 트릭이 끝난 뒤: 잠깐 보여 주고(show) → 가져간 사람 쪽으로 날아가고(fly) → 사라짐(gone) */
type CollectStage = 'show' | 'fly' | 'gone';
const SHOW_MS = 700;
const FLY_MS = 550;

function Center({ room, game, sideOf, kiruda }: { room: RoomView; game: GameView; sideOf: Map<number, Side | MySide>; kiruda: Suit }) {
  const n = room.seats.length;
  const trickCards = game.trick?.cards ?? [];
  // 마지막 카드가 나오면 서버는 trick(다 찬 상태)과 lastTrick 을 함께 보낸다
  const complete = game.phase === 'play' && !!game.lastTrick && trickCards.length > 0 && trickCards.length === game.active.length;
  const trickKey = `${game.dealNo}:${game.turn}`;
  const [collect, setCollect] = useState<{ key: string; stage: CollectStage } | null>(null);
  useEffect(() => {
    if (!complete) return;
    setCollect({ key: trickKey, stage: 'show' });
    const t1 = setTimeout(() => (setCollect({ key: trickKey, stage: 'fly' }), sfx('collect')), SHOW_MS);
    const t2 = setTimeout(() => setCollect({ key: trickKey, stage: 'gone' }), SHOW_MS + FLY_MS);
    return () => (clearTimeout(t1), clearTimeout(t2));
  }, [complete, trickKey]);
  const stage: CollectStage | null = complete ? (collect?.key === trickKey ? collect.stage : 'show') : null;
  const winner = complete ? game.lastTrick!.winner : null;
  const cards = stage === 'gone' ? [] : trickCards;
  const winnerSide = winner !== null ? (sideOf.get(winner) ?? 'bottom') : null;

  return (
    <div className="center">
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
          flyTo={stage === 'fly' && winnerSide ? farOffset(winnerSide, n) : null}
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

/** 그 사람 자리 쪽 판 가장자리 (카드가 날아오는 곳, 날아가는 곳) */
function farOffset(side: Side | MySide, n: number): [number, number] {
  const [x, y] = trickOffset(side, n);
  const len = Math.hypot(x, y) || 1;
  return [(x / len) * 4.2, (y / len) * 3.2];
}

const offsetTransform = ([dx, dy]: [number, number], extra = '') =>
  `translate(calc(-50% + ${dx} * var(--cw)), calc(-50% + ${dy} * var(--ch)))${extra}`;

/** 낸 카드: 자기 자리에서 가운데로 날아오고, 트릭이 끝나면 가져간 사람 쪽으로 날아간다 */
function TrickCard({ card, room, kiruda, at, from, flyTo, winner }: {
  card: Card;
  room: RoomView;
  kiruda: Suit;
  at: [number, number];
  from: [number, number];
  flyTo: [number, number] | null;
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
    ? { transform: offsetTransform(flyTo, ' scale(0.5)'), opacity: 0 }
    : { transform: arrived ? offsetTransform(at) : start };
  return (
    <div ref={ref} className={`trick-card ${winner ? 'winner' : ''} ${flyTo ? 'flying' : ''}`} style={style}>
      <CardView card={card} rules={room.rules} kiruda={kiruda} />
    </div>
  );
}

const WAIT_TEXT: Record<string, string> = {
  bid: '공약 결정 중',
  kill: '탈락시킬 사람 고르는 중',
  final: '바닥패 정리 중',
  play: '카드 고르는 중',
};

function StatusBar({ room, game }: { room: RoomView; game: GameView }) {
  const w = game.waitingFor.find((x) => x.kind !== 'continue');
  let text = '';
  if (w) text = w.seat === room.me.seat && w.kind === 'play' ? `${room.seats[w.seat].nickname} 님 차례입니다` : `${room.seats[w.seat].nickname} 님의 ${WAIT_TEXT[w.kind]}`;
  else if (game.phase === 'result') {
    const left = game.result?.continueVotes.filter((v) => v === null).length ?? 0;
    text = left > 0 ? `다음 판을 기다리는 중 (${left}명 남음)` : '다음 판 준비 중';
  } else if (game.phase === 'play') text = '트릭 정리 중';
  else text = '카드를 섞는 중입니다…';
  const c = game.contract;
  return (
    <div className="status-bar">
      {/* 원작 상태 표시줄: 기루다 | 공약 | 프렌드 | 메시지 */}
      <span className="pane icon-pane" title="기루다">{c ? (c.kiruda === NO_SUIT ? 'N' : <SuitIcon suit={c.kiruda} />) : <span className="none">✕</span>}</span>
      <span className="pane" title="공약">{c ? c.goal : ''}</span>
      <span className="pane friend-pane" title="프렌드">
        <FriendText room={room} game={game} />
      </span>
      <span className="status-text">{text}</span>
      {w?.deadline && <Countdown deadline={w.deadline} />}
      {room.paused && <span className="paused-tag">일시정지</span>}
      {room.me.seat === null && <span className="spectating">관전 중</span>}
      <span className="spacer" />
      <SoundToggle />
      <span>{game.dealNo}번째 판{game.phase === 'play' ? ` · ${game.turn + 1}/10` : ''}</span>
    </div>
  );
}

function SoundToggle() {
  const on = useSoundEnabled();
  return (
    <button className={`sound-toggle ${on ? 'on' : 'off'}`} onClick={() => setSoundEnabled(!on)} title={on ? '효과음 끄기' : '효과음 켜기'} aria-pressed={on}>
      ♪ 소리 {on ? '켬' : '끔'}
    </button>
  );
}

function FriendText({ room, game }: { room: RoomView; game: GameView }) {
  const f = game.friendChoice;
  if (!f) return <>{game.master !== null ? '-미정-' : ''}</>;
  let t = f.kind === 'none' ? '노프렌드' : f.kind === 'firstTrick' ? '초구' : f.kind === 'player' ? room.seats[f.seat].nickname! : shortName(f.card);
  if (game.friendSeat !== null && game.friendSeat >= 0 && f.kind !== 'player') t += ` → ${room.seats[game.friendSeat].nickname}`;
  return <>{t} 프렌드</>;
}

export function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className={`countdown ${left <= 5 ? 'urgent' : ''}`}>{left}초</span>;
}

function MyHand({ room, game, kiruda, boardWidth, cw, portrait, discards, setDiscards }: {
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
  let layout = layoutRef.current;
  if (!layout || layout.key !== layoutKey || game.myHand.some((c) => !layout!.order.includes(c))) {
    // 기루다와 상관없는 순서(마이티·조커 → ♠◆♥♣)로 한 번 정렬하고 판 내내 유지
    layout = { key: layoutKey, order: sortHand(game.myHand, rules, NO_SUIT) };
    layoutRef.current = layout;
  }
  const slots = handSlots(layout.order, rules, cw, portrait ? boardWidth - 8 : Math.min(boardWidth * (boardWidth > 900 ? 0.58 : 0.86), 15 * cw));
  const inHand = new Set(game.myHand);
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
    <div className="my-area">
      {req && !ask && <div className="my-prompt">내 차례입니다. 낼 카드를 고르세요</div>}
      {discarding && <div className="my-prompt">버릴 카드 3장을 눌러 올리세요 ({discards.length}/3)</div>}
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
        <div className="my-hand-cards" style={{ width: slots.width }}>
          {layout.order.filter((c) => inHand.has(c)).map((c) => (
            <div key={c} className="slot" style={{ left: slots.x.get(c) }}>
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
        <div className="my-tag">
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
