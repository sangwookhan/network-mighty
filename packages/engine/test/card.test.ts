import { describe, expect, it } from 'vitest';
import {
  CLUB, HEART, JOKER, NO_SUIT, SPADE,
  cardName, goalName, isOneEyedJack, isPoint, jokercallOf, mightyOf, powerOf, presetRules, rankOf, suitOf,
} from '../src/index.js';
import { C } from './helpers.js';

const std = presetRules(1);

describe('카드 인코딩', () => {
  it('원작과 같은 정수 값', () => {
    expect([C('SA'), C('DA'), C('H3'), C('C3'), C('CK')]).toEqual([1, 14, 29, 42, 52]);
    expect(JOKER).toBe(53);
    expect([suitOf(C('H3')), rankOf(C('H3'))]).toEqual([HEART, 3]);
    expect(suitOf(JOKER)).toBe(NO_SUIT);
  });

  it('세기: 2가 가장 약하고 A가 가장 세다, 조커는 14', () => {
    expect([powerOf(C('S2')), powerOf(C('SK')), powerOf(C('SA')), powerOf(JOKER)]).toEqual([1, 12, 13, 14]);
  });

  it('점수카드와 애꾸눈 잭', () => {
    expect(['SA', 'SK', 'SQ', 'SJ', 'S10'].map((s) => isPoint(C(s)))).toEqual([true, true, true, true, true]);
    expect(isPoint(C('S9'))).toBe(false);
    expect(isPoint(JOKER)).toBe(false);
    expect([isOneEyedJack(C('SJ')), isOneEyedJack(C('HJ')), isOneEyedJack(C('DJ'))]).toEqual([true, true, false]);
  });

  it('기루다가 마이티/조커콜 무늬면 보조 카드로 바뀐다', () => {
    expect(mightyOf(std, HEART)).toBe(C('SA'));
    expect(mightyOf(std, NO_SUIT)).toBe(C('SA'));
    expect(mightyOf(std, SPADE)).toBe(C('DA'));
    expect(jokercallOf(std, HEART)).toBe(C('C3'));
    expect(jokercallOf(std, CLUB)).toBe(C('S3'));
  });

  it('카드 이름', () => {
    expect(cardName(C('SK'), std, NO_SUIT)).toBe('스페이드 K');
    expect(cardName(C('S10'), std, SPADE)).toBe('기루다 10');
    expect(cardName(C('SK'), std, NO_SUIT, true)).toBe('삽카');
    expect(cardName(C('HA'), std, HEART, true)).toBe('기아');
    expect(cardName(C('SA'), std, HEART)).toBe('마이티');
    expect(cardName(C('C3'), std, HEART, true)).toBe('쪼콜');
  });

  it('공약 이름', () => {
    expect(goalName(SPADE, 14, std)).toBe('스페이드 14');
    expect(goalName(SPADE, 14, std, true)).toBe('넷삽');
    expect(goalName(NO_SUIT, 13, std, true)).toBe('기노');
    expect(goalName(NO_SUIT, 15, std, true)).toBe('닷노');
  });
});
