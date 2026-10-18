// 다시 섞기 직전: 딜 미스면 누가 선언했는지와 그 사람의 패를 모두 펼쳐 보여 준다 (서버가 3초 기다림)

import { NO_SUIT, countPoints, isPoint } from '@mighty/engine';
import type { GameView, RoomView } from '@mighty/protocol';
import { CardView, sortHand } from '../cards.js';
import { Dsb } from './Dsb.js';

export function RedealBox({ room, game }: { room: RoomView; game: GameView }) {
  const r = game.redeal;
  if (!r) return null;
  if (r.reason === 'allPassed' || r.seat === null) {
    return (
      <Dsb title="다시 섞습니다" className="dsb-center dsb-redeal">
        <div className="redeal-who">모두 포기했습니다</div>
      </Dsb>
    );
  }
  const rules = room.rules;
  const hand = sortHand(r.hand, rules, NO_SUIT);
  const points = countPoints(hand);
  const why = points === 0 ? '점수카드가 한 장도 없습니다' : points === hand.length ? '모두 점수카드입니다' : `점수카드 ${points}장`;
  const isMe = r.seat === room.me.seat;
  return (
    <Dsb title="딜 미스 !!" className="dsb-center dsb-redeal">
      <div className="redeal-who">
        <b>{isMe ? '나' : room.seats[r.seat].nickname}</b>
        {isMe ? '의' : '님의'} 패 · <span className="redeal-why">{why}</span>
      </div>
      <div className="redeal-cards">
        {hand.map((c, i) => (
          <div key={c} className={`redeal-card ${isPoint(c) ? 'point' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
            <CardView card={c} rules={rules} kiruda={NO_SUIT} />
          </div>
        ))}
      </div>
      <div className="redeal-note">잠시 후 다시 섞습니다</div>
    </Dsb>
  );
}
