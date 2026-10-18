import { PRESETS, describePreset } from '@mighty/engine';
import { BOT_LEVELS, type BotLevel } from '@mighty/protocol';
import { useEffect, useState } from 'react';
import { chooseNewNickname, continueAsLast, send, sendHello, takeBack, useNet } from './net.js';

export function NicknameScreen() {
  const net = useNet();
  const [name, setName] = useState(net.needNickname?.suggested ?? '');
  const suggested = net.needNickname?.suggested;
  useEffect(() => {
    if (suggested) setName((n) => n || suggested);
  }, [suggested]);
  // 새 창: 마지막으로 쓴 닉네임으로 계속할지
  if (net.choose) {
    return (
      <div className="center-box">
        <h1>마이티</h1>
        <p>이 브라우저에서 마지막으로 쓴 닉네임이 있습니다</p>
        <div className="choice">
          <button className="primary" onClick={continueAsLast}>
            {net.choose.nickname}님으로 계속
          </button>
          <button onClick={chooseNewNickname}>다른 닉네임으로 입장</button>
        </div>
        <p className="hint">계속하면 다른 창에서 열려 있던 {net.choose.nickname}님 화면은 이 창으로 넘어옵니다.</p>
      </div>
    );
  }
  // 같은 사람이 다른 창에서 접속해서 밀려남
  if (net.replaced) {
    return (
      <div className="center-box">
        <h1>마이티</h1>
        <p>
          <b>{net.replaced.nickname}</b>님이 다른 창에서 접속했습니다.
        </p>
        <div className="choice">
          <button className="primary" onClick={takeBack}>
            여기서 계속
          </button>
          <button onClick={chooseNewNickname}>다른 닉네임으로 입장</button>
        </div>
      </div>
    );
  }
  return (
    <div className="center-box">
      <h1>마이티</h1>
      <p>닉네임을 정하고 들어가세요</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) sendHello(name.trim());
        }}
      >
        <input autoFocus maxLength={12} value={name} onChange={(e) => setName(e.target.value)} placeholder="닉네임" name="nickname" />
        <button type="submit" disabled={!net.connected || !name.trim()}>
          입장
        </button>
      </form>
      {net.needNickname?.reason && <p className="error">{net.needNickname.reason}</p>}
      {!net.connected && <p className="hint">서버에 연결하는 중…</p>}
    </div>
  );
}

export function PresetInfo({ presetId }: { presetId: number }) {
  const d = describePreset(presetId);
  return (
    <div className="preset-info">
      <ul className="summary">
        {d.summary.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      {d.comparedTo && (
        <>
          <div className="diff-title">{d.comparedTo}와 다른 점</div>
          <ul className="diff">
            {d.differences.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function PresetSelect({ value, onChange, disabled }: { value: number; onChange: (id: number) => void; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} name="preset">
      {PRESETS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export const TURN_CHOICES = [
  [0, '제한 없음'],
  [30, '30초'],
  [60, '60초'],
  [90, '90초'],
  [120, '120초'],
] as const;

/** 봇 수준 고르기 (방 단위) */
export function BotLevelSelect({ value, onChange }: { value: BotLevel; onChange: (l: BotLevel) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as BotLevel)} name="botLevel" title={BOT_LEVELS.find((l) => l.id === value)?.hint}>
      {BOT_LEVELS.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name} — {l.hint}
        </option>
      ))}
    </select>
  );
}

export const botLevelName = (l: BotLevel | undefined) => BOT_LEVELS.find((x) => x.id === (l ?? 'normal'))!.name;

export function TurnSelect({ value, onChange, disabled }: { value: number; onChange: (s: number) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      name="turnSeconds"
      title="주공이 바닥패를 받고 정리할 때는 이 시간의 4배"
    >
      {TURN_CHOICES.map(([s, label]) => (
        <option key={s} value={s}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function Lobby() {
  const net = useNet();
  const [name, setName] = useState('');
  const [presetId, setPresetId] = useState(1);
  const [turnSeconds, setTurnSeconds] = useState(60);
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const rooms = net.lobby?.rooms ?? [];
  return (
    <div className="lobby felt">
      <header className="lobby-header">
        <h1>마이티</h1>
        <span className="who">
          <b>{net.me?.nickname}</b>님 · 접속 {net.lobby?.online ?? 0}명
        </span>
      </header>
      <div className="lobby-body">
        <section className="room-list">
          <h2>방 목록</h2>
          {rooms.length === 0 && <div className="empty-rooms">열린 방이 없습니다. 오른쪽에서 방을 만들어 보세요.</div>}
          <div className="room-cards">
            {rooms.map((r) => {
              const empty = Math.max(0, r.players - r.humans - r.bots);
              return (
                <div key={r.id} className={`room-card st-${r.status}`}>
                  <div className="room-card-top">
                    <span className="room-name">{r.name}</span>
                    <span className={`status-chip ${r.status}`}>{r.status === 'playing' ? '게임 중' : '대기 중'}</span>
                  </div>
                  <div className="room-card-mid">
                    <span className="preset-chip">{r.presetName}</span>
                    <span className={`level-chip ${r.botLevel ?? 'normal'}`}>봇 {botLevelName(r.botLevel)}</span>
                    <span className="seat-dots" title={`사람 ${r.humans} · 봇 ${r.bots} · 빈자리 ${empty}`}>
                      {Array.from({ length: r.humans }, (_, i) => <span key={`h${i}`} className="dot human" />)}
                      {Array.from({ length: r.bots }, (_, i) => <span key={`b${i}`} className="dot bot">🤖</span>)}
                      {Array.from({ length: empty }, (_, i) => <span key={`e${i}`} className="dot empty" />)}
                    </span>
                    {r.spectators > 0 && <span className="spect">관전 {r.spectators}</span>}
                  </div>
                  <button className="join" onClick={() => send({ t: 'joinRoom', roomId: r.id })}>
                    {r.status === 'playing' ? '관전하기' : empty > 0 || r.bots > 0 ? '입장하기' : '관전하기'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
        <section className="create panel-dark">
          <h2>방 만들기</h2>
          <label>
            방 이름 <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${net.me?.nickname}님의 방`} maxLength={20} name="roomName" />
          </label>
          <label>
            규칙 <PresetSelect value={presetId} onChange={setPresetId} />
          </label>
          <PresetInfo presetId={presetId} />
          <label>
            차례 제한 시간 <TurnSelect value={turnSeconds} onChange={setTurnSeconds} /> <span className="hint">(주공 정리는 4배)</span>
          </label>
          <label>
            봇 수준 <BotLevelSelect value={botLevel} onChange={setBotLevel} />
          </label>
          <button className="primary big" onClick={() => send({ t: 'createRoom', name, presetId, turnSeconds, botLevel })}>
            방 만들기
          </button>
        </section>
      </div>
    </div>
  );
}
