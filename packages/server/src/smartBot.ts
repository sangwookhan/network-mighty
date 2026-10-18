// 개선된 봇. 자기 패와 공개된 정보(나온 카드, 공약, 공개된 프렌드)만 본다.
// 원작 Xiao 의 생각(re/03_game_flow_and_ai.md §4.6)을 단순화해서 옮겼다:
//  - 나온 카드와 "리드 무늬를 못 따른 사람(그 무늬 없음)"을 기억하고,
//  - 안 나온 카드가 누구에게 있을지 확률로 어림해서 이 카드가 트릭을 이길 확률을 계산하고,
//  - 같은 편/상대 편을 따져 점수카드를 몰아주거나 아낀다.

import {
  JOKER,
  NO_SUIT,
  SUITS,
  canDeclareJokercall,
  countPoints,
  goalRange,
  isKiruda,
  isPoint,
  isValidBid,
  isValidFinalContract,
  jokercallOf,
  makeCard,
  maxGoal,
  mightyOf,
  powerCompare,
  powerOf,
  suitOf,
  trickWinner,
  type Bid,
  type Card,
  type Contract,
  type Rules,
  type Suit,
} from '@mighty/engine';
import type { FriendChoice, GameAction, Request } from '@mighty/protocol';
import type { Game } from './game.js';

/** 조정용 상수 (봇끼리 대결로 맞춘다: scripts/bench.ts) */
export const PARAMS = {
  /** 프렌드가 보태 줄 것으로 기대하는 트릭 수 */
  friendTricks: 1.6,
  /** 바닥패 3장으로 기대하는 트릭 수 */
  kittyTricks: 0.6,
  /** 트릭 1개당 점수 */
  pointsPerTrick: 2.0,
  /** 공약 추정에서 빼는 안전 여유 */
  bidMargin: -3,
  /** 아직 낼 사람이 보탤 것으로 기대하는 점수 */
  laterPoints: 0.2,
  /** 카드를 아끼는 정도 */
  holdScale: 1.5,
  /** 프렌드 없는 규칙(3마)에서 혼자 칠 때 더하는 트릭 수 */
  soloBonus: 1.0,
};

export function decideSmart(g: Game, seat: number, req: Request): GameAction {
  switch (req.kind) {
    case 'bid':
      return { kind: 'bid', bid: chooseBid(g, seat) };
    case 'kill':
      return { kind: 'kill', card: chooseKill(g, seat, req.failed) };
    case 'final':
      return chooseFinal(g, seat);
    case 'play':
      return choosePlay(g, seat, req);
    case 'continue':
      return { kind: 'continue', cont: true };
  }
}

// ================= 패 평가 =================

/** 이 패를 이 기루다로 쳤을 때 내가 딸 트릭 수 어림 */
export function estimateTricks(hand: readonly Card[], kiruda: Suit, rules: Rules): number {
  const mighty = mightyOf(rules, kiruda);
  let t = 0;
  if (hand.includes(mighty)) t += 1;
  if (hand.includes(JOKER)) t += 0.9;
  const bySuit = (s: Suit) => hand.filter((c) => c !== mighty && c !== JOKER && suitOf(c) === s).sort((a, b) => powerOf(b) - powerOf(a));

  if (kiruda !== NO_SUIT) {
    const k = bySuit(kiruda);
    // 위에서부터 이어지는 기루다는 확실한 트릭
    let top = 13;
    for (const c of k) {
      if (powerOf(c) === top) (t += 1), top--;
      else break;
    }
    const sure = 13 - top;
    // 이어지지 않는 높은 기루다
    for (const c of k.slice(sure)) if (powerOf(c) >= 11) t += 0.45;
    // 긴 기루다는 상대 기루다가 떨어진 뒤 트릭이 된다
    t += Math.max(0, k.length - 3 - Math.max(0, sure - 1)) * 0.85;
  }
  for (const s of SUITS) {
    if (s === kiruda) continue;
    const cs = bySuit(s);
    if (cs.length === 0) {
      // 무늬가 없으면 기루다로 잘라 먹을 수 있다
      if (kiruda !== NO_SUIT && bySuit(kiruda).length >= 3) t += 0.35;
      continue;
    }
    if (powerOf(cs[0]) === 13) {
      t += 0.8;
      if (cs[1] && powerOf(cs[1]) === 12) t += 0.5;
    } else if (powerOf(cs[0]) === 12 && cs.length >= 2) t += 0.25;
    // 노기루다는 긴 무늬가 그대로 트릭이 된다
    if (kiruda === NO_SUIT && cs.length >= 5 && powerOf(cs[0]) >= 12) t += (cs.length - 4) * 0.6;
  }
  return t;
}

/** 이 패로 부를 만한 공약 (팀 전체 기대 점수) */
export function targetGoal(hand: readonly Card[], kiruda: Suit, rules: Rules, withKitty: boolean): number {
  const tricks = estimateTricks(hand, kiruda, rules) * (10 / Math.max(hand.length, 8)) * (hand.length === 8 ? 1 : 1);
  const team = tricks + (rules.friendEnabled ? PARAMS.friendTricks : PARAMS.soloBonus) + (withKitty ? PARAMS.kittyTricks : 0);
  // 버린 카드의 점수가 야당 몫인 규칙은 그만큼 불리하다
  const discardPenalty = rules.discardsToOpposition ? 1 : 0;
  return Math.floor(team * PARAMS.pointsPerTrick - PARAMS.bidMargin - discardPenalty);
}

// ================= 공약 =================

function chooseBid(g: Game, seat: number): Bid {
  const es = g.election!;
  const hand = g.hands[seat];
  const rules = g.rules;
  if (isValidBid(es, { type: 'dealMiss' }, hand, rules)) return { type: 'dealMiss' };

  // 무늬마다 "부를 수 있는 최소 공약"과 "내 패가 감당할 공약"의 차이가 가장 큰 무늬
  let best: { bid: Bid; slack: number } | null = null;
  for (const k of [...SUITS, NO_SUIT] as Suit[]) {
    const { min, max } = goalRange(rules, k);
    const need = Math.max(min, (es.best?.goal ?? 0) + 1);
    if (need > max) continue;
    const target = Math.min(targetGoal(hand, k, rules, true), max);
    const slack = target - need + (k === NO_SUIT ? 0.5 : 0); // 노기루다는 이기면 2배
    const bid: Bid = { type: 'bid', kiruda: k, goal: need };
    if (slack >= 0 && isValidBid(es, bid, hand, rules) && (!best || slack > best.slack)) best = { bid, slack };
  }
  if (best) return best.bid;
  if (isValidBid(es, { type: 'pass' }, hand, rules)) return { type: 'pass' };
  // 포기할 수 없으면(딜러 첫 차례) 내 패에 가장 맞는 무늬로 가장 낮은 공약
  let forced: { bid: Bid; slack: number } | null = null;
  for (const k of [...SUITS, NO_SUIT] as Suit[]) {
    const { min, max } = goalRange(rules, k);
    for (let gl = Math.max(min, (es.best?.goal ?? 0) + 1); gl <= max; gl++) {
      const bid: Bid = { type: 'bid', kiruda: k, goal: gl };
      if (!isValidBid(es, bid, hand, rules)) continue;
      const slack = targetGoal(hand, k, rules, true) - gl;
      if (!forced || slack > forced.slack) forced = { bid, slack };
      break;
    }
  }
  if (forced) return forced.bid;
  throw new Error('no valid bid');
}

export function bestSuitByLength(hand: readonly Card[]): Suit {
  let best: Suit = 1;
  let score = -1;
  for (const s of SUITS) {
    const cs = hand.filter((c) => c !== JOKER && suitOf(c) === s);
    const v = cs.length * 100 + cs.reduce((a, c) => a + powerOf(c), 0);
    if (v > score) (best = s), (score = v);
  }
  return best;
}

// ================= 6마 탈락 지목 =================

function chooseKill(g: Game, seat: number, failed: readonly Card[]): Card {
  const hand = g.hands[seat];
  const kiruda = g.contract!.kiruda;
  const wish: Card[] = [JOKER, mightyOf(g.rules, kiruda)];
  if (kiruda !== NO_SUIT) for (const r of [1, 13, 12, 11]) wish.push(makeCard(kiruda, r));
  for (const s of SUITS) wish.push(makeCard(s, 1));
  for (let c = 1; c <= 53; c++) wish.push(c);
  return wish.find((c) => !hand.includes(c) && !failed.includes(c))!;
}

// ================= 주공: 버리기, 기루다 변경, 프렌드 =================

function combos3<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) for (let k = j + 1; k < xs.length; k++) out.push([xs[i], xs[j], xs[k]]);
  return out;
}

/** 버릴 3장을 고른다: 남은 10장의 기대 점수 + 버린 점수카드(규칙에 따라 여당/야당 몫) */
function bestDiscard(hand13: readonly Card[], kiruda: Suit, rules: Rules): { discards: Card[]; value: number } {
  const mighty = mightyOf(rules, kiruda);
  let best = { discards: hand13.slice(0, 3), value: -Infinity };
  for (const d of combos3(hand13)) {
    if (d.includes(mighty) || d.includes(JOKER)) continue;
    const rest = hand13.filter((c) => !d.includes(c));
    const pts = countPoints(d);
    const value =
      estimateTricks(rest, kiruda, rules) * PARAMS.pointsPerTrick + (rules.discardsToOpposition ? -pts : pts) * 0.8 - d.filter((c) => isKiruda(c, kiruda)).length * 0.5;
    if (value > best.value) best = { discards: d, value };
  }
  return best;
}

function chooseFinal(g: Game, seat: number): GameAction {
  const rules = g.rules;
  const hand = g.hands[seat];
  const elected = g.electedContract!;
  const team = (rules.friendEnabled ? PARAMS.friendTricks : 0) * PARAMS.pointsPerTrick;

  const options: { contract: Contract; discards: Card[]; slack: number }[] = [];
  for (const k of [...SUITS, NO_SUIT] as Suit[]) {
    const d = bestDiscard(hand, k, rules);
    const expected = d.value + team - PARAMS.bidMargin;
    // 이 기루다로 바꿀 때 가능한 가장 낮은 공약
    let goal = k === elected.kiruda ? elected.goal : -1;
    if (goal < 0) for (let gl = elected.goal; gl <= maxGoal(rules); gl++) if (isValidFinalContract(elected, { kiruda: k, goal: gl }, rules)) { goal = gl; break; }
    if (goal < 0) continue;
    // 바꾸는 건 확실히 나을 때만
    const slack = expected - goal - (k === elected.kiruda ? 0 : 1.5) + (k === NO_SUIT ? 1 : 0);
    options.push({ contract: { kiruda: k, goal }, discards: d.discards, slack });
  }
  options.sort((a, b) => b.slack - a.slack);

  for (const o of options) {
    for (const friend of friendCandidates(g, seat, o.contract.kiruda, o.discards)) {
      const action: GameAction = { kind: 'final', discards: o.discards, contract: o.contract, friend };
      if (g.validateFinal(action)) return action;
    }
  }
  throw new Error('no valid final');
}

function friendCandidates(g: Game, seat: number, kiruda: Suit, discards: Card[]): FriendChoice[] {
  const rules = g.rules;
  const keep = g.hands[seat].filter((c) => !discards.includes(c));
  const out: FriendChoice[] = [];
  const add = (c: Card) => {
    if (!keep.includes(c) && !discards.includes(c)) out.push({ kind: 'card', card: c });
  };
  add(mightyOf(rules, kiruda));
  add(JOKER);
  if (kiruda !== NO_SUIT) for (const r of [1, 13, 12]) add(makeCard(kiruda, r));
  for (const s of SUITS) if (s !== kiruda) add(makeCard(s, 1));
  out.push({ kind: 'firstTrick' }, { kind: 'none' });
  return out;
}

// ================= 카드 내기 =================

/** 공개 정보로 만든 판 상황 */
class Knowledge {
  readonly n: number;
  readonly order: number[];
  readonly played = new Set<Card>();
  /** voids[seat][suit] = 그 무늬가 없음이 드러남 */
  readonly voids = new Map<number, Set<Suit>>();
  readonly unknown: Card[];
  readonly kiruda: Suit;
  readonly mighty: Card;
  readonly iAmDefender: boolean;
  readonly friendKnown: number | null; // 좌석, -1 없음, null 모름

  constructor(readonly g: Game, readonly me: number) {
    const rules = g.rules;
    this.kiruda = g.contract!.kiruda;
    this.mighty = mightyOf(rules, this.kiruda);
    this.n = g.active.length;
    this.order = g.active;
    const tricks = [...g.history, ...(g.trick && g.trick.cards.length ? [{ ...g.trick, winner: -1 }] : [])];
    for (const t of tricks) {
      const first = t.cards[0]?.card;
      const lead = first === JOKER ? t.jokerSuit : first !== undefined ? suitOf(first) : NO_SUIT;
      const jcForced = t.jokercall && first === jokercallOf(rules, this.kiruda);
      for (const { seat, card } of t.cards) {
        this.played.add(card);
        if (lead !== NO_SUIT && card !== JOKER && card !== this.mighty && suitOf(card) !== lead && !(jcForced && card === JOKER)) {
          if (!this.voids.has(seat)) this.voids.set(seat, new Set());
          this.voids.get(seat)!.add(lead);
        }
      }
    }
    const hand = new Set(g.hands[me]);
    const mine = me === g.master ? new Set(g.discards) : new Set<Card>();
    this.unknown = [];
    for (let c = 1; c <= 53; c++) if (!hand.has(c) && !this.played.has(c) && !mine.has(c)) this.unknown.push(c);

    const f = g.friendChoice;
    const iHoldFriendCard = f?.kind === 'card' && hand.has(f.card);
    this.iAmDefender = me === g.master || iHoldFriendCard || (f?.kind === 'player' && f.seat === me) || (g.friendRevealed && g.friendSeat === me);
    if (g.friendRevealed) this.friendKnown = g.friendSeat >= 0 ? g.friendSeat : -1;
    else if (iHoldFriendCard) this.friendKnown = me;
    else this.friendKnown = null;
  }

  /** +1 같은 편, -1 상대 편, 그 사이는 모를 때의 기댓값 */
  sign(seat: number): number {
    const g = this.g;
    if (seat === this.me) return 1;
    const def = (s: number) => s === g.master || s === this.friendKnown;
    if (this.friendKnown !== null || !this.g.rules.friendEnabled) {
      const sDef = def(seat);
      return sDef === this.iAmDefender ? 1 : -1;
    }
    // 프렌드를 모름
    if (seat === g.master) return this.iAmDefender ? 1 : -1;
    const others = this.n - (this.me === g.master ? 1 : 2);
    const pFriend = 1 / Math.max(1, others);
    return this.iAmDefender ? pFriend * 1 + (1 - pFriend) * -1 : pFriend * -1 + (1 - pFriend) * 1;
  }

  handCount(seat: number): number {
    return this.g.hands[seat].length;
  }

  hiddenCount(): number {
    return this.unknown.length;
  }

  isVoid(seat: number, suit: Suit): boolean {
    return this.voids.get(seat)?.has(suit) ?? false;
  }

  /** seat 가 card 를 이길 카드를 내놓을 확률 */
  pBeat(seat: number, card: Card, lead: Suit, jc: boolean): number {
    const g = this.g;
    const turn = g.turn;
    const ctx = g.ctx;
    const h = this.handCount(seat) / Math.max(1, this.hiddenCount());
    let special = 0;
    let follow = 0;
    let trump = 0;
    let leadLeft = 0;
    for (const x of this.unknown) {
      if (lead !== NO_SUIT && x !== JOKER && suitOf(x) === lead) leadLeft++;
      if (powerCompare(x, card, turn, lead, jc, ctx) <= 0) continue;
      if (x === this.mighty || x === JOKER) special++;
      else if (suitOf(x) === lead) follow++;
      else if (isKiruda(x, this.kiruda)) trump++;
    }
    const none = (k: number) => Math.pow(1 - h, k);
    const pSpecial = 1 - none(special);
    const pFollow = this.isVoid(seat, lead) ? 0 : 1 - none(follow);
    const pVoidLead = lead === NO_SUIT ? 1 : this.isVoid(seat, lead) ? 1 : none(leadLeft);
    const pTrump = this.isVoid(seat, this.kiruda) ? 0 : (1 - none(trump)) * (lead === this.kiruda ? 1 : pVoidLead);
    return 1 - (1 - pSpecial) * (1 - pFollow) * (1 - pTrump);
  }
}

/** 카드를 내 버리는 아까움 (나중 트릭에서 쓸 힘) */
function holdValue(c: Card, k: Knowledge): number {
  return PARAMS.holdScale * holdValueRaw(c, k);
}

function holdValueRaw(c: Card, k: Knowledge): number {
  const turnsLeft = 9 - k.g.turn;
  const late = turnsLeft <= 1 ? 0.3 : 1;
  if (c === k.mighty) return 2.2 * late;
  if (c === JOKER) return (k.g.rules.jokerLastTurnEffective || turnsLeft > 1 ? 1.9 : 0.6) * late;
  const p = powerOf(c) / 13;
  return (isKiruda(c, k.kiruda) ? 0.6 + 1.2 * p * p : 1.0 * p * p * p) * late;
}

function choosePlay(g: Game, seat: number, req: Extract<Request, { kind: 'play' }>): GameAction {
  const legal = req.legal;
  const rules = g.rules;
  const k = new Knowledge(g, seat);
  const trick = g.trick!;
  const pos = trick.cards.length;
  const order = g.orderFrom(trick.leader);
  const later = order.slice(pos + 1);
  const jcCard = jokercallOf(rules, k.kiruda);
  const leading = pos === 0;

  type PlayAction = Extract<GameAction, { kind: 'play' }>;
  let best: { action: PlayAction; value: number } | null = null;
  for (const card of legal) {
    for (const action of variants(card)) {
      const value = evaluate(action);
      if (!best || value > best.value) best = { action, value };
    }
  }
  return best!.action;

  /** 조커 선이면 무늬, 조커콜 카드면 선언 여부를 함께 고른다 */
  function variants(card: Card): PlayAction[] {
    if (leading && card === JOKER && req.mustDeclareJokerSuit) {
      const suits = k.iAmDefender && k.kiruda !== NO_SUIT ? [k.kiruda] : SUITS.filter((s) => s !== k.kiruda);
      return suits.map((s) => ({ kind: 'play', card, jokerSuit: s }));
    }
    if (leading && card === jcCard && req.canJokercall && canDeclareJokercall(card, g.turn, true, g.jokerPlayed, g.ctx)) {
      return [{ kind: 'play', card, jokercall: true }, { kind: 'play', card, jokercall: false }];
    }
    return [{ kind: 'play', card }];
  }

  function evaluate(a: PlayAction): number {
    const card = a.card;
    const cards = [...trick.cards.map((c) => c.card), card];
    const jokerSuit = leading ? (a.jokerSuit ?? NO_SUIT) : trick.jokerSuit;
    const jcDeclared = leading ? !!a.jokercall : trick.jokercall;
    const t = { cards, turn: g.turn, jokerSuit, jokercall: jcDeclared };
    const lead = cards[0] === JOKER ? jokerSuit : suitOf(cards[0]);
    const jc = jcDeclared && cards[0] === jcCard && (g.turn !== 0 || rules.jokercallFirstTurn);
    const wIdx = trickWinner(t, g.ctx);
    const winnerSeat = wIdx === pos ? seat : trick.cards[wIdx].seat;
    const winCard = cards[wIdx];

    // 뒤에 낼 사람들이 지금 이기는 카드를 넘을 확률 → 우리 편이 가져갈 확률
    const pOwnerAlly = (1 + k.sign(winnerSeat)) / 2;
    let surviveEnemies = 1;
    let allyOvertakes = 1;
    for (const s of later) {
      const pb = k.pBeat(s, winCard, lead, jc);
      const enemy = (1 - k.sign(s)) / 2;
      surviveEnemies *= 1 - pb * enemy;
      allyOvertakes *= 1 - pb * (1 - enemy);
    }
    const pTeam = pOwnerAlly * surviveEnemies + (1 - pOwnerAlly) * (1 - allyOvertakes);

    // 이 트릭의 점수: 이미 나온 것 + 내 카드 + 뒷사람 기대치
    const pts = countPoints(cards) + later.length * PARAMS.laterPoints;
    let value = (2 * pTeam - 1) * pts - holdValue(card, k);

    if (leading) {
      // 확실히 이기는 카드는 일찍 거둔다
      if (pTeam > 0.85 && card !== k.mighty && card !== JOKER) value += 0.6;
      // 주공 편은 기루다를 먼저 돌려 상대 기루다를 뺀다, 야당은 기루다 리드를 피한다
      if (isKiruda(card, k.kiruda)) value += k.iAmDefender ? (g.hands[seat].filter((c) => isKiruda(c, k.kiruda)).length >= 3 ? 0.8 : 0.2) : -0.8;
      // 조커콜: 조커가 상대 편에 있을 것 같으면 선언
      if (card === jcCard && a.jokercall) {
        const jokerOut = !k.played.has(JOKER) && !g.hands[seat].includes(JOKER);
        const friendIsJoker = g.friendChoice?.kind === 'card' && g.friendChoice.card === JOKER;
        const jokerEnemy = k.iAmDefender ? !friendIsJoker : friendIsJoker || true;
        value += jokerOut && jokerEnemy ? 1.5 : -1;
      }
    } else if (card === JOKER && jc) {
      value += 0; // 조커콜에 강제로 내는 경우
    }
    return value;
  }
}
