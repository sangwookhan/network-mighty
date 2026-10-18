import { describe, expect, it } from 'vitest';
import { PRESETS, presetRules } from '../src/index.js';
import { seeded, simulateDeal } from './helpers.js';

const DEALS = 300;

describe('프리셋별 무작위 판 시뮬레이션', () => {
  it.each(PRESETS.map((p) => [p.id, p.name] as const))('%i %s', (id) => {
    const rules = presetRules(id);
    const rng = seeded(1000 + id);
    let defenderWins = 0;
    for (let i = 0; i < DEALS; i++) {
      const log = simulateDeal(rules, rng, i % rules.players);
      const s = log.settlement;
      // 파산이 없을 만큼 돈이 많으면 점수 합은 보존된다
      expect(s.money.reduce((a, b) => a + b, 0)).toBe(log.moneyBefore.reduce((a, b) => a + b, 0));
      expect(s.defenderPoints + s.oppositionPoints).toBe(20);
      expect(s.amount).toBeGreaterThanOrEqual(0);
      expect(s.formula.endsWith(`= [${s.amount}]`)).toBe(true);
      if (!rules.friendEnabled) expect(log.friend).toBe(-1);
      if (s.defenderWon) defenderWins++;
    }
    // 무작위로 쳐도 양쪽이 다 이기는 경우가 나와야 정상
    expect(defenderWins).toBeGreaterThan(0);
    expect(defenderWins).toBeLessThan(DEALS);
  });
});
