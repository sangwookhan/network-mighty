import { describe, expect, it } from 'vitest';
import { NO_SUIT, SPADE, presetRules, settle, type Rules, type SettleInput } from '../src/index.js';

const std = presetRules(1); // 위험 보상, 런 2배, 노기 2배, 노프 2배
const base = (rules: Rules, o: Partial<SettleInput>): SettleInput => ({
  rules, n: 5, master: 0, friend: 1, friendSpec: { kind: 'player', seat: 1 },
  kiruda: SPADE, goal: 14, pointsTaken: [10, 5, 3, 1, 1], discardPoints: 0, ...o,
});
const M = [1000, 1000, 1000, 1000, 1000];

describe('정산', () => {
  it('위험 보상: 이기면 (공약-기본)x2 + (득점-공약), 주공:프렌드 = 2:1', () => {
    const s = settle(base(std, {}), M);
    expect(s).toMatchObject({ defenderWon: true, defenderPoints: 15, oppositionPoints: 5, amount: 3 });
    expect(s.formula).toBe('((14-13)x2+(15-14)) = [3]');
    expect(s.money).toEqual([1006, 1003, 997, 997, 997]);
  });

  it('지면 (공약-득점)을 야당에게 준다. 버린 카드 점수는 여당 몫', () => {
    const s = settle(base(std, { goal: 16, pointsTaken: [8, 4, 4, 2, 1], discardPoints: 1 }), M);
    expect(s).toMatchObject({ defenderWon: false, defenderPoints: 13, amount: 3 });
    expect(s.money).toEqual([994, 997, 1003, 1003, 1003]);
  });

  it('버린 카드 점수가 야당 몫인 규칙 (신촌)', () => {
    const s = settle(base(presetRules(6), { goal: 14, pointsTaken: [10, 4, 3, 2, 0], discardPoints: 1 }), M);
    expect([s.defenderPoints, s.oppositionPoints, s.defenderWon]).toEqual([14, 6, true]);
  });

  it('런 2배', () => {
    const s = settle(base(std, { pointsTaken: [12, 8, 0, 0, 0] }), M);
    expect(s.amount).toBe(16);
    expect(s.formula).toBe('((14-13)x2+(20-14)) x2(런) = [16]');
  });

  it('노기루다 2배와 노프렌드 2배 (표준 5마)', () => {
    const s = settle(base(std, { kiruda: NO_SUIT, goal: 13, friend: -1, friendSpec: { kind: 'none' }, pointsTaken: [14, 2, 2, 1, 1] }), M);
    expect(s.formula).toBe('((13-13)x2+(14-13)) x2(노기) x2(노프) = [4]');
  });

  it('수정: 노프렌드 2배 옵션이 꺼져 있으면 2배 아님', () => {
    const s = settle(base({ ...std, noFriendDouble: false }, { kiruda: NO_SUIT, goal: 13, friend: -1, friendSpec: { kind: 'none' }, pointsTaken: [14, 2, 2, 1, 1] }), M);
    expect(s.amount).toBe(2);
    expect(s.formula).toBe('((13-13)x2+(14-13)) x2(노기) = [2]');
    expect(s.money).toEqual([1008, 998, 998, 998, 998]);
  });

  it('노프렌드 2배와 빽런 (경기)', () => {
    const gyeonggi = presetRules(7); // 기본 12, 위험 보상
    const win = settle(base(gyeonggi, { goal: 13, friend: -1, friendSpec: { kind: 'none' }, pointsTaken: [14, 2, 2, 1, 1] }), M);
    expect(win.formula).toBe('((13-12)x2+(14-13)) x2(노프) = [6]');
    const lose = settle(base(gyeonggi, { goal: 13, pointsTaken: [2, 1, 8, 5, 4] }), M);
    expect(lose.formula).toBe('(13-3) x2(빽런) = [20]');
  });

  it('점수법 5종', () => {
    const o = { goal: 14, pointsTaken: [10, 6, 2, 1, 1] }; // 여당 16
    const amount = (m: Rules['scoreMethod']) => settle(base({ ...std, scoreMethod: m }, o), M).amount;
    expect(amount('risk')).toBe(4);
    expect(amount('eyeForEye')).toBe(2);
    expect(amount('eyeForEyeVariant')).toBe(3);
    expect(amount('base10')).toBe(6);
    expect(amount('baseGoal')).toBe(3);
  });

  it('수정: 노기루다로 기본보다 낮게 불러 이겨도 음수가 되지 않는다', () => {
    const r: Rules = { ...std, scoreMethod: 'baseGoal', noKirudaGoalMinusOne: true, noKirudaDouble: true };
    const s = settle(base(r, { kiruda: NO_SUIT, goal: 12, pointsTaken: [8, 4, 4, 2, 2] }), M);
    expect(s.defenderWon).toBe(true);
    expect(s.amount).toBe(0);
    expect(s.money).toEqual(M);
  });

  it('수정: 프렌드가 없게 된 경우(카드를 아무도 안 가짐) 주공이 전부 받는다', () => {
    const s = settle(base(std, { friend: -1, friendSpec: { kind: 'card', card: 52 }, pointsTaken: [15, 0, 3, 1, 1] }), M);
    expect(s.money).toEqual([1012, 997, 997, 997, 997]);
    expect(s.money.length).toBe(5);
  });

  it('파산: 음수는 0으로 하고 모자란 만큼 주공 몫에서 뺀다', () => {
    const s = settle(base(std, {}), [5, 5, 1, 1, 1]);
    expect(s.money).toEqual([5, 8, 0, 0, 0]);
  });

  it('4마는 주공:프렌드 = 1:1', () => {
    const s = settle(base(presetRules(2), { n: 4, goal: 14, pointsTaken: [10, 5, 3, 2] }), M.slice(0, 4));
    expect(s.amount).toBe(1);
    expect(s.money).toEqual([1001, 1001, 999, 999]);
  });
});
