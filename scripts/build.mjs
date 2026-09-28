import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const worker = await readFile(resolve(root, 'src/worker.js'), 'utf8');

if (!html.includes('<meta charset="utf-8">') || !html.includes('id="createRoom"') ||
    !html.includes('id="joinRoom"') || !worker.includes('export class GameRoom') ||
    !worker.includes('async webSocketMessage') || !worker.includes('setAlarm')) {
  throw new Error('두뇌 서바이벌 화면 또는 실시간 방 서버를 찾지 못했습니다.');
}

const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'index.html'), html, 'utf8');
console.log('TIMELINE 두뇌 서바이벌을 배포용으로 빌드했습니다.');
