// 카드 디자인 고르기: 이 브라우저에 저장한다 (다른 사람 화면에는 영향 없음).

import { useSyncExternalStore } from 'react';

export type DeckId = 'classic' | 'fourColor' | 'big' | 'modern' | 'noir';

export const DECKS: { id: DeckId; name: string; hint: string }[] = [
  { id: 'classic', name: '고전', hint: '전통 그림, 빨간 뒷면' },
  { id: 'fourColor', name: '4색', hint: '◆ 파랑 · ♣ 초록으로 무늬를 헷갈리지 않게' },
  { id: 'big', name: '큰 글자', hint: '모서리 숫자와 가운데 무늬를 크게 (휴대폰)' },
  { id: 'modern', name: '모던', hint: '단순한 평면 디자인' },
  { id: 'noir', name: '누아르', hint: '검정 바탕에 금색' },
];

const KEY = 'mighty.deck';
const isDeck = (x: unknown): x is DeckId => DECKS.some((d) => d.id === x);
let deck: DeckId = (() => {
  const saved = localStorage.getItem(KEY);
  return isDeck(saved) ? saved : 'classic';
})();
const listeners = new Set<() => void>();

export function setDeck(id: DeckId) {
  deck = id;
  localStorage.setItem(KEY, id);
  listeners.forEach((l) => l());
}

export function useDeck(): DeckId {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => deck,
  );
}
