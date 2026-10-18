// 덱 구성과 분배 (CCardList::NewDeck @0040b340, FUN_004225b0 딜 부분)

import { JOKER, makeCard, rankOf, type Card, type Suit } from './card.js';
import { activePlayers, type Rules } from './rules.js';

/** [0,1) 난수. 서버는 crypto 기반, 테스트는 시드 고정 난수를 넣는다. */
export type Rng = () => number;

export function newDeck(rules: Rules): Card[] {
  const n = activePlayers(rules);
  const keepA = rules.jokercall;
  const keepB = rules.altJokercall;
  const deck: Card[] = [JOKER];
  const addAll = (rank: number) => {
    for (let suit = 1; suit <= 4; suit++) deck.push(makeCard(suit as Suit, rank));
  };

  if (n === 5) {
    for (let rank = 1; rank <= 13; rank++) addAll(rank);
  } else if (n === 3) {
    // 2..9 중 조커콜 카드의 숫자가 아닌 것을 작은 숫자부터 5개 통째로 뺀다 → 33장
    let removed = 0;
    for (let rank = 1; rank <= 13; rank++) {
      if (rank >= 2 && rank <= 9 && removed <= 4 && rank !== rankOf(keepA) && rank !== rankOf(keepB)) removed++;
      else addAll(rank);
    }
  } else {
    // 4마: 43장
    const ra = rankOf(keepA);
    if (ra === rankOf(keepB) && keepA >= 1 && keepA <= 52 && ra >= 2 && ra <= 4) {
      for (let rank = 1; rank <= 13; rank++) if (rank < 2 || rank > 4) addAll(rank);
      deck.push(keepA, keepB);
    } else {
      for (let rank = 1; rank <= 13; rank++) addAll(rank);
      let removed = 0;
      for (let rank = 2; rank <= 9 && removed < 10; rank++) {
        for (let suit = 4; suit >= 1 && removed < 10; suit--) {
          const c = makeCard(suit as Suit, rank);
          if (c === keepA || c === keepB) continue;
          deck.splice(deck.indexOf(c), 1);
          removed++;
        }
      }
    }
  }
  return deck;
}

/** Fisher–Yates. 원작의 rand() 셔플은 재현하지 않는다. */
export function shuffle<T>(cards: readonly T[], rng: Rng): T[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const cardsPerPlayer = (rules: Rules): number => (rules.players === 6 ? 8 : 10);

/**
 * 덱 꼬리에서 한 장씩 (dealer + i) % n 순서로 나눈다. 남은 카드가 바닥패(키티).
 * 3/4/5마: 10장씩 + 키티 3장, 6마: 8장씩 + 키티 5장.
 */
export function deal(deck: readonly Card[], rules: Rules, dealer: number): { hands: Card[][]; kitty: Card[] } {
  const n = rules.players;
  const per = cardsPerPlayer(rules);
  const rest = [...deck];
  const hands: Card[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n * per; i++) hands[(dealer + i) % n].push(rest.pop()!);
  return { hands, kitty: rest };
}

/** 6마: 주공이 지목한 카드를 가진 사람(주공 제외). 없으면 -1 → 다시 지목해야 한다. */
export function killTarget(hands: readonly Card[][], master: number, card: Card): number {
  return hands.findIndex((h, i) => i !== master && h.includes(card));
}

/**
 * 6마 탈락 후 재분배: 탈락자 8장 + 키티 5장을 섞어 남은 5명에게 2장씩, 나머지 3장은 키티.
 * 반환하는 hands 는 탈락자를 뺀 5명 (원래 좌석 순서 유지), seats 는 원래 좌석 번호.
 */
export function redealAfterKill(
  hands: readonly Card[][],
  kitty: readonly Card[],
  killed: number,
  rng: Rng,
): { hands: Card[][]; kitty: Card[]; seats: number[] } {
  const pool = shuffle([...hands[killed], ...kitty], rng);
  const seats = hands.map((_, i) => i).filter((i) => i !== killed);
  const newHands = seats.map((s) => [...hands[s]]);
  for (let k = 0; k < 2; k++) for (const h of newHands) h.push(pool.pop()!);
  return { hands: newHands, kitty: pool, seats };
}
