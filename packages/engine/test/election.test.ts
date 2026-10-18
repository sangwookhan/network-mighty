import { describe, expect, it } from 'vitest';
import {
  HEART, JOKER, NO_SUIT, SPADE,
  applyBid, isDealMiss, isValidBid, isValidFinalContract, isValidFriend, minFinalGoal, presetRules, resolveFriend, startElection,
  type Bid, type ElectionResult, type ElectionState, type Rules,
} from '../src/index.js';
import { C, Cs } from './helpers.js';

const std = presetRules(1);
const junk = Cs('S2 S3 S4 S5 S6 S7 S8 S9 D2 D3');

function run(rules: Rules, bids: Bid[], dealer = 0): ElectionResult {
  let s: ElectionState = startElection(rules.players === 6 ? 6 : rules.players, dealer);
  let r: ElectionResult = { type: 'continue', state: s };
  for (const b of bids) {
    if (r.type !== 'continue') throw new Error('election already finished');
    s = r.state;
    r = applyBid(s, b, junk, rules);
  }
  return r;
}
const bid = (kiruda: number, goal: number): Bid => ({ type: 'bid', kiruda: kiruda as 0, goal });
const pass: Bid = { type: 'pass' };

describe('선거', () => {
  it('공약 후 나머지가 모두 포기하면 당선', () => {
    const r = run(std, [bid(SPADE, 13), pass, pass, pass, pass]);
    expect(r).toEqual({ type: 'elected', seat: 0, contract: { kiruda: SPADE, goal: 13 } });
  });

  it('경쟁 후 마지막 남은 사람이 당선', () => {
    const r = run(std, [bid(SPADE, 13), bid(HEART, 14), pass, pass, pass, pass]);
    expect(r).toEqual({ type: 'elected', seat: 1, contract: { kiruda: HEART, goal: 14 } });
  });

  it('전원 포기하면 다시 딜 (딜러 첫 포기가 허용되는 규칙)', () => {
    const loose = { ...std, dealerCanPassFirst: true };
    expect(run(loose, [pass, pass, pass, pass, pass])).toEqual({ type: 'redeal', reason: 'allPassed' });
  });

  it('공약은 현재 최고보다 높아야 하고 범위 안이어야 한다', () => {
    const r = run(std, [bid(SPADE, 14)]);
    if (r.type !== 'continue') throw new Error();
    expect(isValidBid(r.state, bid(HEART, 14), junk, std)).toBe(false);
    expect(isValidBid(r.state, bid(HEART, 15), junk, std)).toBe(true);
    expect(isValidBid(r.state, bid(HEART, 21), junk, std)).toBe(false);
    expect(isValidBid(startElection(5, 0), bid(SPADE, 12), junk, std)).toBe(false);
  });

  it('노기루다는 기본보다 1 낮게 부를 수 있는 규칙 (신촌)', () => {
    const shinchon = presetRules(6); // 기본 14
    const s = startElection(5, 0);
    expect(isValidBid(s, bid(NO_SUIT, 13), junk, shinchon)).toBe(true);
    expect(isValidBid(s, bid(SPADE, 13), junk, shinchon)).toBe(false);
  });

  it('최대 공약을 부르면 즉시 당선 (수정: 25까지 허용이면 25에서)', () => {
    expect(run(std, [bid(SPADE, 20)])).toMatchObject({ type: 'elected', seat: 0 });
    const shinchon = presetRules(6);
    expect(run(shinchon, [bid(SPADE, 20)])).toMatchObject({ type: 'continue' });
    expect(run(shinchon, [bid(SPADE, 25)])).toMatchObject({ type: 'elected', seat: 0 });
  });

  it('표준 5마: 첫 공약자(딜러)는 포기할 수 없고, 노기루다 13(기노)은 부를 수 있다', () => {
    const s = startElection(5, 3);
    expect(isValidBid(s, pass, junk, std)).toBe(false);
    expect(isValidBid(s, bid(NO_SUIT, 13), junk, std)).toBe(true);
    // 누가 먼저 공약했으면 딜러도 포기 가능
    const r = run(std, [bid(SPADE, 13), pass, pass, pass], 1);
    if (r.type !== 'continue') throw new Error();
    expect(r.state.current).toBe(0);
  });

  it('딜러의 첫 패스 금지 옵션', () => {
    const strict = { ...std, dealerCanPassFirst: false };
    const s = startElection(5, 2);
    expect(isValidBid(s, pass, junk, strict)).toBe(false);
    expect(() => applyBid(s, pass, junk, strict)).toThrow();
    expect(isValidBid(s, pass, junk, { ...std, dealerCanPassFirst: true })).toBe(true);
  });

  it('딜 미스 선언은 패가 조건에 맞을 때만', () => {
    const s = startElection(5, 0);
    expect(applyBid(s, { type: 'dealMiss' }, junk, std)).toEqual({ type: 'redeal', reason: 'dealMiss' });
    expect(isValidBid(s, { type: 'dealMiss' }, Cs('SA SK SQ S2 S3 S4 S5 S6 S7 S8'), std)).toBe(false);
  });
});

describe('딜 미스', () => {
  it('표준 5마', () => {
    expect(isDealMiss(junk, std)).toBe(true); // 점수카드 없음
    expect(isDealMiss(Cs('S10 S3 S4 S5 S6 S7 S8 S9 D2 D3'), std)).toBe(true); // 10 한 장뿐
    expect(isDealMiss(Cs('SJ S3 S4 S5 S6 S7 S8 S9 D2 D3'), std)).toBe(false); // 애꾸눈 잭 옵션 꺼짐
    expect(isDealMiss([JOKER, ...junk.slice(1)], std)).toBe(true); // 조커는 점수로 안 침
    expect(isDealMiss(Cs('SA SK SQ SJ S10 DA DK DQ DJ D10'), std)).toBe(true); // 모두 점수카드
  });

  it('수정: 모두 점수카드 옵션이 꺼져 있으면 딜 미스 아님', () => {
    const r = { ...std, dealMiss: { ...std.dealMiss, allPoints: false } };
    expect(isDealMiss(Cs('SA SK SQ SJ S10 DA DK DQ DJ D10'), r)).toBe(false);
  });

  it('수정: 점수카드 0장 옵션이 꺼져 있으면 딜 미스 아님', () => {
    const r = { ...std, dealMiss: { ...std.dealMiss, noPoints: false } };
    expect(isDealMiss(junk, r)).toBe(false);
  });

  it('수정: 조커 감점은 조커가 있을 때만', () => {
    const r = { ...std, dealMiss: { ...std.dealMiss, jokerDeductsOne: true } };
    expect(isDealMiss(Cs('S10 DK S4 S5 S6 S7 S8 S9 D2 D3'), r)).toBe(false);
    expect(isDealMiss([...Cs('S10 DK S4 S5 S6 S7 S8 S9 D2'), JOKER], r)).toBe(true);
  });

  it('마이티 한 장뿐 (신촌)', () => {
    expect(isDealMiss(Cs('SA S3 S4 S5 S6 S7 S8 S9 D2 D3'), presetRules(6))).toBe(true);
  });
});

describe('당선 후 최종 공약', () => {
  const el = { kiruda: SPADE as 1, goal: 14 };
  it('같은 기루다는 낮출 수 없다', () => {
    expect(isValidFinalContract(el, { kiruda: SPADE, goal: 14 }, std)).toBe(true);
    expect(isValidFinalContract(el, { kiruda: SPADE, goal: 13 }, std)).toBe(false);
  });
  it('기루다를 바꾸면 +2 (수정: 손패 장수와 무관)', () => {
    expect(isValidFinalContract(el, { kiruda: HEART, goal: 15 }, std)).toBe(false);
    expect(isValidFinalContract(el, { kiruda: HEART, goal: 16 }, std)).toBe(true);
    expect(isValidFinalContract(el, { kiruda: NO_SUIT, goal: 15 }, std)).toBe(false);
  });
  it('노기루다로 바꿀 땐 +1 옵션 (관악)', () => {
    expect(isValidFinalContract(el, { kiruda: NO_SUIT, goal: 15 }, presetRules(5))).toBe(true);
  });
  it('최대 점수에서 잘린다', () => {
    expect(isValidFinalContract({ kiruda: SPADE, goal: 19 }, { kiruda: HEART, goal: 20 }, std)).toBe(true);
  });
  it('기루다별 최소 공약 (자동 올림/원복용)', () => {
    expect(minFinalGoal(el, SPADE, std)).toBe(14);
    expect(minFinalGoal(el, HEART, std)).toBe(16);
    expect(minFinalGoal(el, NO_SUIT, presetRules(5))).toBe(15);
    expect(minFinalGoal({ kiruda: SPADE, goal: 19 }, HEART, std)).toBe(20);
  });
});

describe('프렌드', () => {
  const ctx = { rules: std, n: 5, master: 0, masterHand: Cs('SA SK'), discards: Cs('D2') };
  it('유효성', () => {
    expect(isValidFriend({ kind: 'player', seat: 2 }, ctx)).toBe(true);
    expect(isValidFriend({ kind: 'player', seat: 0 }, ctx)).toBe(false);
    expect(isValidFriend({ kind: 'player', seat: 5 }, ctx)).toBe(false);
    expect(isValidFriend({ kind: 'card', card: C('SK') }, ctx)).toBe(false);
    expect(isValidFriend({ kind: 'card', card: C('D2') }, ctx)).toBe(false);
    expect(isValidFriend({ kind: 'card', card: JOKER }, ctx)).toBe(true);
    expect(isValidFriend({ kind: 'card', card: JOKER }, { ...ctx, rules: presetRules(2) })).toBe(false);
    expect(isValidFriend({ kind: 'firstTrick' }, { ...ctx, rules: presetRules(3) })).toBe(false);
    expect(isValidFriend({ kind: 'none' }, { ...ctx, rules: presetRules(3) })).toBe(true);
  });
  it('카드 프렌드는 그 카드를 가진 사람, 아무도 없으면 노프렌드', () => {
    const hands = [Cs('SA'), Cs('HK'), Cs('DK')];
    expect(resolveFriend({ kind: 'card', card: C('DK') }, hands, 0)).toBe(2);
    expect(resolveFriend({ kind: 'card', card: C('CK') }, hands, 0)).toBe(-1);
  });
});
