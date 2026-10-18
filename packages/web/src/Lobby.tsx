import { PRESETS, describePreset } from '@mighty/engine';
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

export function TurnSelect({ value, onChange, disabled }: { value: number; onChange: (s: number) => void; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} name="turnSeconds">
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
  const rooms = net.lobby?.rooms ?? [];
  return (
    <div className="lobby">
      <header>
        <h1>마이티</h1>
        <span>
          {net.me?.nickname}님 · 접속 {net.lobby?.online ?? 0}명
        </span>
      </header>
      <div className="lobby-body">
        <section>
          <h2>방 목록</h2>
          {rooms.length === 0 && <p className="hint">열린 방이 없습니다. 방을 만들어 보세요.</p>}
          <table className="rooms">
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.presetName}</td>
                  <td>
                    사람 {r.humans} · 봇 {r.bots} / {r.players}
                    {r.spectators > 0 && ` · 관전 ${r.spectators}`}
                  </td>
                  <td>{r.status === 'playing' ? '게임 중' : '대기 중'}</td>
                  <td>
                    <button onClick={() => send({ t: 'joinRoom', roomId: r.id })}>{r.status === 'playing' ? '관전' : '입장'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="create">
          <h2>방 만들기</h2>
          <label>
            방 이름 <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${net.me?.nickname}님의 방`} maxLength={20} name="roomName" />
          </label>
          <label>
            규칙 <PresetSelect value={presetId} onChange={setPresetId} />
          </label>
          <PresetInfo presetId={presetId} />
          <label>
            차례 제한 시간 <TurnSelect value={turnSeconds} onChange={setTurnSeconds} />
          </label>
          <button className="primary" onClick={() => send({ t: 'createRoom', name, presetId, turnSeconds })}>
            방 만들기
          </button>
        </section>
      </div>
    </div>
  );
}
