// 받는 쪽(화면, 테스트 클라이언트)에서 서버 메시지를 모아 화면용 방 정보(RoomView)를 만든다.
// 서버는 자주 바뀌는 상태(room)와 가끔 바뀌는 규칙·설명(roomStatic), 채팅(chatHistory/chat)을 따로 보낸다.

import type { ChatLine, RoomView, ServerMessage } from './index.js';

export const MAX_CHAT_LINES = 100;

export interface RoomCache {
  statics: Extract<ServerMessage, { t: 'roomStatic' }> | null;
  chat: { roomId: string; lines: ChatLine[] } | null;
  /** 합친 결과. 규칙을 아직 못 받았으면 null */
  room: RoomView | null;
}

export const emptyRoomCache = (): RoomCache => ({ statics: null, chat: null, room: null });

/** 메시지 하나를 반영한 새 캐시 (방과 관계없는 메시지면 그대로) */
export function applyRoomMessage(c: RoomCache, m: ServerMessage): RoomCache {
  switch (m.t) {
    case 'roomStatic': {
      const room = c.room && c.room.id === m.roomId ? { ...c.room, presetId: m.presetId, rules: m.rules, preset: m.preset } : c.room;
      return { ...c, statics: m, room };
    }
    case 'chatHistory': {
      const room = c.room && c.room.id === m.roomId ? { ...c.room, chat: m.lines } : c.room;
      return { ...c, chat: { roomId: m.roomId, lines: m.lines }, room };
    }
    case 'chat': {
      if (!c.chat || c.chat.roomId !== m.roomId) return c;
      const lines = [...c.chat.lines, m.line].slice(-MAX_CHAT_LINES);
      const room = c.room && c.room.id === m.roomId ? { ...c.room, chat: lines } : c.room;
      return { ...c, chat: { roomId: m.roomId, lines }, room };
    }
    case 'room': {
      const s = c.statics;
      if (!s || s.roomId !== m.room.id) return c; // 규칙을 먼저 받아야 그릴 수 있다 (서버는 입장 때 먼저 보낸다)
      const lines = c.chat && c.chat.roomId === m.room.id ? c.chat.lines : [];
      return { ...c, room: { ...m.room, rules: s.rules, preset: s.preset, chat: lines } };
    }
    case 'leftRoom':
    case 'lobby':
    case 'replaced':
    case 'needNickname':
      return emptyRoomCache();
    default:
      return c;
  }
}
