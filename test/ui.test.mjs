import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('실전 튜토리얼을 끝까지 진행해도 저장은 유지되고 이동·공격 프레임이 재생된다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const nodes = new Map(), frames = [];
  function makeNode(id) {
    const classes = new Set(), img = {};
    Object.defineProperty(img, 'src', { set: value => frames.push(value) });
    return { id, style: {}, dataset: {}, innerHTML: '', textContent: '',
      classList: { toggle: (k, v) => v ? classes.add(k) : classes.delete(k),
        contains: k => classes.has(k), add: k => classes.add(k), remove: k => classes.delete(k) },
      querySelector: () => img, appendChild() {}, addEventListener() {}, scrollIntoView() {},
      getBoundingClientRect: () => ({ top: 200 }) };
  }
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector, makeNode(selector.slice(1))); return nodes.get(selector); };
  const screens = ['title', 'multi', 'tutorial', 'settings', 'setup', 'battle', 'result'].map(id => node('#' + id));
  const saved = '{"saved":true}', db = new Map([['timeline_turn_save_v1', saved]]);
  const storage = { getItem: key => db.get(key) || null, setItem: (key, value) => db.set(key, value), removeItem: key => db.delete(key) };
  class ImageMock { set src(value) { this.onload?.(); } }
  const context = vm.createContext({
    document: { querySelector: node, querySelectorAll: selector => selector === '.screen' ? screens : [],
      body: makeNode('body'), documentElement: { style: {} }, createElement: () => ({ remove() {} }) },
    localStorage: storage, sessionStorage: storage, Image: ImageMock, window: { innerHeight: 900 },
    setTimeout: callback => { callback(); return 0; }
  });
  const api = vm.runInContext(script + '\n({state,Tutorial,resolveTurn,startBattle,Net})', context);
  api.Tutorial.start();
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
  assert.equal(db.get('timeline_turn_save_v1'), saved);
  for (const motion of ['advance', 'retreat', 'attack', 'hit'])
    assert.ok(frames.some(path => path.endsWith(`/${motion}-1.png`)), motion);
  api.state.deck = ['step', 'step', 'back2'];
  api.startBattle();
  assert.equal((node('#hand').innerHTML.match(/data-card=/g) || []).length, 2);
  assert.match(node('#round').textContent, /현재 턴 1/);
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

