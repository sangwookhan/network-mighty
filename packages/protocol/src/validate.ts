// 클라이언트 메시지 실행 중 검증. TypeScript 타입은 실행 중에는 아무것도 막지 않으므로,
// 서버는 이 함수를 통과한 메시지만 처리한다. 형식만 본다 (규칙에 맞는지는 서버·엔진이 따로 본다).

import type { ClientMessage, FriendChoice, GameAction } from './index.js';

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min = -1e9, max = 1e9): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const optStr = (x: unknown, max: number) => x === undefined || isStr(x, max);
const optInt = (x: unknown, min?: number, max?: number) => x === undefined || isInt(x, min, max);

const SEAT = [0, 5] as const;
const CARD = [0, 53] as const;
const SUIT = [0, 4] as const;

function isFriend(f: unknown): f is FriendChoice {
  if (!isObj(f)) return false;
  switch (f.kind) {
    case 'none':
    case 'firstTrick':
      return true;
    case 'player':
      return isInt(f.seat, ...SEAT);
    case 'card':
      return isInt(f.card, ...CARD);
    default:
      return false;
  }
}

function isAction(a: unknown): a is GameAction {
  if (!isObj(a)) return false;
  switch (a.kind) {
    case 'bid': {
      const b = a.bid;
      if (!isObj(b)) return false;
      if (b.type === 'pass' || b.type === 'dealMiss') return true;
      return b.type === 'bid' && isInt(b.kiruda, ...SUIT) && isInt(b.goal, 0, 30);
    }
    case 'kill':
      return isInt(a.card, ...CARD);
    case 'final':
      return (
        Array.isArray(a.discards) &&
        a.discards.length === 3 &&
        a.discards.every((c) => isInt(c, ...CARD)) &&
        isObj(a.contract) &&
        isInt(a.contract.kiruda, ...SUIT) &&
        isInt(a.contract.goal, 0, 30) &&
        isFriend(a.friend)
      );
    case 'play':
      return isInt(a.card, ...CARD) && optInt(a.jokerSuit, ...SUIT) && (a.jokercall === undefined || typeof a.jokercall === 'boolean');
    case 'continue':
      return typeof a.cont === 'boolean';
    default:
      return false;
  }
}

/** 형식이 맞으면 그대로 돌려주고, 아니면 null */
export function parseClientMessage(m: unknown): ClientMessage | null {
  if (!isObj(m)) return null;
  const ok = (() => {
    switch (m.t) {
      case 'hello':
        return optStr(m.token, 64) && optStr(m.nickname, 40);
      case 'createRoom':
        return isStr(m.name, 60) && isInt(m.presetId, 1, 99) && isInt(m.turnSeconds, 0, 3600);
      case 'joinRoom':
        return isStr(m.roomId, 32);
      case 'leaveRoom':
      case 'standUp':
      case 'start':
        return true;
      case 'sit':
      case 'addBot':
      case 'removeBot':
        return isInt(m.seat, ...SEAT);
      case 'kick':
        return isStr(m.playerId, 64);
      case 'setRoom':
        return optInt(m.presetId, 1, 99) && optInt(m.turnSeconds, 0, 3600);
      case 'chat':
        return isStr(m.text, 1000);
      case 'pause':
        return typeof m.paused === 'boolean';
      case 'action':
        return isInt(m.requestId, 0) && isAction(m.action);
      default:
        return false;
    }
  })();
  return ok ? (m as unknown as ClientMessage) : null;
}
