// 효과음: 파일 없이 Web Audio 로 짧게 합성한다. 켬/끔은 이 브라우저에 저장한다.

import { useSyncExternalStore } from 'react';

export type SoundName = 'shuffle' | 'deal' | 'play' | 'collect' | 'turn' | 'elected' | 'win' | 'lose';

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
      swish(a, 0, 0.07, 0.35, 900);
      tone(a, 180, 0, 0.06, 'triangle', 0.12);
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
  }
}
