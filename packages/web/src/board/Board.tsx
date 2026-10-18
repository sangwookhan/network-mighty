// 게임판: 원작(마이티 네트워크 3.2) 배치를 참고한 초록 판.
// 내 패는 아래에 앞면으로 펼치고, 다른 사람은 판 가장자리에 뒷면으로 둘러앉는다.
// 공약·안내는 원작의 반투명 상자(DSB)처럼 판 위에 띄운다.

import { NO_SUIT, defaultDiscards, isValidBid, type Card, type Suit } from '@mighty/engine';
import type { GameView, RoomView } from '@mighty/protocol';
import { useRef, useState, type CSSProperties } from 'react';
import { send } from '../net.js';
import { BidPanel, FinalPanel, KillPanel, ResultPanel, recommendKiruda } from '../panels.js';
import { Center } from './Center.js';
import { ContractBox } from './ContractBox.js';
import { Dsb } from './Dsb.js';
import { MyHand } from './MyHand.js';
import { Opponent, SpectatorSeat } from './Seats.js';
import { StatusBar } from './StatusBar.js';
import { type Side, type MySide, SIDES, useBoardSize } from './layout.js';
import { useGameSounds } from './useGameSounds.js';
import '../fx.css';

export function Board({ room, game }: { room: RoomView; game: GameView }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useBoardSize(ref);
  // 세로로 긴 좁은 화면(휴대폰, 3분할 시험 화면): 카드를 폭 기준으로 크게 하고 다른 사람은 위쪽에 모은다
  const portrait = w < 760 && h > w * 1.1;
  // 원작처럼 창이 크면 카드도 키운다 (원작은 0.5배 단위, 여기서는 연속으로 최대 2배)
  const scale = portrait ? Math.min(1.25, Math.max(0.62, w / 4.4 / 71)) : Math.max(0.55, Math.min(2, w / 1000, h / 600));
  const cw = Math.round(71 * scale);
  const ch = Math.round(96 * scale);
  const kiruda: Suit = game.contract?.kiruda ?? NO_SUIT;
  const me = room.me.seat;
  const base = me ?? 0;
  const n = room.seats.length;
  const others = Array.from({ length: n - 1 }, (_, k) => (base + 1 + k) % n);
  const sideOf = new Map<number, Side | MySide>(others.map((s, k) => [s, SIDES[n - 1][k]]));
  sideOf.set(base, n === 6 ? 'bottom-right' : 'bottom');
  const req = game.myRequest;
  // 주공이 버릴 카드 (아래 내 패에서 눌러 고른다). 정리 차례가 오면 엔진의 기본 선택을 미리 올려 둔다
  // (시간이 지나 서버가 대신 진행할 때도 같은 기본 선택을 쓴다)
  const [picked, setPicked] = useState<{ id: number | null; cards: Card[] }>({ id: null, cards: [] });
  const discards =
    picked.id === game.myRequestId
      ? picked.cards
      : req?.kind === 'final' && game.electedContract
        ? defaultDiscards(game.myHand, game.electedContract.kiruda, room.rules)
        : [];
  const setDiscards = (f: (d: Card[]) => Card[]) => setPicked({ id: game.myRequestId, cards: f(discards) });
  // 공약할 기루다: 판마다 내 패에 맞는 무늬를 추천하고, 고른 것은 그 판 동안 유지한다
  const recommended = recommendKiruda(game.myHand, room.rules);
  const [bidKiruda, setBidKiruda] = useState<{ deal: number; kiruda: Suit } | null>(null);
  // 포기할 수 없는 첫 공약(예: 표준 5마의 딜러)은 '기노'(노기루다 + 기본 공약)를 기본으로 고른다
  const forcedFirst =
    req?.kind === 'bid' && !!game.election && game.election.best === null && !isValidBid(game.election, { type: 'pass' }, game.myHand, room.rules);
  const kirudaChoice = bidKiruda && bidKiruda.deal === game.dealNo ? bidKiruda.kiruda : forcedFirst ? NO_SUIT : recommended;

  useGameSounds(room, game);

  const style = { '--cw': `${cw}px`, '--ch': `${ch}px`, '--s': scale } as CSSProperties;
  return (
    <div className={`board players-${n} ${portrait ? 'portrait' : ''}`} ref={ref} style={style}>
      {others.map((s) => (
        <Opponent key={s} room={room} game={game} seat={room.seats[s]} side={sideOf.get(s) as Side} scale={scale} compact={portrait} />
      ))}
      {me === null && <SpectatorSeat room={room} game={game} seat={room.seats[base]} />}
      <Center room={room} game={game} sideOf={sideOf} kiruda={kiruda} />
      {game.contract && game.master !== null && <ContractBox room={room} game={game} />}
      {req?.kind === 'bid' && <Dsb title="공약을 정해 주세요" className="dsb-bid"><BidPanel room={room} game={game} kiruda={kirudaChoice} setKiruda={(k) => setBidKiruda({ deal: game.dealNo, kiruda: k })} recommended={recommended} /></Dsb>}
      {req?.kind === 'kill' && <Dsb title="탈락 지목" className="dsb-center dsb-low"><KillPanel game={game} /></Dsb>}
      {req?.kind === 'final' && <Dsb title="당선을 축하드립니다 !!" className="dsb-center dsb-final"><FinalPanel room={room} game={game} discards={discards} setDiscards={setDiscards} /></Dsb>}
      {game.phase === 'result' && game.result && <Dsb className="dsb-center dsb-result"><ResultPanel room={room} game={game} /></Dsb>}
      {me !== null && (
        <MyHand room={room} game={game} kiruda={kiruda} boardWidth={w} cw={cw} portrait={portrait} discards={req?.kind === 'final' ? discards : null} setDiscards={setDiscards} />
      )}
      <StatusBar room={room} game={game} />
      {room.paused && (
        <div className="pause-overlay">
          <Dsb title="일시정지" className="pause-box">
            <div className="pause-text">{room.paused.by}님이 게임을 멈췄습니다</div>
            <div className="hint">차례 시간도 멈춰 있습니다. 다시 시작하면 남은 시간부터 이어집니다.</div>
            {(room.me.seat !== null || room.me.isHost) && (
              <div className="row text-buttons">
                <button className="confirm" onClick={() => send({ t: 'pause', paused: false })}>
                  ▶ 다시 시작
                </button>
              </div>
            )}
          </Dsb>
        </div>
      )}
    </div>
  );
}
