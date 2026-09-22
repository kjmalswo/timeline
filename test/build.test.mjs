import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DB, Battle } from '../src/game-engine.generated.js';

test('빌드가 전투 화면과 서버 전투 규칙을 생성한다', async () => {
  const [html, engine, worker] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/game-engine.generated.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /THE TIMELINE/);
  assert.match(html, /UI\.playBattleMotion/);
  assert.match(html, /혼자 테스트하는 임시방/);
  assert.match(engine, /export \{DB,U,Battle\}/);
  assert.match(worker, /message\.type === 'start'/);
});

test('모든 1남자 무기에 대기·전진·후퇴·공격·피격 프레임이 빠짐없이 배포된다', async () => {
  assert.deepEqual(Object.keys(DB.visual.weapons).sort(),
    Object.keys(DB.weapons).sort());
  const expected = { idle: 1, advance: 3, retreat: 3, attack: 2, hit: 2 };
  for (const [weaponId, weapon] of Object.entries(DB.visual.weapons)) {
    for (const [motionId, count] of Object.entries(expected)) {
      const motion = weapon.motions[motionId];
      assert.ok(motion, `${weaponId}/${motionId} 동작 누락`);
      assert.equal(motion.frames.length, count, `${weaponId}/${motionId} 프레임 수`);
      assert.equal(motion.footOffsets.length, count, `${weaponId}/${motionId} 발 위치 수`);
      if (motionId !== 'idle') {
        assert.equal(motion.frameMs * count, DB.visual.scene.movementMs,
          `${weaponId}/${motionId} 재생시간`);
      }
      for (const frame of motion.frames) {
        const png = await readFile(new URL(`../dist/${frame}`, import.meta.url));
        assert.equal(png.subarray(1, 4).toString(), 'PNG', frame);
      }
    }
  }
  assert.equal(DB.visual.weapons.standard.motions.advance.scale, 0.89);
});

function makeActor(side) {
  const preset = DB.setup.presets[0];
  return Battle.makeActor(side, {
    name: side, hp: 72, hpMax: 72,
    stamina: DB.balance.resource.staminaStart,
    staminaMax: DB.setup.base.stamina,
    staminaRegen: DB.balance.resource.staminaRegenPerTick,
    focus: 0, focusMax: DB.setup.base.focus,
    stance: DB.stanceStart, techs: preset.techs,
    traits: [], weapon: preset.weapon, chains: preset.chains,
    sigils: preset.sigils, milestones: [], controller: 'human'
  });
}

function startBattle() {
  const zones = { ...DB.visual.scene.zones.start };
  Battle.st = {
    tick: 0, distance: 2, actors: { P: makeActor('P'), E: makeActor('E') },
    queue: [], reactions: [], log: [], seq: 0, visualEvents: [],
    visual: { seq: 0, side: null, motion: 'idle', zones,
      coords: Battle.zoneCoords(zones) },
    over: false, winner: null
  };
}

test('이동과 공격·피격 동작이 순서대로 기록된다', () => {
  startBattle();
  assert.equal(Battle.basic('P', 'approach'), true);
  assert.equal(Battle.st.visualEvents.at(-1).motion, 'advance');
  assert.equal(Battle.st.visual.fromCoords.P, 30);
  assert.equal(Battle.st.visual.zones.E - Battle.st.visual.zones.P,
    Battle.st.distance);

  assert.equal(Battle.useTech('P', 'pierce', false), true);
  assert.equal(Battle.st.visualEvents.at(-1).motion, 'attack');
  const queued = Battle.st.queue.find(q => q.status === 'pending');
  if (queued) Battle.advanceTo(queued.resolveAt);
  assert.equal(Battle.st.visualEvents.at(-1).motion, 'hit');
  assert.deepEqual(Battle.st.visualEvents.slice(-2).map(event => event.motion),
    ['attack', 'hit']);
  assert.deepEqual(Battle.st.visualEvents.slice(-2).map(event => event.seq),
    [2, 3]);
});
