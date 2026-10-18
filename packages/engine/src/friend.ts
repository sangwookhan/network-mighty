// 프렌드 지정 (CState::GetValidFriend @00431ac0, FUN_004225b0 프렌드 확정 부분)

import { JOKER, type Card } from './card.js';
import type { Rules } from './rules.js';

export type FriendSpec =
  | { kind: 'none' } //                    노프렌드
  | { kind: 'firstTrick' } //              초구 프렌드 (첫 트릭 승자)
  | { kind: 'player'; seat: number } //    특정 플레이어
  | { kind: 'card'; card: Card }; //       이 카드를 가진 사람

export interface FriendContext {
  rules: Rules;
  /** 이번 판 인원 */
  n: number;
  master: number;
  /** 버린 뒤의 주공 손패 */
  masterHand: readonly Card[];
  /** 주공이 버린 카드 */
  discards: readonly Card[];
}

export function isValidFriend(spec: FriendSpec, ctx: FriendContext): boolean {
  if (!ctx.rules.friendEnabled) return spec.kind === 'none';
  switch (spec.kind) {
    case 'none':
    case 'firstTrick':
      return true;
    case 'player':
      return Number.isInteger(spec.seat) && spec.seat >= 0 && spec.seat < ctx.n && spec.seat !== ctx.master;
    case 'card':
      if (!Number.isInteger(spec.card) || spec.card < 1 || spec.card > 53) return false;
      if (spec.card === JOKER && !ctx.rules.jokerFriendAllowed) return false;
      return !ctx.masterHand.includes(spec.card) && !ctx.discards.includes(spec.card);
  }
}

/** 프렌드가 아직 정해지지 않음 (초구 프렌드에서 첫 트릭 전) */
export const FRIEND_PENDING = -2;
export const NO_FRIEND = -1;

/**
 * 판 시작 시점의 프렌드 좌석. 카드 프렌드는 카드를 가진 사람(비공개).
 * 카드를 아무도 갖고 있지 않으면 노프렌드로 진행한다.
 */
export function resolveFriend(spec: FriendSpec, hands: readonly Card[][], master: number): number {
  switch (spec.kind) {
    case 'none':
      return NO_FRIEND;
    case 'firstTrick':
      return FRIEND_PENDING;
    case 'player':
      return spec.seat;
    case 'card': {
      const seat = hands.findIndex((h, i) => i !== master && h.includes(spec.card));
      return seat;
    }
  }
}

/** 초구 프렌드: 첫 트릭 승자가 프렌드. 주공이 이기면 노프렌드. */
export const firstTrickFriend = (winner: number, master: number): number => (winner === master ? NO_FRIEND : winner);
