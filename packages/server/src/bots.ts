// 봇 종류: simple(1차, 비교용) / smart(기본)
import type { GameAction, Request } from '@mighty/protocol';
import type { Game } from './game.js';
import { decideSimple } from './simpleBot.js';
import { decideSmart } from './smartBot.js';

export type BotKind = 'simple' | 'smart';
export type Decide = (g: Game, seat: number, req: Request) => GameAction;

/** 봇 종류별 결정 함수 (테스트에서 바꿔 끼울 수 있도록 표로 둔다) */
export const BOTS: Record<BotKind, Decide> = { simple: decideSimple, smart: decideSmart };

export function decideFor(kind: BotKind, g: Game, seat: number, req: Request): GameAction {
  return BOTS[kind](g, seat, req);
}
