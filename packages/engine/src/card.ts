// 카드 인코딩은 원작(CCard)과 동일: re/01_game_logic.md §1
//   0 = 없음, 1..52 = (suit-1)*13 + rank, 53 = 조커
//   suit: 1 ♠, 2 ◆, 3 ♥, 4 ♣ / rank: 1 = A, 2..10, 11 = J, 12 = Q, 13 = K

import type { Rules } from './rules.js';

export type Card = number;
export type Suit = 0 | 1 | 2 | 3 | 4;

export const NOTHING: Card = 0;
export const JOKER: Card = 53;
export const NO_SUIT: Suit = 0;
export const SPADE: Suit = 1;
export const DIAMOND: Suit = 2;
export const HEART: Suit = 3;
export const CLUB: Suit = 4;
export const SUITS: readonly Suit[] = [SPADE, DIAMOND, HEART, CLUB];

const isNormal = (c: Card) => c >= 1 && c <= 52;

export function makeCard(suit: Suit, rank: number): Card {
  if (suit >= 1 && suit <= 4 && rank >= 1 && rank <= 13) return (suit - 1) * 13 + rank;
  return JOKER;
}

export const suitOf = (c: Card): Suit => (isNormal(c) ? (Math.floor((c - 1) / 13) + 1) as Suit : NO_SUIT);
export const rankOf = (c: Card): number => (isNormal(c) ? ((c - 1) % 13) + 1 : 0);
/** 세기: 2=1 … K=12, A=13. 조커/없음 = 14 (GetPowerNum @00401300) */
export const powerOf = (c: Card): number => (isNormal(c) ? ((((c - 1) % 13) + 12) % 13) + 1 : 14);
/** A·K·Q·J·10 (IsPoint @00401370) */
export const isPoint = (c: Card): boolean => isNormal(c) && (rankOf(c) === 1 || rankOf(c) >= 10);
export const isAce = (c: Card): boolean => rankOf(c) === 1;
/** 애꾸눈 잭: ♠J, ♥J */
export const isOneEyedJack = (c: Card): boolean => rankOf(c) === 11 && (suitOf(c) === SPADE || suitOf(c) === HEART);
/** 노기루다(0)면 항상 false, 조커는 항상 false */
export const isKiruda = (c: Card, kiruda: Suit): boolean => kiruda !== NO_SUIT && suitOf(c) === kiruda;

/** 기본 카드의 무늬가 기루다면 보조 카드를 쓴다 (GetMighty @0040aa80 / GetJokercall @0040ab10) */
function pickSpecial(primary: Card, alternate: Card, kiruda: Suit): Card {
  const valid = (c: Card) => c >= 0 && c <= 52;
  const primarySuit = !valid(primary) || primary === 0 ? NO_SUIT : suitOf(primary);
  if (kiruda === primarySuit) return valid(alternate) ? alternate : JOKER;
  return valid(primary) ? primary : JOKER;
}

export const mightyOf = (rules: Rules, kiruda: Suit): Card => pickSpecial(rules.mighty, rules.altMighty, kiruda);
export const jokercallOf = (rules: Rules, kiruda: Suit): Card => pickSpecial(rules.jokercall, rules.altJokercall, kiruda);

export const countPoints = (cards: readonly Card[]): number => cards.filter(isPoint).length;

// ---- 표시용 이름 (GetString @0040aba0, GetGoalString @0040b010) ----

const SUIT_NAME = ['', '스페이드 ', '다이아몬드 ', '하트 ', '클로버 '];
const SUIT_SLANG = ['', '삽', '다리', '트', '끌'];
const RANK_NAME = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_SLANG = ['', '아', '2', '3', '4', '5', '6', '7', '8', '9', '10', '자', '큐', '카'];

/** 마이티/조커콜 같은 별칭 없이 카드 자체의 이름. 예: "다이아몬드 A" */
export function plainCardName(c: Card): string {
  if (c === JOKER) return '조커';
  if (!isNormal(c)) return '';
  return SUIT_NAME[suitOf(c)] + RANK_NAME[rankOf(c)];
}

export function cardName(c: Card, rules: Rules, kiruda: Suit, slang = false): string {
  if (c === mightyOf(rules, kiruda)) return '마이티';
  if (c === JOKER) return slang ? '쪼카' : '조커';
  if (c === jokercallOf(rules, kiruda)) return slang ? '쪼콜' : '조커콜';
  if (!isNormal(c)) return '';
  const suit = suitOf(c);
  const prefix = isKiruda(c, kiruda) ? (slang ? '기' : '기루다 ') : slang ? SUIT_SLANG[suit] : SUIT_NAME[suit];
  return prefix + (slang ? RANK_SLANG : RANK_NAME)[rankOf(c)];
}

const GOAL_KIRUDA = ['노기루다', '스페이드', '다이아몬드', '하트', '클로버'];
const GOAL_SLANG_KIRUDA = ['노', '삽', '다리', '트', '끌'];
const GOAL_SLANG_NUM = ['독', '둘', '셋', '넷', '닷', '엿', '곱', '덜', '홉', '풀'];

/** 공약 표기. 예: (♠,14) → "스페이드 14" / 속어 "넷삽" */
export function goalName(kiruda: Suit, goal: number, rules: Rules, slang = false): string {
  if (!slang) return `${GOAL_KIRUDA[kiruda]} ${goal}`;
  if (goal === rules.baseGoal && kiruda === NO_SUIT) return '기노';
  let s = goal <= 10 ? '초' : goal > 20 ? '풀' : '';
  s += GOAL_SLANG_NUM[(goal + 9) % 10];
  return s + GOAL_SLANG_KIRUDA[kiruda];
}
