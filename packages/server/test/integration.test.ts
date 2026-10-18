// 사람 3명(스크립트 클라이언트)이 접속해 방을 만들고, 봇과 함께 여러 판을 끝까지 치는 통합 테스트.

import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });
import { NO_SUIT, SUITS, goalRange, isValidBid, type Bid } from '@mighty/engine';
import { PROTOCOL_VERSION, applyRoomMessage, emptyRoomCache, type ClientMessage, type GameAction, type RoomView, type ServerMessage } from '@mighty/protocol';
import { BOTS } from '../src/bots.js';
import { turnLimitMs } from '../src/game.js';
import { Hub } from '../src/hub.js';

const FAST = { botDelayMs: 1, trickPauseMs: 1, redealPauseMs: 1 };

class Client {
  token?: string;
  playerId?: string;
  room: RoomView | null = null;
  private cache = emptyRoomCache();
  /** 받은 방 상태 메시지 크기 (통신량 확인용) */
  roomBytes: number[] = [];
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
    this.send({ t: 'hello', version: PROTOCOL_VERSION, token: this.token, nickname: this.nickname });
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
    // 서버는 방 상태·규칙·채팅을 따로 보낸다: 화면과 같은 함수로 합친다
    this.cache = applyRoomMessage(this.cache, m);
    if (m.t === 'room') this.roomBytes.push(JSON.stringify(m).length);
    if (this.cache.room && this.cache.room !== this.room) {
      this.room = this.cache.room;
      const g = this.room.game;
      if (g?.phase === 'result') this.dealsFinished.add(g.dealNo);
      if (m.t === 'room' && this.autoPlay) this.act();
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
    expect(a.room!.game!.waitingFor.every((w) => w.remainingMs === null)).toBe(true);
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

  it('봇이 예외를 던져도 서버는 멈추지 않고, 낼 수 있는 수로 대신 진행한다', async () => {
    const real = BOTS.smart;
    let failures = 0;
    BOTS.smart = (g, seat, req) => {
      // 절반은 예외, 절반은 규칙에 어긋난 수
      failures++;
      if (failures % 2) throw new Error('봇 고장 (테스트)');
      return req.kind === 'play' ? { kind: 'play', card: 0 } : real(g, seat, req);
    };
    try {
      const { hub, a, b, c } = await setup(1);
      a.send({ t: 'start' });
      await until(() => [a, b, c].every((x) => x.dealsFinished.size >= 2), 20_000);
      expect(failures).toBeGreaterThan(10);
      expect([a, b, c].flatMap((x) => x.errors)).toEqual([]);
      hub.closeRoom(hub.rooms.get(a.room!.id)!);
    } finally {
      BOTS.smart = real;
    }
  });

  it('잘못된 형식의 메시지는 거절하고 방 상태를 바꾸지 않는다', async () => {
    const { hub, a, roomId } = await setup(3); // 3마: 자리 0~2
    const bad: unknown[] = [
      { t: 'sit', seat: '__proto__' },
      { t: 'addBot', seat: 99 },
      { t: 'addBot', seat: 1.5 },
      { t: 'removeBot', seat: -1 },
      { t: 'chat', text: { evil: true } },
      { t: 'createRoom', name: 123, presetId: 'x', turnSeconds: null },
      { t: 'setRoom', presetId: 1e9 },
      { t: 'kick', playerId: ['x'] },
      { t: 'pause', paused: 'yes' },
      { t: 'action', requestId: 'a', action: { kind: 'play', card: 1 } },
      { t: 'action', requestId: 1, action: { kind: 'bid', bid: { type: 'bid', kiruda: 9, goal: 'x' } } },
      { t: 'nope' },
      null,
      42,
    ];
    const before = JSON.stringify(hub.rooms.get(roomId)!.seats);
    const errorsBefore = a.errors.length;
    for (const m of bad) a.send(m as ClientMessage);
    await until(() => a.errors.length >= errorsBefore + bad.length);
    expect(JSON.stringify(hub.rooms.get(roomId)!.seats)).toBe(before);
    expect(Object.getPrototypeOf(hub.rooms.get(roomId)!.seats)).toBe(Array.prototype);
    hub.closeRoom(hub.rooms.get(roomId)!);
  });

  it('차례 제한 시간은 남은 밀리초로 보낸다', async () => {
    const { hub, a, b } = await setup(1);
    a.autoPlay = b.autoPlay = false;
    a.send({ t: 'setRoom', turnSeconds: 30 });
    await until(() => a.room?.turnSeconds === 30);
    a.send({ t: 'start' });
    await until(() => !!a.room?.game?.waitingFor.length);
    const w = a.room!.game!.waitingFor[0];
    // 사람 좌석이면 30초 이하의 남은 시간, 봇 좌석이면 null
    if (w.remainingMs !== null) expect(w.remainingMs).toBeGreaterThan(25_000), expect(w.remainingMs).toBeLessThanOrEqual(30_000);
    expect(JSON.stringify(a.room)).not.toContain('deadline');
    hub.closeRoom(hub.rooms.get(a.room!.id)!);
  });

  it('주공 정리는 제한 시간의 4배, 방장은 게임 중에도 제한 시간을 바꿀 수 있다', async () => {
    expect(turnLimitMs(30, 'final')).toBe(120_000);
    expect(turnLimitMs(30, 'play')).toBe(30_000);
    expect(turnLimitMs(0, 'final')).toBe(0);

    const { hub, a, b } = await setup(1);
    a.autoPlay = b.autoPlay = false;
    a.send({ t: 'setRoom', turnSeconds: 30 });
    await until(() => a.room?.turnSeconds === 30);
    a.send({ t: 'start' });
    const human = () => a.room?.game?.waitingFor.find((w) => w.remainingMs !== null);
    await until(() => !!human());
    expect(human()!.remainingMs).toBeLessThanOrEqual(30_000);

    // 기다리는 차례는 새 제한 시간으로 다시 센다
    a.send({ t: 'setRoom', turnSeconds: 90 });
    await until(() => a.room?.turnSeconds === 90);
    expect(human()!.remainingMs).toBeGreaterThan(85_000);
    a.send({ t: 'setRoom', turnSeconds: 0 });
    await until(() => a.room?.turnSeconds === 0);
    expect(a.room!.game!.waitingFor.every((w) => w.remainingMs === null)).toBe(true);
    await until(() => a.room!.chat.some((l) => l.text.includes('제한 없음으로')));

    // 규칙은 게임 중에 바꿀 수 없고, 방장이 아니면 시간도 못 바꾼다
    const before = a.errors.length;
    a.send({ t: 'setRoom', presetId: 2 });
    await until(() => a.errors.length > before);
    expect(a.errors.at(-1)).toContain('규칙');
    b.send({ t: 'setRoom', turnSeconds: 30 });
    await until(() => b.errors.length > 0);
    expect(b.errors.at(-1)).toContain('방장');
    hub.closeRoom(hub.rooms.get(a.room!.id)!);
  });

  it('봇 수준: 방을 만들 때 고르고, 방장이 바꾸며, 로비에 보인다', async () => {
    const hub = new Hub({ timing: FAST });
    const a = new Client(hub, '가');
    a.connect();
    await until(() => !!a.playerId);
    a.send({ t: 'createRoom', name: '초급방', presetId: 1, turnSeconds: 0, botLevel: 'easy' });
    await until(() => !!a.room);
    const room = hub.rooms.get(a.room!.id)!;
    expect(a.room!.botLevel).toBe('easy');
    expect(room.botKind()).toBe('easy');
    expect(hub.roomSummaries()[0].botLevel).toBe('easy');
    a.send({ t: 'setRoom', botLevel: 'normal' });
    await until(() => a.room?.botLevel === 'normal');
    expect(room.botKind()).toBe('smart');
    // 모르는 수준은 형식 검사에서 막힌다
    const before = a.errors.length;
    a.send({ t: 'setRoom', botLevel: 'hard' } as unknown as ClientMessage);
    await until(() => a.errors.length > before);
    expect(a.room!.botLevel).toBe('normal');
    hub.closeRoom(room);
  });

  it('대기실에서 창을 닫으면 바로 퇴장 안내, 30초 안에 다시 접속하면 그 방으로 돌아온다', async () => {
    const { hub, a, b, c, roomId } = await setup(1);
    const bName = (r: RoomView | null) => r?.seats.some((s) => s.nickname === '나' && s.occupant === 'human') ?? false;
    expect(bName(a.room)).toBe(true);
    b.disconnect();
    await until(() => !!a.room?.chat.some((l) => l.text === '나님이 퇴장했습니다'));
    expect(bName(a.room)).toBe(false);
    // 새로고침처럼 곧바로 다시 접속
    b.connect();
    await until(() => bName(a.room) && b.room?.id === roomId);
    expect(a.room!.chat.at(-1)?.text).toBe('나님이 들어왔습니다');
    // 혼자 남은 사람은 바로 내보내지 않는다 (방이 사라지지 않게)
    a.send({ t: 'leaveRoom' });
    b.send({ t: 'leaveRoom' });
    await until(() => hub.rooms.get(roomId)?.summary().humans === 1);
    c.disconnect();
    await new Promise((r) => setTimeout(r, 20));
    expect(hub.rooms.has(roomId)).toBe(true);
    hub.closeRoom(hub.rooms.get(roomId)!);
  });

  it('게임 중에도 내 이름을 바꿀 수 있다 (자리·채팅에 반영, 겹치는 이름은 거절)', async () => {
    const { hub, a, b } = await setup(1);
    a.autoPlay = b.autoPlay = false;
    a.send({ t: 'start' });
    await until(() => a.room?.status === 'playing');
    const mySeat = () => a.room!.seats.find((s) => s.playerId === a.playerId)!;
    expect(mySeat().nickname).toBe('가');
    a.send({ t: 'rename', nickname: '가나다' });
    await until(() => mySeat().nickname === '가나다' && b.room!.seats.some((s) => s.nickname === '가나다'));
    expect(a.room!.chat.at(-1)?.text).toBe('가님이 이름을 가나다로 바꿨습니다');
    // 다른 사람이 쓰는 이름은 안 된다
    const before = a.errors.length;
    a.send({ t: 'rename', nickname: '나' });
    await until(() => a.errors.length > before);
    expect(a.errors.at(-1)).toContain('이미 쓰고 있는');
    expect(mySeat().nickname).toBe('가나다');
    hub.closeRoom(hub.rooms.get(a.room!.id)!);
  });

  it('프로토콜 버전이 다르면 접속을 거절한다', async () => {
    const hub = new Hub({ timing: FAST });
    const got: ServerMessage[] = [];
    const session = hub.connect({ send: (m) => got.push(m), close: () => {} });
    session.onMessage({ t: 'hello', version: PROTOCOL_VERSION - 1, nickname: '예전탭' });
    session.onMessage({ t: 'hello', nickname: '버전없음' });
    expect(got.map((m) => m.t)).toEqual(['versionMismatch', 'versionMismatch']);
    expect(hub.users.size).toBe(0);
    session.onMessage({ t: 'hello', version: PROTOCOL_VERSION, nickname: '새탭' });
    expect(got.at(-2)?.t).toBe('welcome');
  });

  it('방 상태에는 규칙·채팅이 빠지고, 채팅은 새 줄만, 나중에 온 사람도 기록과 규칙을 받는다', async () => {
    const { hub, a, b, roomId } = await setup(1);
    a.send({ t: 'chat', text: '안녕' });
    await until(() => b.room!.chat.some((l) => l.text === '안녕'));
    const d = new Client(hub, '라');
    d.connect();
    await until(() => !!d.playerId);
    d.send({ t: 'joinRoom', roomId });
    await until(() => !!d.room);
    expect(d.room!.chat.some((l) => l.text === '안녕')).toBe(true);
    expect(d.room!.rules.players).toBe(5);
    expect(d.room!.preset.name).toBe('표준 5마');
    // 방장이 규칙을 바꾸면 모두 새 규칙을 받는다
    a.send({ t: 'setRoom', presetId: 2 });
    await until(() => d.room!.preset.name === '표준 4마' && b.room!.rules.players === 4);
    // 서버가 보내는 방 상태 메시지에는 규칙·설명·채팅이 없다
    const raw: ServerMessage[] = [];
    const s2 = hub.connect({ send: (m) => raw.push(m), close: () => {} });
    s2.onMessage({ t: 'hello', version: PROTOCOL_VERSION, nickname: '원본보기' });
    s2.onMessage({ t: 'joinRoom', roomId });
    await new Promise((r) => setTimeout(r, 10));
    const roomMsg = raw.find((m) => m.t === 'room') as Extract<ServerMessage, { t: 'room' }>;
    expect(Object.keys(roomMsg.room)).not.toContain('chat');
    expect(Object.keys(roomMsg.room)).not.toContain('rules');
    // 규칙과 채팅 기록이 방 상태보다 먼저 와야 화면이 바로 그릴 수 있다
    const order = raw.map((m) => m.t);
    expect(order.indexOf('roomStatic')).toBeLessThan(order.indexOf('room'));
    expect(order.indexOf('chatHistory')).toBeLessThan(order.indexOf('room'));
    hub.closeRoom(hub.rooms.get(roomId)!);
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
