// 접속자, 로비, 방 관리. 모든 상태는 메모리에만 둔다 (docs/server_spec.md).

import { randomBytes, randomInt } from 'node:crypto';
import { PRESETS, describePreset, presetRules, type Rules } from '@mighty/engine';
import { PROTOCOL_VERSION, parseClientMessage, type ChatLine, type ClientMessage, type RoomState, type RoomSummary, type SeatView, type ServerMessage } from '@mighty/protocol';
import { DEFAULT_TIMING, Game, type GameHost, type Timing } from './game.js';

export interface Connection {
  send(msg: ServerMessage): void;
  close(): void;
}

export interface HubOptions {
  timing?: Timing;
  /** 끊긴 사람의 자리를 지켜 주는 시간 */
  reconnectGraceMs?: number;
}

export const TURN_SECONDS_CHOICES = [0, 30, 60, 90, 120] as const;
const START_MONEY = 100;
/**
 * 봇 이름: 원작 마이티 네트워크 3.2 의 좌석별 기본 이름 (Mighty.exe 0x4425f4 표).
 * 원작은 0번(나)이 Windows 사용자 이름, 없으면 '아무개'.
 */
export const BOT_NAMES = ['아무개', '대중', '영삼', '태우', '두환', '정희'] as const;
const botName = (seat: number) => BOT_NAMES[seat] ?? `봇${seat + 1}`;
const MAX_CHAT = 100;

export interface User {
  id: string;
  token: string;
  nickname: string;
  conn: Connection | null;
  roomId: string | null;
  graceTimer?: ReturnType<typeof setTimeout>;
}

interface Seat {
  occupant: 'empty' | 'human' | 'bot';
  userId: string | null;
  money: number;
}

const newId = (bytes = 6) => randomBytes(bytes).toString('base64url');
const cryptoRng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export class Hub {
  readonly users = new Map<string, User>(); // id → user
  private byToken = new Map<string, User>();
  readonly rooms = new Map<string, Room>();
  readonly timing: Timing;
  private graceMs: number;

  constructor(opts: HubOptions = {}) {
    this.timing = opts.timing ?? DEFAULT_TIMING;
    this.graceMs = opts.reconnectGraceMs ?? 5 * 60_000;
  }

  // ---- 연결 ----

  /** 새 연결. hello 를 받기 전까지는 user 가 없다 */
  connect(conn: Connection): { onMessage(raw: unknown): void; onClose(): void } {
    let user: User | null = null;
    return {
      onMessage: (raw) => {
        // 형식이 틀린 메시지는 처리하지 않는다 (타입은 실행 중에 아무것도 막지 않음)
        const msg = parseClientMessage(raw);
        if (!msg) return conn.send({ t: 'error', message: '잘못된 요청입니다' });
        if (!user) {
          if (msg?.t !== 'hello') return conn.send({ t: 'needNickname' });
          // 버전이 다른 화면(예전 탭)은 받지 않는다
          if (msg.version !== PROTOCOL_VERSION) return conn.send({ t: 'versionMismatch', serverVersion: PROTOCOL_VERSION });
          user = this.hello(conn, msg);
          return;
        }
        if (user.conn !== conn) return; // 같은 사람이 다른 곳에서 다시 접속함
        this.handle(user, msg);
      },
      onClose: () => {
        if (user) this.disconnect(user, conn);
      },
    };
  }

  private hello(conn: Connection, msg: Extract<ClientMessage, { t: 'hello' }>): User | null {
    let user = msg.token ? this.byToken.get(msg.token) : undefined;
    if (!user) {
      const nickname = (msg.nickname ?? '').trim();
      if (!nickname) {
        conn.send({ t: 'needNickname' });
        return null;
      }
      if (nickname.length > 12) {
        conn.send({ t: 'needNickname', reason: '닉네임은 12자까지입니다' });
        return null;
      }
      if ([...this.users.values()].some((u) => u.nickname === nickname)) {
        conn.send({ t: 'needNickname', reason: '이미 쓰고 있는 닉네임입니다' });
        return null;
      }
      user = { id: newId(), token: newId(18), nickname, conn: null, roomId: null };
      this.users.set(user.id, user);
      this.byToken.set(user.token, user);
    }
    if (user.conn && user.conn !== conn) {
      // 같은 사람이 다른 창에서 접속: 먼저 있던 창에 알리고 끊는다 (그 창은 자동 재접속을 멈춘다)
      user.conn.send({ t: 'replaced' });
      user.conn.close();
    }
    user.conn = conn;
    clearTimeout(user.graceTimer);
    conn.send({ t: 'welcome', token: user.token, playerId: user.id, nickname: user.nickname });
    const room = user.roomId ? this.rooms.get(user.roomId) : undefined;
    if (room) room.reconnected(user);
    else this.sendLobby(user);
    this.broadcastLobby();
    return user;
  }

  private disconnect(user: User, conn: Connection): void {
    if (user.conn !== conn) return;
    user.conn = null;
    const room = user.roomId ? this.rooms.get(user.roomId) : undefined;
    room?.disconnected(user);
    user.graceTimer = setTimeout(() => this.expire(user), this.graceMs);
    this.broadcastLobby();
  }

  /** 끊긴 채 유예 시간이 지남: 방에서 내보내고 사용자 정보를 지운다 */
  private expire(user: User): void {
    if (user.conn) return;
    const room = user.roomId ? this.rooms.get(user.roomId) : undefined;
    room?.leave(user, `${user.nickname}님이 연결이 끊겨 퇴장했습니다`);
    this.users.delete(user.id);
    this.byToken.delete(user.token);
    this.broadcastLobby();
  }

  // ---- 메시지 ----

  private handle(user: User, msg: ClientMessage): void {
    const room = user.roomId ? this.rooms.get(user.roomId) : undefined;
    const err = (message: string) => user.conn?.send({ t: 'error', message });
    switch (msg.t) {
      case 'hello':
        return;
      case 'createRoom': {
        if (room) return err('이미 방에 있습니다');
        if (!PRESETS.some((p) => p.id === msg.presetId)) return err('알 수 없는 규칙입니다');
        const name = String(msg.name ?? '').trim().slice(0, 20) || `${user.nickname}님의 방`;
        const r = new Room(this, newId(4), name, user.id, msg.presetId, normalizeTurnSeconds(msg.turnSeconds));
        this.rooms.set(r.id, r);
        r.join(user);
        return;
      }
      case 'joinRoom': {
        if (room) return err('이미 방에 있습니다');
        const r = this.rooms.get(msg.roomId);
        if (!r) return err('방이 없습니다');
        r.join(user);
        return;
      }
      case 'chat':
        if (room) room.chatFrom(user, String(msg.text ?? ''));
        return;
      default:
        if (!room) return err('방에 있지 않습니다');
        const e = room.handle(user, msg);
        if (e) err(e);
    }
  }

  // ---- 로비 ----

  roomSummaries(): RoomSummary[] {
    return [...this.rooms.values()].map((r) => r.summary());
  }

  sendLobby(user: User): void {
    user.conn?.send({ t: 'lobby', rooms: this.roomSummaries(), online: this.onlineCount() });
  }

  private lobbyQueued = false;
  broadcastLobby(): void {
    if (this.lobbyQueued) return;
    this.lobbyQueued = true;
    queueMicrotask(() => {
      this.lobbyQueued = false;
      for (const u of this.users.values()) if (!u.roomId) this.sendLobby(u);
    });
  }

  private onlineCount(): number {
    return [...this.users.values()].filter((u) => u.conn).length;
  }

  closeRoom(room: Room): void {
    room.game?.abort();
    this.rooms.delete(room.id);
    this.broadcastLobby();
  }
}

function normalizeTurnSeconds(x: unknown): number {
  return TURN_SECONDS_CHOICES.includes(x as 0) ? (x as number) : 60;
}

// ---- 방 ----

export class Room implements GameHost {
  rules: Rules;
  seats: Seat[] = [];
  spectators = new Set<string>();
  chat: ChatLine[] = [];
  game: Game | null = null;
  status: 'waiting' | 'playing' = 'waiting';
  pausedBy: string | null = null;

  constructor(
    private hub: Hub,
    readonly id: string,
    readonly name: string,
    public hostId: string,
    public presetId: number,
    public turnSeconds: number,
  ) {
    this.rules = presetRules(presetId);
    this.resizeSeats();
  }

  // ---- GameHost ----

  get money(): number[] {
    return this.moneyView;
  }
  private moneyView: number[] = [];

  isHumanControlled(seat: number): boolean {
    const s = this.seats[seat];
    return s.occupant === 'human' && !!this.user(s.userId)?.conn;
  }

  seatName(seat: number): string {
    const s = this.seats[seat];
    return s.occupant === 'human' ? (this.user(s.userId)?.nickname ?? '?') : botName(seat);
  }

  systemChat(text: string): void {
    this.pushChat({ at: Date.now(), from: null, text });
  }

  quit(seats: number[]): void {
    for (const seat of seats) {
      const s = this.seats[seat];
      if (s.occupant !== 'human') continue;
      const u = this.user(s.userId);
      this.toBot(seat);
      if (u) {
        this.spectators.add(u.id);
        this.systemChat(`${u.nickname}님이 그만두고 관전합니다. 자리는 봇이 맡습니다`);
      }
    }
    this.changed();
  }

  // ---- 입장/퇴장 ----

  join(user: User): void {
    user.roomId = this.id;
    this.sendIntro(user);
    let seat = -1;
    if (this.status === 'waiting') {
      seat = this.seats.findIndex((s) => s.occupant === 'empty');
      if (seat < 0) seat = this.seats.findIndex((s) => s.occupant === 'bot');
    }
    if (seat >= 0) this.seatHuman(seat, user);
    else this.spectators.add(user.id);
    this.systemChat(`${user.nickname}님이 들어왔습니다${seat < 0 ? ' (관전)' : ''}`);
    this.changed();
    this.hub.broadcastLobby();
  }

  leave(user: User, message?: string): void {
    const seat = this.seatOf(user.id);
    if (seat !== null) {
      if (this.status === 'playing') this.toBot(seat);
      else this.seats[seat] = { occupant: 'empty', userId: null, money: START_MONEY };
    }
    this.spectators.delete(user.id);
    user.roomId = null;
    this.systemChat(message ?? `${user.nickname}님이 나갔습니다`);
    if (this.hostId === user.id) this.passHost();
    if (this.humans().length === 0) return this.hub.closeRoom(this);
    this.changed();
    this.hub.broadcastLobby();
  }

  disconnected(user: User): void {
    const seat = this.seatOf(user.id);
    if (seat !== null) {
      this.systemChat(`${user.nickname}님의 연결이 끊겼습니다. 돌아올 때까지 봇이 대신 칩니다`);
      this.game?.occupantChanged(seat);
    }
    this.changed();
  }

  reconnected(user: User): void {
    this.sendIntro(user);
    const seat = this.seatOf(user.id);
    if (seat !== null) {
      this.systemChat(`${user.nickname}님이 돌아왔습니다`);
      this.game?.occupantChanged(seat);
    }
    this.changed();
  }

  // ---- 방 안 메시지 ----

  handle(user: User, msg: ClientMessage): string | null {
    const isHost = user.id === this.hostId;
    switch (msg.t) {
      case 'leaveRoom':
        this.leave(user);
        user.conn?.send({ t: 'leftRoom' });
        this.hub.sendLobby(user);
        return null;
      case 'sit':
        return this.sit(user, msg.seat);
      case 'standUp': {
        const seat = this.seatOf(user.id);
        if (seat === null) return '자리에 앉아 있지 않습니다';
        if (this.status === 'playing') this.toBot(seat);
        else this.seats[seat] = { occupant: 'empty', userId: null, money: START_MONEY };
        this.spectators.add(user.id);
        this.changed();
        return null;
      }
      case 'addBot':
      case 'removeBot': {
        if (!isHost) return '방장만 할 수 있습니다';
        if (this.status !== 'waiting') return '게임 중에는 할 수 없습니다';
        const s = this.seats[msg.seat];
        if (!s) return '잘못된 자리입니다';
        if (msg.t === 'addBot' && s.occupant !== 'empty') return '빈자리가 아닙니다';
        if (msg.t === 'removeBot' && s.occupant !== 'bot') return '봇 자리가 아닙니다';
        this.seats[msg.seat] = { occupant: msg.t === 'addBot' ? 'bot' : 'empty', userId: null, money: START_MONEY };
        this.changed();
        return null;
      }
      case 'kick': {
        if (!isHost) return '방장만 할 수 있습니다';
        const target = this.user(msg.playerId);
        if (!target || target.roomId !== this.id || target.id === user.id) return '내보낼 수 없습니다';
        this.leave(target, `${target.nickname}님을 방장이 내보냈습니다`);
        target.conn?.send({ t: 'leftRoom', reason: '방장이 내보냈습니다' });
        this.hub.sendLobby(target);
        return null;
      }
      case 'setRoom': {
        if (!isHost) return '방장만 할 수 있습니다';
        // 게임 중에는 차례 제한 시간만 바꿀 수 있다 (규칙은 판이 끝난 뒤 대기실에서)
        if (this.status !== 'waiting' && msg.presetId !== undefined && msg.presetId !== this.presetId) return '게임 중에는 규칙을 바꿀 수 없습니다';
        if (msg.presetId !== undefined && msg.presetId !== this.presetId) {
          if (!PRESETS.some((p) => p.id === msg.presetId)) return '알 수 없는 규칙입니다';
          this.presetId = msg.presetId;
          this.rules = presetRules(msg.presetId);
          this.resizeSeats();
          for (const u of this.humans()) this.sendStatic(u);
        }
        if (msg.turnSeconds !== undefined) {
          const t = normalizeTurnSeconds(msg.turnSeconds);
          if (t !== this.turnSeconds) {
            this.turnSeconds = t;
            if (this.game) {
              this.game.turnLimitChanged();
              this.systemChat(`방장이 차례 제한 시간을 ${t === 0 ? '제한 없음으로' : `${t}초로`} 바꿨습니다`);
            }
          }
        }
        this.changed();
        this.hub.broadcastLobby();
        return null;
      }
      case 'start':
        return this.start(user);
      case 'pause': {
        if (!this.game) return '게임 중이 아닙니다';
        if (this.seatOf(user.id) === null && user.id !== this.hostId) return '자리에 앉은 사람만 할 수 있습니다';
        const paused = !!msg.paused;
        if (paused === this.game.isPaused) return null;
        this.pausedBy = paused ? user.nickname : null;
        this.game.setPaused(paused);
        this.systemChat(paused ? `${user.nickname}님이 일시정지했습니다` : `${user.nickname}님이 게임을 다시 시작했습니다`);
        return null;
      }
      case 'action': {
        const seat = this.seatOf(user.id);
        if (seat === null || !this.game) return '게임에 참가하고 있지 않습니다';
        if (!Number.isInteger(msg.requestId) || !msg.action) return '잘못된 요청입니다';
        return this.game.handleAction(seat, msg.requestId, msg.action);
      }
      default:
        return '알 수 없는 요청입니다';
    }
  }

  private sit(user: User, seat: number): string | null {
    const s = this.seats[seat];
    if (!s) return '잘못된 자리입니다';
    if (this.seatOf(user.id) !== null) return '이미 앉아 있습니다';
    if (s.occupant === 'human') return '다른 사람이 앉은 자리입니다';
    if (this.status === 'playing' && s.occupant !== 'bot') return '봇 자리만 넘겨받을 수 있습니다';
    this.spectators.delete(user.id);
    this.seatHuman(seat, user);
    if (this.status === 'playing') this.systemChat(`${user.nickname}님이 ${seat + 1}번 자리를 넘겨받았습니다`);
    this.game?.occupantChanged(seat);
    this.changed();
    this.hub.broadcastLobby();
    return null;
  }

  private start(user: User): string | null {
    if (user.id !== this.hostId) return '방장만 시작할 수 있습니다';
    if (this.status !== 'waiting') return '이미 시작했습니다';
    this.seats.forEach((s, i) => {
      if (s.occupant === 'empty') this.seats[i] = { occupant: 'bot', userId: null, money: START_MONEY };
      this.seats[i].money = START_MONEY;
    });
    this.moneyView = this.seats.map((s) => s.money);
    this.status = 'playing';
    this.systemChat('게임을 시작합니다. 빈자리는 봇이 채웠습니다');
    this.game = new Game(this, cryptoRng, randomInt(0, this.seats.length), this.hub.timing);
    this.game.run().catch((e) => {
      console.error('game crashed', e);
      this.systemChat('게임 진행 중 오류가 나서 대기실로 돌아갑니다');
      this.game = null;
      this.status = 'waiting';
      this.changed();
    });
    this.changed();
    this.hub.broadcastLobby();
    return null;
  }

  chatFrom(user: User, text: string): void {
    const t = text.trim().slice(0, 200);
    if (t) this.pushChat({ at: Date.now(), from: user.nickname, text: t });
  }

  // ---- 내부 ----

  private user(id: string | null): User | undefined {
    return id ? this.hub.users.get(id) : undefined;
  }

  seatOf(userId: string): number | null {
    const i = this.seats.findIndex((s) => s.occupant === 'human' && s.userId === userId);
    return i < 0 ? null : i;
  }

  private seatHuman(seat: number, user: User): void {
    const money = this.status === 'playing' ? this.moneyView[seat] : START_MONEY;
    this.seats[seat] = { occupant: 'human', userId: user.id, money };
  }

  private toBot(seat: number): void {
    this.seats[seat] = { occupant: 'bot', userId: null, money: this.moneyView[seat] ?? START_MONEY };
    this.game?.occupantChanged(seat);
  }

  /** 방에 남은 사람 (자리, 관전, 끊겼지만 유예 중 포함) */
  private humans(): User[] {
    return [...this.hub.users.values()].filter((u) => u.roomId === this.id);
  }

  private passHost(): void {
    const seated = this.seats.find((s) => s.occupant === 'human')?.userId;
    const next = seated ?? [...this.spectators][0];
    if (next) {
      this.hostId = next;
      this.systemChat(`${this.user(next)?.nickname}님이 방장이 되었습니다`);
    }
  }

  private resizeSeats(): void {
    const n = this.rules.players;
    const kept = this.seats.slice(0, n);
    for (const s of this.seats.slice(n)) if (s.occupant === 'human' && s.userId) this.spectators.add(s.userId);
    while (kept.length < n) kept.push({ occupant: 'empty', userId: null, money: START_MONEY });
    this.seats = kept;
  }

  /** 채팅은 새 줄만 보낸다 (방 상태 전체에 넣지 않음) */
  private pushChat(line: ChatLine): void {
    this.chat.push(line);
    if (this.chat.length > MAX_CHAT) this.chat.shift();
    for (const u of this.humans()) u.conn?.send({ t: 'chat', roomId: this.id, line });
  }

  /** 입장·재접속 때: 규칙·설명과 지금까지의 채팅 */
  private sendIntro(user: User): void {
    this.sendStatic(user);
    user.conn?.send({ t: 'chatHistory', roomId: this.id, lines: this.chat });
  }

  private sendStatic(user: User): void {
    user.conn?.send({ t: 'roomStatic', roomId: this.id, presetId: this.presetId, rules: this.rules, preset: describePreset(this.presetId) });
  }

  summary(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      presetId: this.presetId,
      presetName: PRESETS.find((p) => p.id === this.presetId)!.name,
      players: this.seats.length,
      humans: this.seats.filter((s) => s.occupant === 'human').length,
      bots: this.seats.filter((s) => s.occupant === 'bot').length,
      spectators: this.spectators.size,
      status: this.status,
    };
  }

  viewFor(user: User): RoomState {
    const mySeat = this.seatOf(user.id);
    const seats: SeatView[] = this.seats.map((s, i) => {
      const u = this.user(s.userId);
      return {
        seat: i,
        occupant: s.occupant,
        playerId: s.userId,
        nickname: s.occupant === 'human' ? (u?.nickname ?? '?') : s.occupant === 'bot' ? botName(i) : null,
        connected: s.occupant === 'human' ? !!u?.conn : true,
        reserved: s.occupant === 'human' && !u?.conn,
        money: this.status === 'playing' ? this.moneyView[i] : s.money,
      };
    });
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      presetId: this.presetId,
      turnSeconds: this.turnSeconds,
      status: this.status,
      paused: this.game?.isPaused ? { by: this.pausedBy ?? '?' } : null,
      seats,
      spectators: [...this.spectators].map((id) => ({ playerId: id, nickname: this.user(id)?.nickname ?? '?' })),
      me: { playerId: user.id, seat: mySeat, isHost: user.id === this.hostId },
      game: this.game ? this.game.view(mySeat) : null,
    };
  }

  private queued = false;
  changed(): void {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (!this.hub.rooms.has(this.id)) return;
      for (const u of this.humans()) u.conn?.send({ t: 'room', room: this.viewFor(u) });
    });
  }
}
