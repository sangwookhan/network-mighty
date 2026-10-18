import { describe, expect, it } from 'vitest';
import {
  CLUB, DIAMOND, HEART, JOKER, NO_SUIT, SPADE,
  canDeclareJokercall, legalPlays, presetRules, trickWinner, type Suit, type Trick,
} from '../src/index.js';
import { C, Cs } from './helpers.js';

const std = presetRules(1); // 표준 5마
const ctxH = { rules: std, kiruda: HEART as Suit };
const T = (cards: string, turn = 3, extra: Partial<Trick> = {}): Trick => ({
  cards: Cs(cards), turn, jokerSuit: NO_SUIT, jokercall: false, ...extra,
});

describe('트릭 승자', () => {
  it('마이티 > 조커 > 기루다 > 리드 무늬', () => {
    expect(trickWinner(T('CK CA H2 JK SA'), ctxH)).toBe(4);
    expect(trickWinner(T('CK CA H2 JK D3'), ctxH)).toBe(3);
    expect(trickWinner(T('CK CA H2 DA C2'), ctxH)).toBe(2);
    expect(trickWinner(T('CK CA DA C2 SK'), ctxH)).toBe(1);
  });

  it('리드 무늬도 기루다도 아니면 이기지 못한다', () => {
    expect(trickWinner(T('C2 DA SK HQ C3'), { rules: std, kiruda: NO_SUIT })).toBe(4);
  });

  it('첫 턴 조커는 효력 없음 (표준 5마)', () => {
    expect(trickWinner(T('CK JK C2 C4 C5', 0), ctxH)).toBe(0);
  });

  it('마지막 턴 조커는 효력 없음, 마이티는 효력 있음 (표준 5마)', () => {
    expect(trickWinner(T('CK JK C2 C4 C5', 9), ctxH)).toBe(0);
    expect(trickWinner(T('CK SA C2 C4 C5', 9), ctxH)).toBe(1);
  });

  it('조커 선은 선언한 무늬가 리드 무늬', () => {
    expect(trickWinner(T('JK DA SK D2 C3', 3, { jokerSuit: DIAMOND }), ctxH)).toBe(0);
  });

  it('조커콜이 선언되면 조커는 효력을 잃는다', () => {
    expect(trickWinner(T('C3 CA JK CK D2', 3, { jokercall: true }), ctxH)).toBe(1);
    expect(trickWinner(T('C3 CA JK CK D2', 3, { jokercall: false }), ctxH)).toBe(2);
  });

  it('기루다가 스페이드면 ◆A 가 마이티', () => {
    const ctxS = { rules: std, kiruda: SPADE as Suit };
    expect(trickWinner(T('SK DA SA'), ctxS)).toBe(1);
  });
});

describe('낼 수 있는 카드', () => {
  it('리드 무늬를 따라야 한다. 마이티와 조커는 언제나 가능', () => {
    expect(legalPlays(Cs('C2 CK D5 H3 SA JK'), T('CQ'), ctxH)).toEqual(Cs('C2 CK SA JK'));
  });

  it('리드 무늬가 없으면 아무거나', () => {
    expect(legalPlays(Cs('D5 H3 SA'), T('CQ'), ctxH)).toEqual(Cs('D5 H3 SA'));
  });

  it('첫 턴: 조커 금지, 선이 아닌 사람은 기루다 가능', () => {
    expect(legalPlays(Cs('D5 H3 JK SA'), T('CQ', 0), ctxH)).toEqual(Cs('D5 H3 SA'));
  });

  it('첫 턴 선은 기루다를 낼 수 없다. 기루다밖에 없으면 허용', () => {
    expect(legalPlays(Cs('D5 H3'), T('', 0), ctxH)).toEqual(Cs('D5'));
    expect(legalPlays(Cs('H3 H4'), T('', 0), ctxH)).toEqual(Cs('H3 H4'));
  });

  it('조커콜을 당하면 조커를 내야 한다', () => {
    expect(legalPlays(Cs('C2 JK SA'), T('C3', 3, { jokercall: true }), ctxH)).toEqual([JOKER]);
    const alt = { rules: { ...std, mightyAnswersJokercall: true }, kiruda: HEART as Suit };
    expect(legalPlays(Cs('C2 JK SA'), T('C3', 3, { jokercall: true }), alt)).toEqual([JOKER, C('SA')]);
    // 조커콜 선언이 없으면 강제되지 않음
    expect(legalPlays(Cs('C2 JK SA'), T('C3', 3), ctxH)).toEqual(Cs('C2 JK SA'));
  });

  it('첫 턴 조커콜이 무효인 규칙에서는 강제되지 않는다', () => {
    const shinchon = { rules: presetRules(6), kiruda: HEART as Suit };
    expect(legalPlays(Cs('C2 JK'), T('C3', 0, { jokercall: true }), shinchon)).toEqual(Cs('C2'));
  });

  it('마지막 턴에 못 내는 조커는 9번째 트릭에서 강제로 낸다', () => {
    expect(legalPlays(Cs('JK C2'), T('CK', 8), ctxH)).toEqual([JOKER]);
  });

  it('마이티와 조커가 모두 마지막에 못 나가면 8번째 트릭부터 강제', () => {
    const r = { rules: { ...std, mightyLastTurnPlayable: false }, kiruda: HEART as Suit };
    expect(legalPlays(Cs('JK SA C2'), T('CK', 7), r)).toEqual([C('SA'), JOKER]);
  });
});

describe('조커콜 선언', () => {
  it('선이 조커콜 카드를 낼 때만, 조커가 아직 안 나왔을 때만', () => {
    expect(canDeclareJokercall(C('C3'), 3, true, false, ctxH)).toBe(true);
    expect(canDeclareJokercall(C('C3'), 3, true, true, ctxH)).toBe(false);
    expect(canDeclareJokercall(C('C3'), 3, false, false, ctxH)).toBe(false);
    expect(canDeclareJokercall(C('C4'), 3, true, false, ctxH)).toBe(false);
    expect(canDeclareJokercall(C('S3'), 3, true, false, { rules: std, kiruda: CLUB })).toBe(true);
    expect(canDeclareJokercall(C('C3'), 0, true, false, { rules: presetRules(6), kiruda: HEART })).toBe(false);
  });
});
