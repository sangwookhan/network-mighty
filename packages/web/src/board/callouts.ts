// 특수 카드 외침: 트릭에 새로 나온 카드가 마이티·조커·조커콜·간·오버간이면 그 말을 돌려준다.

import { JOKER, NO_SUIT, isKiruda, jokercallOf, mightyOf, powerOf, suitOf, type Card, type Rules, type Suit } from '@mighty/engine';

export type Callout = '마이티' | '조커' | '조커콜' | '간' | '오버간';

interface TrickLike {
  cards: { card: Card }[];
  jokerSuit: Suit;
  jokercall: boolean;
}

/**
 * 트릭의 마지막 카드에 대한 외침.
 * 간: 리드 무늬가 기루다가 아닌데 기루다를 내서 자름. 오버간: 이미 간 된 트릭에 더 높은 기루다로 다시 자름.
 */
export function calloutFor(trick: TrickLike, rules: Rules, kiruda: Suit): Callout | null {
  const n = trick.cards.length;
  if (n === 0) return null;
  const card = trick.cards[n - 1].card;
  const mighty = mightyOf(rules, kiruda);
  if (card === mighty) return '마이티';
  if (card === JOKER) return '조커';
  if (n === 1) return trick.jokercall && card === jokercallOf(rules, kiruda) ? '조커콜' : null;
  if (kiruda === NO_SUIT || !isKiruda(card, kiruda)) return null;
  const first = trick.cards[0].card;
  const lead = first === JOKER ? trick.jokerSuit : suitOf(first);
  if (lead === kiruda) return null;
  const earlier = trick.cards.slice(0, -1).map((c) => c.card).filter((c) => c !== mighty && isKiruda(c, kiruda));
  if (earlier.length === 0) return '간';
  return powerOf(card) > Math.max(...earlier.map(powerOf)) ? '오버간' : null;
}
