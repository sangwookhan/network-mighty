// 음성 안내: 브라우저 음성 합성으로 짧게 읽는다. 효과음(sound.ts)과 따로 켜고 끄며,
// 무엇을 읽을지(종류별)와 크기는 이 브라우저에 저장한다 (다른 사람 화면에는 영향 없음).

import { useSyncExternalStore } from 'react';

export type VoiceKind = 'callout' | 'room' | 'bid' | 'deal' | 'contract' | 'friend' | 'trick' | 'turn' | 'result';

/** 종류별 이름과 기본 크기 (배경 음악을 덮지 않게 자주 나오는 것은 작게) */
export const VOICE_KINDS: { id: VoiceKind; name: string; hint: string; base: number }[] = [
  { id: 'callout', name: '특수 카드', hint: '마이티·조커·조커콜·간·오버간', base: 0.9 },
  { id: 'turn', name: '내 차례', hint: '내 차례입니다 · 5초 남았습니다', base: 0.8 },
  { id: 'contract', name: '당선·최종 공약', hint: '누가 무엇으로 당선, 최종 공약과 프렌드', base: 0.8 },
  { id: 'friend', name: '프렌드 공개', hint: '프렌드는 누구, 초구 프렌드', base: 0.8 },
  { id: 'result', name: '판 결과', hint: '여당/야당 승리와 점수', base: 0.8 },
  { id: 'bid', name: '공약 부르기', hint: '각자 공약·포기', base: 0.6 },
  { id: 'trick', name: '트릭 가져감', hint: '누가 가져감 (매 트릭)', base: 0.55 },
  { id: 'deal', name: '판 시작·딜 미스·탈락', hint: '몇 번째 판, 딜 미스, 6마 탈락', base: 0.6 },
  { id: 'room', name: '방 소식', hint: '입장·나가기·일어나기·관전·자리·연결', base: 0.5 },
];

export interface VoiceSettings {
  on: boolean;
  /** 전체 크기 배율 0..1 */
  volume: number;
  kinds: Record<VoiceKind, boolean>;
}

const KEY = 'mighty.voice';
const listeners = new Set<() => void>();
let settings: VoiceSettings = load();

function load(): VoiceSettings {
  const kinds = Object.fromEntries(VOICE_KINDS.map((k) => [k.id, true])) as Record<VoiceKind, boolean>;
  const def: VoiceSettings = { on: true, volume: 1, kinds };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s === 'object') return { on: s.on !== false, volume: Number.isFinite(s.volume) ? s.volume : 1, kinds: { ...kinds, ...s.kinds } };
  } catch {
    /* 저장된 설정 없음 */
  }
  return def;
}

export function setVoice(next: Partial<VoiceSettings>) {
  settings = { ...settings, ...next };
  localStorage.setItem(KEY, JSON.stringify(settings));
  listeners.forEach((l) => l());
  if (!settings.on && typeof speechSynthesis !== 'undefined') (queue.length = 0), speechSynthesis.cancel();
}

export function useVoice(): VoiceSettings {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => settings,
  );
}

/** 읽기 좋게: 무늬 기호(♠◆♥♣)는 빼고 공백 정리 (이름이 함께 나오므로) */
const speakable = (text: string) => text.replace(/[♠◆♥♣]/g, '').replace(/\s+/g, ' ').trim();

/** 우선순위: 밀릴 때 낮은 것부터 버린다 (방 소식·결과처럼 드물고 중요한 것은 남긴다) */
const PRIORITY: Record<VoiceKind, number> = { room: 3, result: 3, contract: 3, friend: 3, turn: 3, deal: 2, callout: 2, bid: 2, trick: 1 };
const MAX_WAIT = 4; // 기다리는 말 수
const STALE_MS: Record<VoiceKind, number> = { room: 15000, result: 10000, contract: 10000, friend: 10000, turn: 4000, deal: 8000, callout: 2500, bid: 7000, trick: 3000 };

interface Item {
  kind: VoiceKind;
  text: string;
  at: number;
}
const queue: Item[] = [];
let speaking = false;
let current = 0; // 지금 읽는 말 번호 (끝 알림과 시간 초과가 두 번 넘기지 않게)

function next() {
  speaking = false;
  current++;
  // 너무 늦어진 말은 버린다 (예: 지난 트릭)
  while (queue.length && Date.now() - queue[0].at > STALE_MS[queue[0].kind]) queue.shift();
  const item = queue.shift();
  if (!item || !settings.on) return;
  const u = new SpeechSynthesisUtterance(speakable(item.text));
  u.lang = 'ko-KR';
  const ko = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ko'));
  if (ko) u.voice = ko;
  u.rate = 1;
  u.pitch = 1.1;
  u.volume = Math.min(1, (VOICE_KINDS.find((k) => k.id === item.kind)?.base ?? 0.8) * settings.volume);
  speaking = true;
  const id = ++current;
  const done = () => id === current && (clearTimeout(guard), next());
  // 끝 알림이 오지 않는 브라우저가 있어 넉넉한 시간 뒤에는 다음으로 넘어간다
  const guard = setTimeout(done, 1500 + item.text.length * 250);
  u.onend = u.onerror = done;
  speechSynthesis.speak(u);
}

/**
 * kind 종류의 말을 읽는다. 음성 끔이거나 그 종류를 껐으면 아무것도 안 한다.
 * 말하는 중에 온 말은 차례로 읽고, 많이 밀리면 우선순위가 낮은(트릭·공약) 오래된 말부터 버린다.
 * 한국어 목소리가 없는 기기에서는 기본 목소리로 읽는다.
 */
export function speak(kind: VoiceKind, text: string) {
  if (!settings.on || !settings.kinds[kind] || typeof speechSynthesis === 'undefined') return;
  queue.push({ kind, text, at: Date.now() });
  while (queue.length > MAX_WAIT) {
    // 가장 낮은 우선순위 중 가장 오래된 것을 버린다
    let drop = 0;
    for (let i = 1; i < queue.length; i++) if (PRIORITY[queue[i].kind] < PRIORITY[queue[drop].kind]) drop = i;
    queue.splice(drop, 1);
  }
  if (!speaking) next();
}
