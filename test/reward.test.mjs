import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function container() {
  return {
    innerHTML: '',
    selectors: new Map(),
    querySelectorAll(selector) {
      if (this.selectors.has(selector)) return this.selectors.get(selector);
      const attr = selector.slice(1, -1);
      const nodes = [...this.innerHTML.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))]
        .map(match => ({ dataset: { [attr.slice(5)]: match[1] }, onclick: null }));
      this.selectors.set(selector, nodes);
      return nodes;
    }
  };
}

test('전투 보상 기술 카드를 누르면 습득하고, 슬롯이 가득 차면 교체할 수 있다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('(function boot(){'));
  const elements = new Map([['rwBody', container()], ['modalBox', container()]]);
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {});
    return elements.get(id);
  } };
  const context = vm.createContext({ document, setTimeout, clearTimeout });
  vm.runInContext(script, context);
  vm.runInContext(`
    Run.data = { techs: [], traits: [], weapon: DB.weaponStart,
      chains: [], sigils: [], milestones: [], parts: 0 };
    Run.rollTechs = () => ['pierce'];
    Run.rollChains = Run.rollSigils = Run.rollTraits = Run.rollWeapons = () => [];
    UI.showScreen = () => {};
    UI.modal = html => { document.getElementById('modalBox').innerHTML = html; };
    UI.closeModal = () => {};
    Run.advance = () => { Run.data.advanced = true; };
    UI.renderReward({ type: 'battle' });
  `, context);

  const reward = elements.get('rwBody');
  const pick = reward.querySelectorAll('[data-pick]')[0];
  assert.equal(pick.dataset.pick, 'pierce');
  assert.equal(typeof pick.onclick, 'function');
  pick.onclick();
  assert.deepEqual(Array.from(vm.runInContext('Run.data.techs', context)), ['pierce']);
  assert.equal(vm.runInContext('Run.data.advanced', context), true);

  reward.selectors.clear();
  vm.runInContext(`
    Run.data.techs = ['pierce', 'brace_mid', 'press'];
    Run.data.advanced = false;
    Run.rollTechs = () => ['intercept'];
    UI.renderReward({ type: 'battle' });
  `, context);
  reward.querySelectorAll('[data-pick]')[0].onclick();
  const replace = elements.get('modalBox').querySelectorAll('[data-rep]')[0];
  assert.equal(replace.dataset.rep, 'pierce');
  assert.equal(typeof replace.onclick, 'function');
  replace.onclick();
  assert.deepEqual(Array.from(vm.runInContext('Run.data.techs', context)),
    ['brace_mid', 'press', 'intercept']);
  assert.equal(vm.runInContext('Run.data.advanced', context), true);

  const rangeCard = vm.runInContext('UI.techCard("brace_mid", {compact:true})', context);
  assert.match(rangeCard, /0칸 · 가까움/);
  assert.match(rangeCard, /4칸 · 멂/);
  assert.equal((rangeCard.match(/class="on /g) || []).length, 5);
});
