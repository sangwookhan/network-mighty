// 봇이 보는 판: 사람에게 보내는 것과 같은 GameView(그 좌석 기준)만으로 만든다.
// 남의 패·바닥패는 들어 있지 않으므로 봇은 구조적으로 치트할 수 없다 (원작 BSW 는 남의 패를 읽었다).

import { JOKER, NO_SUIT, type Card, type Rules, type Trick } from '@mighty/engine';
import type { GameAction, GameView } from '@mighty/protocol';
import { isValidFinalAction } from './finalCheck.js';

export class BotView {
  constructor(
    readonly rules: Rules,
    /** 이 봇의 좌석 */
    readonly me: number,
    readonly view: GameView,
  ) {}

  get myHand(): readonly Card[] {
    return this.view.myHand;
  }
  /** 좌석별 손패 장수 (공개 정보) */
  get handCounts(): readonly number[] {
    return this.view.handCounts;
  }
  get election() {
    return this.view.election;
  }
  get master() {
    return this.view.master;
  }
  get contract() {
    return this.view.contract;
  }
  get electedContract() {
    return this.view.electedContract;
  }
  get friendChoice() {
    return this.view.friendChoice;
  }
  /** 내가 아는 프렌드: 공개됐으면 그 좌석(-1 없음), 내가 프렌드면 내 좌석, 모르면 null */
  get friendSeat() {
    return this.view.friendSeat;
  }
  /** 주공이면 내가 버린 3장 */
  get myDiscards(): readonly Card[] {
    return this.view.myDiscards ?? [];
  }
  get active() {
    return this.view.active;
  }
  get turn() {
    return this.view.turn;
  }
  get trick() {
    return this.view.trick;
  }
  get history() {
    return this.view.history;
  }
  get ctx() {
    return { rules: this.rules, kiruda: this.view.contract?.kiruda ?? NO_SUIT };
  }
  /** 이번 판에 조커가 이미 나왔는가 */
  get jokerPlayed(): boolean {
    return [...this.history.flatMap((t) => t.cards), ...(this.trick?.cards ?? [])].some((c) => c.card === JOKER);
  }

  /** 선부터 이번 판 참가 좌석 순서 */
  orderFrom(leader: number): number[] {
    const a = this.active;
    const i = a.indexOf(leader);
    return a.map((_, k) => a[(i + k) % a.length]);
  }

  engineTrick(): Trick {
    const t = this.trick!;
    return { cards: t.cards.map((c) => c.card), turn: this.turn, jokerSuit: t.jokerSuit, jokercall: t.jokercall };
  }

  validateFinal(x: GameAction): boolean {
    const v = this.view;
    if (v.master === null || !v.electedContract) return false;
    return isValidFinalAction({ rules: this.rules, hand: v.myHand, active: v.active, master: v.master, elected: v.electedContract }, x);
  }
}
