import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { W, C, PEAKS } from '../src/turn-rules.generated.js';
import { GameRoom } from '../src/worker.js';

test('빌드 HTML에 이전 타이틀 메뉴와 정상 한글이 포함된다', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /THE TIMELINE/);
  for (const label of ['싱글플레이', '이어하기', '멀티플레이', '튜토리얼', '설정'])
    assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /�|嫄곕━/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test('싱글과 PvP가 공유하는 여섯 무기 프리셋은 유효한 8장 덱을 갖는다', () => {
  assert.equal(Object.keys(W).length, 6);
  for (const [id, weapon] of Object.entries(W)) {
    assert.equal(weapon.deck.length, 8, id);
    for (const card of weapon.deck) assert.ok(C[card], `${id}: ${card}`);
  }
  const peaks = PEAKS.flatMap(branch => branch.items);
  for (const peak of peaks) if (peak.req) assert.ok(peaks.some(item => item.id === peak.req));
});

test('공격·피격에 쓰는 양쪽 캐릭터 프레임이 배포된다', async () => {
  for (const id of Object.keys(W)) {
    for (const side of ['', 'p2/']) {
      for (const file of ['idle.png', 'attack-1.png', 'attack-2.png', 'hit-1.png', 'hit-2.png']) {
        const bytes = await readFile(new URL(`../dist/assets/battle/${side}${id}/${file}`, import.meta.url));
        assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `${side}${id}/${file}`);
      }
    }
  }
});

test('PvP 서버가 새 덱 규칙과 라운드 행동을 처리한다', async () => {
  const records = new Map(), sockets = [];
  const storage = {
    get: key => records.get(key), put: (key, value) => { records.set(key, value); },
    setAlarm: () => {}, deleteAll: () => records.clear()
  };
  const context = { storage, blockConcurrencyWhile: callback => callback(),
    getWebSockets: side => sockets.filter(socket => !side || socket.side === side) };
  const room = new GameRoom(context);
  await room.ready;
  const build = { weapon: 'standard', deck: W.standard.deck.slice(), peaks: ['stride'] };
  const created = await room.create({ code: 'ABC234', name: '1P', build });
  const joined = await room.join({ name: '2P', build });
  const pToken = (await created.json()).token, eToken = (await joined.json()).token;
  const socket = (side, token) => ({ side, readyState: 1, send() {},
    deserializeAttachment: () => ({ side, token }) });
  sockets.push(socket('P', pToken), socket('E', eToken));
  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'start' }));
  assert.equal(room.game.round, 1);
  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'action', id: 'step' }));
  assert.equal(room.game.round, 1, '양쪽 카드가 모일 때까지 대기');
  await room.webSocketMessage(sockets[1], JSON.stringify({ type: 'action', id: 'lunge' }));
  assert.equal(room.game.round, 2);
  assert.equal(room.game.events.length, 2);
});

