import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('기동 룬, 접근 방어, 거리 표시가 같은 거리 규칙을 사용한다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const core = script.slice(0, script.lastIndexOf("$$('[data-go]')"));
  const nodes = { '#p1': { style: {} }, '#p2': { style: {} } };
  const context = vm.createContext({ document: { querySelector: selector => nodes[selector] } });
  vm.runInContext(core, context);
  const result = vm.runInContext(`
    state.weapon='shortblade'; state.peaks=['stride'];
    state.battle={round:1,distance:7,p:{keep:0},e:{keep:0}};
    const dash=effective('dash','p');
    applyMove(dash,'p');
    const afterDash=state.battle.distance;
    state.battle.e.keep=2;
    applyMove(effective('shadow','p'),'p');
    const afterKeep=state.battle.distance;
    placeFighters();
    ({dash:dash.move,afterDash,afterKeep,guard:effective('guardStep','p').block});
  `, context);
  assert.equal(result.dash, -3);
  assert.equal(result.afterDash, 4);
  assert.equal(result.afterKeep, 3);
  assert.equal(result.guard, 8);
  const near = parseFloat(nodes['#p1'].style.left);
  vm.runInContext('state.battle.distance=8;placeFighters()', context);
  assert.ok(near > parseFloat(nodes['#p1'].style.left));
});

