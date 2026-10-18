import type { RoomView } from '@mighty/protocol';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Board } from './board/Board.js';
import { BotLevelSelect, PresetInfo, PresetSelect, TURN_CHOICES, TurnSelect, botLevelName } from './Lobby.js';
import { send, useNet } from './net.js';
import { SoundMenu } from './SoundMenu.js';
import { play as sfx } from './sound.js';
import { speak } from './voice.js';
import { voiceForSystemLine } from './voiceLines.js';

export function RoomScreen({ room }: { room: RoomView }) {
  useRoomNewsVoice(room);
  const [showChat, setShowChat] = useState(() => window.innerWidth > 900);
  const [showScore, setShowScore] = useState(() => window.innerWidth > 900);
  const playing = room.status === 'playing' && room.game;
  return (
    <div className="room">
      <header className="menu-bar">
        <b>{room.name}</b>
        <span>
          {room.preset.name} · 봇 {botLevelName(room.botLevel)} · 차례{' '}
          {/* 방장은 게임 중에도 차례 제한 시간을 바꿀 수 있다 */}
          {room.me.isHost ? (
            <TurnSelect value={room.turnSeconds} onChange={(turnSeconds) => send({ t: 'setRoom', turnSeconds })} />
          ) : (
            TURN_CHOICES.find(([s]) => s === room.turnSeconds)?.[1]
          )}
        </span>
        <span className="spacer" />
        {playing && (room.me.seat !== null || room.me.isHost) && (
          <button className={room.paused ? 'pause-btn on' : 'pause-btn'} onClick={() => send({ t: 'pause', paused: !room.paused })}>
            {room.paused ? '▶ 다시 시작' : '❚❚ 일시정지'}
          </button>
        )}
        {playing && <button onClick={() => setShowScore((v) => !v)}>전적</button>}
        {playing && <button onClick={() => setShowChat((v) => !v)}>채팅</button>}
        {!playing && <SoundMenu />}
        {room.me.seat !== null && <button onClick={() => send({ t: 'standUp' })}>일어나기</button>}
        <button onClick={() => send({ t: 'leaveRoom' })}>나가기</button>
      </header>
      {playing ? (
        <div className={`room-play players-${room.seats.length}`}>
          <Board room={room} game={room.game!} />
          {showScore && <Scoreboard room={room} onClose={() => setShowScore(false)} />}
          {showChat && <ChatWindow room={room} fromTop={room.seats.length === 6} onClose={() => setShowChat(false)} />}
        </div>
      ) : (
        <div className="room-body felt">
          <main>
            <WaitingRoom room={room} />
          </main>
          <aside>
            <Chat room={room} />
          </aside>
        </div>
      )}
    </div>
  );
}

/** 원작의 "전적" 창: 이름과 점수 */
function Scoreboard({ room, onClose }: { room: RoomView; onClose: () => void }) {
  const total = room.seats.reduce((a, s) => a + s.money, 0) || 1;
  return (
    <div className="float-window score-window">
      <div className="float-title">
        전적 <button onClick={onClose}>✕</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>이름</th>
            <th>점수</th>
            <th>지지율</th>
          </tr>
        </thead>
        <tbody>
          {room.seats.map((s) => (
            <tr key={s.seat} className={s.seat === room.me.seat ? 'me' : ''}>
              <td>{s.nickname}</td>
              <td>{s.money}</td>
              <td>{((s.money * 100) / total).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WaitingRoom({ room }: { room: RoomView }) {
  const host = room.me.isHost;
  const humans = room.seats.filter((s) => s.occupant === 'human').length;
  return (
    <div className="waiting">
      <div className="waiting-banner">
        <span className="waiting-tag">대기실</span>
        <h1 className="waiting-title">{room.name}</h1>
        <div className="waiting-sub">
          {room.preset.name} · {room.seats.length}명 · 사람 {humans}명 · 봇 {botLevelName(room.botLevel)} · 차례 {TURN_CHOICES.find(([s]) => s === room.turnSeconds)?.[1]}
        </div>
      </div>
      <div className="waiting-main">
        <div className="seat-table">
          {room.seats.map((s) => (
            <div key={s.seat} className={`seat-card ${s.occupant} ${s.playerId === room.me.playerId ? 'me' : ''}`} data-seat={s.seat}>
              <div className="seat-no">{s.seat + 1}</div>
              <div className="seat-avatar">{s.occupant === 'human' ? '🙂' : s.occupant === 'bot' ? '🤖' : ''}</div>
              <div className="seat-name">
                {s.occupant === 'empty' ? '빈자리' : s.nickname}
                {s.playerId === room.hostId && <span className="crown"> 👑</span>}
              </div>
              <div className="seat-actions">
                {s.occupant === 'empty' && room.me.seat === null && <button onClick={() => send({ t: 'sit', seat: s.seat })}>앉기</button>}
                {host && s.occupant === 'empty' && <button onClick={() => send({ t: 'addBot', seat: s.seat })}>봇 추가</button>}
                {host && s.occupant === 'bot' && <button onClick={() => send({ t: 'removeBot', seat: s.seat })}>봇 빼기</button>}
                {host && s.occupant === 'human' && s.playerId !== room.me.playerId && (
                  <button onClick={() => send({ t: 'kick', playerId: s.playerId! })}>내보내기</button>
                )}
              </div>
            </div>
          ))}
        </div>
        {room.spectators.length > 0 && <p className="spectators">관전: {room.spectators.map((s) => s.nickname).join(', ')}</p>}
        {host ? (
          <div className="host-controls panel-dark">
            <h3>방장 설정</h3>
            <label>
              규칙 <PresetSelect value={room.presetId} onChange={(presetId) => send({ t: 'setRoom', presetId })} />
            </label>
            <label>
              차례 제한 시간 <TurnSelect value={room.turnSeconds} onChange={(turnSeconds) => send({ t: 'setRoom', turnSeconds })} /> <span className="hint">(주공 정리는 4배)</span>
            </label>
            <label>
              봇 수준 <BotLevelSelect value={room.botLevel ?? 'normal'} onChange={(botLevel) => send({ t: 'setRoom', botLevel })} />
            </label>
            <PresetInfo presetId={room.presetId} />
            <button className="primary big" onClick={() => send({ t: 'start' })}>
              게임 시작 (빈자리는 봇으로)
            </button>
          </div>
        ) : (
          <div className="host-controls panel-dark">
            <h3>규칙: {room.preset.name}</h3>
            <PresetInfo presetId={room.presetId} />
            <p className="wait-msg">방장이 시작하기를 기다리는 중…</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 서버 시스템 안내(방 소식, 판 시작·당선·프렌드·결과 등)를 음성으로 읽는다 (음성 설정에서 종류별로 끌 수 있음).
 * 방에 들어올 때 받은 지난 대화는 읽지 않고, 그 뒤에 새로 온 시스템 줄만 본다.
 */
function useRoomNewsVoice(room: RoomView) {
  const myName = useNet().me?.nickname;
  const last = useRef<{ at: number; text: string } | null | undefined>(undefined);
  useEffect(() => {
    const lines = room.chat;
    const prev = last.current;
    last.current = lines.length ? { at: lines[lines.length - 1].at, text: lines[lines.length - 1].text } : null;
    if (prev === undefined) return; // 처음 그릴 때(지난 대화)는 조용히
    // 지난번 마지막 줄 다음부터가 새 줄 (못 찾으면 그 시각 이후 줄만)
    let k = -1;
    if (prev) for (let j = lines.length - 1; j >= 0; j--) if (lines[j].at === prev.at && lines[j].text === prev.text) { k = j; break; }
    const fresh = prev && k < 0 ? lines.filter((l) => l.at > prev.at) : lines.slice(k + 1);
    for (const l of fresh) {
      const v = l.from === null ? voiceForSystemLine(l.text, myName) : null;
      if (!v) continue;
      // 누가 들어온 것은 게임 중에도 꼭 들리게: 초인종 소리 + 다른 말보다 먼저, 크게
      if (/입장했습니다$/.test(v.text)) {
        sfx('join');
        const text = v.text;
        setTimeout(() => speak('room', text, { urgent: true, volume: 0.9 }), 650); // 딩동 뒤에 말
      } else speak(v.kind, v.text);
    }
  }, [room.chat, myName]);
}

const CHAT_SIZE_KEY = 'mighty.chatSize';

/**
 * 게임판 위에 떠 있는 채팅 창. 모서리 손잡이로 크기를 바꾸고, 크기는 이 브라우저에 저장한다.
 * 보통은 왼쪽 아래에 붙어 있어 손잡이가 오른쪽 위, 6마는 왼쪽 위에 있어 손잡이가 오른쪽 아래.
 */
function ChatWindow({ room, fromTop, onClose }: { room: RoomView; fromTop: boolean; onClose: () => void }) {
  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHAT_SIZE_KEY) ?? '');
      if (Number.isFinite(s.w) && Number.isFinite(s.h)) return s;
    } catch {
      /* 저장된 크기 없음 */
    }
    return { w: 210, h: 195 };
  });
  const win = useRef<HTMLDivElement>(null);
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, ...size };
    const area = win.current?.parentElement?.getBoundingClientRect();
    const maxW = (area?.width ?? 800) - 16;
    const maxH = (area?.height ?? 600) - 48;
    let last = size;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - start.y;
      last = {
        w: Math.round(Math.min(maxW, Math.max(160, start.w + ev.clientX - start.x))),
        h: Math.round(Math.min(maxH, Math.max(110, fromTop ? start.h + dy : start.h - dy))),
      };
      setSize(last);
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      localStorage.setItem(CHAT_SIZE_KEY, JSON.stringify(last));
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  };
  return (
    <div className="float-window chat-window" ref={win} style={{ width: size.w, height: size.h }}>
      <div className="float-title">
        채팅 <button onClick={onClose}>✕</button>
      </div>
      <Chat room={room} />
      <div className={`resize-grip ${fromTop ? 'bottom' : 'top'}`} onPointerDown={startResize} title="끌어서 크기 바꾸기" />
    </div>
  );
}

/** 마지막 조작(스크롤·입력) 뒤 이만큼 아무것도 안 하면 가장 최근 줄로 내려간다 */
const CHAT_IDLE_MS = 3000;

function Chat({ room }: { room: RoomView }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const lastTouch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 새 줄이 오거나 조작이 끝나면, 조작 뒤 3초가 지났을 때 맨 아래로 (지난 대화를 읽는 중에는 끌어내리지 않음)
  const followLatest = () => {
    clearTimeout(timer.current);
    const wait = CHAT_IDLE_MS - (Date.now() - lastTouch.current);
    const toBottom = () => box.current?.scrollTo(0, box.current.scrollHeight);
    if (wait <= 0) toBottom();
    else timer.current = setTimeout(toBottom, wait);
  };
  const touched = () => {
    lastTouch.current = Date.now();
    followLatest();
  };
  useEffect(followLatest, [room.chat.length]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="chat">
      <div className="lines" ref={box} onWheel={touched} onTouchMove={touched} onPointerDown={touched} onKeyDown={touched}>
        {room.chat.map((l, i) => (
          <div key={i} className={l.from ? 'line' : 'line system'}>
            {l.from && <b>{l.from}: </b>}
            {l.text}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send({ t: 'chat', text });
          setText('');
          lastTouch.current = 0; // 내가 보낸 줄은 바로 보이게
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="채팅" maxLength={200} name="chat" />
      </form>
    </div>
  );
}

export function useRoom() {
  return useNet().room;
}
