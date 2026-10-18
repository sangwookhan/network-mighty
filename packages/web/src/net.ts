// 서버 연결과 화면 상태. WebSocket 하나로 서버가 보내는 최신 상태를 그대로 보관한다.
// ?p=<이름> 을 붙이면 토큰을 따로 저장해서, 한 브라우저에서 여러 사람으로 접속할 수 있다 (개발·시험용).

import { useSyncExternalStore } from 'react';
import type { ClientMessage, GameAction, RoomSummary, RoomView, ServerMessage } from '@mighty/protocol';

const profile = new URLSearchParams(location.search).get('p') ?? '';
const key = (k: string) => `mighty.${k}${profile ? `.${profile}` : ''}`;

export interface NetState {
  connected: boolean;
  me: { playerId: string; nickname: string } | null;
  needNickname: { reason?: string } | null;
  lobby: { rooms: RoomSummary[]; online: number } | null;
  room: RoomView | null;
  notice: string | null;
}

let state: NetState = { connected: false, me: null, needNickname: null, lobby: null, room: null, notice: null };
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function set(patch: Partial<NetState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function showNotice(text: string) {
  set({ notice: text });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => set({ notice: null }), 4000);
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    set({ connected: true });
    const token = localStorage.getItem(key('token')) ?? undefined;
    const nickname = localStorage.getItem(key('nickname')) ?? undefined;
    if (token || nickname) send({ t: 'hello', token, nickname });
    else set({ needNickname: {} });
  };
  ws.onmessage = (e) => receive(JSON.parse(e.data) as ServerMessage);
  ws.onclose = () => {
    set({ connected: false });
    setTimeout(connect, 1000);
  };
}

function receive(m: ServerMessage) {
  switch (m.t) {
    case 'welcome':
      localStorage.setItem(key('token'), m.token);
      localStorage.setItem(key('nickname'), m.nickname);
      set({ me: { playerId: m.playerId, nickname: m.nickname }, needNickname: null });
      break;
    case 'needNickname':
      // 서버가 재시작되어 토큰을 모르면 저장된 닉네임으로 다시 시도하지 않고 입력을 받는다
      localStorage.removeItem(key('token'));
      set({ needNickname: { reason: m.reason }, me: null });
      break;
    case 'lobby':
      set({ lobby: { rooms: m.rooms, online: m.online }, room: null });
      break;
    case 'room':
      set({ room: m.room });
      break;
    case 'leftRoom':
      set({ room: null });
      if (m.reason) showNotice(m.reason);
      break;
    case 'error':
      showNotice(m.message);
      break;
  }
}

export function send(m: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

export function sendHello(nickname: string) {
  send({ t: 'hello', nickname });
}

/** 지금 받은 요청에 응답한다 */
export function act(action: GameAction) {
  const id = state.room?.game?.myRequestId;
  if (id == null) return;
  send({ t: 'action', requestId: id, action });
}

export function useNet(): NetState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

connect();
