import { W, C, PEAKS, initialBoard, boardMove, stanceMultiplier } from './turn-rules.generated.js';

const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const other = side => side === 'P' ? 'E' : 'P';
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const fail = (message, status = 400) => json({ message }, status);

function validBuild(value) {
  if (!value || !W[value.weapon] || !Array.isArray(value.deck) || value.deck.length !== 8 ||
      value.deck.some(id => typeof id !== 'string' || !C[id]) ||
      !Array.isArray(value.peaks) || value.peaks.length > 3 ||
      new Set(value.peaks).size !== value.peaks.length) return null;
  const all = PEAKS.flatMap(branch => branch.items);
  if (value.peaks.some(id => !all.some(peak => peak.id === id))) return null;
  if (value.peaks.some(id => { const peak = all.find(item => item.id === id); return peak.req && !value.peaks.includes(peak.req); })) return null;
  return { weapon: value.weapon, deck: value.deck.slice(), peaks: value.peaks.slice() };
}

function bonuses(build) {
  const out = { hp: 0, power: 0, guard: 0, move: 0, early: 0, finish: 0 };
  PEAKS.flatMap(branch => branch.items).filter(item => build.peaks.includes(item.id))
    .forEach(item => Object.entries(item.mod).forEach(([key, value]) => { out[key] += value; }));
  return out;
}

function cardFor(id, build, round) {
  const card = { ...C[id] }, mod = bonuses(build), weapon = W[build.weapon];
  if (card.dmg) card.dmg += weapon.power + mod.power;
  if (card.block) card.block += weapon.guard + mod.guard;
  if (card.move) card.move += Math.sign(card.move) * mod.move;
  card.cast = Math.max(0, (card.cast || 0) - (round <= 3 ? mod.early : 0));
  return card;
}

function newGame(players) {
  const make = side => {
    const build = players[side].build, weapon = W[build.weapon], hp = weapon.hp + bonuses(build).hp;
    return { hp, max: hp, weapon: build.weapon, block: 0, keep: 0, stance: 'mid' };
  };
  const distance = clamp(Math.round((W[players.P.build.weapon].start + W[players.E.build.weapon].start) / 2), 0, 4);
  const board = initialBoard(distance);
  return { version: 3, round: 1, turn: 'P', distance, positions: { P: board.p, E: board.e },
    actors: { P: make('P'), E: make('E') }, pending: { P: null, E: null },
    events: [], seq: 0, log: '방장 턴부터 시작합니다. 각자 자신의 턴에 한 장씩 행동합니다.', over: false, winner: null };
}

function resolveActorTurn(game, players, side, chosen) {
  const actor = game.actors[side], foe = other(side), target = game.actors[foe];
  actor.block = 0;
  actor.keep = 0;
  let id = chosen, pending = game.pending[side], event;
  if (pending) {
    id = pending.id;
    pending.ticks -= 1;
    if (pending.ticks > 0) event = { side, id, kind: 'countdown', ticks: pending.ticks, damage: 0, hit: false };
    else game.pending[side] = null;
  }
  if (!event) {
    const card = cardFor(id, players[side].build, game.round);
    actor.stance = card.stance || card.line || actor.stance;
    if (!pending && card.cast > 0) {
      game.pending[side] = { id, ticks: card.cast };
      event = { side, id, kind: 'forecast', ticks: card.cast, damage: 0, hit: false };
    } else {
      actor.block = card.block || 0;
      actor.keep = card.keep || 0;
      const before = game.distance;
      game.distance = boardMove(game.positions, side, foe, card, target.keep || 0);
      if (target.keep && (card.move < 0 || card.set != null)) target.keep = 0;
      let damage = 0, hit = false;
      if (card.dmg && game.distance >= card.range[0] && game.distance <= card.range[1]) {
        hit = true;
        let raw = card.dmg;
        const finish = bonuses(players[side].build).finish;
        if (finish && target.hp <= target.max * .4) raw += finish;
        raw = Math.round(raw * stanceMultiplier(card.line, target.stance));
        damage = Math.min(target.hp, Math.max(0, raw - target.block));
        target.hp -= damage;
      }
      event = { side, id, kind: 'resolve', damage, hit, landed: hit, attack: !!card.dmg,
        moved: before !== game.distance, moveDirection: game.distance < before ? 'advance' : 'retreat', distance: game.distance, positions: { ...game.positions },
        movement: card.move || card.set != null ? ` · 거리 ${before}→${game.distance}칸${before === game.distance ? ' (거리 한계 또는 방어)' : ''}` : '' };
    }
  }
  game.events = [event];
  game.seq += 1;
  game.log = `${players[side].name}: ${C[id].name}${event.kind === 'forecast' || event.kind === 'countdown' ? ` 예고 · ${event.ticks}틱 남음` : event.hit ? ` (${event.damage} 피해)` : C[id].dmg ? ' (빗나감)' : ''}`;
  game.log += event.movement || '';
  if (game.actors.P.hp <= 0 || game.actors.E.hp <= 0) {
    game.over = true;
    game.winner = game.actors.P.hp > 0 ? 'P' : 'E';
  } else {
    if (side === 'E') game.round += 1;
    game.turn = foe;
  }
  return event;
}

function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(value => letters[value % letters.length]).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, rules: 'turn-duel-v2' });
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      let body;
      try { body = await request.json(); } catch { return fail('요청 형식이 올바르지 않습니다.'); }
      const name = String(body.name || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18);
      const build = validBuild(body.build);
      if (!name || !build) return fail('이름과 8장 덱 구성을 확인해 주세요.');
      for (let i = 0; i < 20; i++) {
        const code = roomCode(), id = env.GAME_ROOMS.idFromName(code);
        const response = await env.GAME_ROOMS.get(id).fetch('https://room.internal/create', {
          method: 'POST', body: JSON.stringify({ code, name, build, test: body.test === true })
        });
        if (response.status !== 409) return response;
      }
      return fail('방 코드를 만들 수 없습니다.', 503);
    }
    const join = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/join$/);
    if (request.method === 'POST' && join) {
      let body;
      try { body = await request.json(); } catch { return fail('요청 형식이 올바르지 않습니다.'); }
      const name = String(body.name || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18);
      const build = validBuild(body.build);
      if (!name || !build) return fail('이름과 8장 덱 구성을 확인해 주세요.');
      const id = env.GAME_ROOMS.idFromName(join[1]);
      return env.GAME_ROOMS.get(id).fetch('https://room.internal/join', {
        method: 'POST', body: JSON.stringify({ name, build })
      });
    }
    const socket = url.pathname.match(/^\/ws\/([A-Z2-9]{6})$/);
    if (socket) {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return fail('WebSocket 연결이 필요합니다.', 426);
      return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(socket[1])).fetch(request);
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return fail('경로를 찾을 수 없습니다.', 404);
    if (url.pathname === '/' || url.pathname === '/index.html')
      return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
    return env.ASSETS.fetch(request);
  }
};

export class GameRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.meta = null;
    this.game = null;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      [this.meta, this.game] = await Promise.all([ctx.storage.get('meta'), ctx.storage.get('game')]);
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.hostname === 'room.internal' && url.pathname === '/create') return this.create(await request.json());
    if (url.hostname === 'room.internal' && url.pathname === '/join') return this.join(await request.json());
    if (url.pathname.startsWith('/ws/')) return this.connect(request);
    return fail('방을 찾을 수 없습니다.', 404);
  }

  async save() {
    await Promise.all([this.ctx.storage.put('meta', this.meta), this.ctx.storage.put('game', this.game)]);
  }

  async create(body) {
    if (this.meta) return fail('이미 사용 중인 코드입니다.', 409);
    const token = crypto.randomUUID() + crypto.randomUUID();
    this.meta = { code: body.code, status: 'waiting', expires: Date.now() + 30 * 60_000,
      players: { P: { name: body.name, token, build: body.build, bot: false } } };
    if (body.test) {
      const build = { weapon: 'standard', deck: W.standard.deck.slice(), peaks: [] };
      this.meta.players.E = { name: '테스트 봇', token: '', build, bot: true };
      this.start();
    }
    await this.save();
    await this.ctx.storage.setAlarm(this.meta.expires);
    return json({ code: body.code, token, status: this.meta.status }, 201);
  }

  async join(body) {
    if (!this.meta || this.meta.status !== 'waiting' || this.meta.players.E) return fail('입장할 수 없는 방입니다.', 404);
    const token = crypto.randomUUID() + crypto.randomUUID();
    this.meta.players.E = { name: body.name, token, build: body.build, bot: false };
    await this.save();
    this.broadcast();
    return json({ code: this.meta.code, token, status: this.meta.status });
  }

  socket(side) {
    return this.ctx.getWebSockets(side).find(socket => socket.readyState === 1);
  }

  connected(side) {
    return Boolean(this.meta.players[side]?.bot || this.socket(side));
  }

  async connect(request) {
    if (!this.meta) return fail('방이 만료되었습니다.', 404);
    const token = new URL(request.url).searchParams.get('token');
    const side = ['P', 'E'].find(item => this.meta.players[item]?.token === token);
    if (!side || !token) return fail('방 접속 정보가 올바르지 않습니다.', 403);
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    const previous = this.socket(side);
    if (previous) previous.close(4001, '새 연결');
    this.ctx.acceptWebSocket(server, [side]);
    server.serializeAttachment({ side, token });
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  send(side, message) {
    try { this.socket(side)?.send(JSON.stringify(message)); } catch {}
  }

  players() {
    return ['P', 'E'].filter(side => this.meta.players[side]).map(side => ({
      name: this.meta.players[side].name, connected: this.connected(side), bot: this.meta.players[side].bot
    }));
  }

  stateFor(side) {
    const game = this.game, mine = game.actors[side], foe = game.actors[other(side)];
    const positions = side === 'P' ? { p: game.positions.P, e: game.positions.E } :
      { p: 6 - game.positions.E, e: 6 - game.positions.P };
    return { round: game.round, tick: game.seq + 1, distance: game.distance,
      turn: game.turn === side ? 'p' : 'e', positions,
      p: { hp: mine.hp, max: mine.max, weapon: mine.weapon, stance: mine.stance },
      e: { hp: foe.hp, max: foe.max, weapon: foe.weapon, stance: foe.stance },
      pending: { p: game.pending[side], e: game.pending[other(side)] },
      seq: game.seq, events: game.events.map(event => ({ ...event, side: event.side === side ? 'p' : 'e',
        positions: !event.positions ? null : side === 'P' ? { p: event.positions.P, e: event.positions.E } :
          { p: 6 - event.positions.E, e: 6 - event.positions.P } })),
      log: game.log, over: game.over, winner: game.winner ? (game.winner === side ? 'p' : 'e') : null };
  }

  broadcast() {
    for (const side of ['P', 'E']) {
      const player = this.meta.players[side];
      if (!player || player.bot) continue;
      this.send(side, { type: this.game ? 'state' : 'room', code: this.meta.code,
        status: this.meta.status, players: this.players(), isHost: side === 'P',
        build: player.build, you: player.name, opponent: this.meta.players[other(side)]?.name || '상대',
        state: this.game?.version === 3 ? this.stateFor(side) : null });
    }
  }

  start() {
    this.meta.status = 'playing';
    this.game = newGame(this.meta.players);
  }

  async webSocketMessage(socket, raw) {
    await this.ready;
    const auth = socket.deserializeAttachment(), side = auth?.side;
    if (!side || this.meta?.players[side]?.token !== auth.token) return socket.close(4003, '인증 실패');
    if (typeof raw !== 'string' || raw.length > 8192) return socket.close(1009, '요청이 너무 큽니다.');
    let message;
    try { message = JSON.parse(raw); } catch { return this.send(side, { type: 'error', message: '요청 형식이 올바르지 않습니다.' }); }
    if (message.type === 'start') {
      if (side !== 'P' || this.meta.status !== 'waiting' || !this.meta.players.E || !this.connected('E'))
        return this.send(side, { type: 'error', message: '상대가 입장한 뒤 방장이 시작할 수 있습니다.' });
      this.start();
    } else if (message.type === 'action') {
      if (this.meta.status !== 'playing' || this.game?.version !== 3 || this.game.over || !this.connected(other(side)) || this.game.turn !== side)
        return this.send(side, { type: 'error', message: '현재 행동할 수 없습니다.' });
      const id = message.id;
      if (!this.game.pending[side] && !this.meta.players[side].build.deck.includes(id))
        return this.send(side, { type: 'error', message: '사용할 수 없는 카드입니다.' });
      const events = [resolveActorTurn(this.game, this.meta.players, side, id)];
      if (!this.game.over && this.meta.players[other(side)].bot && this.game.turn === other(side)) {
        const deck = this.meta.players[other(side)].build.deck;
        const botId = this.game.pending[other(side)] ? null : deck[Math.floor(Math.random() * deck.length)];
        events.push(resolveActorTurn(this.game, this.meta.players, other(side), botId));
      }
      this.game.events = events;
      if (this.game.over) { this.meta.status = 'finished'; this.meta.expires = Date.now() + 5 * 60_000; }
    } else if (message.type === 'forfeit') {
      if (this.game && !this.game.over) {
        this.game.over = true;
        this.game.winner = other(side);
        this.meta.status = 'finished';
        this.meta.expires = Date.now() + 5 * 60_000;
      }
    } else if (message.type === 'leave') {
      if (this.meta.status === 'waiting' && side === 'E') delete this.meta.players.E;
      else if (this.game && !this.game.over) {
        this.game.over = true;
        this.game.winner = other(side);
        this.meta.status = 'finished';
      }
      socket.close(1000, '방 나가기');
    }
    await this.save();
    await this.ctx.storage.setAlarm(this.meta.expires);
    this.broadcast();
  }

  async webSocketClose() { await this.ready; if (this.meta) this.broadcast(); }
  async webSocketError() { await this.ready; if (this.meta) this.broadcast(); }

  async alarm() {
    await this.ready;
    if (this.meta?.expires <= Date.now()) {
      for (const socket of this.ctx.getWebSockets()) try { socket.close(1000, '방 만료'); } catch {}
      this.meta = null;
      this.game = null;
      await this.ctx.storage.deleteAll();
    }
  }
}

