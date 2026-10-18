// 개발용: 카드 그림 전체 보기 (/cards.html)
import { createRoot } from 'react-dom/client';
import { CardBack, CardFace } from './cardArt.js';

const cards = Array.from({ length: 53 }, (_, i) => i + 1);
createRoot(document.getElementById('root')!).render(
  <>
    {cards.map((c) => (
      <CardFace key={c} card={c} />
    ))}
    <CardBack />
  </>,
);
