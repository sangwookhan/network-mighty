// 트릭: 낼 수 있는 카드, 승자 판정
// 원작: CCardList::GetAvList @0040c160, PowerComp @0040bea0, GetWinner @0040bde0,
//       CState::IsEffectiveJokercall @00431dd0

import { JOKER, NO_SUIT, isKiruda, jokercallOf, mightyOf, powerOf, suitOf, type Card, type Suit } from './card.js';
import type { Rules } from './rules.js';

export const LAST_TURN = 9;

export interface PlayContext {
  rules: Rules;
  kiruda: Suit;
}

export interface Trick {
  /** 선부터 낸 순서대로 */
  cards: readonly Card[];
  /** 트릭 번호 0..9 */
  turn: number;
  /** 선이 조커를 냈을 때 선언한 무늬 (아니면 0) */
  jokerSuit: Suit;
  /** 선이 조커콜 카드를 내며 조커콜을 선언했는지 */
  jokercall: boolean;
}

function leadSuitOf(trick: Trick): Suit {
  if (trick.cards.length === 0) return NO_SUIT;
  return trick.cards[0] === JOKER ? trick.jokerSuit : suitOf(trick.cards[0]);
}

/** 조커콜 선언이 이 트릭에서 실제로 효력이 있는가 (첫 트릭 규칙 반영) */
function jokercallActive(trick: Trick, ctx: PlayContext): boolean {
  return (
    trick.jokercall &&
    trick.cards.length > 0 &&
    trick.cards[0] === jokercallOf(ctx.rules, ctx.kiruda) &&
    (trick.turn !== 0 || ctx.rules.jokercallFirstTurn)
  );
}

/** 선이 조커콜 카드를 낼 때 "조커콜" 선언을 고를 수 있는가 */
export function canDeclareJokercall(card: Card, turn: number, trickEmpty: boolean, jokerPlayed: boolean, ctx: PlayContext): boolean {
  return (
    card === jokercallOf(ctx.rules, ctx.kiruda) &&
    trickEmpty &&
    !jokerPlayed &&
    (turn !== 0 || ctx.rules.jokercallFirstTurn)
  );
}

/** +1: a 가 강함, -1: b 가 강함, 0: 둘 다 리드무늬·기루다가 아님 */
export function powerCompare(a: Card, b: Card, turn: number, leadSuit: Suit, jokercalled: boolean, ctx: PlayContext): number {
  const { rules, kiruda } = ctx;
  const mighty = mightyOf(rules, kiruda);
  const mightyOn = turn === 0 ? rules.mightyFirstTurnEffective : turn === LAST_TURN ? rules.mightyLastTurnEffective : true;
  const jokerTurnOn = turn === 0 ? rules.jokerFirstTurnEffective : turn === LAST_TURN ? rules.jokerLastTurnEffective : true;
  const jokerOn = jokerTurnOn && (!jokercalled || rules.jokercalledJokerEffective);

  if (mightyOn) {
    if (a === mighty) return 1;
    if (b === mighty) return -1;
  }
  if (jokerOn) {
    if (a === JOKER) return 1;
    if (b === JOKER) return -1;
  } else {
    // 효력 없는 조커는 무엇에게도 진다
    if (a === JOKER) return -1;
    if (b === JOKER) return 1;
  }
  // 효력 없는 마이티는 일반 카드로 취급한다 (기루다일 수도 있음)
  const ka = isKiruda(a, kiruda);
  const kb = isKiruda(b, kiruda);
  if (!ka && !kb) {
    const la = suitOf(a) === leadSuit;
    const lb = suitOf(b) === leadSuit;
    if (!la && !lb) return 0;
    if (!la) return -1;
    if (!lb) return 1;
  } else {
    if (!ka) return -1;
    if (!kb) return 1;
  }
  return powerOf(a) > powerOf(b) ? 1 : -1;
}

/** 이긴 카드의 trick.cards 인덱스. 동률(0)이면 먼저 낸 카드가 이긴다. */
export function trickWinner(trick: Trick, ctx: PlayContext): number {
  const lead = leadSuitOf(trick);
  const jc = jokercallActive(trick, ctx);
  let best = 0;
  for (let i = 1; i < trick.cards.length; i++) {
    if (powerCompare(trick.cards[best], trick.cards[i], trick.turn, lead, jc, ctx) < 0) best = i;
  }
  return best;
}

/** 지금 낼 수 있는 카드 (손패 순서 유지) */
export function legalPlays(hand: readonly Card[], trick: Trick, ctx: PlayContext): Card[] {
  const { rules, kiruda } = ctx;
  const { turn } = trick;
  const mighty = mightyOf(rules, kiruda);
  const hasMighty = hand.includes(mighty);
  const hasJoker = hand.includes(JOKER);
  const lead = leadSuitOf(trick);
  const mustFollow = lead !== NO_SUIT && hand.some((c) => c !== JOKER && suitOf(c) === lead);

  let out: Card[];
  if (hasJoker && jokercallActive(trick, ctx)) {
    // 조커콜 당함: 조커를 내야 한다 (옵션에 따라 마이티로 대신할 수 있음)
    out = [JOKER];
    if (rules.mightyAnswersJokercall && hasMighty) out.push(mighty);
  } else {
    out = hand.filter((c) => {
      if (c === mighty) {
        if (turn === 0 && !rules.mightyFirstTurnPlayable) return false;
        if (turn === LAST_TURN && !rules.mightyLastTurnPlayable) return false;
        return true;
      }
      if (c === JOKER) {
        if (turn === 0 && !rules.jokerFirstTurnPlayable) return false;
        if (turn === LAST_TURN && !rules.jokerLastTurnPlayable) return false;
        return true;
      }
      if (mustFollow) return suitOf(c) === lead;
      if (!isKiruda(c, kiruda) || turn !== 0) return true;
      // 첫 턴에 리드무늬 없이 기루다를 내려는 경우
      return rules.firstTurnKirudaFollower && (trick.cards.length > 0 || rules.firstTurnKirudaLeader);
    });
  }

  // 마지막 턴에 낼 수 없는 마이티/조커가 남지 않도록 미리 내게 한다
  const mightyStuck = hasMighty && !rules.mightyLastTurnPlayable;
  const jokerStuck = hasJoker && !rules.jokerLastTurnPlayable;
  if (turn === LAST_TURN - 2 && mightyStuck && jokerStuck) return [mighty, JOKER];
  if (turn === LAST_TURN - 1 && (mightyStuck || jokerStuck)) return mightyStuck ? [mighty] : [JOKER];
  if (out.length === 0) return [...hand];
  return out;
}
