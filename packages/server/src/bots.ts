// 봇 종류. 지금은 simple 하나뿐이다.
import type { GameAction, Request } from '@mighty/protocol';
import type { Game } from './game.js';
import { decideSimple } from './simpleBot.js';

export type BotKind = 'simple' | 'smart';

export function decideFor(_kind: BotKind, g: Game, seat: number, req: Request): GameAction {
  return decideSimple(g, seat, req);
}
