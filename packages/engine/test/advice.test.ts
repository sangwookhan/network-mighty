import { describe, expect, it } from 'vitest';
import {
  HEART, JOKER, SPADE,
  adviseFinal, defaultDiscards, defaultFriend, isValidFinalContract, isValidFriend, mightyOf, presetRules,
} from '../src/index.js';
import { C, Cs } from './helpers.js';

const std = presetRules(1); // 표준 5마: 마이티 ♠A (기루다 ♠이면 ◆A), 조커 프렌드 가능
const hand = Cs('SA JK HA HK H5 H4 D2 D9 DK C4 C7 S3 S8');

describe('주공 도우미: 처음 선택', () => {
  it('마이티·조커 제외, 기루다 아닌 무늬 중 높은 카드 없는 무늬의 낮은 카드부터', () => {
    // ◆는 K 가 있어 뒤로, ♠(마이티 ♠A 는 빼고 봄)·♣에서 낮은 순
    expect(defaultDiscards(hand, HEART, std)).toEqual(Cs('S3 C4 C7'));
  });

  it('남은 무늬마다 높은 카드가 있으면 그 무늬의 낮은 카드, 기루다는 마지막', () => {
    const h = Cs('SA JK HA HK HQ HJ H9 DK D2 CQ C3 SK S5');
    expect(defaultDiscards(h, HEART, std)).toEqual(Cs('D2 C3 S5'));
    const allKiruda = Cs('SA JK H2 H3 H4 H5 H6 H7 H8 H9 H10 HJ HQ');
    expect(defaultDiscards(allKiruda, HEART, std)).toEqual(Cs('H2 H3 H4'));
  });

  it('기루다가 ♠이면 마이티는 ◆A 라서 ◆A 를 지키고 ♠A 는 기루다로 본다', () => {
    const h = Cs('DA JK SA SK S2 S3 H2 H3 H4 C2 C5 D3 D4');
    expect(mightyOf(std, SPADE)).toBe(C('DA'));
    const d = defaultDiscards(h, SPADE, std);
    expect(d).not.toContain(C('DA'));
    expect(d).toEqual(Cs('H2 C2 D3'));
  });

  it('프렌드: 내게 없는 마이티 → 조커 → 기루다 A·K·Q 순, 프렌드 없는 규칙은 노프렌드', () => {
    expect(defaultFriend(Cs('HA S2'), HEART, std)).toEqual({ kind: 'card', card: C('SA') });
    expect(defaultFriend(Cs('SA S2'), HEART, std)).toEqual({ kind: 'card', card: JOKER });
    expect(defaultFriend(hand, HEART, std)).toEqual({ kind: 'card', card: C('HQ') });
    expect(defaultFriend(hand, HEART, presetRules(3))).toEqual({ kind: 'none' }); // 표준 3마
  });
});

describe('주공 도우미: 추천', () => {
  it('규칙에 맞는 버리기·공약·프렌드를 고르고 이유를 붙인다', () => {
    const elected = { kiruda: HEART, goal: 14 } as const;
    const a = adviseFinal(hand, elected, std);
    expect(a.discards).toHaveLength(3);
    expect(a.discards).not.toContain(C('SA'));
    expect(a.discards).not.toContain(JOKER);
    expect(isValidFinalContract(elected, a.contract, std)).toBe(true);
    const keep = hand.filter((c) => !a.discards.includes(c));
    expect(isValidFriend(a.friend, { rules: std, n: 5, master: 0, masterHand: keep, discards: a.discards })).toBe(true);
    expect(a.reason.length).toBeGreaterThan(0);
  });

  it('기루다가 강하면 당선 기루다와 공약을 그대로 둔다', () => {
    const strong = Cs('SA JK HA HK HQ HJ H10 H9 H8 D2 D3 C2 C3');
    const a = adviseFinal(strong, { kiruda: HEART, goal: 15 }, std);
    expect(a.contract).toEqual({ kiruda: HEART, goal: 15 });
  });
});
