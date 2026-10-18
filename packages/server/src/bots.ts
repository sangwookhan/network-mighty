// 봇 종류: simple(1차, 비교용) / smart(기본)
import type { GameAction, Request } from '@mighty/protocol';
import type { BotView } from './botView.js';
import { decideSimple } from './simpleBot.js';
import { decideSmart } from './smartBot.js';

export type BotKind = 'simple' | 'smart';
/** 봇 결정 함수: 그 좌석에서 보이는 정보(BotView)와 요청만 받는다 */
export type Decide = (g: BotView, seat: number, req: Request) => GameAction;

/** 봇 종류별 결정 함수 (테스트에서 바꿔 끼울 수 있도록 표로 둔다) */
export const BOTS: Record<BotKind, Decide> = { simple: decideSimple, smart: decideSmart };

export function decideFor(kind: BotKind, g: BotView, seat: number, req: Request): GameAction {
  return BOTS[kind](g, seat, req);
}
