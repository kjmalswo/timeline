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

test('2남자 무기 프레임과 무작위 전투 배경이 모두 배포된다', async () => {
  const expected = { idle: 1, advance: 3, retreat: 3, attack: 2, hit: 2 };
  for (const weaponId of ['standard', 'longblade', 'shortblade', 'greatblade', 'twinblade', 'polearm']) {
    const weapon = DB.visual.fighters.p2[weaponId];
    assert.ok(weapon, `2남자 ${weaponId} 누락`);
    for (const [motionId, count] of Object.entries(expected)) {
      assert.equal(weapon.motions[motionId].frames.length, count);
      for (const frame of weapon.motions[motionId].frames) {
        assert.match(frame, new RegExp(`^assets/battle/p2/${weaponId}/`));
        const png = await readFile(new URL(`../dist/${frame}`, import.meta.url));
        assert.equal(png.subarray(1, 4).toString(), 'PNG', frame);
      }
    }
  }
  assert.notEqual(DB.visual.fighters.p2.greatblade, DB.visual.fighters.p2.standard);
  assert.deepEqual(DB.visual.scene.backgrounds.map(item => item.id),
    ['grassland', 'city', 'dock', 'desert', 'alley']);
  for (const backdrop of DB.visual.scene.backgrounds) {
    const png = await readFile(new URL(`../dist/${backdrop.src}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', backdrop.src);
  }
});

test('멀티 2P 시점은 오른쪽 배치를 유지하고 적 동작도 재생한다', async () => {
  const [html, worker] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(worker, /view\.viewRight = side === 'E'/);
  assert.match(html, /UI\.displayCoord=function\(value\).*100-value/);
  assert.doesNotMatch(html, /battle-actor\.foe>img[^}]*scaleX\(-1\)/);
  assert.doesNotMatch(html, /event\.side===DB\.meta\.sides\.FOE &&/);
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
    queue: [], reactions: [], log: [], seq: 0, floatSeq: 0, floatEvents: [], visualEvents: [],
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

test('거리 제한이 없는 기술은 무기 사거리 보정에도 모든 칸에서 사용된다', () => {
  for (const tech of Object.values(DB.techs).filter(t => t.range[0] === 0 && t.range[1] === 4)) {
    assert.deepEqual(Battle.effRange({ mods: { rangeMin: 1, rangeMax: -1 } }, tech), [0, 4], tech.id);
  }
  assert.deepEqual(Battle.effRange({ mods: { rangeMax: 1 } }, DB.techs.pierce), [1, 3]);
});

test('실제 체력 피해와 사거리 밖 빗나감이 피격 캐릭터에 연결된다', () => {
  startBattle();
  const foe = Battle.A('E');
  foe.statuses.guard = 4;
  Battle.dealDamage(foe, 11, false, 'P');
  assert.equal(foe.hp, 65);
  assert.deepEqual({ ...Battle.st.floatEvents[0] },
    { seq: 1, side: 'E', kind: 'damage', value: 7 });

  Battle.st.distance = 4;
  Battle.resolveEntry({ status: 'pending', owner: 'P', name: '찌르기',
    range: [1, 2], onHit: [{ k: 'damage', v: 7 }] });
  assert.deepEqual({ ...Battle.st.floatEvents[1] },
    { seq: 2, side: 'E', kind: 'miss', value: undefined });

  foe.statuses.guard = 100;
  Battle.dealDamage(foe, 5, false, 'P');
  assert.equal(Battle.st.floatEvents.length, 2, '체력 피해가 없으면 숫자를 띄우지 않는다');

  startBattle();
  const lowHpFoe = Battle.A('E');
  lowHpFoe.hp = 3;
  Battle.dealDamage(lowHpFoe, 99, true, 'P');
  assert.equal(Battle.st.floatEvents[0].value, 3, '남은 체력을 초과한 피해는 실제 감소량만 표시한다');
});
