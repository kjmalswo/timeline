import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('공격과 상대 피격 프레임은 같은 순간 시작된다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const core = script.slice(0, script.lastIndexOf("$$('[data-go]')"));
  const timers = [];
  function actor() {
    const img = { src: '' };
    return { img, children: [], querySelector: () => img,
      classList: { add() {}, remove() {} },
      appendChild(child) { this.children.push(child); } };
  }
  const p1 = actor(), p2 = actor();
  const document = {
    querySelector: selector => ({ '#p1': p1, '#p2': p2 })[selector],
    createElement: () => ({ className: '', textContent: '', remove() {} })
  };
  const context = vm.createContext({ document, setTimeout: (fn, ms) => timers.push({ fn, ms }) });
  vm.runInContext(core, context);
  vm.runInContext("state.weapon='standard'; animateStrike('p',5)", context);
  assert.match(p1.img.src, /standard\/attack-1\.png$/);
  assert.match(p2.img.src, /p2\/standard\/hit-1\.png$/);
  assert.ok(timers.some(timer => timer.ms === 160));
  vm.runInContext("animateStrike('e',5)", context);
  assert.match(p2.img.src, /p2\/standard\/attack-1\.png$/);
  assert.match(p1.img.src, /standard\/hit-1\.png$/);
});

