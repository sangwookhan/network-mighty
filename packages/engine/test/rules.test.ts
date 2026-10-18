import { describe, expect, it } from 'vitest';
import { PRESETS, decodeRules, encodeRules, presetRules } from '../src/index.js';
import { C } from './helpers.js';

describe('프리셋 규칙 문자열', () => {
  it.each(PRESETS.map((p) => [p.id, p.name, p.code] as const))('%i %s: 디코드 후 다시 인코드하면 원본과 같다', (_id, _name, code) => {
    expect(encodeRules(decodeRules(code))).toBe(code);
  });

  it('인원과 기본 목표 점수가 원작 표와 같다', () => {
    const expected: Record<number, [number, number]> = {
      1: [5, 13], 2: [4, 14], 3: [3, 12], 4: [6, 13], 5: [6, 13], 6: [5, 14],
      7: [5, 12], 8: [4, 13], 9: [5, 12], 10: [6, 13], 11: [5, 12], 12: [3, 12],
    };
    for (const p of PRESETS) {
      const r = presetRules(p.id);
      expect([r.players, r.baseGoal], p.name).toEqual(expected[p.id]);
    }
  });

  it('공통 카드: 마이티 ♠A / 보조 ◆A / 조커콜 ♣3', () => {
    for (const p of PRESETS) {
      const r = presetRules(p.id);
      expect([r.mighty, r.altMighty, r.jokercall]).toEqual([C('SA'), C('DA'), C('C3')]);
    }
    expect(presetRules(1).altJokercall).toBe(C('S3'));
    expect(presetRules(5).altJokercall).toBe(C('H3'));
    expect(presetRules(7).altJokercall).toBe(C('H3'));
  });

  it('표준 5마 세부 옵션', () => {
    const r = presetRules(1);
    expect(r).toMatchObject({
      noKirudaGoalMinusOne: false,
      allowGoalOver20: false,
      dealerCanPassFirst: true,
      kirudaChangeRaise2: true,
      noKirudaChangeRaise1: false,
      friendEnabled: true,
      jokerFriendAllowed: true,
      mightyFirstTurnEffective: true,
      jokerFirstTurnPlayable: false,
      jokerLastTurnPlayable: false,
      jokercallFirstTurn: true,
      jokercalledJokerEffective: false,
      scoreMethod: 'risk',
      runBonus: 'double',
      backRunDouble: false,
      noKirudaDouble: true,
      noFriendDouble: true, // 원작 체감 결과에 맞춰 켬 (원본 문자열 값은 false)
    });
    expect(r.dealMiss).toEqual({
      noPoints: true, allPoints: true, // allPoints 도 원작 체감에 맞춰 켬
      countMighty: true, countJoker: false,
      jokerDeductsOne: false, onlyTen: true, onlyOneEyedJack: false, onlyMighty: false,
    });
  });

  it('지역 프리셋 특징', () => {
    expect(presetRules(5).scoreMethod).toBe('eyeForEye'); // 관악
    expect(presetRules(6)).toMatchObject({ allowGoalOver20: true, discardsToOpposition: true, flipScoredCards: true, jokercallFirstTurn: false }); // 신촌
    expect(presetRules(7)).toMatchObject({ jokerFirstTurnPlayable: true, backRunDouble: true, noFriendDouble: true, revealFriendOnScore: true }); // 경기
    expect(presetRules(3).friendEnabled).toBe(false); // 3마
    expect(presetRules(2).jokerFriendAllowed).toBe(false); // 표준 4마
  });

  it('원본 문자열 값은 decodeRules 로 그대로 얻을 수 있다', () => {
    const raw = decodeRules(PRESETS[0].code);
    expect([raw.noFriendDouble, raw.dealMiss.allPoints]).toEqual([false, false]);
  });

  it('프리셋 12종 모두 노기·노프 2배와 점수카드 0장/전부 딜 미스가 켜져 있다', () => {
    for (const p of PRESETS) {
      const r = presetRules(p.id);
      expect([r.noKirudaDouble, r.noFriendDouble, r.dealMiss.noPoints, r.dealMiss.allPoints], p.name).toEqual([true, true, true, true]);
    }
  });

  it('잘못된 문자열은 거부한다', () => {
    expect(() => decodeRules('abc')).toThrow();
    expect(() => decodeRules("#0$1M&WO*7H'5#")).toThrow(); // 인원 0
  });
});
