import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const engine = await readFile(resolve(root, 'src/game-engine.generated.js'), 'utf8');

if (!html.includes('<meta charset="utf-8">') || !html.includes('const W=') ||
    !html.includes('function resolveTurn()') || !html.includes('</script>')) {
  throw new Error('새 턴제 전투 화면이 올바르지 않습니다.');
}
if (!engine.includes('export {DB,U,Battle}')) {
  throw new Error('기존 멀티플레이 서버의 전투 코어가 없습니다.');
}

await stat(resolve(root, 'assets/battle/grassland.png'));
await mkdir(resolve(root, 'dist'), { recursive: true });
await cp(resolve(root, 'assets'), resolve(root, 'dist/assets'), { recursive: true });
await writeFile(resolve(root, 'dist/index.html'), html, 'utf8');
console.log('새 싱글플레이 화면과 기존 멀티플레이 서버를 배포용으로 빌드했습니다.');

