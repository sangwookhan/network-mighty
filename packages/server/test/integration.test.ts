// 사람 3명(스크립트 클라이언트)이 접속해 방을 만들고, 봇과 함께 여러 판을 끝까지 치는 통합 테스트.

import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });
import { NO_SUIT, SUITS, goalRange, isValidBid, type Bid } from '@mighty/engine';
import type { ClientMessage, GameAction, RoomView, ServerMessage } from '@mighty/protocol';
import { Hub } from '../src/hub.js';

const FAST = { botDelayMs: 1, trickPauseMs: 1, redealPauseMs: 1 };

class Client {
  token?: string;
  playerId?: string;
  room: RoomView | null = null;
  errors: string[] = [];
  lobbyRooms: { id: string }[] = [];
  replaced = false;
  dealsFinished = new Set<number>();
  private session: ReturnType<Hub['connect']> | null = null;
  /** 이 판 번호까지는 계속, 그 뒤에는 그만 */
  stopAfterDeal = Infinity;
  autoPlay = true;

  constructor(private hub: Hub, readonly nickname: string) {}

  connect(): void {
    const conn = { send: (m: ServerMessage) => setImmediate(() => this.receive(m)), close: () => {} };
    this.session = this.hub.connect(conn);
    this.send({ t: 'hello', token: this.token, nickname: this.nickname });
  }
  disconnect(): void {
    this.session?.onClose();
    this.session = null;
  }
  send(m: ClientMessage): void {
    this.session?.onMessage(m);
  }

  private receive(m: ServerMessage): void {
    if (!this.session) return;
    if (m.t === 'welcome') (this.token = m.token), (this.playerId = m.playerId);
    if (m.t === 'error') this.errors.push(m.message);
    if (m.t === 'replaced') this.replaced = true;
    if (m.t === 'lobby') this.lobbyRooms = m.rooms;
    if (m.t === 'room') {
      this.room = m.room;
      const g = m.room.game;
      if (g?.phase === 'result') this.dealsFinished.add(g.dealNo);
      if (this.autoPlay) this.act();
    }
  }

  private act(): void {
    const g = this.room?.game;
    const req = g?.myRequest;
    if (!g || !req) return;
    const rules = this.room!.rules;
    let action: GameAction;
    switch (req.kind) {
      case 'bid': {
        const es = g.election!;
        let bid: Bid = { type: 'pass' };
        // 딜러는 첫 공약을 해서 전원 포기로 끝없이 다시 섞지 않게 한다
        if (!isValidBid(es, bid, g.myHand, rules) || (es.best === null && es.current === es.dealer)) {
          outer: for (let goal = goalRange(rules, NO_SUIT).min; goal <= 25; goal++)
            for (const k of [...SUITS, NO_SUIT]) {
              const b: Bid = { type: 'bid', kiruda: k, goal };
              if (isValidBid(es, b, g.myHand, rules)) {
                bid = b;
                break outer;
              }
            }
        }
        action = { kind: 'bid', bid };
        break;
      }
      case 'kill': {
        let card = 1;
        while (g.myHand.includes(card) || req.failed.includes(card)) card++;
        action = { kind: 'kill', card };
        break;
      }
      case 'final':
        action = {
          kind: 'final',
          discards: g.myHand.slice(0, 3),
          contract: g.electedContract!,
          friend: rules.friendEnabled ? { kind: 'firstTrick' } : { kind: 'none' },
        };
        break;
      case 'play':
        action = { kind: 'play', card: req.legal[0], jokerSuit: 1, jokercall: req.canJokercall };
        break;
      case 'continue':
        action = { kind: 'continue', cont: g.dealNo < this.stopAfterDeal };
        break;
    }
    this.send({ t: 'action', requestId: g.myRequestId!, action });
  }
}

const until = async (cond: () => boolean, ms = 10_000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 2));
  }
};

async function setup(presetId: number) {
  const hub = new Hub({ timing: FAST, reconnectGraceMs: 60_000 });
  const [a, b, c] = ['가', '나', '다'].map((n) => new Client(hub, n));
  for (const x of [a, b, c]) x.connect();
  await until(() => !!a.playerId && !!b.playerId && !!c.playerId);
  a.send({ t: 'createRoom', name: '시험방', presetId, turnSeconds: 0 });
  await until(() => !!a.room);
  const roomId = a.room!.id;
  b.send({ t: 'joinRoom', roomId });
  c.send({ t: 'joinRoom', roomId });
  await until(() => !!b.room && !!c.room && a.room!.seats.filter((s) => s.occupant === 'human').length === 3);
  return { hub, a, b, c, roomId };
}

describe('통합: 사람 3명 + 봇', () => {
  it.each([
    [1, '표준 5마'],
    [2, '표준 4마'],
    [3, '표준 3마'],
    [4, '표준 6마'],
    [6, '신촌 5마'],
  ])('프리셋 %i (%s): 여러 판을 끝까지 진행한다', async (presetId) => {
    const { hub, a, b, c } = await setup(presetId);
    a.send({ t: 'start' });
    await until(() => [a, b, c].every((x) => x.dealsFinished.size >= 3), 20_000);
    const room = a.room!;
    // 점수는 주고받기만 하므로 합이 보존된다
    expect(room.seats.reduce((s, x) => s + x.money, 0)).toBe(100 * room.seats.length);
    expect([a, b, c].flatMap((x) => x.errors)).toEqual([]);
    hub.closeRoom(hub.rooms.get(room.id)!);
  });

  it('남의 패는 보이지 않는다', async () => {
    const { hub, a, b } = await setup(1);
    a.autoPlay = b.autoPlay = false;
    a.send({ t: 'start' });
    await until(() => a.room?.game?.phase === 'election' && b.room?.game?.phase === 'election');
    const ga = a.room!.game!;
    const gb = b.room!.game!;
    expect(ga.myHand.length).toBe(10);
    expect(ga.myHand.some((c) => gb.myHand.includes(c))).toBe(false);
    expect(JSON.stringify(a.room)).not.toContain('"kitty"');
    hub.closeRoom(hub.rooms.get(a.room!.id)!);
  });

  it('연결이 끊기면 봇이 대신 치고, 다시 접속하면 자리를 되찾는다', async () => {
    const { hub, a, b, c } = await setup(1);
    a.send({ t: 'start' });
    await until(() => a.dealsFinished.size >= 1);
    b.disconnect();
    await until(() => a.room!.seats.some((s) => s.reserved));
    await until(() => a.dealsFinished.size >= 3, 20_000); // b 없이도 진행
    b.room = null;
    b.connect();
    await until(() => !!b.room);
    const mySeat = b.room!.me.seat;
    expect(mySeat).not.toBeNull();
    expect(b.room!.seats[mySeat!].reserved).toBe(false);
    const before = b.dealsFinished.size;
    await until(() => b.dealsFinished.size > before, 20_000);
    expect([a, b, c].flatMap((x) => x.errors)).toEqual([]);
    hub.closeRoom(hub.rooms.get(a.room!.id)!);
  });

  it('[그만]을 고르면 그 사람만 관전자가 되고 게임은 계속된다', async () => {
    const { hub, a, b, c } = await setup(1);
    c.stopAfterDeal = 1;
    a.send({ t: 'start' });
    await until(() => a.dealsFinished.size >= 2, 20_000);
    expect(a.room!.spectators.map((s) => s.nickname)).toEqual(['다']);
    expect(c.room!.me.seat).toBeNull();
    expect(c.room!.game!.myHand).toEqual([]);
    hub.closeRoom(hub.rooms.get(a.room!.id)!);
  });

  it('게임 중 들어온 사람은 관전하다가 봇 자리를 넘겨받는다', async () => {
    const { hub, a, roomId } = await setup(1);
    a.send({ t: 'start' });
    await until(() => a.dealsFinished.size >= 1);
    const d = new Client(hub, '라');
    d.connect();
    await until(() => !!d.playerId);
    d.send({ t: 'joinRoom', roomId });
    await until(() => !!d.room);
    expect(d.room!.me.seat).toBeNull();
    const botSeat = d.room!.seats.find((s) => s.occupant === 'bot')!.seat;
    d.send({ t: 'sit', seat: botSeat });
    await until(() => d.room!.me.seat === botSeat);
    const before = d.dealsFinished.size;
    await until(() => d.dealsFinished.size > before, 20_000);
    expect(d.errors).toEqual([]);
    hub.closeRoom(hub.rooms.get(roomId)!);
  });

  it('일시정지하면 봇도 멈추고, 다시 시작하면 이어진다', async () => {
    const { hub, a, b, c } = await setup(1);
    a.send({ t: 'start' });
    await until(() => !!a.room?.game && a.room.game.phase === 'play');
    b.send({ t: 'pause', paused: true });
    await until(() => !!a.room?.paused);
    expect(a.room!.paused!.by).toBe('나');
    // 일시정지 중에는 진행되지 않는다 (봇 지연 1ms 인데도)
    const snapshot = () => JSON.stringify([a.room!.game!.turn, a.room!.game!.trick?.cards.length, a.room!.game!.phase]);
    await new Promise((r) => setTimeout(r, 30));
    const before = snapshot();
    await new Promise((r) => setTimeout(r, 200));
    expect(snapshot()).toBe(before);
    expect(a.room!.game!.waitingFor.every((w) => w.deadline === null)).toBe(true);
    // 다시 시작하면 판이 끝까지 간다
    c.send({ t: 'pause', paused: false });
    await until(() => a.room?.paused === null && a.dealsFinished.size >= 1, 20_000);
    expect([a, b, c].flatMap((x) => x.errors).filter((e) => !e.includes('일시정지'))).toEqual([]);
    hub.closeRoom(hub.rooms.get(a.room!.id)!);
  });

  it('같은 사람이 다른 창에서 접속하면 먼저 창은 밀려나고, 새 창이 자리를 이어받는다', async () => {
    const { hub, a, roomId } = await setup(1);
    const a2 = new Client(hub, '가');
    a2.token = a.token;
    a2.connect();
    await until(() => a.replaced && !!a2.room);
    expect(a2.playerId).toBe(a.playerId);
    expect(a2.room!.me.seat).toBe(0);
    // 밀려난 연결이 보내는 메시지는 무시된다
    a.send({ t: 'start' });
    await new Promise((r) => setTimeout(r, 30));
    expect(hub.rooms.get(roomId)!.status).toBe('waiting');
    hub.closeRoom(hub.rooms.get(roomId)!);
  });

  it('봇 이름은 원작의 좌석별 기본 이름이다', async () => {
    const { hub, a } = await setup(1);
    a.send({ t: 'start' });
    await until(() => a.room?.status === 'playing');
    expect(a.room!.seats.filter((s) => s.occupant === 'bot').map((s) => s.nickname)).toEqual(['태우', '두환']);
    hub.closeRoom(hub.rooms.get(a.room!.id)!);
  });

  it('사람이 모두 나가면 방이 닫힌다', async () => {
    const { hub, a, b, c, roomId } = await setup(1);
    a.send({ t: 'start' });
    for (const x of [a, b, c]) x.send({ t: 'leaveRoom' });
    await until(() => !hub.rooms.has(roomId));
  });

  it('방장만 시작할 수 있고, 규칙에 맞지 않는 행동은 거절한다', async () => {
    const { hub, a, b } = await setup(1);
    b.send({ t: 'start' });
    await until(() => b.errors.length > 0);
    expect(b.errors[0]).toContain('방장');
    a.autoPlay = b.autoPlay = false;
    a.send({ t: 'start' });
    await until(() => !!a.room?.game);
    const g = a.room!.game!;
    const notMine = g.election!.current === a.room!.me.seat ? b : a;
    const errorsBefore = notMine.errors.length;
    notMine.send({ t: 'action', requestId: 999_999, action: { kind: 'bid', bid: { type: 'pass' } } });
    await until(() => notMine.errors.length > errorsBefore);
    expect(notMine.errors.at(-1)).toContain('차례');
    hub.closeRoom(hub.rooms.get(a.room!.id)!);
  });
});
