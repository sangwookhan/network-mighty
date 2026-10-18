import { describe, expect, it } from 'vitest';
import { JOKER, PRESETS, deal, newDeck, presetRules, rankOf, redealAfterKill, shuffle, killTarget } from '../src/index.js';
import { C, seeded } from './helpers.js';

const SIZE: Record<number, number> = { 3: 33, 4: 43, 5: 53, 6: 53 };

describe('덱', () => {
  it.each(PRESETS.map((p) => [p.id, p.name] as const))('%i %s: 장수, 중복 없음, 조커와 조커콜 포함', (id) => {
    const r = presetRules(id);
    const deck = newDeck(r);
    expect(deck.length).toBe(SIZE[r.players]);
    expect(new Set(deck).size).toBe(deck.length);
    expect(deck).toContain(JOKER);
    expect(deck).toContain(r.jokercall);
    expect(deck).toContain(r.altJokercall);
    expect(deck.filter((c) => c !== JOKER && (rankOf(c) === 1 || rankOf(c) >= 10)).length).toBe(20);
  });

  it('표준 3마는 2,4,5,6,7 을 뺀다', () => {
    const ranks = new Set(newDeck(presetRules(3)).filter((c) => c !== JOKER).map(rankOf));
    expect([...ranks].sort((a, b) => a - b)).toEqual([1, 3, 8, 9, 10, 11, 12, 13]);
  });

  it('표준 4마는 2,3,4 를 빼되 ♣3, ♠3 은 남긴다', () => {
    const deck = newDeck(presetRules(2));
    expect(deck.filter((c) => [2, 3, 4].includes(rankOf(c)))).toEqual([C('C3'), C('S3')]);
  });

  it('4마에서 조커콜 두 장의 숫자가 다르면 작은 카드 10장을 뺀다', () => {
    const r = { ...presetRules(2), altJokercall: C('H5') };
    const deck = newDeck(r);
    expect(deck.length).toBe(43);
    expect(deck).toContain(C('C3'));
    expect(deck).toContain(C('H5'));
  });

  it.each([[1, 10, 3], [2, 10, 3], [3, 10, 3], [4, 8, 5]])('프리셋 %i: %i장씩, 바닥 %i장', (id, per, kitty) => {
    const r = presetRules(id);
    const d = deal(shuffle(newDeck(r), seeded(id)), r, 2);
    expect(d.hands.every((h) => h.length === per)).toBe(true);
    expect(d.kitty.length).toBe(kitty);
    expect(new Set([...d.hands.flat(), ...d.kitty]).size).toBe(SIZE[r.players]);
  });

  it('딜러부터 덱 꼬리에서 한 장씩 나눈다', () => {
    const r = presetRules(1);
    const deck = newDeck(r);
    const d = deal(deck, r, 3);
    expect(d.hands[3][0]).toBe(deck[deck.length - 1]);
    expect(d.hands[4][0]).toBe(deck[deck.length - 2]);
    expect(d.kitty).toEqual(deck.slice(0, 3));
  });

  it('6마 탈락과 재분배', () => {
    const r = presetRules(4);
    const rng = seeded(7);
    const d = deal(shuffle(newDeck(r), rng), r, 0);
    const target = killTarget(d.hands, 0, d.hands[4][0]);
    expect(target).toBe(4);
    expect(killTarget(d.hands, 0, d.hands[0][0])).toBe(-1); // 주공 자신의 카드
    const re = redealAfterKill(d.hands, d.kitty, 4, rng);
    expect(re.seats).toEqual([0, 1, 2, 3, 5]);
    expect(re.hands.every((h) => h.length === 10)).toBe(true);
    expect(re.kitty.length).toBe(3);
    expect(new Set([...re.hands.flat(), ...re.kitty]).size).toBe(53);
  });
});
