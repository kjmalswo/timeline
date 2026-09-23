import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('실전 튜토리얼을 끝까지 진행해도 저장은 유지되고 이동·공격 프레임이 재생된다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const nodes = new Map(), frames = [], timerDelays = [];
  function makeNode(id) {
    const classes = new Set(), img = {};
    Object.defineProperty(img, 'src', { set: value => frames.push(value) });
    return { id, style: {}, dataset: {}, innerHTML: '', textContent: '', children: [{ style: {} }, { style: {} }, { style: {} }, { style: {} }], removeAttribute() {},
      classList: { toggle: (k, v) => v ? classes.add(k) : classes.delete(k),
        contains: k => classes.has(k), add: k => classes.add(k), remove: k => classes.delete(k) },
      querySelector: () => img, appendChild() {}, addEventListener() {}, scrollIntoView() {},
      getBoundingClientRect: () => ({ left: 100, top: 200, right: 240, bottom: 250 }) };
  }
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector, makeNode(selector.slice(1))); return nodes.get(selector); };
  const screens = ['title', 'multi', 'tutorial', 'settings', 'setup', 'battle', 'reward', 'result'].map(id => node('#' + id));
  const saved = '{"saved":true}', db = new Map([['timeline_turn_save_v1', saved]]);
  const storage = { getItem: key => db.get(key) || null, setItem: (key, value) => db.set(key, value), removeItem: key => db.delete(key) };
  class ImageMock { set src(value) { this.onload?.(); } }
  const context = vm.createContext({
    document: { querySelector: node, querySelectorAll: selector => selector === '.screen' ? screens : [],
      body: makeNode('body'), documentElement: { style: {}, clientWidth: 1200, clientHeight: 900 }, createElement: () => ({ remove() {} }) },
    localStorage: storage, sessionStorage: storage, Image: ImageMock, window: { innerWidth: 1200, innerHeight: 900, addEventListener() {} },
    setTimeout: (callback, delay) => { timerDelays.push(delay); callback(); return 0; }
  });
  const api = vm.runInContext(script + '\n({state,settings,Tutorial,resolveTurn,startBattle,finish,takeReward,randomBackground,animateFrames,Net})', context);
  api.Tutorial.start();
  assert.equal(node('#tutorialShade').hidden, false);
  assert.equal(node('#tutorialShade').children[0].style.height, '193px');
  let count = 0;
  while (api.Tutorial.active && count++ < 30) {
    const step = api.Tutorial.steps[api.Tutorial.index];
    if (step.type === 'select') {
      assert.ok(api.Tutorial.canSelect(step.card));
      api.state.battle.selected = step.card;
      api.Tutorial.selected();
    } else if (step.type === 'resolve') await api.resolveTurn();
    else api.Tutorial.advance();
  }
  assert.equal(count, api.Tutorial.steps.length);
  assert.equal(api.Tutorial.active, false);
  assert.equal(node('#tutorialShade').hidden, true);
  assert.equal(db.get('timeline_turn_save_v1'), saved);
  for (const motion of ['advance', 'retreat', 'attack', 'hit'])
    assert.ok(frames.some(path => path.endsWith(`/${motion}-1.png`)), motion);
  api.state.deck = ['step', 'step', 'back2'];
  api.startBattle();
  assert.equal(api.state.battle.positions.p, 2);
  assert.equal(api.state.battle.positions.e, 4);
  assert.ok(api.state.battle.background);
  assert.notEqual(api.randomBackground(api.state.battle.background), api.state.battle.background);
  assert.match(node('#eForecast').innerHTML, /틱/);
  assert.ok(node('#eForecast').dataset.description);
  assert.match(node('#sceneBg').src, /assets\/battle\//);
  const beforeMotion = timerDelays.length;
  await api.animateFrames('p', ['attack-1', 'attack-2']);
  assert.deepEqual(timerDelays.slice(beforeMotion), [320, 320]);
  for (const motion of ['hit', 'advance', 'retreat'])
    await api.animateFrames('p', [`${motion}-1`, `${motion}-2`]);
  for (const motion of ['attack', 'hit', 'advance', 'retreat'])
    assert.ok(frames.includes(`assets/battle/standard/${motion}-1.png`), `1P ${motion}`);
  api.settings.speed = 'fast';
  const beforeFastMotion = timerDelays.length;
  await api.animateFrames('p', ['attack-1', 'attack-2']);
  assert.deepEqual(timerDelays.slice(beforeFastMotion), [240, 240]);
  api.settings.speed = 'normal';
  assert.equal((node('#hand').innerHTML.match(/data-card=/g) || []).length, 2);
  assert.match(node('#round').textContent, /현재 턴 1/);
  let previousBackground = api.state.battle.background;
  for (let stage = 1; stage < 10; stage++) {
    api.finish(true);
    assert.equal(api.state.run.stage, stage);
    assert.equal(api.state.run.rewardOptions.length, 3);
    const card = api.state.run.rewardOptions[0].id;
    api.takeReward(stage === 1 ? 0 : 2);
    if (stage === 1) assert.ok(api.state.deck.includes(card));
    assert.equal(api.state.run.stage, stage + 1);
    assert.notEqual(api.state.battle.background, previousBackground);
    previousBackground = api.state.battle.background;
  }
  assert.equal(api.state.battle.enemy.name, '시간의 수호자');
  api.finish(true);
  assert.equal(node('#result').classList.contains('active'), true);
  assert.equal(db.has('timeline_turn_save_v1'), false);
  api.startBattle();
  api.Net.build = { weapon: 'standard', deck: ['step', 'step', 'back2'], peaks: [] };
  await api.Net.receive({ type: 'state', state: {
    round: 1, tick: 2, seq: 1, turn: 'e', pending: { p: null, e: null },
    positions: { p: 1, e: 4 }, distance: 3,
    p: { hp: 92, max: 92, weapon: 'standard' }, e: { hp: 92, max: 92, weapon: 'standard' },
    events: [{ side: 'p', kind: 'resolve', moved: true, moveDirection: 'retreat',
      positions: { p: 1, e: 4 }, distance: 3, attack: false }], log: '후퇴'
  } });
  assert.match(node('#round').textContent, /현재 턴 2/);
  assert.equal(api.state.battle.busy, false);
  assert.equal(api.state.battle.turn, 'e');
});

test('싱글 승리 보상은 다음 단계로 이어지고 10단계는 보스전으로 끝난다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="reward"/);
  assert.match(html, /id="pForecast"/);
  assert.match(html, /id="eForecast"/);
  assert.doesNotMatch(html, /id="forecast"|id="intent"/);
  assert.match(html, /const ENCOUNTERS=\[/);
  assert.match(html, /boss=stage===10/);
  assert.match(html, /run\.stage\+\+/);
});

