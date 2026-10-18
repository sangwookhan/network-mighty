import {
  JOKER,
  NO_SUIT,
  SUITS,
  activePlayers,
  applyBid,
  canDeclareJokercall,
  countPoints,
  deal,
  firstTrickFriend,
  FRIEND_PENDING,
  goalRange,
  isValidBid,
  isValidFinalContract,
  isValidFriend,
  killTarget,
  legalPlays,
  makeCard,
  newDeck,
  redealAfterKill,
  resolveFriend,
  settle,
  shuffle,
  startElection,
  trickWinner,
  type Bid,
  type Card,
  type Contract,
  type FriendSpec,
  type Rng,
  type Rules,
  type Settlement,
  type Suit,
  type Trick,
} from '../src/index.js';

/** 시드 고정 난수 (mulberry32) */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "SA", "D10", "HQ", "C3", "JK" → Card */
export function C(s: string): Card {
  if (s === 'JK') return JOKER;
  const suit = ({ S: 1, D: 2, H: 3, C: 4 } as const)[s[0] as 'S' | 'D' | 'H' | 'C'];
  const r = s.slice(1);
  const rank = r === 'A' ? 1 : r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : Number(r);
  return makeCard(suit as Suit, rank);
}
export const Cs = (s: string): Card[] => s.split(/\s+/).filter(Boolean).map(C);

const pickOne = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];

export interface DealLog {
  redeals: number;
  master: number;
  contract: Contract;
  friendSpec: FriendSpec;
  friend: number;
  pointsTaken: number[];
  discardPoints: number;
  settlement: Settlement;
  moneyBefore: number[];
}

/**
 * 무작위이지만 규칙에 맞는 선택만 해서 한 판을 끝까지 진행한다.
 * 진행 중 엔진이 내놓는 값들의 불변식을 검사하고, 어긋나면 예외를 던진다.
 */
export function simulateDeal(rules: Rules, rng: Rng, dealer = 0): DealLog {
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  let redeals = 0;

  for (;;) {
    let n = rules.players;
    let { hands, kitty } = deal(shuffle(newDeck(rules), rng), rules, dealer);

    // 선거
    let es = startElection(n, dealer);
    let elected: { seat: number; contract: Contract } | null = null;
    let redeal = false;
    for (let guard = 0; guard < 200 && !elected && !redeal; guard++) {
      const hand = hands[es.current];
      const canPass = isValidBid(es, { type: 'pass' }, hand, rules);
      const bids: Bid[] = [];
      for (const k of [NO_SUIT, ...SUITS]) {
        const { min, max } = goalRange(rules, k);
        for (let g = min; g <= max; g++) {
          const b: Bid = { type: 'bid', kiruda: k, goal: g };
          if (isValidBid(es, b, hand, rules) && g <= (es.best?.goal ?? min) + 2) bids.push(b);
        }
      }
      // 공약이 끝없이 올라가지 않도록, 이미 공약이 있으면 대부분 포기한다
      let choice: Bid;
      if (isValidBid(es, { type: 'dealMiss' }, hand, rules) && rng() < 0.5) choice = { type: 'dealMiss' };
      else if (canPass && (bids.length === 0 || rng() < (es.best ? 0.8 : 0.5))) choice = { type: 'pass' };
      else if (bids.length > 0) choice = pickOne(bids, rng);
      else choice = fail('no valid bid option');
      const r = applyBid(es, choice, hand, rules);
      if (r.type === 'continue') es = r.state;
      else if (r.type === 'redeal') redeal = true;
      else elected = { seat: r.seat, contract: r.contract };
    }
    if (redeal) {
      if (++redeals > 100) fail('too many redeals');
      continue;
    }
    if (!elected) fail('election did not finish');
    let master = elected!.seat;

    // 6마: 한 명 탈락
    if (n === 6) {
      const candidates = hands.flatMap((h, i) => (i === master ? [] : h));
      const target = killTarget(hands, master, pickOne(candidates, rng));
      if (target < 0 || target === master) fail('bad kill target');
      const r = redealAfterKill(hands, kitty, target, rng);
      hands = r.hands;
      kitty = r.kitty;
      master = r.seats.indexOf(master);
      n = 5;
      if (hands.some((h) => h.length !== 10) || kitty.length !== 3) fail('bad redeal after kill');
    }
    if (n !== activePlayers(rules)) fail('player count mismatch');

    // 주공: 바닥패 받고 3장 버림
    const masterHand = shuffle([...hands[master], ...kitty], rng);
    if (masterHand.length !== 13) fail('master should hold 13');
    const discards = masterHand.slice(0, 3);
    hands[master] = masterHand.slice(3);

    // 최종 공약: 가끔 바꿔 본다
    let contract = elected!.contract;
    if (rng() < 0.3) {
      const k = pickOne([NO_SUIT, ...SUITS], rng);
      const next = { kiruda: k, goal: Math.min(contract.goal + Math.floor(rng() * 3), goalRange(rules, k).max) };
      if (isValidFinalContract(contract, next, rules)) contract = next;
    }
    const ctx = { rules, kiruda: contract.kiruda };

    // 프렌드
    const others = hands.flatMap((h, i) => (i === master ? [] : h));
    const specs: FriendSpec[] = [
      { kind: 'none' },
      { kind: 'firstTrick' },
      { kind: 'player', seat: (master + 1) % n },
      { kind: 'card', card: pickOne(others, rng) },
      { kind: 'card', card: JOKER },
    ].filter((s) => isValidFriend(s as FriendSpec, { rules, n, master, masterHand: hands[master], discards, }) ) as FriendSpec[];
    const friendSpec = pickOne(specs, rng);
    let friend = resolveFriend(friendSpec, hands, master);

    // 10 트릭
    const pointsTaken = Array(n).fill(0);
    let leader = master;
    let jokerPlayed = false;
    for (let turn = 0; turn < 10; turn++) {
      const trick: { cards: Card[]; turn: number; jokerSuit: Suit; jokercall: boolean } = {
        cards: [],
        turn,
        jokerSuit: NO_SUIT,
        jokercall: false,
      };
      for (let k = 0; k < n; k++) {
        const p = (leader + k) % n;
        const legal = legalPlays(hands[p], trick as Trick, ctx);
        if (legal.length === 0) fail('empty legal list');
        if (legal.some((c) => !hands[p].includes(c))) fail('legal card not in hand');
        const card = pickOne(legal, rng);
        if (k === 0 && card === JOKER) trick.jokerSuit = pickOne(SUITS, rng);
        if (k === 0 && canDeclareJokercall(card, turn, true, jokerPlayed, ctx)) trick.jokercall = rng() < 0.7;
        if (card === JOKER) jokerPlayed = true;
        hands[p] = hands[p].filter((c) => c !== card);
        trick.cards.push(card);
      }
      const idx = trickWinner(trick, ctx);
      if (idx < 0 || idx >= n) fail('winner out of range');
      const w = (leader + idx) % n;
      pointsTaken[w] += countPoints(trick.cards);
      if (turn === 0 && friend === FRIEND_PENDING) friend = firstTrickFriend(w, master);
      leader = w;
    }
    if (hands.some((h) => h.length !== 0)) fail('hands not empty after 10 tricks');

    const discardPoints = countPoints(discards);
    if (pointsTaken.reduce((a, b) => a + b, 0) + discardPoints !== 20) fail('total points != 20');

    const moneyBefore = Array(n).fill(1000);
    const settlement = settle(
      { rules, n, master, friend, friendSpec, kiruda: contract.kiruda, goal: contract.goal, pointsTaken, discardPoints },
      moneyBefore,
    );
    return { redeals, master, contract, friendSpec, friend, pointsTaken, discardPoints, settlement, moneyBefore };
  }
}
