// 단순 봇 (1차). 대결 비교용으로 남겨 둔다. 자기 패와 공개된 정보만 본다.
// 이후 Xiao 전략 포팅으로 개선할 예정 (re/03_game_flow_and_ai.md §4.6).

import {
  JOKER,
  NO_SUIT,
  SUITS,
  countPoints,
  goalRange,
  isKiruda,
  isPoint,
  isValidBid,
  jokercallOf,
  makeCard,
  mightyOf,
  powerOf,
  suitOf,
  trickWinner,
  type Bid,
  type Card,
  type Suit,
} from '@mighty/engine';
import type { FriendChoice, GameAction, Request } from '@mighty/protocol';
import type { Game } from './game.js';

export function decideSimple(g: Game, seat: number, req: Request): GameAction {
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

// ---- 공약 ----

/** 기루다로 가장 좋은 무늬: 장수, 그다음 세기 합 */
function bestSuit(hand: readonly Card[]): Suit {
  let best: Suit = SUITS[0];
  let bestScore = -1;
  for (const s of SUITS) {
    const cards = hand.filter((c) => suitOf(c) === s);
    const score = cards.length * 100 + cards.reduce((a, c) => a + powerOf(c), 0);
    if (score > bestScore) (best = s), (bestScore = score);
  }
  return best;
}

/** 이 패로 딸 수 있을 것 같은 점수 (대략) */
export function estimate(g: Game, hand: readonly Card[], kiruda: Suit): number {
  const rules = g.rules;
  const kirudaCards = hand.filter((c) => isKiruda(c, kiruda));
  let e = 6 + kirudaCards.length * 1.1;
  if (hand.includes(mightyOf(rules, kiruda))) e += 2;
  if (hand.includes(JOKER)) e += 2;
  for (const c of kirudaCards) if (powerOf(c) >= 11) e += 0.7; // 기루다 Q 이상
  for (const c of hand) if (!isKiruda(c, kiruda) && c !== mightyOf(rules, kiruda) && powerOf(c) === 13) e += 0.8; // 다른 무늬 A
  return Math.round(e);
}

function chooseBid(g: Game, seat: number): Bid {
  const es = g.election!;
  const hand = g.hands[seat];
  const rules = g.rules;
  if (isValidBid(es, { type: 'dealMiss' }, hand, rules)) return { type: 'dealMiss' };
  const kiruda = bestSuit(hand);
  const est = estimate(g, hand, kiruda);
  const goal = Math.max(goalRange(rules, kiruda).min, (es.best?.goal ?? 0) + 1);
  const bid: Bid = { type: 'bid', kiruda, goal };
  if (goal <= est && isValidBid(es, bid, hand, rules)) return bid;
  if (isValidBid(es, { type: 'pass' }, hand, rules)) return { type: 'pass' };
  // 포기할 수 없으면 가능한 가장 낮은 공약
  for (let gl = goalRange(rules, NO_SUIT).min; gl <= 25; gl++)
    for (const k of [kiruda, ...SUITS, NO_SUIT]) {
      const b: Bid = { type: 'bid', kiruda: k, goal: gl };
      if (isValidBid(es, b, hand, rules)) return b;
    }
  throw new Error('no valid bid');
}

// ---- 6마 탈락 지목 ----

function chooseKill(g: Game, seat: number, failed: readonly Card[]): Card {
  const hand = g.hands[seat];
  const kiruda = g.contract!.kiruda;
  const wish: Card[] = [JOKER, mightyOf(g.rules, kiruda)];
  if (kiruda !== NO_SUIT) for (const r of [1, 13, 12]) wish.push(makeCard(kiruda, r));
  for (const s of SUITS) wish.push(makeCard(s, 1));
  for (let c = 1; c <= 53; c++) wish.push(c);
  return wish.find((c) => !hand.includes(c) && !failed.includes(c))!;
}

// ---- 주공: 버리기, 프렌드 ----

/** 남길 가치. 낮을수록 먼저 버린다 */
function keepValue(c: Card, kiruda: Suit, g: Game): number {
  if (c === JOKER || c === mightyOf(g.rules, kiruda)) return 1000;
  if (isKiruda(c, kiruda)) return 500 + powerOf(c);
  if (powerOf(c) === 13) return 300;
  return (isPoint(c) ? 50 : 0) + powerOf(c);
}

function chooseFinal(g: Game, seat: number): GameAction {
  const hand = g.hands[seat];
  const contract = g.electedContract!;
  const discards = [...hand].sort((a, b) => keepValue(a, contract.kiruda, g) - keepValue(b, contract.kiruda, g)).slice(0, 3);
  const candidates: FriendChoice[] = [
    { kind: 'card', card: mightyOf(g.rules, contract.kiruda) },
    { kind: 'card', card: JOKER },
  ];
  if (contract.kiruda !== NO_SUIT) candidates.push({ kind: 'card', card: makeCard(contract.kiruda, 1) }, { kind: 'card', card: makeCard(contract.kiruda, 13) });
  candidates.push({ kind: 'firstTrick' }, { kind: 'none' });
  for (const friend of candidates) {
    const action: GameAction = { kind: 'final', discards, contract, friend };
    if (g.validateFinal(action)) return action;
  }
  throw new Error('no valid final');
}

// ---- 카드 내기 ----

function cost(c: Card, g: Game): number {
  const kiruda = g.contract!.kiruda;
  if (c === mightyOf(g.rules, kiruda)) return 200;
  if (c === JOKER) return 150;
  return (isKiruda(c, kiruda) ? 30 : 0) + (isPoint(c) ? 15 : 0) + powerOf(c);
}

function choosePlay(g: Game, seat: number, req: Extract<Request, { kind: 'play' }>): GameAction {
  const legal = req.legal;
  const kiruda = g.contract!.kiruda;
  const trick = g.trick!;
  const byCost = [...legal].sort((a, b) => cost(a, g) - cost(b, g));
  const hand = g.hands[seat];

  if (trick.cards.length === 0) {
    // 선: 기루다가 아닌 A가 있으면 먼저, 아니면 가장 싼 카드
    const ace = legal.find((c) => powerOf(c) === 13 && !isKiruda(c, kiruda) && c !== mightyOf(g.rules, kiruda));
    const card = ace ?? byCost[0];
    const action: GameAction = { kind: 'play', card };
    if (card === JOKER) action.jokerSuit = kiruda !== NO_SUIT ? kiruda : bestSuit(hand.filter((c) => c !== JOKER));
    if (req.canJokercall && card === jokercallOf(g.rules, kiruda)) action.jokercall = true;
    return action;
  }

  // 지금 내면 이기는 카드 중 가장 싼 것 (뒷사람은 고려하지 않음)
  const base = g.engineTrick();
  const winning = byCost.filter((c) => trickWinner({ ...base, cards: [...base.cards, c] }, g.ctx) === base.cards.length);
  const isLast = trick.cards.length === g.active.length - 1;
  const pointsOnTable = countPoints(base.cards);
  if (winning.length > 0 && (pointsOnTable > 0 || isLast)) return { kind: 'play', card: winning[0] };
  // 질 거면 점수카드가 아닌 가장 싼 카드
  const losing = byCost.filter((c) => !winning.includes(c));
  const pool = losing.length > 0 ? losing : byCost;
  const nonPoint = pool.find((c) => !isPoint(c));
  return { kind: 'play', card: nonPoint ?? pool[0] };
}
