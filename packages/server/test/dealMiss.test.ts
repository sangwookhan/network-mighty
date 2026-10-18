// 딜 미스: 다시 섞기 전에 선언한 사람과 그 사람의 패를 모두에게 보여 주고, 딜 미스 대기 시간만큼 기다린다.

import { isDealMiss, presetRules } from '@mighty/engine';
import type { GameView } from '@mighty/protocol';
import { describe, expect, it } from 'vitest';
import { Game, type GameHost } from '../src/game.js';

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('딜 미스 공개', () => {
  it('선언한 좌석과 패를 모든 사람의 화면 상태에 담고, 다음 딜에서 지운다', async () => {
    const rules = presetRules(1);
    let game!: Game;
    let shown: { at: number; views: GameView[]; log: number } | null = null;
    let cleared = 0;
    const done = new Promise<void>((resolve) => {
      const host: GameHost = {
        rules,
        turnSeconds: 0,
        money: Array(rules.players).fill(0),
        isHumanControlled: () => false,
        seatName: (s) => `p${s}`,
        systemChat: () => {},
        quit: () => {},
        changed: () => {
          const v = game.view(null);
          if (!shown && v.redeal?.reason === 'dealMiss') {
            shown = { at: Date.now(), views: [0, 1, 2, 3, 4].map((s) => game.view(s)), log: v.election!.log.length };
          } else if (shown && !cleared && !v.redeal) {
            cleared = Date.now() - shown.at;
            game.abort();
            resolve();
          }
        },
      };
      game = new Game(host, seeded(11), 0, { botDelayMs: 0, trickPauseMs: 0, redealPauseMs: 0, dealMissPauseMs: 60 });
      game.run().catch(() => {});
    });
    await done;
    const s = shown!;
    const r = s.views[0].redeal!;
    // 누구에게나 같은 공개 정보
    for (const v of s.views) expect(v.redeal).toEqual(r);
    expect(r.seat).toBe(s.views[0].election!.log.at(-1)!.seat);
    expect(r.hand).toHaveLength(10);
    expect(isDealMiss(r.hand, rules)).toBe(true);
    expect(cleared).toBeGreaterThanOrEqual(55);
  }, 20_000);
});
