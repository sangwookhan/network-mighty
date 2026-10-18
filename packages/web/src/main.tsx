import { createRoot } from 'react-dom/client';
import { Lobby, NicknameScreen } from './Lobby.js';
import { useNet } from './net.js';
import { RoomScreen } from './Room.js';
import './style.css';

function App() {
  const net = useNet();
  let body;
  if (net.outdated)
    body = (
      <div className="center-box">
        <h1>마이티</h1>
        <p>새 버전이 나왔습니다. 새로고침해 주세요.</p>
        <button className="primary" onClick={() => location.reload()}>
          새로고침
        </button>
      </div>
    );
  else if (!net.me) body = <NicknameScreen />;
  else if (net.room) body = <RoomScreen room={net.room} />;
  else body = <Lobby />;
  return (
    <>
      {!net.connected && net.me && <div className="banner">서버와 연결이 끊겼습니다. 다시 연결하는 중…</div>}
      {net.notice && <div className="notice">{net.notice}</div>}
      {body}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
