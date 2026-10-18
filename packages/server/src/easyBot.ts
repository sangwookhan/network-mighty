// 초급 봇: 중급(smart)처럼 두되 가끔 실수한다.
//  - 공약과 주공 정리는 단순 봇(simple) 방식 (패를 덜 정교하게 읽음)
//  - 카드 낼 때 30% 는 낼 수 있는 카드 중 아무거나 (마이티·조커는 아무렇게나 버리지 않음)

import { JOKER, mightyOf } from '@mighty/engine';
import type { GameAction, Request } from '@mighty/protocol';
import type { BotView as Game } from './botView.js';
import { decideSimple } from './simpleBot.js';
import { decideSmart } from './smartBot.js';

/** 실수하는 비율 (bench 로 중급보다 확실히 약한지 확인) */
export const EASY_MISTAKE = 0.3;

export function decideEasy(g: Game, seat: number, req: Request, rand: () => number = Math.random): GameAction {
  switch (req.kind) {
    case 'bid':
    case 'final':
      return decideSimple(g, seat, req);
    case 'play': {
      if (rand() < EASY_MISTAKE) {
        const kiruda = g.contract?.kiruda;
        const special = kiruda === undefined ? [] : [mightyOf(g.rules, kiruda), JOKER];
        const pool = req.legal.filter((c) => !special.includes(c));
        if (pool.length > 0) return { kind: 'play', card: pool[Math.floor(rand() * pool.length)] };
      }
      return decideSmart(g, seat, req);
    }
    default:
      return decideSmart(g, seat, req);
  }
}
