// 규칙 옵션. 원작 규칙 구조체(0x48 바이트) → re/01_game_logic.md §4
// 각 필드 옆 주석의 0xNN 은 원작 오프셋.

import type { Card } from './card.js';

/** 기본 점수 계산법 (원작 0x2b~0x2f 라디오) */
export type ScoreMethod =
  | 'risk' //            위험 보상 (2.0 호환)
  | 'eyeForEye' //       눈에는 눈
  | 'eyeForEyeVariant' // 눈에는 눈 (변형)
  | 'base10' //          10 기준
  | 'baseGoal'; //       13 기준 (= 기본 목표 점수 기준)

/** 런 보상 (원작 0x30 / 0x31 / 0x35 라디오, 모두 0이면 없음) */
export type RunBonus = 'none' | 'double' | 'doubleIfDeclared' | 'fixed20';

export interface Rules {
  players: 3 | 4 | 5 | 6; //                0x00
  clockwise: boolean; //                    0x04 화면 표시용
  baseGoal: number; //                      0x08 기본 목표 점수

  // 선거
  noKirudaGoalMinusOne: boolean; //         0x0c 노기루다는 기본보다 1 적게 부를 수 있음
  allowGoalOver20: boolean; //              0x0d 최대 25까지
  friendDealsNext: boolean; //              0x0e 전판 프렌드가 다음판 선
  dealerCanPassFirst: boolean; //           0x0f
  kirudaChangeRaise2: boolean; //           0x10 기루다를 바꿀 때 목표 +2
  noKirudaChangeRaise1: boolean; //         0x11 노기루다로/에서 바꿀 때는 +1
  friendEnabled: boolean; //                0x13
  jokerFriendAllowed: boolean; //           0x14
  discardsToOpposition: boolean; //         0x15 주공이 버린 3장은 야당 득점

  // 제약 조건
  mightyFirstTurnPlayable: boolean; //      0x16
  mightyFirstTurnEffective: boolean; //     0x17
  mightyLastTurnPlayable: boolean; //       0x18
  mightyLastTurnEffective: boolean; //      0x19
  mightyAnswersJokercall: boolean; //       0x1a 조커콜에 조커 대신 마이티
  jokerFirstTurnPlayable: boolean; //       0x1b
  jokerFirstTurnEffective: boolean; //      0x1c
  jokerLastTurnPlayable: boolean; //        0x1d
  jokerLastTurnEffective: boolean; //       0x1e
  firstTurnKirudaFollower: boolean; //      0x1f 첫 턴에 선이 아닌 사람은 기루다 가능
  firstTurnKirudaLeader: boolean; //        0x20 첫 턴에 선도 기루다 가능 (0x1f가 켜져야 의미)
  jokercallFirstTurn: boolean; //           0x21 첫 턴 조커콜 효력
  jokercalledJokerEffective: boolean; //    0x22 조커콜 당한 조커도 효력

  // 딜 미스
  dealMiss: {
    noPoints: boolean; //                   0x23 (원작은 미사용 → 수정: 반영)
    allPoints: boolean; //                  0x24 (원작은 미사용 → 수정: 반영)
    countMighty: boolean; //                0x25 위 두 경우 마이티를 점수카드로
    countJoker: boolean; //                 0x26 위 두 경우 조커를 점수카드로
    jokerDeductsOne: boolean; //            0x27 조커가 있으면 점수카드 하나 제함
    onlyTen: boolean; //                    0x28
    onlyOneEyedJack: boolean; //            0x29
    onlyMighty: boolean; //                 0x2a
  };

  // 점수 계산
  scoreMethod: ScoreMethod; //              0x2b~0x2f (원작 UI 저장 off-by-one 버그는 수정)
  runBonus: RunBonus; //                    0x30 / 0x31 / 0x35
  backRunDouble: boolean; //                0x32
  noKirudaDouble: boolean; //               0x33 (원작은 미사용 → 수정: 반영)
  noFriendDouble: boolean; //               0x34 (원작은 미사용 → 수정: 반영)

  // 표시
  revealFriendOnScore: boolean; //          0x36
  flipScoredCards: boolean; //              0x37

  // 카드
  mighty: Card; //                          0x38 (표준 ♠A)
  altMighty: Card; //                       0x3c (표준 ◆A)
  jokercall: Card; //                       0x40 (표준 ♣3)
  altJokercall: Card; //                    0x44 (표준 ♠3)
}

// ---- 원작 14글자 규칙 문자열 (FUN_00430a10 디코드 / FUN_004306a0 인코드) ----
// 각 글자 = 값 + 0x23('#'). c[6..13] 은 6비트씩 bool 필드를 담는다 (bit0 이 첫 필드).

const BIT_FIELDS: number[][] = [
  [0x0c, 0x0d, 0x04, 0x0e, 0x0f, 0x10],
  [0x11, 0x12, 0x13, 0x14, 0x15, 0x16],
  [0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c],
  [0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22],
  [0x23, 0x24, 0x25, 0x26, 0x27, 0x28],
  [0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e],
  [0x2f, 0x30, 0x31, 0x32, 0x33, 0x34],
  [0x35, 0x36, 0x37],
];
const INT_FIELDS = [0x00, 0x08, 0x38, 0x3c, 0x40, 0x44];

type Raw = Record<number, number>;

function decodeRaw(s: string): Raw {
  if (s.length !== 14) throw new Error(`rule string must be 14 chars: ${s}`);
  const v = [...s].map((ch) => ch.charCodeAt(0) - 0x23);
  const raw: Raw = {};
  INT_FIELDS.forEach((off, i) => (raw[off] = v[i]));
  BIT_FIELDS.forEach((offs, i) => offs.forEach((off, bit) => (raw[off] = (v[6 + i] >> bit) & 1)));
  return raw;
}

function encodeRaw(raw: Raw): string {
  const v = INT_FIELDS.map((off) => raw[off] ?? 0);
  BIT_FIELDS.forEach((offs) => v.push(offs.reduce((acc, off, bit) => acc | ((raw[off] ? 1 : 0) << bit), 0)));
  return v.map((x) => String.fromCharCode(x + 0x23)).join('');
}

const SCORE_METHODS: [number, ScoreMethod][] = [
  [0x2b, 'risk'],
  [0x2c, 'eyeForEye'],
  [0x2d, 'eyeForEyeVariant'],
  [0x2e, 'base10'],
];

export function decodeRules(s: string): Rules {
  const r = decodeRaw(s);
  const b = (off: number) => r[off] !== 0;
  const players = r[0x00];
  if (players < 3 || players > 6) throw new Error(`invalid player count ${players}`);
  return {
    players: players as Rules['players'],
    clockwise: b(0x04),
    baseGoal: r[0x08],
    noKirudaGoalMinusOne: b(0x0c),
    allowGoalOver20: b(0x0d),
    friendDealsNext: b(0x0e),
    dealerCanPassFirst: b(0x0f),
    kirudaChangeRaise2: b(0x10),
    noKirudaChangeRaise1: b(0x11),
    friendEnabled: b(0x13),
    jokerFriendAllowed: b(0x14),
    discardsToOpposition: b(0x15),
    mightyFirstTurnPlayable: b(0x16),
    mightyFirstTurnEffective: b(0x17),
    mightyLastTurnPlayable: b(0x18),
    mightyLastTurnEffective: b(0x19),
    mightyAnswersJokercall: b(0x1a),
    jokerFirstTurnPlayable: b(0x1b),
    jokerFirstTurnEffective: b(0x1c),
    jokerLastTurnPlayable: b(0x1d),
    jokerLastTurnEffective: b(0x1e),
    firstTurnKirudaFollower: b(0x1f),
    firstTurnKirudaLeader: b(0x20),
    jokercallFirstTurn: b(0x21),
    jokercalledJokerEffective: b(0x22),
    dealMiss: {
      noPoints: b(0x23),
      allPoints: b(0x24),
      countMighty: b(0x25),
      countJoker: b(0x26),
      jokerDeductsOne: b(0x27),
      onlyTen: b(0x28),
      onlyOneEyedJack: b(0x29),
      onlyMighty: b(0x2a),
    },
    // 원작 정산은 0x2b → 0x2e 순서로 첫 번째 켜진 것을 쓰고, 모두 꺼져 있으면 13 기준
    scoreMethod: SCORE_METHODS.find(([off]) => b(off))?.[1] ?? 'baseGoal',
    // 원작 정산의 우선순위: 고정액(0x35) → 선언 시 2배(0x31) → 2배(0x30)
    runBonus: b(0x35) ? 'fixed20' : b(0x31) ? 'doubleIfDeclared' : b(0x30) ? 'double' : 'none',
    backRunDouble: b(0x32),
    noKirudaDouble: b(0x33),
    noFriendDouble: b(0x34),
    revealFriendOnScore: b(0x36),
    flipScoredCards: b(0x37),
    mighty: r[0x38],
    altMighty: r[0x3c],
    jokercall: r[0x40],
    altJokercall: r[0x44],
  };
}

export function encodeRules(rules: Rules): string {
  const n = (x: boolean) => (x ? 1 : 0);
  const raw: Raw = {
    0x00: rules.players,
    0x04: n(rules.clockwise),
    0x08: rules.baseGoal,
    0x0c: n(rules.noKirudaGoalMinusOne),
    0x0d: n(rules.allowGoalOver20),
    0x0e: n(rules.friendDealsNext),
    0x0f: n(rules.dealerCanPassFirst),
    0x10: n(rules.kirudaChangeRaise2),
    0x11: n(rules.noKirudaChangeRaise1),
    0x12: 0,
    0x13: n(rules.friendEnabled),
    0x14: n(rules.jokerFriendAllowed),
    0x15: n(rules.discardsToOpposition),
    0x16: n(rules.mightyFirstTurnPlayable),
    0x17: n(rules.mightyFirstTurnEffective),
    0x18: n(rules.mightyLastTurnPlayable),
    0x19: n(rules.mightyLastTurnEffective),
    0x1a: n(rules.mightyAnswersJokercall),
    0x1b: n(rules.jokerFirstTurnPlayable),
    0x1c: n(rules.jokerFirstTurnEffective),
    0x1d: n(rules.jokerLastTurnPlayable),
    0x1e: n(rules.jokerLastTurnEffective),
    0x1f: n(rules.firstTurnKirudaFollower),
    0x20: n(rules.firstTurnKirudaLeader),
    0x21: n(rules.jokercallFirstTurn),
    0x22: n(rules.jokercalledJokerEffective),
    0x23: n(rules.dealMiss.noPoints),
    0x24: n(rules.dealMiss.allPoints),
    0x25: n(rules.dealMiss.countMighty),
    0x26: n(rules.dealMiss.countJoker),
    0x27: n(rules.dealMiss.jokerDeductsOne),
    0x28: n(rules.dealMiss.onlyTen),
    0x29: n(rules.dealMiss.onlyOneEyedJack),
    0x2a: n(rules.dealMiss.onlyMighty),
    0x2b: n(rules.scoreMethod === 'risk'),
    0x2c: n(rules.scoreMethod === 'eyeForEye'),
    0x2d: n(rules.scoreMethod === 'eyeForEyeVariant'),
    0x2e: n(rules.scoreMethod === 'base10'),
    0x2f: 0, // 원작 프리셋은 13 기준일 때도 0x2f 를 0으로 둔다
    0x30: n(rules.runBonus === 'double'),
    0x31: n(rules.runBonus === 'doubleIfDeclared'),
    0x32: n(rules.backRunDouble),
    0x33: n(rules.noKirudaDouble),
    0x34: n(rules.noFriendDouble),
    0x35: n(rules.runBonus === 'fixed20'),
    0x36: n(rules.revealFriendOnScore),
    0x37: n(rules.flipScoredCards),
    0x38: rules.mighty,
    0x3c: rules.altMighty,
    0x40: rules.jokercall,
    0x44: rules.altJokercall,
  };
  return encodeRaw(raw);
}

export const maxGoal = (rules: Rules): number => (rules.allowGoalOver20 ? 25 : 20);
/** 이번 판에 카드를 받는 인원 (6마는 1명 탈락 후 5명) */
export const activePlayers = (rules: Rules): number => (rules.players === 6 ? 5 : rules.players);
