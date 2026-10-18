// 효과음: 파일 없이 Web Audio 로 짧게 합성한다. 켬/끔은 이 브라우저에 저장한다.

import { useSyncExternalStore } from 'react';

export type SoundName = 'shuffle' | 'deal' | 'play' | 'collect' | 'turn' | 'elected' | 'win' | 'lose' | 'special' | 'cut';

const KEY = 'mighty.sound';
let enabled = localStorage.getItem(KEY) !== 'off';
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  localStorage.setItem(KEY, on ? 'on' : 'off');
  listeners.forEach((l) => l());
  if (on) play('turn');
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => enabled,
  );
}

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  // 브라우저는 사용자가 한 번 누르기 전까지 소리를 막는다
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 음 하나: 주파수, 시작(초), 길이(초), 파형, 크기 */
function tone(a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + at;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** 짧은 잡음 덩어리 (필터 종류·주파수 지정) */
function burst(a: AudioContext, at: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1) {
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + at);
}

/** 카드가 스치는 소리: 짧은 잡음 */
function swish(a: AudioContext, at: number, dur = 0.09, vol = 0.25, hp = 1800) {
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + at);
}

export function play(name: SoundName) {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  switch (name) {
    case 'shuffle':
      for (let i = 0; i < 6; i++) swish(a, i * 0.05, 0.06, 0.15, 2500);
      break;
    case 'deal':
      swish(a, 0, 0.12, 0.3, 1200);
      break;
    case 'play':
      CARD_SOUNDS.find((c) => c.id === cardSound)!.make(a);
      break;
    case 'collect':
      for (let i = 0; i < 3; i++) swish(a, i * 0.04, 0.08, 0.15, 1500);
      break;
    case 'turn':
      tone(a, 880, 0, 0.18, 'sine', 0.1);
      tone(a, 1320, 0.09, 0.22, 'sine', 0.08);
      break;
    case 'elected':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, i * 0.1, 0.3, 'triangle', 0.12));
      break;
    case 'win':
      [523, 659, 784].forEach((f) => tone(a, f, 0, 0.6, 'triangle', 0.09));
      [659, 784, 1047].forEach((f) => tone(a, f, 0.25, 0.8, 'triangle', 0.09));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(a, f, i * 0.18, 0.35, 'sine', 0.12));
      break;
    case 'special': // 마이티·조커·조커콜: 반짝이는 소리
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(a, f, i * 0.05, 0.25, 'triangle', 0.08));
      break;
    case 'cut': // 간·오버간: 탁 치는 소리
      swish(a, 0, 0.1, 0.4, 600);
      tone(a, 120, 0, 0.12, 'square', 0.08);
      break;
  }
}

/**
 * 짧은 말(마이티!, 조커! …)을 브라우저 음성 합성으로 읽는다. 소리 끔이면 아무것도 안 한다.
 * 한국어 목소리가 없는 기기에서는 기본 목소리로 읽는다.
 */
export function say(text: string) {
  if (!enabled || typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  const ko = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ko'));
  if (ko) u.voice = ko;
  u.rate = 1;
  u.pitch = 1.1;
  u.volume = 0.9;
  speechSynthesis.cancel(); // 앞의 말이 밀리지 않게
  speechSynthesis.speak(u);
}

/**
 * 카드 내는 소리 후보. 들어 보고 고르는 페이지: /sounds.html
 * cardSound 가 지금 쓰는 것.
 */
export const CARD_SOUNDS: { id: string; name: string; desc: string; make: (a: AudioContext) => void }[] = [
  {
    id: 'swish-tock', name: '1. 지금 소리 (스침 + 톡)', desc: '높은 스침에 낮은 톡',
    make: (a) => (swish(a, 0, 0.07, 0.35, 900), tone(a, 180, 0, 0.06, 'triangle', 0.12)),
  },
  {
    id: 'table-tap', name: '2. 탁 (테이블에 내려놓기)', desc: '둔하고 묵직하게 펠트에 놓는 소리',
    make: (a) => (burst(a, 0, 0.06, 0.9, 'lowpass', 700), tone(a, 95, 0, 0.09, 'sine', 0.25)),
  },
  {
    id: 'snap', name: '3. 딱 (카드 튕기기)', desc: '짧고 또렷한 고음 클릭',
    make: (a) => (burst(a, 0, 0.025, 1.2, 'bandpass', 3200, 2), tone(a, 1800, 0, 0.03, 'square', 0.04)),
  },
  {
    id: 'slide-tap', name: '4. 스윽-탁 (밀어서 놓기)', desc: '카드를 밀다가 탁 멈추는 소리',
    make: (a) => (swish(a, 0, 0.16, 0.22, 1400), burst(a, 0.14, 0.05, 0.8, 'lowpass', 900), tone(a, 120, 0.14, 0.07, 'sine', 0.18)),
  },
  {
    id: 'flick', name: '5. 팔락 (종이 넘기기)', desc: '가벼운 종이 소리 두 번',
    make: (a) => (swish(a, 0, 0.04, 0.3, 2400), swish(a, 0.045, 0.05, 0.25, 1800)),
  },
  {
    id: 'woodblock', name: '6. 똑 (나무 테이블)', desc: '나무 블록을 치는 맑은 소리',
    make: (a) => (tone(a, 820, 0, 0.08, 'sine', 0.22), tone(a, 1640, 0, 0.04, 'sine', 0.08), burst(a, 0, 0.015, 0.5, 'highpass', 2000)),
  },
  {
    id: 'chip', name: '7. 찰칵 (포커 칩)', desc: '칩끼리 부딪는 짧은 금속성 소리',
    make: (a) => (tone(a, 2600, 0, 0.05, 'triangle', 0.08), tone(a, 3400, 0.03, 0.05, 'triangle', 0.06), burst(a, 0, 0.02, 0.6, 'highpass', 4000)),
  },
];

let cardSound = 'swish-tock';
/** 카드 내는 소리 바꾸기 (들어 보기 페이지용, 고른 뒤에는 기본값을 바꾼다) */
export function setCardSound(id: string) {
  if (CARD_SOUNDS.some((c) => c.id === id)) cardSound = id;
}
