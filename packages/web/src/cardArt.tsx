// 카드 그림 (직접 그린 SVG, 71×96 = 원작 비율). 원작 카드 그림(Windows 카드 게임 그림)은 저작권 문제로 쓰지 않는다.
// 카드 디자인은 5가지(DECKS) 중 이 브라우저에서 고른 것으로 그린다 (deck.ts).

import { JOKER, rankOf, suitOf, type Card } from '@mighty/engine';
import type { ReactNode } from 'react';
import { type DeckId, useDeck } from './deck.js';

export const CARD_W = 71;
export const CARD_H = 96;

/** 디자인 한 벌: 바탕·무늬 색, 모서리 글자, 가운데 그림 방식 */
interface Theme {
  bg: string;
  stroke: string;
  /** 무늬별 색 [, ♠, ◆, ♥, ♣] */
  colors: [string, string, string, string, string];
  /** 모서리 숫자 크기 (기본 12) */
  corner: number;
  /** 숫자 카드 가운데: 무늬를 숫자만큼(pips) / 큰 무늬 하나(big) */
  pips: 'pips' | 'big';
  font: string;
  /** 그림 카드(J/Q/K) 틀 색 */
  court: { bg: string; j: string; q: string; k: string; crown: string };
  joker: { bg: string; ink: string };
  radius: number;
}

const THEMES: Record<DeckId, Theme> = {
  classic: {
    bg: '#fff', stroke: '#333', colors: ['', '#111', '#d40000', '#d40000', '#111'], corner: 12, pips: 'pips', font: 'Georgia, serif',
    court: { bg: '#fff6d5', j: '#1d4fa3', q: '#b8860b', k: '#8b1a1a', crown: '#e3b21b' }, joker: { bg: '#f6ecff', ink: '#6a1b9a' }, radius: 4,
  },
  fourColor: {
    bg: '#fff', stroke: '#333', colors: ['', '#111', '#1565c0', '#d40000', '#2e7d32'], corner: 12, pips: 'pips', font: 'Georgia, serif',
    court: { bg: '#f3f7ff', j: '#1d4fa3', q: '#2e7d32', k: '#8b1a1a', crown: '#e3b21b' }, joker: { bg: '#fff3e0', ink: '#e65100' }, radius: 4,
  },
  big: {
    bg: '#fffdf7', stroke: '#222', colors: ['', '#000', '#e00000', '#e00000', '#000'], corner: 20, pips: 'big', font: 'Arial Black, Arial, sans-serif',
    court: { bg: '#fff', j: '#333', q: '#333', k: '#333', crown: '#f2b705' }, joker: { bg: '#fff', ink: '#7b1fa2' }, radius: 5,
  },
  modern: {
    bg: '#f7f8fa', stroke: '#c9ced6', colors: ['', '#263238', '#e53950', '#e53950', '#263238'], corner: 15, pips: 'big', font: 'Helvetica Neue, Arial, sans-serif',
    court: { bg: '#eef1f6', j: '#5c6bc0', q: '#ab47bc', k: '#ef6c00', crown: '#ffca28' }, joker: { bg: '#ede7f6', ink: '#5e35b1' }, radius: 7,
  },
  noir: {
    bg: '#17181c', stroke: '#c9a24a', colors: ['', '#e8c766', '#ff5a5a', '#ff5a5a', '#e8c766'], corner: 13, pips: 'pips', font: 'Didot, Georgia, serif',
    court: { bg: '#23242a', j: '#c9a24a', q: '#c9a24a', k: '#c9a24a', crown: '#e8c766' }, joker: { bg: '#23242a', ink: '#e8c766' }, radius: 4,
  },
};

/** 10×10 상자 안의 무늬 모양 */
function SuitShape({ suit, x, y, size, color, flip = false }: { suit: number; x: number; y: number; size: number; color: string; flip?: boolean }) {
  const s = size / 10;
  const t = `translate(${x - size / 2} ${y - size / 2}) scale(${s})${flip ? ' rotate(180 5 5)' : ''}`;
  return (
    <g transform={t} fill={color}>
      {suit === 1 && (
        <path d="M5 0C5 0 0 4 0 6.2C0 7.6 1.1 8.6 2.4 8.6C3.3 8.6 4 8.2 4.4 7.5L3.6 10H6.4L5.6 7.5C6 8.2 6.7 8.6 7.6 8.6C8.9 8.6 10 7.6 10 6.2C10 4 5 0 5 0Z" />
      )}
      {suit === 2 && <path d="M5 0L9 5L5 10L1 5Z" />}
      {suit === 3 && (
        <path d="M5 9.6C5 9.6 0 6 0 3C0 1.3 1.2 0 2.7 0C3.8 0 4.6 .7 5 1.6C5.4 .7 6.2 0 7.3 0C8.8 0 10 1.3 10 3C10 6 5 9.6 5 9.6Z" />
      )}
      {suit === 4 && (
        <>
          <circle cx="5" cy="2.6" r="2.4" />
          <circle cx="2.5" cy="6" r="2.4" />
          <circle cx="7.5" cy="6" r="2.4" />
          <path d="M4.5 5L3.6 10H6.4L5.5 5Z" />
        </>
      )}
    </g>
  );
}

// 숫자 카드 무늬 위치 [x, y] (아래쪽 절반은 뒤집어 그림)
const L = 22, C = 35.5, R = 49;
const PIPS: Record<number, [number, number][]> = {
  2: [[C, 20], [C, 76]],
  3: [[C, 20], [C, 48], [C, 76]],
  4: [[L, 20], [R, 20], [L, 76], [R, 76]],
  5: [[L, 20], [R, 20], [C, 48], [L, 76], [R, 76]],
  6: [[L, 20], [R, 20], [L, 48], [R, 48], [L, 76], [R, 76]],
  7: [[L, 20], [R, 20], [C, 34], [L, 48], [R, 48], [L, 76], [R, 76]],
  8: [[L, 20], [R, 20], [C, 34], [L, 48], [R, 48], [C, 62], [L, 76], [R, 76]],
  9: [[L, 20], [R, 20], [L, 39], [R, 39], [C, 48], [L, 57], [R, 57], [L, 76], [R, 76]],
  10: [[L, 20], [R, 20], [C, 30], [L, 39], [R, 39], [L, 57], [R, 57], [C, 66], [L, 76], [R, 76]],
};

const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function Corner({ rank, suit, color, t }: { rank: string; suit: number; color: string; t: Theme }) {
  const fs = rank === '10' ? t.corner * 0.82 : t.corner;
  const x = 4 + t.corner * 0.28;
  return (
    <g>
      <text x={x} y={2.5 + t.corner} fontSize={fs} fontWeight="bold" textAnchor="middle" fill={color} fontFamily={t.font} letterSpacing={rank === '10' ? -1 : 0}>
        {rank}
      </text>
      <SuitShape suit={suit} x={x} y={8 + t.corner * 1.1} size={t.corner * 0.6} color={color} />
    </g>
  );
}

function CourtCenter({ rank, suit, color, t }: { rank: number; suit: number; color: string; t: Theme }) {
  const frame = rank === 11 ? t.court.j : rank === 12 ? t.court.q : t.court.k;
  const big = t.pips === 'big';
  return (
    <g>
      {/* 큰 글자 디자인은 모서리가 커서 틀 없이 글자만 */}
      {!big && <rect x="14" y="12" width="43" height="72" fill={t.court.bg} stroke={frame} strokeWidth="1.5" />}
      {!big && <rect x="16.5" y="14.5" width="38" height="67" fill="none" stroke={frame} strokeWidth="0.6" />}
      {/* 왕관/모자 */}
      {rank === 13 && <path d="M25 30L28 22L32 28L35.5 20L39 28L43 22L46 30Z" fill={t.court.crown} stroke="#8b6508" strokeWidth=".6" />}
      {rank === 12 && <path d="M27 30Q35.5 18 44 30Z" fill={t.court.crown} stroke="#8b6508" strokeWidth=".6" />}
      {rank === 11 && <path d="M27 30L35.5 22L44 30Z" fill={frame} />}
      <text x="35.5" y={big ? 60 : 56} fontSize={big ? 34 : 26} fontWeight="bold" textAnchor="middle" fill={color} fontFamily={t.font}>
        {RANK[rank]}
      </text>
      <SuitShape suit={suit} x={35.5} y={72} size={11} color={color} />
    </g>
  );
}

function JokerFace({ t }: { t: Theme }) {
  const ink = t.joker.ink;
  return (
    <g>
      {'JOKER'.split('').map((ch, i) => (
        <text key={i} x="7" y={12 + i * 9} fontSize="8.5" fontWeight="bold" textAnchor="middle" fill={ink} fontFamily="Arial, sans-serif">
          {ch}
        </text>
      ))}
      <rect x="15" y="12" width="44" height="72" rx="3" fill={t.joker.bg} stroke={ink} strokeWidth="1.2" />
      {/* 광대 모자 */}
      <path d="M24 44Q26 26 37 22Q33 32 37 44Z" fill="#d40000" />
      <path d="M37 44Q37 30 50 24Q46 34 49 44Z" fill="#1d4fa3" />
      <circle cx="37" cy="21" r="2.4" fill="#e3b21b" />
      <circle cx="50.5" cy="23" r="2.4" fill="#e3b21b" />
      <rect x="23" y="44" width="27" height="5" rx="2" fill="#e3b21b" />
      {/* 얼굴 */}
      <circle cx="36.5" cy="58" r="9" fill="#ffe0bd" stroke={ink} strokeWidth=".6" />
      <circle cx="33.5" cy="56" r="1.1" fill="#222" />
      <circle cx="39.5" cy="56" r="1.1" fill="#222" />
      <path d="M32 61Q36.5 65 41 61" stroke="#d40000" strokeWidth="1.2" fill="none" />
      <text x="37" y="80" fontSize="7" fontWeight="bold" textAnchor="middle" fill={ink} fontFamily="Arial, sans-serif">
        JOKER
      </text>
    </g>
  );
}

export function CardFace({ card, deck }: { card: Card; deck?: DeckId }) {
  const chosen = useDeck();
  const t = THEMES[deck ?? chosen];
  const base = <rect x=".5" y=".5" width="70" height="95" rx={t.radius} fill={t.bg} stroke={t.stroke} />;
  if (card === JOKER) {
    return (
      <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="card-svg">
        {base}
        <JokerFace t={t} />
      </svg>
    );
  }
  const suit = suitOf(card);
  const rank = rankOf(card);
  const color = t.colors[suit];
  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="card-svg">
      {base}
      <Corner rank={RANK[rank]} suit={suit} color={color} t={t} />
      <g transform={`rotate(180 ${CARD_W / 2} ${CARD_H / 2})`}>
        <Corner rank={RANK[rank]} suit={suit} color={color} t={t} />
      </g>
      {rank === 1 && <SuitShape suit={suit} x={35.5} y={48} size={suit === 1 ? 30 : 22} color={color} />}
      {rank >= 2 && rank <= 10 && t.pips === 'pips' && PIPS[rank].map(([x, y], i) => <SuitShape key={i} suit={suit} x={x} y={y} size={11} color={color} flip={y > 48} />)}
      {rank >= 2 && rank <= 10 && t.pips === 'big' && <SuitShape suit={suit} x={35.5} y={50} size={28} color={color} />}
      {rank >= 11 && <CourtCenter rank={rank} suit={suit} color={color} t={t} />}
    </svg>
  );
}

/** 카드 뒷면: 디자인마다 다르게 (모두 새로 그린 무늬) */
export function CardBack({ deck }: { deck?: DeckId } = {}) {
  const chosen = useDeck();
  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="card-svg">
      {BACKS[deck ?? chosen]}
    </svg>
  );
}

const BACKS: Record<DeckId, ReactNode> = {
  // 고전: 짙은 빨강 바탕에 금색 마름모 격자와 가운데 메달
  classic: (
    <>
      <defs>
        <pattern id="back-classic" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#8e1b1b" />
          <path d="M0 0H8M0 0V8" stroke="#d9a441" strokeWidth=".8" />
          <circle cx="4" cy="4" r="1" fill="#f3d27a" />
        </pattern>
      </defs>
      <rect x=".5" y=".5" width="70" height="95" rx="4" fill="#fff" stroke="#333" />
      <rect x="4" y="4" width="63" height="88" rx="3" fill="url(#back-classic)" stroke="#5e0f0f" />
      <rect x="7" y="7" width="57" height="82" rx="2" fill="none" stroke="#f3d27a" strokeWidth=".7" />
      <circle cx="35.5" cy="48" r="11" fill="#5e0f0f" stroke="#f3d27a" strokeWidth="1.2" />
      <text x="35.5" y="53" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#f3d27a" fontFamily="Georgia, serif">M</text>
    </>
  ),
  // 4색: 남색 바탕에 흰 물결 줄
  fourColor: (
    <>
      <defs>
        <pattern id="back-four" width="10" height="6" patternUnits="userSpaceOnUse">
          <rect width="10" height="6" fill="#16325c" />
          <path d="M0 3Q2.5 0 5 3T10 3" stroke="#6fa8ff" strokeWidth=".8" fill="none" />
        </pattern>
      </defs>
      <rect x=".5" y=".5" width="70" height="95" rx="4" fill="#fff" stroke="#333" />
      <rect x="4" y="4" width="63" height="88" rx="3" fill="url(#back-four)" stroke="#0d1f3a" />
      <g transform="translate(35.5 48)">
        <rect x="-10" y="-10" width="20" height="20" transform="rotate(45)" fill="#fff" />
        <text y="5" fontSize="13" fontWeight="bold" textAnchor="middle" fill="#16325c" fontFamily="Arial, sans-serif">M</text>
      </g>
    </>
  ),
  // 큰 글자: 청록 사선 줄무늬
  big: (
    <>
      <defs>
        <pattern id="back-big" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <rect width="8" height="8" fill="#00796b" />
          <rect width="4" height="8" fill="#009688" />
        </pattern>
      </defs>
      <rect x=".5" y=".5" width="70" height="95" rx="5" fill="#fff" stroke="#222" />
      <rect x="4" y="4" width="63" height="88" rx="3" fill="url(#back-big)" />
    </>
  ),
  // 모던: 보라→파랑 그라데이션에 둥근 로고
  modern: (
    <>
      <defs>
        <linearGradient id="back-modern" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c4dff" />
          <stop offset="1" stopColor="#2979ff" />
        </linearGradient>
      </defs>
      <rect x=".5" y=".5" width="70" height="95" rx="7" fill="url(#back-modern)" stroke="#c9ced6" />
      <circle cx="35.5" cy="48" r="16" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" />
      <circle cx="35.5" cy="48" r="10" fill="rgba(255,255,255,.18)" />
      <text x="35.5" y="53" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#fff" fontFamily="Helvetica Neue, Arial, sans-serif">M</text>
    </>
  ),
  // 누아르: 검정 바탕에 금색 아르데코 선
  noir: (
    <>
      <rect x=".5" y=".5" width="70" height="95" rx="4" fill="#111" stroke="#c9a24a" />
      <rect x="5" y="5" width="61" height="86" rx="2" fill="none" stroke="#c9a24a" strokeWidth=".8" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M35.5 ${14 + i * 4}L${16 + i * 2} 48L35.5 ${82 - i * 4}L${55 - i * 2} 48Z`} fill="none" stroke="#c9a24a" strokeWidth=".5" opacity={1 - i * 0.12} />
      ))}
      <circle cx="35.5" cy="48" r="4" fill="#e8c766" />
    </>
  ),
};
