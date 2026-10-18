import { createRoot } from 'react-dom/client';
import { Lobby, NicknameScreen } from './Lobby.js';
import { useNet } from './net.js';
import { RoomScreen } from './Room.js';
import './style.css';

function App() {
  const net = useNet();
  let body;
  if (!net.me) body = <NicknameScreen />;
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
