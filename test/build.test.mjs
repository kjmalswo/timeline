import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('정적 프론트와 공유 전투 엔진이 생성된다', async () => {
  const [html, engine] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/game-engine.generated.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /혼자 테스트하는 임시방/);
  assert.match(html, /\/api\/rooms/);
  assert.match(engine, /export \{DB,U,Battle\}/);
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
});
