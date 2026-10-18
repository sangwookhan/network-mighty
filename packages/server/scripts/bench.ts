// 봇 대결: 같은 판에 두 종류의 봇을 섞어 앉혀 판당 평균 점수 변화를 비교한다.
// 자리에 따른 유불리를 없애려고 자리 배치를 바꿔 두 번 돌린다.
//   npx tsx scripts/bench.ts [판 수=400] [프리셋들=1,2,3,4]

import { PRESETS, presetRules } from '@mighty/engine';
import type { BotKind } from '../src/bots.js';
import { Game, type GameHost } from '../src/game.js';
import { PARAMS } from '../src/smartBot.js';

// 조정 실험용: PARAMS='{"bidMargin":0}' npx tsx scripts/bench.ts
if (process.env.PARAMS) Object.assign(PARAMS, JSON.parse(process.env.PARAMS));
// 검증용: 다른 판으로 다시 재기 (SEED=1000 npx tsx scripts/bench.ts)
const SEED = Number(process.env.SEED ?? 0);
// 대결할 두 봇 (KINDS=smart,easy npx tsx scripts/bench.ts). 기본은 smart 대 simple
const [A, B] = (process.env.KINDS ?? 'smart,simple').split(',') as [BotKind, BotKind];

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

interface KindStats {
  delta: number; // 점수 변화 합
  seatDeals: number; // (좌석 × 판) 수
  master: number; // 주공이 된 횟수
  masterWins: number;
  goalSum: number;
  defenderPts: number;
}

const empty = (): KindStats => ({ delta: 0, seatDeals: 0, master: 0, masterWins: 0, goalSum: 0, defenderPts: 0 });

function runMatch(presetId: number, deals: number, kinds: BotKind[], seed: number): Promise<Record<BotKind, KindStats>> {
  const rules = presetRules(presetId);
  const money = Array(rules.players).fill(1_000_000);
  const stats: Record<BotKind, KindStats> = { simple: empty(), smart: empty(), easy: empty() };
  const seen = new Set<number>();
  return new Promise((resolve, reject) => {
    let game!: Game;
    const host: GameHost = {
      rules,
      turnSeconds: 0,
      money,
      isHumanControlled: () => false,
      seatName: (s) => `b${s}`,
      botKind: (s) => kinds[s],
      systemChat: () => {},
      quit: () => {},
      changed: () => {
        const r = game?.result;
        if (!r || seen.has(game.dealNo)) return;
        seen.add(game.dealNo);
        for (const s of game.active) {
          const st = stats[kinds[s]];
          st.delta += r.after[s] - r.before[s];
          st.seatDeals++;
        }
        const m = stats[kinds[r.master]];
        m.master++;
        m.goalSum += r.contract.goal;
        m.defenderPts += r.settlement.defenderPoints;
        if (r.settlement.defenderWon) m.masterWins++;
        if (seen.size >= deals) {
          game.abort();
          resolve(stats);
        }
      },
    };
    game = new Game(host, seeded(seed), 0, { botDelayMs: 0, trickPauseMs: 0, redealPauseMs: 0 });
    game.run().catch(reject);
  });
}

function merge(a: KindStats, b: KindStats): KindStats {
  return {
    delta: a.delta + b.delta,
    seatDeals: a.seatDeals + b.seatDeals,
    master: a.master + b.master,
    masterWins: a.masterWins + b.masterWins,
    goalSum: a.goalSum + b.goalSum,
    defenderPts: a.defenderPts + b.defenderPts,
  };
}

const fmt = (x: number, d = 2) => x.toFixed(d).padStart(7);

async function main() {
  const deals = Number(process.argv[2] ?? 400);
  const presets = (process.argv[3] ?? '1,2,3,4').split(',').map(Number);
  console.log(`판 수 ${deals} × 2 (자리 바꿔서)`);
  console.log('프리셋        | 봇     | 판당 점수 | 주공 횟수 | 주공 승률 | 평균 공약 | 주공 시 여당 점수');
  for (const id of presets) {
    const n = presetRules(id).players;
    const a: BotKind[] = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? A : B));
    const b: BotKind[] = a.map((k) => (k === A ? B : A));
    const r1 = await runMatch(id, deals, a, SEED + id * 1000 + 1);
    const r2 = await runMatch(id, deals, b, SEED + id * 1000 + 2);
    const name = PRESETS.find((p) => p.id === id)!.name;
    for (const kind of [A, B]) {
      const s = merge(r1[kind], r2[kind]);
      console.log(
        `${name.padEnd(10)} | ${kind.padEnd(6)} | ${fmt(s.delta / s.seatDeals)} | ${String(s.master).padStart(8)} | ${fmt((100 * s.masterWins) / Math.max(1, s.master), 1)}% | ${fmt(s.goalSum / Math.max(1, s.master), 1)} | ${fmt(s.defenderPts / Math.max(1, s.master), 1)}`,
      );
    }
  }
}

main();
