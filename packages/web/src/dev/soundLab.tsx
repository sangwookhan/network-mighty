// 개발용: 카드 내는 소리 후보 들어 보기 (/sounds.html). 버튼을 누르면 그 소리를 한 번, '연속'은 한 트릭처럼 5번.
import { createRoot } from 'react-dom/client';
import { CARD_SOUNDS, currentCardSound, play, setCardSound, setSoundEnabled } from '../sound.js';
import '../styles/index.css';

const inGame = currentCardSound();
setSoundEnabled(true);
const once = (id: string) => (setCardSound(id), play('play'));
const trick = (id: string) => [0, 1, 2, 3, 4].forEach((i) => setTimeout(() => once(id), i * 450));

createRoot(document.getElementById('root')!).render(
  <div className="felt" style={{ padding: 24 }}>
    <h1>카드 내는 소리 후보</h1>
    <p>눌러서 들어 보세요. 마음에 드는 번호를 알려 주시면 그 소리로 바꿉니다.</p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
      {CARD_SOUNDS.map((c) => (
        <div key={c.id} className="panel-dark" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 17 }}>{c.name}</b>
            {c.id === inGame && <span className="status-chip waiting" style={{ marginLeft: 8 }}>지금 게임 소리</span>}
            <div style={{ color: '#dfd' }}>{c.desc}</div>
          </div>
          <button className="primary big" onClick={() => once(c.id)}>▶ 한 번</button>
          <button onClick={() => trick(c.id)}>연속 5번</button>
        </div>
      ))}
    </div>
  </div>,
);
