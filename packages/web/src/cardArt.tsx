// 고전 스타일 카드 그림 (직접 그린 SVG). 원작과 같은 71×96 비율.
// 원작 카드 그림(Windows 카드 게임 그림)은 저작권 문제로 쓰지 않는다.

import { JOKER, rankOf, suitOf, type Card } from '@mighty/engine';

export const CARD_W = 71;
export const CARD_H = 96;

const RED = '#d40000';
const BLACK = '#111';

/** 10×10 상자 안의 무늬 모양 */
function SuitShape({ suit, x, y, size, flip = false }: { suit: number; x: number; y: number; size: number; flip?: boolean }) {
  const s = size / 10;
  const color = suit === 2 || suit === 3 ? RED : BLACK;
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

function Corner({ rank, suit, color }: { rank: string; suit: number; color: string }) {
  return (
    <g>
      <text x="7" y="13" fontSize={rank === '10' ? 10 : 12} fontWeight="bold" textAnchor="middle" fill={color} fontFamily="Arial, sans-serif">
        {rank}
      </text>
      <SuitShape suit={suit} x={7} y={20} size={7} />
    </g>
  );
}

function FaceCenter({ rank, suit, color }: { rank: number; suit: number; color: string }) {
  const frame = rank === 11 ? '#1d4fa3' : rank === 12 ? '#b8860b' : '#8b1a1a';
  return (
    <g>
      <rect x="14" y="12" width="43" height="72" fill="#fff6d5" stroke={frame} strokeWidth="1.5" />
      <rect x="16.5" y="14.5" width="38" height="67" fill="none" stroke={frame} strokeWidth="0.6" />
      {/* 왕관/모자 */}
      {rank === 13 && <path d="M25 30L28 22L32 28L35.5 20L39 28L43 22L46 30Z" fill="#e3b21b" stroke="#8b6508" strokeWidth=".6" />}
      {rank === 12 && <path d="M27 30Q35.5 18 44 30Z" fill="#e3b21b" stroke="#8b6508" strokeWidth=".6" />}
      {rank === 11 && <path d="M27 30L35.5 22L44 30Z" fill="#c0392b" stroke="#6d1e15" strokeWidth=".6" />}
      <text x="35.5" y="56" fontSize="26" fontWeight="bold" textAnchor="middle" fill={color} fontFamily="Georgia, serif">
        {RANK[rank]}
      </text>
      <SuitShape suit={suit} x={35.5} y={70} size={11} />
    </g>
  );
}

function JokerFace() {
  const letters = 'JOKER'.split('');
  return (
    <g>
      {letters.map((ch, i) => (
        <text key={i} x="7" y={12 + i * 9} fontSize="8.5" fontWeight="bold" textAnchor="middle" fill="#6a1b9a" fontFamily="Arial, sans-serif">
          {ch}
        </text>
      ))}
      <rect x="15" y="12" width="44" height="72" rx="3" fill="#f6ecff" stroke="#6a1b9a" strokeWidth="1.2" />
      {/* 광대 모자 */}
      <path d="M24 44Q26 26 37 22Q33 32 37 44Z" fill="#d40000" />
      <path d="M37 44Q37 30 50 24Q46 34 49 44Z" fill="#1d4fa3" />
      <circle cx="37" cy="21" r="2.4" fill="#e3b21b" />
      <circle cx="50.5" cy="23" r="2.4" fill="#e3b21b" />
      <rect x="23" y="44" width="27" height="5" rx="2" fill="#e3b21b" />
      {/* 얼굴 */}
      <circle cx="36.5" cy="58" r="9" fill="#ffe0bd" stroke="#6a1b9a" strokeWidth=".6" />
      <circle cx="33.5" cy="56" r="1.1" fill="#222" />
      <circle cx="39.5" cy="56" r="1.1" fill="#222" />
      <path d="M32 61Q36.5 65 41 61" stroke="#d40000" strokeWidth="1.2" fill="none" />
      <text x="37" y="80" fontSize="7" fontWeight="bold" textAnchor="middle" fill="#6a1b9a" fontFamily="Arial, sans-serif">
        JOKER
      </text>
    </g>
  );
}

export function CardFace({ card }: { card: Card }) {
  if (card === JOKER) {
    return (
      <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="card-svg">
        <rect x=".5" y=".5" width="70" height="95" rx="4" fill="#fff" stroke="#333" />
        <JokerFace />
      </svg>
    );
  }
  const suit = suitOf(card);
  const rank = rankOf(card);
  const color = suit === 2 || suit === 3 ? RED : BLACK;
  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="card-svg">
      <rect x=".5" y=".5" width="70" height="95" rx="4" fill="#fff" stroke="#333" />
      <Corner rank={RANK[rank]} suit={suit} color={color} />
      <g transform={`rotate(180 ${CARD_W / 2} ${CARD_H / 2})`}>
        <Corner rank={RANK[rank]} suit={suit} color={color} />
      </g>
      {rank === 1 && <SuitShape suit={suit} x={35.5} y={48} size={suit === 1 ? 30 : 20} />}
      {rank >= 2 && rank <= 10 && PIPS[rank].map(([x, y], i) => <SuitShape key={i} suit={suit} x={x} y={y} size={11} flip={y > 48} />)}
      {rank >= 11 && <FaceCenter rank={rank} suit={suit} color={color} />}
    </svg>
  );
}

/** 카드 뒷면: 파란 격자 무늬 */
export function CardBack() {
  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="card-svg">
      <defs>
        <pattern id="mighty-back" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#1b4ea8" />
          <path d="M0 0H6M0 0V6" stroke="#7fb0ff" strokeWidth="1.2" />
          <circle cx="3" cy="3" r="0.9" fill="#d9442b" />
        </pattern>
      </defs>
      <rect x=".5" y=".5" width="70" height="95" rx="4" fill="#fff" stroke="#333" />
      <rect x="4" y="4" width="63" height="88" rx="2" fill="url(#mighty-back)" stroke="#123a80" />
    </svg>
  );
}
