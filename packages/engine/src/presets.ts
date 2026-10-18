// 원작 내장 프리셋 12종 (Mighty.exe 0x442e5c 테이블). 문자열은 원본 그대로.

import { decodeRules, type Rules } from './rules.js';

export interface Preset {
  id: number;
  name: string;
  code: string;
}

export const PRESETS: readonly Preset[] = [
  { id: 1, name: '표준 5마', code: "(0$1M&WO*7H'5#" },
  { id: 2, name: '표준 4마', code: "'1$1M&WG*7H'5#" },
  { id: 3, name: '표준 3마', code: "&/$1M&WC*7H'5#" },
  { id: 4, name: '표준 6마', code: ")0$1M&WO*7H'5#" },
  { id: 5, name: '관악 6마', code: ")0$1M@PP27X.=#" },
  { id: 6, name: '신촌 5마', code: "(1$1M&R`2'X*]'" },
  { id: 7, name: '경기 5마', code: "(/$1M@7Obb(']%" },
  { id: 8, name: '부산 4마', code: "'0$1M&PH27H*=#" },
  { id: 9, name: '대구 5마', code: "(/$1M&RP17H'=#" },
  { id: 10, name: '대전 6마', code: ")0$1M&P`27X*=#" },
  { id: 11, name: '광주 5마', code: "(/$1M&XP9(H'='" },
  { id: 12, name: '제주 3마', code: "&/$1M&7C27X*=#" },
];

/**
 * 프리셋 규칙. 원작은 아래 옵션들을 읽지 않고 항상 적용했으므로, 원작에서 체감하던 결과와
 * 같아지도록 켠 값으로 맞춘다. 원본 문자열 그대로의 값이 필요하면 decodeRules(code) 를 쓴다.
 */
export function presetRules(id: number): Rules {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown preset ${id}`);
  const r = decodeRules(p.code);
  return {
    ...r,
    noKirudaDouble: true,
    noFriendDouble: true,
    dealMiss: { ...r.dealMiss, noPoints: true, allPoints: true },
    // 표준 5마: 첫 공약자(딜러)는 포기할 수 없다 (최소 '기노' 13). 사용자 결정 2026-10-18
    ...(id === 1 ? { dealerCanPassFirst: false } : {}),
  };
}
