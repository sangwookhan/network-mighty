// 주공 정리(버릴 3장 + 최종 공약 + 프렌드)가 규칙에 맞는지. 진행기와 봇이 같은 함수를 쓴다.

import { isValidFinalContract, isValidFriend, type Card, type Contract, type FriendSpec, type Rules } from '@mighty/engine';
import type { FriendChoice, GameAction } from '@mighty/protocol';

export interface FinalContext {
  rules: Rules;
  /** 바닥패를 받은 주공의 13장 (6마는 탈락 후 손패 + 바닥패) */
  hand: readonly Card[];
  /** 이번 판에 참가한 좌석 */
  active: readonly number[];
  master: number;
  elected: Contract;
}

/** 프로토콜의 프렌드 지정 → 엔진 형식 (player 좌석을 이번 판 순번으로). 잘못된 좌석이면 null */
export function toEngineFriend(f: FriendChoice, active: readonly number[]): FriendSpec | null {
  if (f.kind !== 'player') return f;
  const i = active.indexOf(f.seat);
  return i < 0 ? null : { kind: 'player', seat: i };
}

export function isValidFinalAction(ctx: FinalContext, x: GameAction): boolean {
  if (x.kind !== 'final') return false;
  const { hand, rules, active, master, elected } = ctx;
  const d = x.discards;
  if (!Array.isArray(d) || d.length !== 3 || new Set(d).size !== 3 || !d.every((c) => hand.includes(c))) return false;
  const c = x.contract;
  if (!c || !Number.isInteger(c.kiruda) || c.kiruda < 0 || c.kiruda > 4) return false;
  if (!isValidFinalContract(elected, c, rules)) return false;
  const spec = x.friend && toEngineFriend(x.friend, active);
  if (!spec) return false;
  return isValidFriend(spec, {
    rules,
    n: active.length,
    master: active.indexOf(master),
    masterHand: hand.filter((card) => !d.includes(card)),
    discards: d,
  });
}
