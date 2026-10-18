// 선거(공약)와 당선 후 최종 공약
// 원작: CState::IsValidNewGoal @00431940, 선거 종료 판정 FUN_00420d10, IsDealMiss @00431b80

import { JOKER, NO_SUIT, countPoints, isOneEyedJack, mightyOf, rankOf, type Card, type Suit } from './card.js';
import { maxGoal, type Rules } from './rules.js';

export type Bid =
  | { type: 'pass' }
  | { type: 'dealMiss' }
  | { type: 'bid'; kiruda: Suit; goal: number };

export interface Contract {
  kiruda: Suit;
  goal: number;
}

export function goalRange(rules: Rules, kiruda: Suit): { min: number; max: number } {
  const min = rules.baseGoal - (rules.noKirudaGoalMinusOne && kiruda === NO_SUIT ? 1 : 0);
  return { min, max: maxGoal(rules) };
}

/**
 * 딜 미스 여부. 선거 중에는 기루다가 정해지지 않았으므로 마이티는 기본 마이티다.
 * 수정: 원작은 jokerDeductsOne 에서 조커 보유를 확인하지 않았고, noPoints/allPoints 옵션을 무시했다.
 */
export function isDealMiss(hand: readonly Card[], rules: Rules): boolean {
  const dm = rules.dealMiss;
  const mighty = mightyOf(rules, NO_SUIT);
  const hasMighty = hand.includes(mighty);
  const hasJoker = hand.includes(JOKER);
  let p = countPoints(hand);
  if (dm.jokerDeductsOne && hasJoker) p -= 1;
  if (dm.onlyMighty && hasMighty && p === 1) return true;
  if (dm.onlyTen && p === 1 && hand.some((c) => rankOf(c) === 10)) return true;
  if (dm.onlyOneEyedJack && p === 1 && hand.some(isOneEyedJack)) return true;
  if (hasJoker && dm.countJoker) p += 1;
  if (hasMighty && !dm.countMighty) p -= 1;
  if (dm.noPoints && p <= 0) return true;
  if (dm.allPoints && p >= hand.length) return true;
  return false;
}

// ---- 선거 진행 ----

export interface ElectionState {
  readonly n: number;
  readonly dealer: number;
  /** 지금 공약할 차례 */
  readonly current: number;
  readonly passed: readonly boolean[];
  /** 현재 최고 공약 (없으면 null) */
  readonly best: (Contract & { seat: number }) | null;
}

export type ElectionResult =
  | { type: 'continue'; state: ElectionState }
  | { type: 'elected'; seat: number; contract: Contract }
  | { type: 'redeal'; reason: 'dealMiss' | 'allPassed' };

/** 선거는 딜러(=선)부터 시작한다 */
export function startElection(n: number, dealer: number): ElectionState {
  return { n, dealer, current: dealer, passed: Array(n).fill(false), best: null };
}

/** 지금 차례인 사람이 이 공약을 낼 수 있는가 */
export function isValidBid(state: ElectionState, bid: Bid, hand: readonly Card[], rules: Rules): boolean {
  switch (bid.type) {
    case 'dealMiss':
      return isDealMiss(hand, rules);
    case 'pass':
      // 아무도 공약하지 않았을 때 딜러의 첫 패스는 옵션으로만 허용
      return !(state.best === null && state.current === state.dealer && !rules.dealerCanPassFirst);
    case 'bid': {
      const { min, max } = goalRange(rules, bid.kiruda);
      if (!Number.isInteger(bid.goal) || bid.goal < min || bid.goal > max) return false;
      return bid.goal > (state.best?.goal ?? 0);
    }
  }
}

/** 다음 미패스자 (current 제외). 없으면 -1 */
function nextActive(state: ElectionState, passed: readonly boolean[]): number {
  for (let k = 1; k < state.n; k++) {
    const i = (state.current + k) % state.n;
    if (!passed[i]) return i;
  }
  return -1;
}

export function applyBid(state: ElectionState, bid: Bid, hand: readonly Card[], rules: Rules): ElectionResult {
  if (!isValidBid(state, bid, hand, rules)) throw new Error(`invalid bid ${JSON.stringify(bid)}`);

  if (bid.type === 'dealMiss') return { type: 'redeal', reason: 'dealMiss' };

  if (bid.type === 'pass') {
    const passed = state.passed.map((p, i) => p || i === state.current);
    const next = nextActive(state, passed);
    if (next < 0) return { type: 'redeal', reason: 'allPassed' };
    const remaining = passed.filter((p) => !p).length;
    if (remaining === 1 && state.best) return { type: 'elected', seat: state.best.seat, contract: pick(state.best) };
    return { type: 'continue', state: { ...state, passed, current: next } };
  }

  const best = { seat: state.current, kiruda: bid.kiruda, goal: bid.goal };
  // 수정: 원작은 최대 25까지 허용해도 20 이상이면 즉시 당선시켰다. 최대 공약에서만 즉시 당선.
  if (bid.goal >= maxGoal(rules)) return { type: 'elected', seat: best.seat, contract: pick(best) };
  const next = nextActive(state, state.passed);
  if (next < 0) return { type: 'elected', seat: best.seat, contract: pick(best) };
  return { type: 'continue', state: { ...state, best, current: next } };
}

const pick = (c: Contract): Contract => ({ kiruda: c.kiruda, goal: c.goal });

/**
 * 당선자가 바닥패를 받은 뒤 최종 공약을 바꿀 수 있는가.
 * 같은 기루다면 목표를 낮출 수 없고, 기루다를 바꾸면 규칙에 따라 +1 또는 +2 올려야 한다.
 * 수정: 원작은 손패 장수에 따라 +2/+1이 달라졌다 (13장일 때 +2, 버린 뒤 +1). 옵션대로 항상 +2.
 */
export function isValidFinalContract(elected: Contract, next: Contract, rules: Rules): boolean {
  const { min, max } = goalRange(rules, next.kiruda);
  if (!Number.isInteger(next.goal) || next.goal < min || next.goal > max) return false;
  if (next.kiruda === elected.kiruda) return next.goal >= elected.goal;
  let raise = 1;
  if (rules.noKirudaChangeRaise1 && (elected.kiruda === NO_SUIT || next.kiruda === NO_SUIT)) raise = 1;
  else if (rules.kirudaChangeRaise2) raise = 2;
  return next.goal >= Math.min(elected.goal + raise, max);
}
