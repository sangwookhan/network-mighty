// 한 방의 게임 진행기. 원작 CMFSM(FUN_004225b0)처럼 "차례인 좌석에 요청 → 응답 대기"를 async 루프로 진행한다.
// 사람과 봇은 구분하지 않는다: 요청은 좌석에 걸리고, 그 좌석을 사람이 조작 중이면 사람의 응답을,
// 아니면(봇 자리, 연결 끊김, 시간 초과) 봇의 결정을 받는다.

import {
  defaultDiscards,
  defaultFriend,
  JOKER,
  NO_SUIT,
  applyBid,
  canDeclareJokercall,
  countPoints,
  deal,
  isPoint,
  isValidBid,
  isValidFinalContract,
  isValidFriend,
  jokercallOf,
  killTarget,
  legalPlays,
  newDeck,
  redealAfterKill,
  resolveFriend,
  settle,
  shuffle,
  startElection,
  trickWinner,
  goalName,
  plainCardName,
  type Bid,
  type Card,
  type Contract,
  type ElectionState,
  type FriendSpec,
  type Rng,
  type Rules,
  type Suit,
  type Trick,
} from '@mighty/engine';
import type { FriendChoice, GameAction, GamePhase, GameView, PlayedCard, Request } from '@mighty/protocol';
import { BotView } from './botView.js';
import { decideFor, type BotKind } from './bots.js';
import { isValidFinalAction, toEngineFriend } from './finalCheck.js';

export interface GameHost {
  readonly rules: Rules;
  readonly turnSeconds: number;
  /** 좌석별 누적 점수 (게임이 직접 갱신한다) */
  readonly money: number[];
  /** 지금 사람이 조작 중인 좌석인가 (사람이 앉아 있고 연결되어 있음) */
  isHumanControlled(seat: number): boolean;
  seatName(seat: number): string;
  /** 이 좌석을 봇이 칠 때 쓸 봇 종류 (기본: smart) */
  botKind?(seat: number): BotKind;
  changed(): void;
  systemChat(text: string): void;
  /** 판이 끝나고 [그만]을 고른 좌석들 */
  quit(seats: number[]): void;
}

export interface Timing {
  botDelayMs: number;
  trickPauseMs: number;
  redealPauseMs: number;
  /** 딜 미스 때 선언한 사람의 패를 보여 주는 시간 (없으면 redealPauseMs) */
  dealMissPauseMs?: number;
}

export const DEFAULT_TIMING: Timing = { botDelayMs: 700, trickPauseMs: 1500, redealPauseMs: 1500, dealMissPauseMs: 3000 };

class Aborted extends Error {}

/** ms 뒤에 실행 (0이면 바로 다음 차례에: 봇 대결을 빠르게 돌리기 위해). 취소 함수를 돌려준다 */
function later(fn: () => void, ms: number): () => void {
  if (ms <= 0) {
    const h = setImmediate(fn);
    return () => clearImmediate(h);
  }
  const h = setTimeout(fn, ms);
  return () => clearTimeout(h);
}

interface Pending {
  id: number;
  req: Request;
  validate: (a: GameAction) => boolean;
  resolve: (a: GameAction) => void;
  reject: (e: Error) => void;
  deadline: number | null;
  /** 예약된 봇 행동/시간 초과를 취소 */
  cancel?: () => void;
}

const SUIT_KO = ['', '스페이드', '다이아몬드', '하트', '클로버'];

/** 주공이 바닥패를 받고 버릴 카드·공약·프렌드를 정하는 단계는 오래 고민하므로 차례 제한 시간의 4배를 준다 */
export const FINAL_TIME_FACTOR = 4;

/** 요청 종류별 제한 시간(밀리초) */
export function turnLimitMs(turnSeconds: number, kind: Request['kind']): number {
  return turnSeconds * 1000 * (kind === 'final' ? FINAL_TIME_FACTOR : 1);
}

export class Game {
  // ---- 판 상태 (좌석 번호 기준 배열) ----
  dealNo = 0;
  phase: GamePhase = 'election';
  dealer: number;
  active: number[] = [];
  killed: number | null = null;
  hands: Card[][] = [];
  kitty: Card[] = [];
  election: ElectionState | null = null;
  electionLog: { seat: number; bid: Bid }[] = [];
  master: number | null = null;
  electedContract: Contract | null = null;
  contract: Contract | null = null;
  friendChoice: FriendChoice | null = null;
  /** 실제 프렌드 좌석: -1 없음, -2 초구 프렌드 미정 */
  friendSeat = -1;
  friendRevealed = false;
  discards: Card[] = [];
  failedKills: Card[] = [];
  turn = 0;
  trick: { leader: number; cards: PlayedCard[]; jokerSuit: Suit; jokercall: boolean } | null = null;
  lastTrick: { cards: PlayedCard[]; winner: number } | null = null;
  /** 이번 판에 끝난 트릭 기록 (모두에게 공개된 정보, 봇의 추론용) */
  history: { leader: number; cards: PlayedCard[]; jokerSuit: Suit; jokercall: boolean; winner: number }[] = [];
  taken: Card[][] = [];
  jokerPlayed = false;
  result: GameView['result'] = null;

  private pending = new Map<number, Pending>();
  private paused = false;
  /** 일시정지할 때 사람 좌석의 남은 시간 */
  private remaining = new Map<number, number>();
  private nextRequestId = 1;
  private aborted = false;
  private sleepers = new Set<() => void>();
  private redeal: GameView['redeal'] = null;

  constructor(
    private host: GameHost,
    private rng: Rng,
    firstDealer: number,
    private timing: Timing = DEFAULT_TIMING,
  ) {
    this.dealer = firstDealer;
    const n = host.rules.players;
    this.hands = Array.from({ length: n }, () => []);
    this.taken = Array.from({ length: n }, () => []);
  }

  get rules(): Rules {
    return this.host.rules;
  }
  get ctx() {
    return { rules: this.rules, kiruda: this.contract?.kiruda ?? NO_SUIT };
  }

  /** 게임 루프. abort() 될 때까지 판을 계속 진행한다 */
  async run(): Promise<void> {
    try {
      for (;;) await this.playDeal();
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
    }
  }

  abort(): void {
    this.aborted = true;
    for (const p of this.pending.values()) {
      p.cancel?.();
      p.reject(new Aborted());
    }
    this.pending.clear();
    for (const wake of this.sleepers) wake();
  }

  // ---- 요청/응답 ----

  /** 좌석의 조작 주체가 바뀌었을 때 (끊김, 재접속, 자리 넘겨받기) 대기 중인 요청을 다시 배정한다 */
  occupantChanged(seat: number): void {
    if (this.pending.has(seat)) this.schedule(seat, true);
    this.host.changed();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** 일시정지: 모든 시간 제한과 봇을 멈추고 남은 시간을 보관한다. 다시 시작하면 남은 시간부터 이어 간다 */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    for (const [seat, p] of this.pending) {
      p.cancel?.();
      if (paused) {
        if (p.deadline !== null) this.remaining.set(seat, Math.max(0, p.deadline - Date.now()));
        p.deadline = null;
      } else {
        const left = this.remaining.get(seat);
        if (left !== undefined) p.deadline = Date.now() + left;
        this.schedule(seat, true);
      }
    }
    if (!paused) this.remaining.clear();
    this.host.changed();
  }

  /** 방장이 게임 중에 차례 제한 시간을 바꿨다: 기다리는 차례는 새 제한 시간으로 지금부터 다시 센다 */
  turnLimitChanged(): void {
    for (const [seat, p] of this.pending) {
      if (!this.host.isHumanControlled(seat)) continue;
      if (this.paused) {
        if (this.host.turnSeconds > 0) this.remaining.set(seat, turnLimitMs(this.host.turnSeconds, p.req.kind));
        else this.remaining.delete(seat);
      } else {
        p.deadline = null;
        this.schedule(seat, false);
      }
    }
    this.host.changed();
  }

  /** 사람이 보낸 행동. 실패하면 오류 문구를 돌려준다. 이미 처리된 요청에 대한 응답은 조용히 무시한다 */
  handleAction(seat: number, requestId: number, action: GameAction): string | null {
    const p = this.pending.get(seat);
    if (requestId < this.nextRequestId && (!p || p.id !== requestId)) return null;
    if (!p || p.id !== requestId) return '지금은 차례가 아닙니다';
    if (this.paused) return '일시정지 중입니다';
    if (action.kind !== p.req.kind) return '지금 할 수 없는 행동입니다';
    let ok = false;
    try {
      ok = p.validate(action);
    } catch {
      ok = false;
    }
    if (!ok) return '규칙에 맞지 않습니다';
    this.complete(seat, action);
    return null;
  }

  requestFor(seat: number): Request | null {
    return this.pending.get(seat)?.req ?? null;
  }

  requestIdFor(seat: number): number | null {
    return this.pending.get(seat)?.id ?? null;
  }

  waitingFor(): GameView['waitingFor'] {
    const now = Date.now();
    return [...this.pending.entries()].map(([seat, p]) => ({
      seat,
      kind: p.req.kind,
      remainingMs: p.deadline === null ? null : Math.max(0, p.deadline - now),
    }));
  }

  private ask(seat: number, req: Request, validate: (a: GameAction) => boolean): Promise<GameAction> {
    if (this.aborted) return Promise.reject(new Aborted());
    return new Promise((resolve, reject) => {
      this.pending.set(seat, { id: this.nextRequestId++, req, validate, resolve, reject, deadline: null });
      this.schedule(seat, false);
      this.host.changed();
    });
  }

  private schedule(seat: number, reassigned: boolean): void {
    const p = this.pending.get(seat)!;
    p.cancel?.();
    if (this.paused) return; // 다시 시작할 때 setPaused(false) 가 다시 배정한다
    if (!this.host.isHumanControlled(seat)) {
      p.deadline = null;
      p.cancel = later(() => this.botAct(seat), this.timing.botDelayMs);
    } else if (this.host.turnSeconds > 0) {
      if (!reassigned || p.deadline === null) p.deadline = Date.now() + turnLimitMs(this.host.turnSeconds, p.req.kind);
      p.cancel = later(() => this.botAct(seat), Math.max(0, p.deadline - Date.now()));
    } else {
      p.deadline = null;
    }
  }

  /**
   * 봇(또는 시간 초과로 대신하는 봇)이 결정한다. 이 함수는 타이머에서 불리므로 예외가 밖으로 나가면
   * 서버 프로세스 전체가 죽는다. 봇이 실패하거나 규칙에 어긋난 수를 내면 로그를 남기고 대체 수로 진행한다.
   */
  private botAct(seat: number): void {
    const p = this.pending.get(seat);
    if (!p) return;
    let action: GameAction | null = null;
    try {
      // 사람이 주공 정리 시간을 넘기면 화면에 처음 올려 둔 선택(엔진의 기본 선택) 그대로 진행한다:
      // 봇처럼 기루다를 바꾸거나 공약을 올리지 않아 손해가 적다
      if (p.req.kind === 'final' && this.host.isHumanControlled(seat)) action = this.defaultFinal(seat);
      // 봇은 사람과 같은 '그 좌석에서 보이는 정보'만 받는다 (남의 패를 볼 수 없음)
      else action = decideFor(this.host.botKind?.(seat) ?? 'smart', new BotView(this.rules, seat, this.view(seat)), seat, p.req);
      if (!p.validate(action)) {
        console.error(`[game] 봇이 규칙에 어긋난 수를 냄 (좌석 ${seat}):`, JSON.stringify(action));
        action = null;
      }
    } catch (e) {
      console.error(`[game] 봇 결정 중 오류 (좌석 ${seat}, 요청 ${p.req.kind}):`, e);
    }
    action ??= this.fallbackAction(seat, p.req);
    if (!action || !p.validate(action)) {
      // 여기까지 오면 엔진/진행기 버그: 이 방의 게임만 끝낸다
      console.error(`[game] 대체 수도 찾지 못함 (좌석 ${seat}, 요청 ${p.req.kind}). 게임을 중단합니다`);
      p.reject(new Error('no valid action'));
      this.pending.delete(seat);
      return;
    }
    this.complete(seat, action);
  }

  /** 주공 정리의 기본 선택: 당선 공약 그대로, 처음 올려 두는 버릴 카드와 프렌드 (화면과 같은 엔진 함수) */
  private defaultFinal(seat: number): GameAction {
    const hand = this.hands[seat];
    const contract = this.electedContract!;
    const friend = defaultFriend(hand, contract.kiruda, this.rules);
    return {
      kind: 'final',
      discards: defaultDiscards(hand, contract.kiruda, this.rules),
      contract: { kiruda: contract.kiruda, goal: contract.goal },
      friend: friend.kind === 'player' ? { kind: 'player', seat: this.active[friend.seat] } : friend,
    };
  }

  /** 규칙상 가능한 가장 단순한 수 (봇이 실패했을 때) */
  private fallbackAction(seat: number, req: Request): GameAction | null {
    const rules = this.rules;
    const hand = this.hands[seat];
    switch (req.kind) {
      case 'bid': {
        const es = this.election!;
        if (isValidBid(es, { type: 'pass' }, hand, rules)) return { kind: 'bid', bid: { type: 'pass' } };
        for (let goal = 1; goal <= 25; goal++)
          for (const kiruda of [NO_SUIT, 1, 2, 3, 4] as Suit[]) {
            const bid = { type: 'bid' as const, kiruda, goal };
            if (isValidBid(es, bid, hand, rules)) return { kind: 'bid', bid };
          }
        return null;
      }
      case 'kill': {
        for (let card = 1; card <= 53; card++) if (!hand.includes(card) && !req.failed.includes(card)) return { kind: 'kill', card };
        return null;
      }
      case 'final': {
        const contract = this.electedContract!;
        const choices: FriendChoice[] = [{ kind: 'none' }, { kind: 'firstTrick' }];
        for (let i = 0; i + 2 < hand.length; i++) {
          const discards = hand.filter((c) => c !== JOKER).slice(i, i + 3);
          for (const friend of choices) {
            const a: GameAction = { kind: 'final', discards, contract, friend };
            if (this.validateFinal(a)) return a;
          }
        }
        return null;
      }
      case 'play':
        return { kind: 'play', card: req.legal[0], jokerSuit: 1 };
      case 'continue':
        return { kind: 'continue', cont: true };
    }
  }

  private complete(seat: number, action: GameAction): void {
    const p = this.pending.get(seat)!;
    p.cancel?.();
    this.pending.delete(seat);
    p.resolve(action);
  }

  private sleep(ms: number): Promise<void> {
    if (this.aborted) return Promise.reject(new Aborted());
    return new Promise((resolve, reject) => {
      const wake = () => {
        cancel();
        this.sleepers.delete(wake);
        if (this.aborted) reject(new Aborted());
        else resolve();
      };
      const cancel = later(wake, ms);
      this.sleepers.add(wake);
    });
  }

  // ---- 한 판 ----

  private async playDeal(): Promise<void> {
    this.dealNo++;
    const { rules } = this;
    const n = rules.players;

    // 딜과 선거 (딜 미스·전원 포기면 다시)
    let elected: { seat: number; contract: Contract };
    for (;;) {
      this.resetDeal();
      const d = deal(shuffle(newDeck(rules), this.rng), rules, this.dealer);
      this.hands = d.hands;
      this.kitty = d.kitty;
      this.phase = 'election';
      this.election = startElection(n, this.dealer);
      this.host.systemChat(`${this.dealNo}번째 판: ${this.host.seatName(this.dealer)}님부터 공약합니다`);

      let outcome: ReturnType<typeof applyBid> | null = null;
      while (!outcome || outcome.type === 'continue') {
        const es: ElectionState = this.election;
        const seat = es.current;
        const a = await this.ask(seat, { kind: 'bid' }, (x) => x.kind === 'bid' && isValidBid(es, x.bid, this.hands[seat], rules));
        if (a.kind !== 'bid') throw new Error('unreachable');
        this.electionLog.push({ seat, bid: a.bid });
        outcome = applyBid(es, a.bid, this.hands[seat], rules);
        if (outcome.type === 'continue') this.election = outcome.state;
        this.host.changed();
      }
      if (outcome.type === 'redeal') {
        // 딜 미스는 선언한 사람의 패를 모두에게 보여 주고 잠깐 기다린 뒤 다시 섞는다
        const dealMiss = outcome.reason === 'dealMiss';
        const seat = dealMiss ? this.electionLog[this.electionLog.length - 1].seat : null;
        this.redeal = { reason: outcome.reason, seat, hand: seat === null ? [] : [...this.hands[seat]] };
        this.host.systemChat(dealMiss ? `${this.host.seatName(seat!)}님의 딜 미스! 다시 섞습니다` : '모두 포기해서 다시 섞습니다');
        this.host.changed();
        await this.sleep(dealMiss ? (this.timing.dealMissPauseMs ?? this.timing.redealPauseMs) : this.timing.redealPauseMs);
        continue;
      }
      elected = { seat: outcome.seat, contract: outcome.contract };
      break;
    }

    const master = elected.seat;
    this.master = master;
    this.electedContract = elected.contract;
    this.contract = elected.contract;
    this.host.systemChat(`${this.host.seatName(master)}님이 ${goalName(elected.contract.kiruda, elected.contract.goal, rules)}(으)로 당선`);

    // 6마: 한 명 탈락
    this.active = [...Array(n).keys()];
    if (n === 6) {
      this.phase = 'kill';
      for (;;) {
        const a = await this.ask(master, { kind: 'kill', failed: [...this.failedKills] }, (x) =>
          x.kind === 'kill' && Number.isInteger(x.card) && x.card >= 1 && x.card <= 53 &&
          !this.hands[master].includes(x.card) && !this.failedKills.includes(x.card));
        if (a.kind !== 'kill') throw new Error('unreachable');
        const target = killTarget(this.hands, master, a.card);
        if (target < 0) {
          this.failedKills.push(a.card);
          this.host.systemChat(`${plainCardName(a.card)}: 아무도 갖고 있지 않습니다. 다시 고릅니다`);
          continue;
        }
        const r = redealAfterKill(this.hands, this.kitty, target, this.rng);
        this.killed = target;
        this.hands = this.hands.map(() => []);
        r.seats.forEach((s, i) => (this.hands[s] = r.hands[i]));
        this.kitty = r.kitty;
        this.active = r.seats;
        this.host.systemChat(`${plainCardName(a.card)}: ${this.host.seatName(target)}님이 이번 판에서 빠집니다`);
        break;
      }
    }

    // 주공: 바닥패 받고 3장 버리고 최종 공약, 프렌드
    this.phase = 'final';
    this.hands[master] = [...this.hands[master], ...this.kitty];
    this.kitty = [];
    const fin = await this.ask(master, { kind: 'final' }, (x) => this.validateFinal(x));
    if (fin.kind !== 'final') throw new Error('unreachable');
    this.discards = fin.discards;
    this.hands[master] = this.hands[master].filter((c) => !fin.discards.includes(c));
    this.contract = fin.contract;
    this.friendChoice = fin.friend;
    this.setupFriend(fin.friend);
    this.host.systemChat(`최종 공약: ${goalName(fin.contract.kiruda, fin.contract.goal, rules)}, 프렌드: ${this.friendText(fin.friend)}`);

    // 10 트릭
    this.phase = 'play';
    let leader = master;
    for (let turn = 0; turn < 10; turn++) {
      this.turn = turn;
      this.trick = { leader, cards: [], jokerSuit: NO_SUIT, jokercall: false };
      const order = this.orderFrom(leader);
      for (let k = 0; k < order.length; k++) {
        const seat = order[k];
        const t = this.trick!;
        const legal = legalPlays(this.hands[seat], this.engineTrick(), this.ctx);
        const jc = jokercallOf(rules, this.ctx.kiruda);
        const canJokercall = k === 0 && legal.includes(jc) && canDeclareJokercall(jc, turn, true, this.jokerPlayed, this.ctx);
        const req: Request = { kind: 'play', legal, canJokercall, mustDeclareJokerSuit: k === 0 && legal.includes(JOKER) };
        const a = await this.ask(seat, req, (x) =>
          x.kind === 'play' && legal.includes(x.card) &&
          !(k === 0 && x.card === JOKER && !(Number.isInteger(x.jokerSuit) && x.jokerSuit! >= 1 && x.jokerSuit! <= 4)));
        if (a.kind !== 'play') throw new Error('unreachable');
        if (k === 0 && a.card === JOKER) t.jokerSuit = a.jokerSuit!;
        if (k === 0 && canJokercall && a.card === jc && a.jokercall) {
          t.jokercall = true;
          this.host.systemChat(`${this.host.seatName(seat)}: 조커콜!`);
        }
        if (a.card === JOKER) {
          this.jokerPlayed = true;
          if (k === 0) this.host.systemChat(`${this.host.seatName(seat)}: 조커 (${SUIT_KO[t.jokerSuit]})`);
        }
        this.hands[seat] = this.hands[seat].filter((c) => c !== a.card);
        t.cards.push({ seat, card: a.card });
        if (this.friendChoice?.kind === 'card' && this.friendChoice.card === a.card && !this.friendRevealed && this.friendSeat >= 0) {
          this.friendRevealed = true;
          this.host.systemChat(`프렌드 공개: ${this.host.seatName(this.friendSeat)}님`);
        }
        this.host.changed();
      }
      const t = this.trick!;
      const winner = t.cards[trickWinner(this.engineTrick(), this.ctx)].seat;
      this.taken[winner].push(...t.cards.map((c) => c.card).filter(isPoint));
      if (turn === 0 && this.friendSeat === -2) {
        this.friendSeat = winner === master ? -1 : winner;
        this.friendRevealed = true;
        this.host.systemChat(winner === master ? '주공이 초구를 따서 노프렌드로 진행합니다' : `초구 프렌드: ${this.host.seatName(winner)}님`);
      }
      this.lastTrick = { cards: t.cards, winner };
      this.history.push({ leader: t.leader, cards: t.cards, jokerSuit: t.jokerSuit, jokercall: t.jokercall, winner });
      this.host.changed();
      await this.sleep(this.timing.trickPauseMs);
      leader = winner;
    }
    this.trick = null;

    // 정산
    this.phase = 'result';
    this.friendRevealed = true;
    const idx = (s: number) => this.active.indexOf(s);
    const before = [...this.host.money];
    const s = settle(
      {
        rules,
        n: this.active.length,
        master: idx(master),
        friend: this.friendSeat >= 0 ? idx(this.friendSeat) : -1,
        friendSpec: this.toEngineFriend(this.friendChoice!)!,
        kiruda: this.contract.kiruda,
        goal: this.contract.goal,
        pointsTaken: this.active.map((x) => this.taken[x].length),
        discardPoints: countPoints(this.discards),
      },
      this.active.map((x) => this.host.money[x]),
    );
    this.active.forEach((x, i) => (this.host.money[x] = s.money[i]));
    this.result = {
      settlement: s,
      master,
      friend: this.friendSeat,
      contract: this.contract,
      before,
      after: [...this.host.money],
      continueVotes: Array(n).fill(null),
    };
    this.host.systemChat(`${s.defenderWon ? '여당 승리' : '야당 승리'} (여당 ${s.defenderPoints}점) ${s.formula}`);

    // 계속/그만 (원작 OnEnd): 모두 동시에 묻는다
    const votes = await Promise.all(
      [...Array(n).keys()].map(async (seat) => {
        const a = await this.ask(seat, { kind: 'continue' }, (x) => x.kind === 'continue' && typeof x.cont === 'boolean');
        const cont = a.kind === 'continue' ? a.cont : true;
        this.result!.continueVotes[seat] = cont;
        // 그만하기는 다른 사람들이 다 고를 때까지 기다리지 않고 바로 알린다 (자리는 모두 고른 뒤 봇에게)
        if (!cont) this.host.systemChat(`${this.host.seatName(seat)}님이 그만합니다. 다음 판부터 봇이 맡습니다`);
        this.host.changed();
        return cont;
      }),
    );
    const quitters = votes.flatMap((v, seat) => (v ? [] : [seat]));
    this.dealer = rules.friendDealsNext && this.friendSeat >= 0 ? this.friendSeat : master;
    if (quitters.length) this.host.quit(quitters);
  }

  private resetDeal(): void {
    const n = this.rules.players;
    this.redeal = null;
    this.phase = 'election';
    this.active = [...Array(n).keys()];
    this.killed = null;
    this.election = null;
    this.electionLog = [];
    this.master = null;
    this.electedContract = null;
    this.contract = null;
    this.friendChoice = null;
    this.friendSeat = -1;
    this.friendRevealed = false;
    this.discards = [];
    this.failedKills = [];
    this.turn = 0;
    this.trick = null;
    this.lastTrick = null;
    this.history = [];
    this.taken = Array.from({ length: n }, () => []);
    this.jokerPlayed = false;
    this.result = null;
  }

  /** 선부터 이번 판 참가 좌석 순서 */
  orderFrom(leader: number): number[] {
    const i = this.active.indexOf(leader);
    return this.active.map((_, k) => this.active[(i + k) % this.active.length]);
  }

  engineTrick(): Trick {
    const t = this.trick!;
    return { cards: t.cards.map((c) => c.card), turn: this.turn, jokerSuit: t.jokerSuit, jokercall: t.jokercall };
  }

  toEngineFriend(f: FriendChoice): FriendSpec | null {
    return toEngineFriend(f, this.active);
  }


  validateFinal(x: GameAction): boolean {
    if (this.master === null || !this.electedContract) return false;
    return isValidFinalAction(
      { rules: this.rules, hand: this.hands[this.master], active: this.active, master: this.master, elected: this.electedContract },
      x,
    );
  }


  private setupFriend(f: FriendChoice): void {
    const spec = this.toEngineFriend(f)!;
    const r = resolveFriend(spec, this.active.map((s) => this.hands[s]), this.active.indexOf(this.master!));
    this.friendSeat = r >= 0 ? this.active[r] : r;
    // 노프렌드, 플레이어 지정, 카드를 아무도 안 가짐 → 바로 공개
    this.friendRevealed = f.kind === 'none' || f.kind === 'player' || (f.kind === 'card' && r < 0);
  }

  friendText(f: FriendChoice): string {
    switch (f.kind) {
      case 'none':
        return '노프렌드';
      case 'firstTrick':
        return '초구 프렌드';
      case 'player':
        return `${this.host.seatName(f.seat)}님`;
      case 'card':
        return plainCardName(f.card);
    }
  }

  // ---- 보는 사람별 화면 ----

  view(viewerSeat: number | null): GameView {
    const n = this.rules.players;
    const isMaster = viewerSeat !== null && viewerSeat === this.master;
    return {
      dealNo: this.dealNo,
      phase: this.phase,
      dealer: this.dealer,
      active: this.active,
      killed: this.killed,
      handCounts: this.hands.map((h) => h.length),
      myHand: viewerSeat !== null ? [...this.hands[viewerSeat]] : [],
      election: this.election ? { ...this.election, log: this.electionLog } : null,
      master: this.master,
      electedContract: this.electedContract,
      contract: this.contract,
      friendChoice: this.friendChoice,
      friendSeat: this.friendRevealed ? this.friendSeat : viewerSeat !== null && viewerSeat === this.friendSeat ? viewerSeat : null,
      myDiscards: isMaster && this.phase !== 'election' ? this.discards : null,
      turn: this.turn,
      trick: this.trick && { ...this.trick, cards: [...this.trick.cards] },
      lastTrick: this.lastTrick,
      history: this.history,
      taken: this.taken.length === n ? this.taken : Array.from({ length: n }, () => []),
      waitingFor: this.waitingFor(),
      myRequest: viewerSeat !== null ? this.requestFor(viewerSeat) : null,
      myRequestId: viewerSeat !== null ? this.requestIdFor(viewerSeat) : null,
      redeal: this.redeal,
      result: this.result,
    };
  }
}

