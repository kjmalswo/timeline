import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { DB, Battle } from '../src/game-engine.generated.js';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

test('배포 HTML은 읽을 수 있는 한글과 실행 가능한 스크립트를 포함한다', () => {
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /거리와 예고의 결투/);
  assert.doesNotMatch(html, /�|嫄곕━/);
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test('여섯 무기 프리셋이 유효한 8장 덱을 제공한다', () => {
  const data = runInNewContext(`${script.slice(0, script.indexOf('function go('))}; ({ W, C, PEAKS })`);
  assert.equal(Object.keys(data.W).length, 6);
  for (const [id, weapon] of Object.entries(data.W)) {
    assert.equal(weapon.deck.length, 8, id);
    for (const card of weapon.deck) assert.ok(data.C[card], `${id}: ${card}`);
    assert.ok(weapon.hp > 0 && weapon.power > 0 && weapon.guard > 0);
  }
  const peaks = data.PEAKS.flatMap(branch => branch.items);
  for (const peak of peaks) if (peak.req) assert.ok(peaks.some(item => item.id === peak.req));
});

test('기존 멀티플레이 서버 코어와 화면에 필요한 이미지가 배포된다', async () => {
  assert.ok(DB.setup.presets.length > 0);
  assert.equal(typeof Battle.makeActor, 'function');
  const images = ['grassland.png', 'standard/idle.png', 'standard/attack-1.png',
    'standard/hit-1.png', 'p2/standard/idle.png', 'p2/standard/attack-1.png',
    'p2/standard/hit-1.png'];
  for (const image of images) {
    const bytes = await readFile(new URL(`../dist/assets/battle/${image}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG', image);
  }
});

