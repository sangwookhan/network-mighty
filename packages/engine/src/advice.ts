// 주공 도우미: 바닥패를 받은 뒤 버릴 카드·기루다·공약·프렌드를 고른다.
// 봇(server smartBot)과 화면('추천' 버튼, 처음 선택)이 같은 계산을 쓴다.

import { JOKER, NO_SUIT, SUITS, countPoints, isKiruda, jokercallOf, makeCard, mightyOf, powerOf, suitOf, type Card, type Suit } from './card.js';
import { isValidFinalContract, minFinalGoal, type Contract } from './election.js';
import { isValidFriend, type FriendSpec } from './friend.js';
import { activePlayers, type Rules } from './rules.js';

/** 패 평가용 상수 (봇끼리 대결로 맞춘다: server/scripts/bench.ts 가 덮어쓴다) */
export const HAND_PARAMS = {
  /** 프렌드가 보태 줄 것으로 기대하는 트릭 수 (2026-10-18 봇 대결 탐색으로 1.6 → 2.4) */
  friendTricks: 2.4,
  /** 바닥패 3장으로 기대하는 트릭 수 (0.6 → 0.3) */
  kittyTricks: 0.3,
  /** 트릭 1개당 점수 */
  pointsPerTrick: 2.0,
  /** 공약 추정에서 빼는 안전 여유 */
  bidMargin: -3,
  /** 프렌드 없는 규칙(3마)에서 혼자 칠 때 더하는 트릭 수 (1.0 → 0.5) */
  soloBonus: 0.5,
  /**
   * 버리기: 조커가 없을 때 조커콜 카드를 남기는 가치 (트릭 단위).
   * 봇 대결(4000판×2, 프리셋 1~4)에서 손해 없이 조금 나아진 보정만 남겼다. 무늬 비우기·한 장 남은 무늬·
   * 낮은 카드 우선·A-K-Q 연속 보정은 주공 승률이 같거나 나빠져서 넣지 않았다.
   */
  jokercallKeep: 0.3,
};

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

// ================= 처음 선택 (시간 초과로 그대로 진행돼도 손해가 적게) =================

/** '높은 카드'로 보는 세기: Q 이상 (A=13, K=12, Q=11) */
export const HIGH_POWER = 11;

/**
 * 처음에 올려 둘 버릴 카드 3장. 마이티·조커는 버리지 않고,
 * 기루다가 아닌 무늬 → 그 가운데 높은 카드(Q 이상)가 없는 무늬 → 낮은 카드 순으로 고른다.
 */
export function defaultDiscards(hand13: readonly Card[], kiruda: Suit, rules: Rules): Card[] {
  const mighty = mightyOf(rules, kiruda);
  const pool = hand13.filter((c) => c !== mighty && c !== JOKER);
  const hasHigh = (s: Suit) => pool.some((c) => suitOf(c) === s && powerOf(c) >= HIGH_POWER);
  const key = (c: Card) => [isKiruda(c, kiruda) ? 1 : 0, hasHigh(suitOf(c)) ? 1 : 0, powerOf(c)];
  return [...pool]
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a - b;
    })
    .slice(0, 3);
}

/** 처음 프렌드: 내 패에 없는 마이티 → 조커 → 기루다 A·K → 다른 무늬 A, 다 있으면 초구 (프렌드 없는 규칙은 노프렌드) */
export function defaultFriend(hand13: readonly Card[], kiruda: Suit, rules: Rules): FriendSpec {
  if (!rules.friendEnabled) return { kind: 'none' };
  for (const c of friendCards(kiruda, rules)) if (!hand13.includes(c)) return { kind: 'card', card: c };
  return { kind: 'firstTrick' };
}

/** 프렌드로 부를 만한 카드 (좋은 순서) */
function friendCards(kiruda: Suit, rules: Rules): Card[] {
  const out: Card[] = [mightyOf(rules, kiruda)];
  if (rules.jokerFriendAllowed) out.push(JOKER);
  if (kiruda !== NO_SUIT) for (const r of [1, 13, 12]) out.push(makeCard(kiruda, r));
  for (const s of SUITS) if (s !== kiruda) out.push(makeCard(s, 1));
  return out;
}

// ================= 추천 (봇이 쓰는 계산) =================

function combos3<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) for (let k = j + 1; k < xs.length; k++) out.push([xs[i], xs[j], xs[k]]);
  return out;
}

/** 버릴 3장을 고른다: 남은 10장의 기대 점수 + 버린 점수카드(규칙에 따라 여당/야당 몫) */
export function bestDiscard(hand13: readonly Card[], kiruda: Suit, rules: Rules): { discards: Card[]; value: number } {
  const mighty = mightyOf(rules, kiruda);
  let best = { discards: hand13.slice(0, 3), value: -Infinity };
  for (const d of combos3(hand13)) {
    if (d.includes(mighty) || d.includes(JOKER)) continue;
    const rest = hand13.filter((c) => !d.includes(c));
    const pts = countPoints(d);
    const value =
      (estimateTricks(rest, kiruda, rules) + discardBonus(rest, kiruda, rules)) * HAND_PARAMS.pointsPerTrick +
      (rules.discardsToOpposition ? -pts : pts) * 0.8 -
      d.filter((c) => isKiruda(c, kiruda)).length * 0.5;
    if (value > best.value) best = { discards: d, value };
  }
  return best;
}

/** estimateTricks 가 보지 않는, 버리기에서만 따지는 가치 (트릭 단위) */
function discardBonus(rest: readonly Card[], kiruda: Suit, rules: Rules): number {
  // 조커가 없으면 조커콜 카드로 상대의 조커를 불러낼 수 있다
  return !rest.includes(JOKER) && rest.includes(jokercallOf(rules, kiruda)) ? HAND_PARAMS.jokercallKeep : 0;
}

export interface FinalAdvice {
  discards: Card[];
  contract: Contract;
  friend: FriendSpec;
  /** 화면에 보여 줄 한 줄 설명 */
  reason: string;
}

const SUIT_MARK = ['노기루다', '♠', '◆', '♥', '♣'];

/** 버릴 카드·기루다·공약·프렌드 추천. 기루다는 확실히 나을 때만 바꾼다 */
export function adviseFinal(hand13: readonly Card[], elected: Contract, rules: Rules): FinalAdvice {
  const team = (rules.friendEnabled ? HAND_PARAMS.friendTricks : 0) * HAND_PARAMS.pointsPerTrick;
  const options: { contract: Contract; discards: Card[]; slack: number }[] = [];
  for (const k of [...SUITS, NO_SUIT] as Suit[]) {
    const d = bestDiscard(hand13, k, rules);
    const expected = d.value + team - HAND_PARAMS.bidMargin;
    // 이 기루다로 바꿀 때 가능한 가장 낮은 공약
    const goal = minFinalGoal(elected, k, rules);
    if (!isValidFinalContract(elected, { kiruda: k, goal }, rules)) continue;
    const slack = expected - goal - (k === elected.kiruda ? 0 : 1.5) + (k === NO_SUIT ? 1 : 0);
    options.push({ contract: { kiruda: k, goal }, discards: d.discards, slack });
  }
  options.sort((a, b) => b.slack - a.slack);
  const n = activePlayers(rules);
  for (const o of options) {
    const keep = hand13.filter((c) => !o.discards.includes(c));
    for (const friend of friendChoices(hand13, o.contract.kiruda, rules)) {
      if (!isValidFriend(friend, { rules, n, master: 0, masterHand: keep, discards: o.discards })) continue;
      return { ...o, friend, reason: explain(hand13, o.discards, o.contract, elected, rules) };
    }
  }
  // 여기까지 오지 않지만, 오면 처음 선택 그대로
  const discards = defaultDiscards(hand13, elected.kiruda, rules);
  return { discards, contract: elected, friend: defaultFriend(hand13, elected.kiruda, rules), reason: '낮은 카드 버림' };
}

function friendChoices(hand13: readonly Card[], kiruda: Suit, rules: Rules): FriendSpec[] {
  if (!rules.friendEnabled) return [{ kind: 'none' }];
  const cards = friendCards(kiruda, rules).filter((c) => !hand13.includes(c));
  return [...cards.map((card) => ({ kind: 'card' as const, card })), { kind: 'firstTrick' }, { kind: 'none' }];
}

function explain(hand13: readonly Card[], discards: readonly Card[], contract: Contract, elected: Contract, rules: Rules): string {
  const parts: string[] = [];
  if (contract.kiruda !== elected.kiruda) parts.push(`기루다를 ${SUIT_MARK[contract.kiruda]}(으)로 바꾸면 더 유리`);
  const keep = hand13.filter((c) => !discards.includes(c));
  const voided = SUITS.filter((s) => s !== contract.kiruda && hand13.some((c) => suitOf(c) === s && c !== JOKER) && !keep.some((c) => suitOf(c) === s && c !== JOKER));
  if (voided.length > 0 && contract.kiruda !== NO_SUIT) parts.push(`${voided.map((s) => SUIT_MARK[s]).join('')} 비워서 기루다로 자르기`);
  const pts = countPoints(discards);
  if (pts > 0) parts.push(rules.discardsToOpposition ? `점수카드 ${pts}장을 버림 (야당 몫)` : `점수카드 ${pts}장은 버려도 여당 점수`);
  if (discards.some((c) => isKiruda(c, contract.kiruda))) parts.push('기루다도 일부 버림');
  if (parts.length === 0) parts.push('약한 카드 버림');
  return parts.join(' · ');
}
