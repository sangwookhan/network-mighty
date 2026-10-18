// 봇 종류: simple(1차, 비교용) / smart(기본)
import type { GameAction, Request } from '@mighty/protocol';
import type { Game } from './game.js';
import { decideSimple } from './simpleBot.js';
import { decideSmart } from './smartBot.js';

export type BotKind = 'simple' | 'smart';

export function decideFor(kind: BotKind, g: Game, seat: number, req: Request): GameAction {
  return kind === 'simple' ? decideSimple(g, seat, req) : decideSmart(g, seat, req);
}
