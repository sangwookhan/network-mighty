import {
  JOKER,
  NO_SUIT,
  isKiruda,
  jokercallOf,
  makeCard,
  mightyOf,
  powerOf,
  rankOf,
  suitOf,
  type Card,
  type Rules,
  type Suit,
} from '@mighty/engine';
import { useState } from 'react';
import { CardBack, CardFace } from './cardArt.js';

export const SUIT_SYMBOL = ['', '♠', '◆', '♥', '♣'];
export const SUIT_NAME = ['노기루다', '스페이드', '다이아몬드', '하트', '클로버'];
const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const shortName = (c: Card) => (c === JOKER ? '조커' : `${SUIT_SYMBOL[suitOf(c)]}${RANK[rankOf(c)]}`);
export const contractText = (k: Suit, goal: number) => `${k === NO_SUIT ? '노기루다' : SUIT_SYMBOL[k] + ' ' + SUIT_NAME[k]} ${goal}`;

/** 손패 정렬: 마이티, 조커, 기루다, 그 외 무늬 순. 같은 무늬는 센 카드부터 */
export function sortHand(cards: readonly Card[], rules: Rules, kiruda: Suit): Card[] {
  const mighty = mightyOf(rules, kiruda);
  const key = (c: Card) => {
    if (c === mighty) return -2000;
    if (c === JOKER) return -1000;
    const s = isKiruda(c, kiruda) ? 0 : suitOf(c);
    return s * 100 - powerOf(c);
  };
  return [...cards].sort((a, b) => key(a) - key(b));
}

export function CardView(props: {
  card: Card;
  rules: Rules;
  kiruda: Suit;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  small?: boolean;
}) {
  const { card, rules, kiruda } = props;
  const name = card === mightyOf(rules, kiruda) ? '마이티' : card === jokercallOf(rules, kiruda) ? '조커콜' : isKiruda(card, kiruda) ? '기루다' : '';
  const cls = ['card', props.small && 'small', props.selected && 'selected', props.onClick && !props.disabled && 'clickable', props.disabled && 'disabled']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} onClick={props.onClick} disabled={props.disabled || !props.onClick} data-card={card} title={shortName(card) + (name ? ` (${name})` : '')}>
      <CardFace card={card} />
    </button>
  );
}

export function CardBackView({ small }: { small?: boolean }) {
  return (
    <div className={small ? 'card back small' : 'card back'}>
      <CardBack />
    </div>
  );
}

/** 카드 한 장 고르기 (6마 탈락 지목, 프렌드 카드 지정) */
export function CardPicker(props: { onPick: (c: Card) => void; isAllowed: (c: Card) => boolean; label: string }) {
  const [suit, setSuit] = useState<Suit>(1);
  const [rank, setRank] = useState(1);
  const [joker, setJoker] = useState(false);
  const card = joker ? JOKER : makeCard(suit, rank);
  const ok = props.isAllowed(card);
  return (
    <div className="picker">
      <label>
        <input type="checkbox" checked={joker} onChange={(e) => setJoker(e.target.checked)} /> 조커
      </label>
      {!joker && (
        <>
          <select value={suit} onChange={(e) => setSuit(Number(e.target.value) as Suit)}>
            {[1, 2, 3, 4].map((s) => (
              <option key={s} value={s}>
                {SUIT_SYMBOL[s]} {SUIT_NAME[s]}
              </option>
            ))}
          </select>
          <select value={rank} onChange={(e) => setRank(Number(e.target.value))}>
            {[1, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((r) => (
              <option key={r} value={r}>
                {RANK[r]}
              </option>
            ))}
          </select>
        </>
      )}
      <button disabled={!ok} onClick={() => props.onPick(card)}>
        {props.label}
      </button>
      {!ok && <span className="hint">고를 수 없는 카드</span>}
    </div>
  );
}
