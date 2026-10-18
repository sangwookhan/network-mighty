// 정산 (FUN_00421240)

import { NO_SUIT, type Suit } from './card.js';
import type { FriendSpec } from './friend.js';
import type { Rules } from './rules.js';

export interface SettleInput {
  rules: Rules;
  /** 이번 판 인원 (6마는 5) */
  n: number;
  master: number;
  /** 최종 프렌드 좌석, 없으면 -1 */
  friend: number;
  friendSpec: FriendSpec;
  kiruda: Suit;
  goal: number;
  /** 좌석별로 트릭에서 딴 점수카드 수 */
  pointsTaken: readonly number[];
  /** 주공이 버린 3장 중 점수카드 수 */
  discardPoints: number;
}

export interface Settlement {
  defenderWon: boolean;
  defenderPoints: number;
  oppositionPoints: number;
  /** 배수까지 적용한 한 사람당 금액 */
  amount: number;
  /** 사람이 읽는 계산식. 예: "((15-13)x2+(16-15)) x2(런) = [6]" */
  formula: string;
  /** 정산 후 좌석별 누적 점수 */
  money: number[];
}

export function settle(input: SettleInput, moneyBefore: readonly number[]): Settlement {
  const { rules, n, master, friend, kiruda, goal } = input;
  const hasFriend = friend >= 0;
  const isDefender = (i: number) => i === master || i === friend;

  let defPts = 0;
  let oppPts = 0;
  for (let i = 0; i < n; i++) {
    if (isDefender(i)) defPts += input.pointsTaken[i];
    else oppPts += input.pointsTaken[i];
  }
  if (rules.discardsToOpposition) oppPts += input.discardPoints;
  else defPts += input.discardPoints;

  const base = rules.baseGoal;
  const win = defPts >= Math.min(goal, 20);

  let amount: number;
  let formula: string;
  if (!win) {
    amount = goal - defPts;
    formula = `(${goal}-${defPts})`;
  } else {
    switch (rules.scoreMethod) {
      case 'risk':
        amount = (goal - base) * 2 + (defPts - goal);
        formula = `((${goal}-${base})x2+(${defPts}-${goal}))`;
        break;
      case 'eyeForEye':
        amount = defPts - goal;
        formula = `(${defPts}-${goal})`;
        break;
      case 'eyeForEyeVariant':
        amount = defPts - goal + 1;
        formula = `(${defPts}-${goal}+1)`;
        break;
      case 'base10':
        amount = defPts - 10;
        formula = `(${defPts}-10)`;
        break;
      case 'baseGoal':
        amount = defPts - base;
        formula = `(${defPts}-${base})`;
        break;
    }
    // 수정: 노기루다로 기본보다 1 낮게 불러 이기면 원작은 음수(이겼는데 잃음)가 나올 수 있었다
    amount = Math.max(amount, 0);
  }

  if (win && defPts >= 20) {
    if (rules.runBonus === 'fixed20') {
      amount = 20;
      formula = `${amount}(고정)`;
    } else if (rules.runBonus === 'doubleIfDeclared') {
      if (goal >= 20) (amount *= 2), (formula += ' x2(런)');
    } else if (rules.runBonus === 'double') {
      amount *= 2;
      formula += ' x2(런)';
    }
  }
  if (!win && oppPts >= goal && rules.backRunDouble) (amount *= 2), (formula += ' x2(빽런)');
  // 수정: 원작은 노기/노프 2배 옵션을 무시하고 항상 적용했다
  if (win && kiruda === NO_SUIT && rules.noKirudaDouble) (amount *= 2), (formula += ' x2(노기)');
  if (win && rules.friendEnabled && input.friendSpec.kind === 'none' && rules.noFriendDouble)
    (amount *= 2), (formula += ' x2(노프)');
  formula += ` = [${amount}]`;

  // 분배: 야당 각자가 amount 를 내고(지면 받고), 그 합을 주공:프렌드 = (n-3):1 로 나눈다 (5마 2:1, 4마 1:1)
  const money = [...moneyBefore];
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (isDefender(i)) continue;
    money[i] += win ? -amount : amount;
    total += win ? amount : -amount;
  }
  // 수정: 원작은 프렌드 카드를 아무도 안 가졌거나 초구 프렌드가 주공일 때 money[-1] 에 기록했다
  const mShare = hasFriend && n >= 4 ? n - 3 : 1;
  const fShare = hasFriend ? 1 : 0;
  const mGain = Math.trunc((mShare * total) / (mShare + fShare));
  money[master] += mGain;
  if (hasFriend) money[friend] += total - mGain;

  // 파산: 음수인 사람은 0으로 하고, 그만큼을 받은 쪽에서 뺀다
  let deficit = 0;
  for (let i = 0; i < n; i++) {
    if (money[i] < 0) {
      deficit += money[i];
      money[i] = 0;
    }
  }
  if (deficit < 0) {
    if (win) money[master] += deficit;
    else {
      const opp = [...Array(n).keys()].filter((i) => !isDefender(i));
      const each = Math.trunc(deficit / opp.length);
      opp.forEach((i, k) => (money[i] += k === opp.length - 1 ? deficit - each * (opp.length - 1) : each));
    }
  }

  return { defenderWon: win, defenderPoints: defPts, oppositionPoints: oppPts, amount, formula, money };
}
