import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const rulesStart = html.indexOf('const W=');
const rulesEnd = html.indexOf('const AI=', rulesStart);

if (!html.includes('<meta charset="utf-8">') || !html.includes('const W=') ||
    !html.includes('function resolveTurn()') || !html.includes('</script>')) {
  throw new Error('새 턴제 전투 화면이 올바르지 않습니다.');
}
if (rulesStart < 0 || rulesEnd < 0) {
  throw new Error('새 전투 규칙을 찾지 못했습니다.');
}

await stat(resolve(root, 'assets/battle/grassland.png'));
await mkdir(resolve(root, 'dist'), { recursive: true });
await cp(resolve(root, 'assets'), resolve(root, 'dist/assets'), { recursive: true });
await writeFile(resolve(root, 'dist/index.html'), html, 'utf8');
await writeFile(resolve(root, 'src/turn-rules.generated.js'),
  `${html.slice(rulesStart, rulesEnd)}\nexport { W, C, PEAKS, initialBoard, boardDistance, boardMove, stanceMultiplier };\n`, 'utf8');
console.log('싱글플레이 화면과 공통 PvP 카드 규칙을 배포용으로 빌드했습니다.');

