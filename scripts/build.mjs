import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const scriptStart = html.indexOf('<script>');
const aiMarker = html.indexOf('   [AI] 점수 기반 선택', scriptStart);
const cutoff = html.lastIndexOf('/*', aiMarker);

if (scriptStart < 0 || aiMarker < 0 || cutoff < 0) {
  throw new Error('index.html에서 전투 규칙 영역을 찾지 못했습니다.');
}

const core = html.slice(scriptStart + '<script>'.length, cutoff);
const generated = `/* 이 파일은 npm run build가 index.html에서 생성합니다. 직접 수정하지 마세요. */
const App={settings:{logDetail:'full',announce:false}};
const Ann={push(){},clear(){}};
const UI={flash(){},renderBattle(){},showScreen(){}};
const Run={difficulty:()=>({enemyHpMult:1,aiNoise:0})};
${core}
DB.meta.sideLabel={P:'1P',E:'2P'};
export {DB,U,Battle};
`;

await mkdir(resolve(root, 'src'), { recursive: true });
await mkdir(resolve(root, 'dist'), { recursive: true });
await cp(resolve(root, 'assets'), resolve(root, 'dist/assets'), { recursive: true });
await writeFile(resolve(root, 'src/game-engine.generated.js'), generated);
await writeFile(resolve(root, 'dist/index.html'), html);
console.log('Cloudflare Worker 빌드 파일을 생성했습니다.');
