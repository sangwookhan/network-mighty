// 서버 ↔ 웹 클라이언트 메시지 (WebSocket 위 JSON). 설계: docs/server_spec.md §7
// 서버는 상태가 바뀔 때마다 받는 사람별 방 상태 전체(RoomView)를 보낸다.

import type { Bid, Card, Contract, ElectionState, PresetDescription, Rules, Settlement, Suit } from '@mighty/engine';

/** 프로토콜의 프렌드 지정. player.seat 는 테이블 좌석 번호 */
export type FriendChoice =
  | { kind: 'none' }
  | { kind: 'firstTrick' }
  | { kind: 'player'; seat: number }
  | { kind: 'card'; card: Card };

/**
 * 프로토콜 버전. 메시지 형식을 바꾸면 올린다. 서버와 다르면 서버가 접속을 거절하고(versionMismatch)
 * 화면은 새로고침을 안내한다. (1: 버전 확인 도입 전, 2: 버전 확인 도입)
 */
export const PROTOCOL_VERSION = 2;

// ---- 클라이언트 → 서버 ----

export type ClientMessage =
  | { t: 'hello'; version?: number; token?: string; nickname?: string }
  | { t: 'createRoom'; name: string; presetId: number; turnSeconds: number }
  | { t: 'joinRoom'; roomId: string }
  | { t: 'leaveRoom' }
  | { t: 'sit'; seat: number }
  | { t: 'standUp' }
  | { t: 'addBot'; seat: number }
  | { t: 'removeBot'; seat: number }
  | { t: 'kick'; playerId: string }
  | { t: 'setRoom'; presetId?: number; turnSeconds?: number }
  | { t: 'start' }
  /** 게임 일시정지/다시 시작 (자리에 앉은 사람 누구나) */
  | { t: 'pause'; paused: boolean }
  | { t: 'chat'; text: string }
  /** requestId: 응답하는 요청의 번호 (GameView.myRequestId). 지난 요청에 대한 응답은 무시된다 */
  | { t: 'action'; requestId: number; action: GameAction };

export type GameAction =
  | { kind: 'bid'; bid: Bid }
  | { kind: 'kill'; card: Card }
  | { kind: 'final'; discards: Card[]; contract: Contract; friend: FriendChoice }
  | { kind: 'play'; card: Card; jokerSuit?: Suit; jokercall?: boolean }
  | { kind: 'continue'; cont: boolean };

// ---- 서버 → 클라이언트 ----

export type ServerMessage =
  | { t: 'welcome'; token: string; playerId: string; nickname: string }
  | { t: 'needNickname'; reason?: string }
  | { t: 'lobby'; rooms: RoomSummary[]; online: number }
  | { t: 'room'; room: RoomView }
  | { t: 'leftRoom'; reason?: string }
  /** 같은 사람이 다른 창에서 접속해서 이 연결은 끊긴다 (자동 재접속하지 말 것) */
  | { t: 'replaced' }
  /** 클라이언트와 서버의 프로토콜 버전이 다름 (새로고침 필요) */
  | { t: 'versionMismatch'; serverVersion: number }
  | { t: 'error'; message: string };

export interface RoomSummary {
  id: string;
  name: string;
  presetId: number;
  presetName: string;
  players: number;
  humans: number;
  bots: number;
  spectators: number;
  status: 'waiting' | 'playing';
}

export interface SeatView {
  seat: number;
  occupant: 'empty' | 'human' | 'bot';
  playerId: string | null;
  nickname: string | null;
  /** 사람 자리의 연결 상태 (끊기면 봇이 대신 침) */
  connected: boolean;
  /** 끊긴 주인이 돌아올 수 있도록 다른 사람이 넘겨받을 수 없는 자리 */
  reserved: boolean;
  money: number;
}

export interface ChatLine {
  at: number;
  from: string | null; // null = 시스템
  text: string;
}

export interface RoomView {
  id: string;
  name: string;
  hostId: string;
  presetId: number;
  rules: Rules;
  preset: PresetDescription;
  turnSeconds: number;
  status: 'waiting' | 'playing';
  /** 일시정지 중이면 누른 사람 */
  paused: { by: string } | null;
  seats: SeatView[];
  spectators: { playerId: string; nickname: string }[];
  me: { playerId: string; seat: number | null; isHost: boolean };
  chat: ChatLine[];
  game: GameView | null;
}

export type GamePhase = 'election' | 'kill' | 'final' | 'play' | 'result';

export type Request =
  | { kind: 'bid' }
  | { kind: 'kill'; failed: Card[] }
  | { kind: 'final' }
  | { kind: 'play'; legal: Card[]; canJokercall: boolean; mustDeclareJokerSuit: boolean }
  | { kind: 'continue' };

export interface PlayedCard {
  seat: number;
  card: Card;
}

export interface GameView {
  dealNo: number;
  phase: GamePhase;
  dealer: number;
  /** 이번 판에 카드를 받은 좌석 (6마는 탈락 후 5명) */
  active: number[];
  killed: number | null;
  /** 좌석별 손패 장수 */
  handCounts: number[];
  myHand: Card[];
  election: (ElectionState & { log: { seat: number; bid: Bid }[] }) | null;
  master: number | null;
  /** 당선 때의 공약 (최종 공약 변경 검사용) */
  electedContract: Contract | null;
  contract: Contract | null;
  friendChoice: FriendChoice | null;
  /** 공개된 프렌드 좌석. 미공개면 null, 프렌드 없음이 확정되면 -1 */
  friendSeat: number | null;
  /** 주공에게만: 버린 카드 */
  myDiscards: Card[] | null;
  turn: number;
  trick: { leader: number; cards: PlayedCard[]; jokerSuit: Suit; jokercall: boolean } | null;
  lastTrick: { cards: PlayedCard[]; winner: number } | null;
  /** 좌석별로 딴 점수카드 */
  taken: Card[][];
  /**
   * 기다리는 요청. remainingMs: 이 메시지를 만든 순간 남은 시간(밀리초). 제한 없음·일시정지면 null.
   * 서버와 기기의 시계가 달라도 맞도록, 받는 쪽은 받은 시점부터 센다.
   */
  waitingFor: { seat: number; kind: Request['kind']; remainingMs: number | null }[];
  myRequest: Request | null;
  myRequestId: number | null;
  result: {
    settlement: Settlement;
    master: number;
    friend: number;
    contract: Contract;
    /** 좌석별 정산 전후 점수 */
    before: number[];
    after: number[];
    continueVotes: (boolean | null)[];
  } | null;
}
export * from './validate.js';
