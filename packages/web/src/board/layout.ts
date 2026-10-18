// 게임판 배치: 자리(방향), 판 크기, 트릭 카드 위치 계산

import { useLayoutEffect, useState } from 'react';

export type Side = 'bottom-left' | 'left' | 'top-left' | 'top' | 'top-right' | 'right';

export type MySide = 'bottom' | 'bottom-right';

/** 나를 뺀 사람 수 → 시계 방향 자리 (원작 FUN_004073c0 배치를 참고, re/04_screen_layout.md) */
export const SIDES: Record<number, Side[]> = {
  2: ['left', 'right'], // 3마: 좌우
  3: ['left', 'top', 'right'], // 4마
  4: ['left', 'top-left', 'top-right', 'right'], // 5마: 좌우는 아래쪽
  5: ['bottom-left', 'left', 'top-left', 'top-right', 'right'], // 6마: 내 패는 오른쪽 아래
};

/** 판 크기에 맞춘 카드 크기 */
export function useBoardSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 1000, h: 700 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** 낸 카드가 놓이는 위치: 판 가운데에서 그 사람 쪽으로 (단위: 카드 폭/높이) */
export const TRICK_OFFSET: Record<Side | MySide, [number, number]> = {
  bottom: [0, 0.9],
  'bottom-right': [0.9, 0.8],
  'bottom-left': [-0.9, 0.8],
  left: [-1.45, 0.27],
  'top-left': [-0.9, -0.73],
  top: [0, -0.9],
  'top-right': [0.9, -0.73],
  right: [1.45, 0.27],
};

export function trickOffset(side: Side | MySide, n: number): [number, number] {
  const [x, y] = TRICK_OFFSET[side];
  // 6마는 육각형: 좌우는 가운데 높이, 위쪽은 조금 더 위로
  if (n === 6) return side === 'left' || side === 'right' ? [x, 0] : side.startsWith('top') ? [x, -0.8] : [x, y];
  return [x, y];
}

/** 그 사람 자리 쪽 판 가장자리 (카드가 날아오는 곳, 날아가는 곳) */
export function farOffset(side: Side | MySide, n: number): [number, number] {
  const [x, y] = trickOffset(side, n);
  const len = Math.hypot(x, y) || 1;
  return [(x / len) * 4.2, (y / len) * 3.2];
}

export const offsetTransform = ([dx, dy]: [number, number], extra = '') =>
  `translate(calc(-50% + ${dx} * var(--cw)), calc(-50% + ${dy} * var(--ch)))${extra}`;
