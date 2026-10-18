// 개발용: 카드 그림 보기 (/cards.html). 위에는 디자인 5가지 비교, 아래는 고른 디자인의 전체 카드.
import { JOKER, makeCard } from '@mighty/engine';
import { createRoot } from 'react-dom/client';
import { CardBack, CardFace } from './cardArt.js';
import { DECKS } from './deck.js';

// 이미지 디자인은 파일이 없으면 빈칸으로 보인다

const sample = [makeCard(1, 1), makeCard(2, 7), makeCard(3, 10), makeCard(4, 3), makeCard(1, 11), makeCard(3, 12), makeCard(4, 13), JOKER];
const all = Array.from({ length: 53 }, (_, i) => i + 1);
createRoot(document.getElementById('root')!).render(
  <>
    {DECKS.map((d) => (
      <div key={d.id} className="row" data-deck={d.id}>
        <b>{d.name}</b>
        {sample.map((c) => (
          <CardFace key={c} card={c} deck={d.id} />
        ))}
        <CardBack deck={d.id} />
      </div>
    ))}
    <div className="row all">
      {all.map((c) => (
        <CardFace key={c} card={c} />
      ))}
      <CardBack />
    </div>
  </>,
);
