// 화면 데모용 고정 상태 만들기: 실제 게임을 진행하면서 '나'(0번 자리)가 보는 방 정보를 시점별로 저장한다.
//   npx tsx scripts/fixtures.ts  →  packages/web/dev/fixtures/*.json
// board-demo.html 이 이 파일을 그대로 그려, 화면 정리 전후를 비교하거나 디자인 작업에 쓴다.
// (5p-waiting.json 은 5p-bid.json 에서 게임을 빼고 빈자리를 둔 대기실 상태로 손으로 만든 것)

import { writeFileSync } from 'node:fs';
import { NO_SUIT, SUITS, goalRange, isValidBid, type Bid } from '@mighty/engine';
import { PROTOCOL_VERSION, applyRoomMessage, emptyRoomCache, type GameAction, type RoomView, type ServerMessage } from '@mighty/protocol';
import { Hub } from '../src/hub.js';

const OUT = new URL('../../web/dev/fixtures/', import.meta.url);

async function capture(presetId: number, want: Record<string, (r: RoomView) => boolean>, prefix: string) {
  const hub = new Hub({ timing: { botDelayMs: 0, trickPauseMs: 30, redealPauseMs: 0 } });
  let cache = emptyRoomCache();
  const got = new Map<string, RoomView>();
  let session!: ReturnType<Hub['connect']>;
  const act = (r: RoomView) => {
    const g = r.game!;
    const req = g.myRequest!;
    let a: GameAction;
    if (req.kind === 'bid') {
      // 주공이 되도록 가능한 가장 낮은 공약을 계속 부른다
      let bid: Bid = { type: 'pass' };
      outer: for (let goal = goalRange(r.rules, NO_SUIT).min; goal <= 20; goal++)
        for (const k of [...SUITS, NO_SUIT]) if (isValidBid(g.election!, { type: 'bid', kiruda: k, goal }, g.myHand, r.rules)) { bid = { type: 'bid', kiruda: k, goal }; break outer; }
      a = { kind: 'bid', bid };
    } else if (req.kind === 'kill') {
      let card = 1;
      while (g.myHand.includes(card) || req.failed.includes(card)) card++;
      a = { kind: 'kill', card };
    } else if (req.kind === 'final') a = { kind: 'final', discards: g.myHand.slice(-3), contract: g.electedContract!, friend: { kind: 'card', card: 1 } };
    else if (req.kind === 'play') a = { kind: 'play', card: req.legal[0], jokerSuit: 1 };
    else a = { kind: 'continue', cont: true };
    session.onMessage({ t: 'action', requestId: g.myRequestId, action: a });
  };
  await new Promise<void>((resolve) => {
    session = hub.connect({
      send: (m: ServerMessage) =>
        setImmediate(() => {
          cache = applyRoomMessage(cache, m);
          const r = cache.room;
          if (!r?.game || m.t !== 'room') return;
          for (const [name, cond] of Object.entries(want)) if (!got.has(name) && cond(r)) got.set(name, structuredClone(r));
          if (got.size === Object.keys(want).length) return resolve();
          if (r.game.myRequest) act(r);
        }),
      close: () => {},
    });
    session.onMessage({ t: 'hello', version: PROTOCOL_VERSION, nickname: '나' });
    session.onMessage({ t: 'createRoom', name: '데모 방', presetId, turnSeconds: 60 });
    session.onMessage({ t: 'chat', text: '안녕하세요' });
    session.onMessage({ t: 'start' });
  });
  for (const [name, r] of got) writeFileSync(new URL(`${prefix}${name}.json`, OUT), JSON.stringify(r, null, 1));
  for (const room of hub.rooms.values()) hub.closeRoom(room);
  console.log(prefix, [...got.keys()].join(', '));
}

const g = (r: RoomView) => r.game!;
await capture(
  1,
  {
    bid: (r) => g(r).myRequest?.kind === 'bid' && (g(r).election?.log.length ?? 0) >= 1,
    final: (r) => g(r).myRequest?.kind === 'final',
    play: (r) => g(r).myRequest?.kind === 'play' && (g(r).trick?.cards.length ?? 0) >= 2 && g(r).turn >= 2,
    result: (r) => g(r).phase === 'result',
  },
  '5p-',
);
await capture(4, { kill: (r) => g(r).myRequest?.kind === 'kill', play: (r) => g(r).phase === 'play' && (g(r).trick?.cards.length ?? 0) >= 3 }, '6p-');
await capture(3, { play: (r) => g(r).phase === 'play' && (g(r).trick?.cards.length ?? 0) >= 1 && g(r).turn >= 1 }, '3p-');
process.exit(0);
