// 서버 연결과 화면 상태. WebSocket 하나로 서버가 보내는 최신 상태를 그대로 보관한다.
//
// 신원(토큰) 저장:
//  - sessionStorage(탭마다 따로): 이 탭이 지금 쓰는 신원. 새로고침·재접속하면 묻지 않고 그대로 들어간다.
//  - localStorage(브라우저 전체): 마지막으로 쓴 신원. 새 창·새 탭에서는 이걸로 [계속] 할지 [다른 닉네임] 으로 들어갈지 묻는다.
// ?p=<이름> 을 붙이면 저장 이름을 따로 써서, 한 브라우저에서 여러 사람으로 접속할 수 있다 (개발·시험용).

import { useSyncExternalStore } from 'react';
import type { ClientMessage, GameAction, RoomSummary, RoomView, ServerMessage } from '@mighty/protocol';

const profile = new URLSearchParams(location.search).get('p') ?? '';
const key = (k: string) => `mighty.${k}${profile ? `.${profile}` : ''}`;

export interface NetState {
  connected: boolean;
  me: { playerId: string; nickname: string } | null;
  needNickname: { reason?: string; suggested?: string } | null;
  /** 새 창: 마지막으로 쓴 닉네임으로 계속할지 묻는 중 */
  choose: { nickname: string } | null;
  /** 같은 사람이 다른 창에서 접속해서 이 창은 밀려남 (자동 재접속 멈춤) */
  replaced: { nickname: string } | null;
  lobby: { rooms: RoomSummary[]; online: number } | null;
  room: RoomView | null;
  notice: string | null;
}

let state: NetState = { connected: false, me: null, needNickname: null, choose: null, replaced: null, lobby: null, room: null, notice: null };

const tab = {
  get token() {
    return sessionStorage.getItem(key('token'));
  },
  set token(v: string | null) {
    if (v) sessionStorage.setItem(key('token'), v);
    else sessionStorage.removeItem(key('token'));
  },
};
const last = {
  get token() {
    return localStorage.getItem(key('token'));
  },
  get nickname() {
    return localStorage.getItem(key('nickname'));
  },
  save(token: string, nickname: string) {
    localStorage.setItem(key('token'), token);
    localStorage.setItem(key('nickname'), nickname);
  },
  forgetToken() {
    localStorage.removeItem(key('token'));
  },
};
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
/** [다른 닉네임으로 입장]을 골랐으면 다시 접속해도 묻지 않고 닉네임 입력으로 */
let wantNewNickname = false;
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
    if (tab.token) send({ t: 'hello', token: tab.token }); // 이 탭이 쓰던 신원: 바로 들어감
    else if (wantNewNickname) set({ needNickname: { suggested: undefined } });
    else if (last.token && last.nickname) set({ choose: { nickname: last.nickname } }); // 새 창: 물어봄
    else set({ needNickname: { suggested: last.nickname ?? undefined } });
  };
  ws.onmessage = (e) => receive(JSON.parse(e.data) as ServerMessage);
  ws.onclose = () => {
    set({ connected: false });
    // 다른 창에 밀려났으면 자동으로 다시 붙지 않는다 (서로 연결을 빼앗지 않도록)
    if (!state.replaced) setTimeout(connect, 1000);
  };
}

function receive(m: ServerMessage) {
  switch (m.t) {
    case 'welcome':
      tab.token = m.token;
      last.save(m.token, m.nickname);
      wantNewNickname = false;
      set({ me: { playerId: m.playerId, nickname: m.nickname }, needNickname: null, choose: null, replaced: null });
      break;
    case 'needNickname':
      // 서버가 재시작되어 토큰을 모르면 닉네임을 다시 받는다 (마지막 닉네임을 미리 채워 둠)
      if (tab.token && tab.token === last.token) last.forgetToken();
      tab.token = null;
      set({ needNickname: { reason: m.reason, suggested: last.nickname ?? undefined }, me: null, choose: null });
      break;
    case 'replaced':
      set({ replaced: { nickname: state.me?.nickname ?? last.nickname ?? '' }, me: null, room: null, lobby: null });
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

/** 새 창에서 [OOO님으로 계속]: 마지막 신원을 이 탭이 이어받는다 (먼저 열린 창은 밀려남) */
export function continueAsLast() {
  if (!last.token) return set({ choose: null, needNickname: {} });
  tab.token = last.token;
  set({ choose: null });
  send({ t: 'hello', token: last.token });
}

/** [다른 닉네임으로 입장]: 이 탭만 새 사람으로 */
export function chooseNewNickname() {
  tab.token = null;
  wantNewNickname = true;
  set({ choose: null, replaced: null, needNickname: {} });
  if (!ws || ws.readyState !== WebSocket.OPEN) connect();
}

/** 밀려난 창에서 [여기서 계속]: 다시 접속해 이 창이 이어받는다 */
export function takeBack() {
  set({ replaced: null });
  if (ws && ws.readyState === WebSocket.OPEN) send({ t: 'hello', token: tab.token ?? undefined });
  else connect();
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
