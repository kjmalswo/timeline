import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('피해 숫자와 빗나감 문구가 대상 캐릭터 안에서 생성되고 새 전투에 남지 않는다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('(function boot(){'));
  const actors = Object.fromEntries(['P', 'E'].map(side => [side, {
    children: [],
    querySelectorAll() { return this.children.filter(child => child.className.startsWith('battle-float')); },
    appendChild(child) { this.children.push(child); child.parent = this; }
  }]));
  const document = {
    querySelector(selector) {
      return actors[selector.match(/data-actor="([PE])"/)?.[1]] || null;
    },
    querySelectorAll() { return Object.values(actors).flatMap(actor => actor.children); },
    createElement() {
      return {
        className: '', textContent: '', style: {}, addEventListener() {},
        remove() {
          if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
        }
      };
    }
  };
  const context = vm.createContext({ document, setTimeout() {} });
  vm.runInContext(script, context);
  vm.runInContext(`
    Battle.st = { floatSeq: 2, floatEvents: [
      { seq: 1, side: 'E', kind: 'damage', value: 24 },
      { seq: 2, side: 'E', kind: 'miss' }
    ] };
    UI.playCombatFloats();
  `, context);
  assert.deepEqual(actors.P.children, []);
  assert.deepEqual(actors.E.children.map(child => child.textContent), ['24', '빗나감!']);
  assert.deepEqual(actors.E.children.map(child => child.className),
    ['battle-float damage', 'battle-float miss']);
  assert.notEqual(actors.E.children[0].style.top, actors.E.children[1].style.top);

  vm.runInContext('Battle.st = { floatSeq: 0, floatEvents: [] }; UI.playCombatFloats();', context);
  assert.deepEqual(actors.E.children, []);
});
