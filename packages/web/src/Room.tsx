import type { RoomView } from '@mighty/protocol';
import { useEffect, useRef, useState } from 'react';
import { Board } from './board/Board.js';
import { PresetInfo, PresetSelect, TURN_CHOICES, TurnSelect } from './Lobby.js';
import { send, useNet } from './net.js';

export function RoomScreen({ room }: { room: RoomView }) {
  const [showChat, setShowChat] = useState(() => window.innerWidth > 900);
  const [showScore, setShowScore] = useState(() => window.innerWidth > 900);
  const playing = room.status === 'playing' && room.game;
  return (
    <div className="room">
      <header className="menu-bar">
        <b>{room.name}</b>
        <span>
          {room.preset.name} · 차례 {TURN_CHOICES.find(([s]) => s === room.turnSeconds)?.[1]}
        </span>
        <span className="spacer" />
        {playing && (room.me.seat !== null || room.me.isHost) && (
          <button className={room.paused ? 'pause-btn on' : 'pause-btn'} onClick={() => send({ t: 'pause', paused: !room.paused })}>
            {room.paused ? '▶ 다시 시작' : '❚❚ 일시정지'}
          </button>
        )}
        {playing && <button onClick={() => setShowScore((v) => !v)}>전적</button>}
        {playing && <button onClick={() => setShowChat((v) => !v)}>채팅</button>}
        {room.me.seat !== null && <button onClick={() => send({ t: 'standUp' })}>일어나기</button>}
        <button onClick={() => send({ t: 'leaveRoom' })}>나가기</button>
      </header>
      {playing ? (
        <div className={`room-play players-${room.seats.length}`}>
          <Board room={room} game={room.game!} />
          {showScore && <Scoreboard room={room} onClose={() => setShowScore(false)} />}
          {showChat && (
            <div className="float-window chat-window">
              <div className="float-title">
                채팅 <button onClick={() => setShowChat(false)}>✕</button>
              </div>
              <Chat room={room} />
            </div>
          )}
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
          {room.preset.name} · {room.seats.length}명 · 사람 {humans}명 · 차례 {TURN_CHOICES.find(([s]) => s === room.turnSeconds)?.[1]}
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
              차례 제한 시간 <TurnSelect value={room.turnSeconds} onChange={(turnSeconds) => send({ t: 'setRoom', turnSeconds })} />
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

function Chat({ room }: { room: RoomView }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight);
  }, [room.chat.length]);
  return (
    <div className="chat">
      <div className="lines" ref={box}>
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
