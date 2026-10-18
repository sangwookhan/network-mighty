// 서버 진입점: HTTP(웹 클라이언트) + WebSocket(/ws) 을 포트 하나로 제공한다.
// 개발 모드는 Vite 를 미들웨어로 붙이고, 운영 모드는 packages/web/dist 를 정적으로 제공한다.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Hub } from './hub.js';

const PORT = Number(process.env.PORT ?? 3000);
const PROD = process.env.NODE_ENV === 'production';
const webRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../web');

const hub = new Hub();

// 마지막 안전망: 처리되지 않은 오류로 서버 전체가 죽지 않게 로그만 남긴다
process.on('uncaughtException', (e) => console.error('[server] 처리되지 않은 오류:', e));
process.on('unhandledRejection', (e) => console.error('[server] 처리되지 않은 거부:', e));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function main() {
  let handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void;
  if (PROD) {
    const dist = join(webRoot, 'dist');
    handler = (req, res) => {
      const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
      let file = join(dist, path);
      if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
      res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    };
  } else {
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({ root: webRoot, server: { middlewareMode: true }, appType: 'spa' });
    handler = (req, res) => vite.middlewares(req, res);
  }

  const server = createServer((req, res) => handler(req, res));
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws) => {
    const session = hub.connect({
      send: (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)),
      close: () => ws.close(),
    });
    ws.on('message', (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      try {
        session.onMessage(msg);
      } catch (e) {
        console.error('message error', e);
      }
    });
    ws.on('close', () => session.onClose());
  });

  server.listen(PORT, () => console.log(`마이티 서버: http://localhost:${PORT} (${PROD ? '운영' : '개발'} 모드)`));
}

main();
