// 카드 디자인 고르기: 이 브라우저에 저장한다 (다른 사람 화면에는 영향 없음).

import { useSyncExternalStore } from 'react';

export type DeckId = 'classic' | 'fourColor' | 'big' | 'modern' | 'noir' | 'stock';

export const DECKS: { id: DeckId; name: string; hint: string }[] = [
  { id: 'classic', name: '고전', hint: '전통 그림, 빨간 뒷면' },
  { id: 'fourColor', name: '4색', hint: '◆ 파랑 · ♣ 초록으로 무늬를 헷갈리지 않게' },
  { id: 'big', name: '큰 글자', hint: '모서리 숫자와 가운데 무늬를 크게 (휴대폰)' },
  { id: 'modern', name: '모던', hint: '단순한 평면 디자인' },
  { id: 'noir', name: '누아르', hint: '검정 바탕에 금색' },
  { id: 'stock', name: '일러스트', hint: '그림 카드 일러스트 (이미지 파일이 있을 때만)' },
];

/** 이미지로 그리는 디자인: 그림 파일 위치 (public/decks/<id>/<카드 번호>.webp) */
export const IMAGE_DECKS: Partial<Record<DeckId, string>> = { stock: '/decks/stock' };

const listeners = new Set<() => void>();

// 이미지 디자인은 파일이 실제로 있을 때만 고를 수 있다 (라이선스 확인 전에는 저장소에 넣지 않으므로)
const available = new Set<DeckId>(DECKS.filter((d) => !IMAGE_DECKS[d.id]).map((d) => d.id));
for (const [id, dir] of Object.entries(IMAGE_DECKS) as [DeckId, string][]) {
  const img = new Image();
  img.onload = () => {
    available.add(id);
    listeners.forEach((l) => l());
  };
  img.src = `${dir}/1.webp`;
}
export const isAvailable = (id: DeckId) => available.has(id);

const KEY = 'mighty.deck';
const isDeck = (x: unknown): x is DeckId => DECKS.some((d) => d.id === x);
let deck: DeckId = (() => {
  const saved = localStorage.getItem(KEY);
  return isDeck(saved) ? saved : 'classic';
})();

export function setDeck(id: DeckId) {
  deck = id;
  localStorage.setItem(KEY, id);
  listeners.forEach((l) => l());
}

export function useDeck(): DeckId {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => (available.has(deck) ? deck : 'classic'),
  );
}

/** 고를 수 있는 디자인 목록 (이미지 파일 확인이 끝나면 바뀐다) */
export function useAvailableDecks() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => available.size,
  );
}
