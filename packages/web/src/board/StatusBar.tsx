// 원작식 상태 표시줄: 기루다 | 공약 | 프렌드 | 메시지

import { DECKS, type DeckId, isAvailable, setDeck, useAvailableDecks, useDeck } from '../deck.js';
import { NO_SUIT } from '@mighty/engine';
import type { GameView, RoomView } from '@mighty/protocol';
import { shortName } from '../cards.js';
import { SoundMenu } from '../SoundMenu.js';
import { SuitIcon, Countdown } from './parts.js';

export const WAIT_TEXT: Record<string, string> = {
  bid: '공약 결정 중',
  kill: '탈락시킬 사람 고르는 중',
  final: '바닥패 정리 중',
  play: '카드 고르는 중',
};

export function StatusBar({ room, game }: { room: RoomView; game: GameView }) {
  const w = game.waitingFor.find((x) => x.kind !== 'continue');
  let text = '';
  if (w) text = w.seat === room.me.seat && w.kind === 'play' ? `${room.seats[w.seat].nickname} 님 차례입니다` : `${room.seats[w.seat].nickname} 님의 ${WAIT_TEXT[w.kind]}`;
  else if (game.phase === 'result') {
    const left = game.result?.continueVotes.filter((v) => v === null).length ?? 0;
    text = left > 0 ? `다음 판을 기다리는 중 (${left}명 남음)` : '다음 판 준비 중';
  } else if (game.phase === 'play') text = '트릭 정리 중';
  else text = '카드를 섞는 중입니다…';
  const c = game.contract;
  return (
    <div className="status-bar">
      {/* 원작 상태 표시줄: 기루다 | 공약 | 프렌드 | 메시지 */}
      <span className="pane icon-pane" title="기루다">{c ? (c.kiruda === NO_SUIT ? 'N' : <SuitIcon suit={c.kiruda} />) : <span className="none">✕</span>}</span>
      <span className="pane" title="공약">{c ? c.goal : ''}</span>
      <span className="pane friend-pane" title="프렌드">
        <FriendText room={room} game={game} />
      </span>
      <span className="status-text">{text}</span>
      {w?.remainingMs != null && <Countdown remainingMs={w.remainingMs} />}
      {room.paused && <span className="paused-tag">일시정지</span>}
      {room.me.seat === null && <span className="spectating">관전 중</span>}
      <span className="spacer" />
      <DeckSelect />
      <SoundMenu up />
      <span>{game.dealNo}번째 판{game.phase === 'play' ? ` · ${game.turn + 1}/10` : ''}</span>
    </div>
  );
}

/** 카드 디자인 고르기 (이 브라우저에 저장) */
export function DeckSelect() {
  const deck = useDeck();
  useAvailableDecks();
  return (
    <select className="deck-select" value={deck} onChange={(e) => setDeck(e.target.value as DeckId)} title={DECKS.find((d) => d.id === deck)?.hint} aria-label="카드 디자인">
      {DECKS.filter((d) => isAvailable(d.id)).map((d) => (
        <option key={d.id} value={d.id}>
          카드: {d.name}
        </option>
      ))}
    </select>
  );
}

export function FriendText({ room, game }: { room: RoomView; game: GameView }) {
  const f = game.friendChoice;
  if (!f) return <>{game.master !== null ? '-미정-' : ''}</>;
  let t = f.kind === 'none' ? '노프렌드' : f.kind === 'firstTrick' ? '초구' : f.kind === 'player' ? room.seats[f.seat].nickname! : shortName(f.card);
  if (game.friendSeat !== null && game.friendSeat >= 0 && f.kind !== 'player') t += ` → ${room.seats[game.friendSeat].nickname}`;
  return <>{t} 프렌드</>;
}
