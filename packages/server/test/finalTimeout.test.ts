// 사람 주공이 정리 시간을 넘기면 서버는 화면에 처음 올려 둔 기본 선택(엔진 함수) 그대로 진행한다.

import { defaultDiscards, defaultFriend, presetRules, type Card, type Contract } from '@mighty/engine';
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

describe('주공 정리 시간 초과', () => {
  it.each([1, 2, 3, 4])('프리셋 %i: 당선 공약 그대로, 기본 버릴 카드와 기본 프렌드로 진행', async (presetId) => {
    const rules = presetRules(presetId);
    // 처음엔 모두 봇. 정리 차례가 오면 그 좌석을 사람으로 바꾸고 아주 짧은 제한 시간을 준다
    const humans = new Set<number>();
    let turnSeconds = 0;
    let seen: { seat: number; hand: Card[]; elected: Contract } | null = null;
    let done!: (v: { discards: Card[]; contract: Contract; friend: unknown }) => void;
    const result = new Promise<{ discards: Card[]; contract: Contract; friend: unknown }>((r) => (done = r));
    let game!: Game;
    let startedAt = 0;
    let waited = 0;
    const host: GameHost = {
      rules,
      get turnSeconds() {
        return turnSeconds;
      },
      money: Array(rules.players).fill(0),
      isHumanControlled: (s) => humans.has(s),
      seatName: (s) => `p${s}`,
      systemChat: () => {},
      quit: () => {},
      changed: () => {
        if (!seen) {
          const seat = game.active.find((s) => game.requestFor(s)?.kind === 'final');
          if (seat === undefined) return;
          seen = { seat, hand: [...game.hands[seat]], elected: { ...game.electedContract! } };
          humans.add(seat);
          turnSeconds = 0.01; // 정리는 4배 = 40ms
          startedAt = Date.now();
          game.occupantChanged(seat); // 봇 대신 사람 제한 시간으로 다시 배정
        } else if (game.phase === 'play' && game.contract) {
          waited = Date.now() - startedAt;
          const v = game.view(seen.seat);
          done({ discards: v.myDiscards!, contract: { ...game.contract }, friend: v.friendChoice });
          game.abort();
        }
      },
    };
    game = new Game(host, seeded(presetId * 7 + 1), 0, { botDelayMs: 0, trickPauseMs: 0, redealPauseMs: 0 });
    game.run().catch(() => {});
    const r = await result;
    const s = seen!;
    expect(waited).toBeGreaterThanOrEqual(35); // 봇이 바로 둔 것이 아니라 시간 초과로 진행됨
    expect([...r.discards].sort()).toEqual([...defaultDiscards(s.hand, s.elected.kiruda, rules)].sort());
    expect(r.contract).toEqual(s.elected);
    expect(r.friend).toEqual(defaultFriend(s.hand, s.elected.kiruda, rules));
  });
});
