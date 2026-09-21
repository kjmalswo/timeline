import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('정적 프론트와 공유 전투 엔진이 생성된다', async () => {
  const [html, engine, worker, battleAsset] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/game-engine.generated.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../dist/assets/battle/standard/idle.png', import.meta.url))
  ]);
  assert.match(html, /혼자 테스트하는 임시방/);
  assert.match(html, /\/api\/rooms/);
  assert.match(html, /입장 링크 복사/);
  assert.match(html, /덱 직접 설정/);
  assert.match(html, /type:'start'/);
  assert.match(html, /DB\.visual/);
  assert.match(html, /battle-scene/);
  assert.match(html, /\.battle-scene\{[^}]*height:clamp\(310px,43vh,430px\)/);
  assert.match(html, /\.battle-scene-bg\{[^}]*z-index:0/);
  assert.match(html, /UI\.pixelGauge/);
  assert.match(html, /P:\{ hp:'#32d66b'/);
  assert.match(html, /E:\{ hp:'#ff4f57'/);
  assert.doesNotMatch(html, /const track=`<div class="track"/, '거리 트랙은 캐릭터 위치로 대체됩니다.');
  assert.match(html, /startPositions:\{P:30,E:70\}/);
  assert.match(html, /panel&&panel\.parentNode!==el/);
  assert.match(html, /\.battle-scene \.battle-actor \.panel\{[^}]*top:var\(--hud-top/);
  assert.match(html, /\.battle-timeline \.tl-lane\{[^}]*background:transparent;box-shadow:none/);
  assert.doesNotMatch(html, /E:\[60,65,70,75,80\]/, '거리는 공통 위치 배열이 아닌 절대 좌표로 관리합니다.');
  assert.match(html, /assets\/battle\/standard\/advance-1\.png/);
  assert.match(worker, /message\.type === 'start'/);
  assert.match(worker, /normalizeBuild/);
  assert.match(engine, /export \{DB,U,Battle\}/);
  assert.equal(battleAsset.subarray(1, 4).toString(), 'PNG');
});

test('공유 엔진이 유효한 첫 행동을 처리한다', async () => {
  const { DB, Battle } = await import('../src/game-engine.generated.js');
  const preset = DB.setup.presets[0];
  const actor = (side) => Battle.makeActor(side, {
    name: side,
    hp: 72,
    hpMax: 72,
    stamina: DB.balance.resource.staminaStart,
    staminaMax: DB.setup.base.stamina,
    staminaRegen: DB.balance.resource.staminaRegenPerTick,
    focus: 0,
    focusMax: DB.setup.base.focus,
    stance: DB.stanceStart,
    techs: preset.techs,
    traits: [],
    weapon: preset.weapon,
    chains: preset.chains,
    sigils: preset.sigils,
    milestones: [],
    controller: 'human'
  });
  Battle.st = { tick: 0, distance: 2, actors: { P: actor('P'), E: actor('E') }, queue: [], reactions: [], log: [], seq: 0, over: false, winner: null };
  assert.equal(Battle.basic('P', 'wait'), true);
  assert.equal(Battle.st.actors.P.readyAt, 3);
  assert.equal(Battle.basic('P', 'approach'), true);
  assert.equal(Battle.st.visual.motion, 'advance');
  assert.equal(Battle.st.visual.side, 'P');
  assert.equal(Battle.st.visual.coords.P, 40);
  assert.equal(Battle.st.visual.coords.E, 70);
  assert.equal(Battle.basic('E', 'approach'), true);
  assert.equal(Battle.st.visual.coords.P, 40);
  assert.equal(Battle.st.visual.coords.E, 60);
});
