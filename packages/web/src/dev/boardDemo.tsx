// 개발용 화면 데모: 서버 없이 고정 상태(dev/fixtures/*.json)를 그대로 그린다.
// 화면 정리 전후 비교, 디자인 작업에 쓴다. 고정 상태는 server/scripts/fixtures.ts 로 다시 만든다.
import type { RoomView } from '@mighty/protocol';
import { createRoot } from 'react-dom/client';
import { RoomScreen } from '../Room.js';
import '../styles/index.css';

const fixtures = import.meta.glob<RoomView>('../../dev/fixtures/*.json', { eager: true, import: 'default' });
const byName = Object.fromEntries(Object.entries(fixtures).map(([path, room]) => [path.split('/').pop()!.replace('.json', ''), room]));
const name = new URLSearchParams(location.search).get('f') ?? '';
const room = byName[name];

createRoot(document.getElementById('root')!).render(
  room ? (
    <RoomScreen room={room} />
  ) : (
    <div className="center-box">
      <h1>화면 데모</h1>
      {Object.keys(byName)
        .sort()
        .map((n) => (
          <p key={n}>
            <a href={`?f=${n}`}>{n}</a>
          </p>
        ))}
    </div>
  ),
);
