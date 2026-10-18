// 규칙 설명: 방 만들기/대기실에서 프리셋을 고를 때 특징을 보여주기 위한 문구

import { plainCardName } from './card.js';
import { PRESETS, presetRules } from './presets.js';
import type { Rules, RunBonus, ScoreMethod } from './rules.js';

export const SCORE_METHOD_NAME: Record<ScoreMethod, string> = {
  risk: '위험 보상',
  eyeForEye: '눈에는 눈',
  eyeForEyeVariant: '눈에는 눈 (변형)',
  base10: '10 기준',
  baseGoal: '기본 공약 기준',
};

export const RUN_BONUS_NAME: Record<RunBonus, string> = {
  none: '런 보상 없음',
  double: '런은 2배',
  doubleIfDeclared: '20을 부르고 런을 하면 2배',
  fixed20: '런은 20점 고정',
};

type Flag = { get: (r: Rules) => boolean; on: string; off: string };

/** 켜짐/꺼짐에 따라 보여줄 문구. 순서가 곧 화면 표시 순서 */
const FLAGS: Flag[] = [
  { get: (r) => r.friendEnabled, on: '프렌드 있음', off: '프렌드 없음' },
  { get: (r) => r.jokerFriendAllowed, on: '조커를 프렌드로 부를 수 있음', off: '조커를 프렌드로 부를 수 없음' },
  { get: (r) => r.allowGoalOver20, on: '공약을 25까지 부를 수 있음', off: '공약은 20까지' },
  { get: (r) => r.noKirudaGoalMinusOne, on: '노기루다는 기본 공약보다 1 낮게 부를 수 있음', off: '노기루다도 기본 공약 이상' },
  { get: (r) => r.dealerCanPassFirst, on: '선도 처음에 포기할 수 있음', off: '선은 처음에 포기할 수 없음' },
  { get: (r) => r.kirudaChangeRaise2, on: '당선 후 기루다를 바꾸면 공약 +2', off: '당선 후 기루다를 바꾸면 공약 +1' },
  { get: (r) => r.noKirudaChangeRaise1, on: '노기루다로 바꿀 때는 +1만', off: '노기루다로 바꿀 때도 같은 규칙' },
  { get: (r) => r.friendDealsNext, on: '전 판 프렌드가 다음 판 선', off: '전 판 주공이 다음 판 선' },
  { get: (r) => r.discardsToOpposition, on: '주공이 버린 카드의 점수는 야당 몫', off: '주공이 버린 카드의 점수는 여당 몫' },
  { get: (r) => r.mightyFirstTurnPlayable, on: '첫 턴에 마이티를 낼 수 있음', off: '첫 턴에 마이티를 낼 수 없음' },
  { get: (r) => r.mightyFirstTurnEffective, on: '첫 턴 마이티 효력 있음', off: '첫 턴 마이티 효력 없음' },
  { get: (r) => r.mightyLastTurnPlayable, on: '마지막 턴에 마이티를 낼 수 있음', off: '마지막 턴에 마이티를 낼 수 없음' },
  { get: (r) => r.mightyLastTurnEffective, on: '마지막 턴 마이티 효력 있음', off: '마지막 턴 마이티 효력 없음' },
  { get: (r) => r.jokerFirstTurnPlayable, on: '첫 턴에 조커를 낼 수 있음', off: '첫 턴에 조커를 낼 수 없음' },
  { get: (r) => r.jokerFirstTurnEffective, on: '첫 턴 조커 효력 있음', off: '첫 턴 조커 효력 없음' },
  { get: (r) => r.jokerLastTurnPlayable, on: '마지막 턴에 조커를 낼 수 있음', off: '마지막 턴에 조커를 낼 수 없음' },
  { get: (r) => r.jokerLastTurnEffective, on: '마지막 턴 조커 효력 있음', off: '마지막 턴 조커 효력 없음' },
  { get: (r) => r.mightyAnswersJokercall, on: '조커콜에 조커 대신 마이티를 낼 수 있음', off: '조커콜에는 조커만 낼 수 있음' },
  { get: (r) => r.jokercallFirstTurn, on: '첫 턴 조커콜 효력 있음', off: '첫 턴 조커콜 효력 없음' },
  { get: (r) => r.jokercalledJokerEffective, on: '조커콜 당한 조커도 효력 있음', off: '조커콜 당한 조커는 효력 없음' },
  { get: (r) => r.firstTurnKirudaFollower, on: '첫 턴에 선이 아니면 기루다를 낼 수 있음', off: '첫 턴에 기루다를 낼 수 없음' },
  { get: (r) => r.firstTurnKirudaLeader, on: '첫 턴에 선도 기루다를 낼 수 있음', off: '첫 턴에 선은 기루다를 낼 수 없음' },
  { get: (r) => r.dealMiss.noPoints, on: '점수카드가 없으면 딜 미스', off: '점수카드가 없어도 딜 미스 아님' },
  { get: (r) => r.dealMiss.allPoints, on: '모두 점수카드면 딜 미스', off: '모두 점수카드여도 딜 미스 아님' },
  { get: (r) => r.dealMiss.countMighty, on: '딜 미스 판정 때 마이티를 점수카드로 셈', off: '딜 미스 판정 때 마이티는 점수카드가 아님' },
  { get: (r) => r.dealMiss.countJoker, on: '딜 미스 판정 때 조커를 점수카드로 셈', off: '딜 미스 판정 때 조커는 점수카드가 아님' },
  { get: (r) => r.dealMiss.jokerDeductsOne, on: '조커가 있으면 점수카드 하나를 빼고 딜 미스 판정', off: '조커가 있어도 점수카드를 빼지 않음' },
  { get: (r) => r.dealMiss.onlyTen, on: '점수카드가 10 한 장뿐이면 딜 미스', off: '10 한 장뿐이어도 딜 미스 아님' },
  { get: (r) => r.dealMiss.onlyOneEyedJack, on: '점수카드가 애꾸눈 잭 한 장뿐이면 딜 미스', off: '애꾸눈 잭 한 장뿐이어도 딜 미스 아님' },
  { get: (r) => r.dealMiss.onlyMighty, on: '점수카드가 마이티 한 장뿐이면 딜 미스', off: '마이티 한 장뿐이어도 딜 미스 아님' },
  { get: (r) => r.backRunDouble, on: '빽런은 2배', off: '빽런 보너스 없음' },
  { get: (r) => r.noKirudaDouble, on: '노기루다로 이기면 2배', off: '노기루다 보너스 없음' },
  { get: (r) => r.noFriendDouble, on: '노프렌드로 이기면 2배', off: '노프렌드 보너스 없음' },
  { get: (r) => r.revealFriendOnScore, on: '프렌드가 점수를 따면 바로 공개', off: '프렌드는 프렌드 카드를 낼 때 공개' },
  { get: (r) => r.flipScoredCards, on: '딴 점수카드를 뒤집어 놓음', off: '딴 점수카드를 펼쳐 놓음' },
];

/** 규칙의 핵심 요약 (항상 보여줄 항목) */
export function ruleSummary(r: Rules): string[] {
  const name = plainCardName;
  return [
    r.players === 6 ? '6명 (당선 후 1명 탈락)' : `${r.players}명`,
    `기본 공약 ${r.baseGoal} (최대 ${r.allowGoalOver20 ? 25 : 20})`,
    r.friendEnabled ? '프렌드 있음' : '프렌드 없음',
    `점수법: ${SCORE_METHOD_NAME[r.scoreMethod]}`,
    RUN_BONUS_NAME[r.runBonus],
    `마이티 ${name(r.mighty)} (기루다가 같은 무늬면 ${name(r.altMighty)})`,
    `조커콜 ${name(r.jokercall)} (기루다가 같은 무늬면 ${name(r.altJokercall)})`,
  ];
}

/** a 와 다른 b 의 특징 문구 */
export function ruleDifferences(a: Rules, b: Rules): string[] {
  const out: string[] = [];
  if (a.baseGoal !== b.baseGoal) out.push(`기본 공약 ${b.baseGoal}`);
  if (a.scoreMethod !== b.scoreMethod) out.push(`점수법: ${SCORE_METHOD_NAME[b.scoreMethod]}`);
  if (a.runBonus !== b.runBonus) out.push(RUN_BONUS_NAME[b.runBonus]);
  const alt = plainCardName;
  if (a.mighty !== b.mighty || a.altMighty !== b.altMighty) out.push(`마이티 ${alt(b.mighty)} / 보조 ${alt(b.altMighty)}`);
  if (a.jokercall !== b.jokercall || a.altJokercall !== b.altJokercall)
    out.push(`조커콜 ${alt(b.jokercall)} / 보조 조커콜 ${alt(b.altJokercall)}`);
  for (const f of FLAGS) if (f.get(a) !== f.get(b)) out.push(f.get(b) ? f.on : f.off);
  return out;
}

/** 규칙 전체를 문구로 (상세 보기용) */
export function ruleDetails(r: Rules): string[] {
  return FLAGS.map((f) => (f.get(r) ? f.on : f.off));
}

const STANDARD_BY_PLAYERS: Record<Rules['players'], number> = { 3: 3, 4: 2, 5: 1, 6: 4 };

export interface PresetDescription {
  id: number;
  name: string;
  /** 핵심 요약 (인원, 공약, 점수법 등) */
  summary: string[];
  /** 같은 인원의 표준 규칙과 다른 점. 표준 프리셋이면 빈 배열 */
  differences: string[];
  /** 비교 기준 프리셋 이름 (표준 프리셋이면 null) */
  comparedTo: string | null;
}

/** 프리셋 선택 화면용 설명 */
export function describePreset(id: number): PresetDescription {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`unknown preset ${id}`);
  const rules = presetRules(id);
  const stdId = STANDARD_BY_PLAYERS[rules.players];
  const isStandard = stdId === id;
  return {
    id,
    name: preset.name,
    summary: ruleSummary(rules),
    differences: isStandard ? [] : ruleDifferences(presetRules(stdId), rules),
    comparedTo: isStandard ? null : PRESETS.find((p) => p.id === stdId)!.name,
  };
}
