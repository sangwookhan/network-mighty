// 공약 상자 (왼쪽 위): 기루다·공약·주공, 프렌드 조건과 누구인지

import { JOKER, NO_SUIT, isKiruda, mightyOf, plainCardName } from '@mighty/engine';
import type { GameView, RoomView } from '@mighty/protocol';
import { CardView, SUIT_NAME, SUIT_SYMBOL } from '../cards.js';

/** 공약 상자: 주공, 기루다·공약, 프렌드 조건(카드면 그림으로)과 공개된 프렌드를 한눈에 */
export function ContractBox({ room, game }: { room: RoomView; game: GameView }) {
  const c = game.contract!;
  const rules = room.rules;
  const f = game.friendChoice;
  const name = (seat: number) => room.seats[seat].nickname;
  let friendLabel = '';
  if (f?.kind === 'card') {
    const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    if (f.card === mightyOf(rules, c.kiruda)) friendLabel = '마이티';
    else if (f.card === JOKER) friendLabel = '조커';
    else if (isKiruda(f.card, c.kiruda)) friendLabel = `기루다 ${RANK[((f.card - 1) % 13) + 1]}`;
    else friendLabel = plainCardName(f.card);
  }
  const revealed = game.friendSeat !== null && game.friendSeat >= 0 ? name(game.friendSeat) : null;
  // 누가 프렌드인가: 공개됐으면 이름, 없음이 확정이면 '없음', 아직 모르면 '?'
  const who =
    f?.kind === 'none' ? null : f?.kind === 'player' ? name(f.seat) : revealed ?? (game.friendSeat === -1 && f && game.phase !== 'final' ? '없음' : '?');
  const red = c.kiruda === 2 || c.kiruda === 3;
  return (
    <div className="dsb contract-box">
      {/* 1순위: 기루다 (가장 크게) */}
      <div className="contract-main">
        <span className={`kiruda-tile ${red ? 'red' : ''} ${c.kiruda === NO_SUIT ? 'nokiruda' : ''}`} title="기루다">
          {c.kiruda === NO_SUIT ? '노기' : SUIT_SYMBOL[c.kiruda]}
        </span>
        <div className="contract-text">
          <div className="kiruda-name">
            <span className="small-label">기루다</span> {c.kiruda === NO_SUIT ? '노기루다' : SUIT_NAME[c.kiruda]}
          </div>
          <div className="contract-sub">
            공약 <b className="contract-goal">{c.goal}</b> · 주공 <b className="contract-master">{name(game.master!)}</b>
          </div>
        </div>
      </div>
      {/* 2순위: 프렌드 (조건 → 누구) */}
      <div className="contract-friend">
        <span className="label">프렌드</span>
        {!f && <span className="friend-name">정하는 중…</span>}
        {f?.kind === 'card' && (
          <>
            <span className="mini-card">
              <CardView card={f.card} rules={rules} kiruda={c.kiruda} />
            </span>
            <span className="friend-name">{friendLabel}</span>
          </>
        )}
        {f?.kind === 'firstTrick' && <span className="friend-name">초구</span>}
        {f?.kind === 'none' && <span className="friend-name">노프렌드</span>}
        {f?.kind === 'player' && <span className="friend-name">지정</span>}
        {who !== null && f && (
          <span className={`friend-who ${who === '?' ? 'unknown' : who === '없음' ? 'none' : 'known'}`}>{who}</span>
        )}
      </div>
    </div>
  );
}
