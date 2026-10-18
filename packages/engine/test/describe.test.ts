import { describe, expect, it } from 'vitest';
import { PRESETS, describePreset, ruleDifferences, presetRules } from '../src/index.js';

describe('프리셋 설명', () => {
  it.each(PRESETS.map((p) => [p.id, p.name] as const))('%i %s: 요약이 있고, 지역 규칙은 표준과 다른 점이 있다', (id, name) => {
    const d = describePreset(id);
    expect(d.name).toBe(name);
    expect(d.summary.length).toBeGreaterThan(0);
    if (name.startsWith('표준')) {
      expect(d.comparedTo).toBeNull();
      expect(d.differences).toEqual([]);
    } else {
      expect(d.comparedTo).toMatch(/^표준 \d마$/);
      expect(d.differences.length).toBeGreaterThan(0);
    }
  });

  it('표준 5마 요약', () => {
    expect(describePreset(1).summary).toEqual([
      '5명',
      '기본 공약 13 (최대 20)',
      '프렌드 있음',
      '점수법: 위험 보상',
      '런은 2배',
      '마이티 스페이드 A (기루다가 같은 무늬면 다이아몬드 A)',
      '조커콜 클로버 3 (기루다가 같은 무늬면 스페이드 3)',
    ]);
  });

  it('신촌 5마는 표준 5마와 다른 점에 25까지 공약, 버린 카드 야당 몫이 들어간다', () => {
    const d = describePreset(6);
    expect(d.differences).toContain('공약을 25까지 부를 수 있음');
    expect(d.differences).toContain('주공이 버린 카드의 점수는 야당 몫');
    expect(d.differences).toContain('기본 공약 14');
  });

  it('같은 규칙끼리는 다른 점이 없다', () => {
    expect(ruleDifferences(presetRules(1), presetRules(1))).toEqual([]);
  });

  it('보조 조커콜이 다르면 표시한다 (경기 5마는 하트 3)', () => {
    expect(describePreset(7).differences).toContain('조커콜 클로버 3 / 보조 조커콜 하트 3');
  });
});
