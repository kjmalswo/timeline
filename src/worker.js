import { DB, Battle, U } from './game-engine.generated.js';

const CONFIG = {
  roomCodeLength: 6,
  roomAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  maxNameLength: 18,
  maxMessageBytes: 8192,
  rateWindowMs: 10_000,
  maxMessagesPerWindow: 35,
  disconnectGraceMs: 30_000,
  waitingTtlMs: 30 * 60_000,
  finishedTtlMs: 5 * 60_000,
  botDelayMs: 450
};

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const errorResponse = (message, status = 400) => json({ message }, status);

function cleanName(value) {
  return String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, CONFIG.maxNameLength);
}

function validPreset(id) {
  return DB.setup.presets.some((preset) => preset.id === id) ? id : DB.setup.presets[0].id;
}

function normalizeBuild(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const uniqueIds = (items, table) => {
    if (!Array.isArray(items) || items.some((id) => typeof id !== 'string' || !table[id])) return null;
    const unique = [...new Set(items)];
    return unique.length === items.length ? unique : null;
  };
  const weapon = typeof value.weapon === 'string' && DB.weapons[value.weapon] ? value.weapon : null;
  const techs = uniqueIds(value.techs, DB.techs);
  const sigils = uniqueIds(value.sigils, DB.sigils);
  const chains = uniqueIds(value.chains, DB.chains);
  const traits = uniqueIds(value.traits, DB.traits);
  const hp = Number(value.hp);
  const stamina = Number(value.stamina);
  const focus = Number(value.focus);
  if (!weapon || !techs || !sigils || !chains || !traits) return null;
  if (![hp, stamina, focus].every(Number.isInteger)) return null;
  const setup = DB.setup;
  if (techs.length < setup.minTechs || techs.length > setup.maxTechs ||
      sigils.length > DB.sigilSlots || chains.length > DB.chainSlots ||
      hp < 0 || hp > setup.maxStep.hp || stamina < 0 || stamina > setup.maxStep.stamina ||
      focus < 0 || focus > setup.maxStep.focus) return null;
  const perStance = {};
  for (const id of techs) {
    const stance = DB.techs[id].stance;
    perStance[stance] = (perStance[stance] || 0) + 1;
    if (perStance[stance] > DB.balance.slots.perStanceBase) return null;
  }
  const techCost = (id) => {
    const tier = DB.techs[id].tier;
    return tier === 'rare' ? setup.cost.techRare : tier === 'common' ? setup.cost.techCommon : setup.cost.techBase;
  };
  const spent = (setup.cost.weapon[weapon] || 0) + techs.reduce((sum, id) => sum + techCost(id), 0) +
    sigils.length * setup.cost.sigil + chains.length * setup.cost.chain + traits.length * setup.cost.trait +
    hp * setup.cost.hpStep + stamina * setup.cost.staminaStep + focus * setup.cost.focusStep;
  if (spent > setup.points) return null;
  return { weapon, techs, sigils, chains, traits, hp, stamina, focus };
}

function makeToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
}

function makeRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CONFIG.roomCodeLength));
  return [...bytes].map((value) => CONFIG.roomAlphabet[value % CONFIG.roomAlphabet.length]).join('');
}

function swapSide(side) {
  return side === 'P' ? 'E' : side === 'E' ? 'P' : side;
}

async function readJson(request) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > CONFIG.maxMessageBytes) throw new Error('요청이 너무 크다.');
  return request.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'the-timeline-pvp' });

    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      let body;
      try { body = await readJson(request); } catch (error) { return errorResponse(error.message); }
      const name = cleanName(body.name);
      if (!name) return errorResponse('표시 이름을 입력해 달라.');
      const build = body.build == null ? null : normalizeBuild(body.build);
      if (body.build != null && !build) return errorResponse('덱 구성이 올바르지 않다.');
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = makeRoomCode();
        const id = env.GAME_ROOMS.idFromName(code);
        const response = await env.GAME_ROOMS.get(id).fetch('https://room.internal/create', {
          method: 'POST', body: JSON.stringify({ code, name, preset: validPreset(body.preset), build, test: body.test === true })
        });
        if (response.status === 409) continue;
        return response;
      }
      return errorResponse('방 코드를 만들 수 없다. 잠시 후 다시 시도해 달라.', 503);
    }

    const join = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/join$/);
    if (request.method === 'POST' && join) {
      let body;
      try { body = await readJson(request); } catch (error) { return errorResponse(error.message); }
      const name = cleanName(body.name);
      if (!name) return errorResponse('표시 이름을 입력해 달라.');
      const build = body.build == null ? null : normalizeBuild(body.build);
      if (body.build != null && !build) return errorResponse('덱 구성이 올바르지 않다.');
      const code = join[1];
      const id = env.GAME_ROOMS.idFromName(code);
      return env.GAME_ROOMS.get(id).fetch('https://room.internal/join', {
        method: 'POST', body: JSON.stringify({ code, name, preset: validPreset(body.preset), build })
      });
    }

    const socket = url.pathname.match(/^\/ws\/([A-Z2-9]{6})$/);
    if (socket) {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return errorResponse('WebSocket 연결이 필요하다.', 426);
      const id = env.GAME_ROOMS.idFromName(socket[1]);
      return env.GAME_ROOMS.get(id).fetch(request);
    }

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return errorResponse('경로를 찾지 못했다.', 404);
    // Always resolve the site root explicitly. This prevents a Worker/static
    // asset deployment from treating the Worker source as a downloadable file.
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const indexUrl = new URL('/index.html', request.url);
      return env.ASSETS.fetch(new Request(indexUrl, request));
    }
    return env.ASSETS.fetch(request);
  }
};

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.meta = null;
    this.game = null;
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      [this.meta, this.game] = await Promise.all([
        this.ctx.storage.get('meta'),
        this.ctx.storage.get('game')
      ]);
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.hostname === 'room.internal' && url.pathname === '/create') return this.create(await request.json());
    if (url.hostname === 'room.internal' && url.pathname === '/join') return this.join(await request.json());
    if (url.pathname.startsWith('/ws/')) return this.connect(request);
    return errorResponse('방 요청을 찾지 못했다.', 404);
  }

  async create(body) {
    if (this.meta) return errorResponse('이미 사용 중인 방 코드다.', 409);
    const token = makeToken();
    this.meta = {
      code: body.code,
      status: 'waiting',
      reason: '',
      players: {
        P: { token, name: body.name, preset: validPreset(body.preset), build: body.build || null, bot: false }
      },
      disconnectDeadlines: {},
      waitingExpiresAt: Date.now() + CONFIG.waitingTtlMs,
      cleanupAt: 0,
      botDueAt: 0,
      turn: null
    };
    if (body.test) {
      this.meta.players.E = { token: '', name: '테스트 봇', preset: 'counterblade', bot: true };
      this.startGame();
    }
    await this.persist();
    await this.scheduleAlarm();
    return json({ code: this.meta.code, token, status: this.meta.status }, 201);
  }

  async join(body) {
    if (!this.meta || this.meta.status !== 'waiting' || this.meta.players.E) return errorResponse('입장 가능한 방을 찾지 못했다.', 404);
    const token = makeToken();
    this.meta.players.E = { token, name: body.name, preset: validPreset(body.preset), build: body.build || null, bot: false };
    await this.persist();
    await this.scheduleAlarm();
    this.broadcastRoom(`${body.name}님이 입장했습니다.`);
    return json({ code: this.meta.code, token, status: this.meta.status });
  }

  async connect(request) {
    if (!this.meta) return errorResponse('방이 만료되었거나 존재하지 않는다.', 404);
    const token = new URL(request.url).searchParams.get('token') || '';
    const side = ['P', 'E'].find((candidate) => this.meta.players[candidate]?.token === token);
    if (!side) return errorResponse('방 접속 정보가 올바르지 않다.', 403);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const previous = this.socketForSide(side);
    if (previous) previous.close(4001, '다른 연결에서 재접속함');
    this.ctx.acceptWebSocket(server, [side]);
    server.serializeAttachment({ side, token, rateStarted: Date.now(), rateCount: 0 });
    delete this.meta.disconnectDeadlines[side];
    await this.persist();
    await this.advanceGame();
    return new Response(null, { status: 101, webSocket: client });
  }

  socketForSide(side) {
    return this.ctx.getWebSockets(side).find((socket) => socket.readyState === 1);
  }

  isConnected(side) {
    const player = this.meta?.players?.[side];
    return Boolean(player && (player.bot || this.socketForSide(side)));
  }

  allConnected() {
    return ['P', 'E'].every((side) => this.isConnected(side));
  }

  send(socket, payload) {
    try { if (socket?.readyState === 1) socket.send(JSON.stringify(payload)); } catch (error) {}
  }

  roomPlayers() {
    return ['P', 'E'].map((side) => this.meta.players[side]).filter(Boolean).map((player, index) => ({
      name: player.name,
      connected: player.bot || this.isConnected(index === 0 ? 'P' : 'E'),
      bot: player.bot
    }));
  }

  stateForSide(side) {
    const view = structuredClone(this.game);
    if (side === 'P') return view;
    [view.actors.P, view.actors.E] = [view.actors.E, view.actors.P];
    view.actors.P.side = 'P';
    view.actors.E.side = 'E';
    view.queue.forEach((entry) => { entry.owner = swapSide(entry.owner); });
    view.reactions.forEach((entry) => { entry.owner = swapSide(entry.owner); });
    view.log.forEach((entry) => {
      if (entry.cls === 's') entry.cls = 'f';
      else if (entry.cls === 'f') entry.cls = 's';
    });
    view.winner = swapSide(view.winner);
    return view;
  }

  broadcastRoom(notice = '') {
    for (const side of ['P', 'E']) {
      const player = this.meta.players[side];
      if (!player || player.bot) continue;
      this.send(this.socketForSide(side), {
        type: 'room', code: this.meta.code, status: this.meta.status, players: this.roomPlayers(),
        youAreHost: side === 'P', notice
      });
    }
  }

  broadcastState() {
    if (!this.game) return this.broadcastRoom();
    const paused = !this.allConnected();
    for (const side of ['P', 'E']) {
      const player = this.meta.players[side];
      if (!player || player.bot) continue;
      const opponent = this.meta.players[swapSide(side)];
      this.send(this.socketForSide(side), {
        type: 'state',
        code: this.meta.code,
        status: this.meta.status,
        state: this.stateForSide(side),
        yourTurn: !paused && this.meta.turn === side,
        paused,
        reason: this.meta.reason,
        you: player.name,
        opponent: opponent?.name || '상대',
        players: this.roomPlayers()
      });
    }
  }

  withGame(callback) {
    const previous = Battle.st;
    Battle.st = this.game;
    try { return callback(); } finally { Battle.st = previous; }
  }

  actorFromPlayer(side, player) {
    const preset = DB.setup.presets.find((item) => item.id === player.preset) || DB.setup.presets[0];
    const build = player.build || { ...preset, traits: [] };
    const hp = DB.setup.base.hp + build.hp * DB.setup.step.hp;
    const actor = Battle.makeActor(side, {
      name: player.name,
      hp,
      hpMax: hp,
      stamina: DB.balance.resource.staminaStart,
      staminaMax: DB.setup.base.stamina + build.stamina * DB.setup.step.stamina,
      staminaRegen: DB.balance.resource.staminaRegenPerTick,
      focus: 0,
      focusMax: DB.setup.base.focus + build.focus * DB.setup.step.focus,
      stance: DB.stanceStart,
      techs: build.techs,
      traits: build.traits || [],
      weapon: build.weapon,
      chains: build.chains,
      sigils: build.sigils,
      milestones: [],
      controller: player.bot ? 'bot' : 'human'
    });
    actor.staminaRegen += Battle.traitSum(actor, 'staminaRegen');
    actor.stamina = U.clamp(actor.stamina, 0, actor.staminaMax);
    return actor;
  }

  startGame() {
    this.meta.status = 'playing';
    this.meta.waitingExpiresAt = 0;
    this.game = {
      tick: DB.balance.tick.start,
      distance: DB.balance.distance.start,
      actors: {
        P: this.actorFromPlayer('P', this.meta.players.P),
        E: this.actorFromPlayer('E', this.meta.players.E)
      },
      queue: [], reactions: [], log: [], seq: 0,
      over: false, winner: null, finished: false, tutorial: false
    };
    for (const side of ['P', 'E']) {
      if (!this.meta.players[side].bot && !this.isConnected(side)) {
        this.meta.disconnectDeadlines[side] = Date.now() + CONFIG.disconnectGraceMs;
      }
    }
    this.withGame(() => Battle.log('start', { foe: this.meta.players.E.name }, 'n'));
  }

  currentSide() {
    return this.game.actors.P.readyAt <= this.game.actors.E.readyAt ? 'P' : 'E';
  }

  async advanceGame() {
    if (!this.game) { this.broadcastRoom(); return; }
    if (this.game.over) { await this.finish(this.meta.reason || 'battle'); return; }
    if (!this.allConnected()) {
      this.meta.turn = null;
      await this.persist();
      this.broadcastState();
      return;
    }
    const side = this.currentSide();
    this.withGame(() => Battle.advanceTo(this.game.actors[side].readyAt));
    if (this.game.over) { await this.finish('battle'); return; }
    this.meta.turn = side;
    if (this.meta.players[side].bot) this.meta.botDueAt = Date.now() + CONFIG.botDelayMs;
    await this.persist();
    await this.scheduleAlarm();
    this.broadcastState();
  }

  async botAct(side) {
    if (!this.game || this.game.over || this.meta.turn !== side) return;
    this.withGame(() => {
      const actor = Battle.A(side);
      const damage = (tech) => (tech.onHit || []).filter((effect) => effect.k === 'damage')
        .reduce((sum, effect) => sum + effect.v, 0);
      const options = actor.techs.map((id) => DB.techs[id]).filter(Boolean).filter((tech) => {
        const need = Battle.transitionCost(actor, tech.stance) + Battle.effCost(actor, tech);
        const range = Battle.effRange(actor, tech);
        return actor.stamina >= need && this.game.distance >= range[0] && this.game.distance <= range[1]
          && damage(tech) > 0;
      }).sort((a, b) => damage(b) - damage(a));
      let acted = options.length ? Battle.useTech(side, options[0].id, false) : false;
      if (!acted) {
        const basic = DB.balance.basic;
        if (this.game.distance > 1 && actor.stamina >= Battle.moveCost(actor, basic.approach)) acted = Battle.basic(side, basic.approach.id);
        if (!acted) Battle.basic(side, basic.wait.id);
      }
    });
    this.meta.botDueAt = 0;
    this.meta.turn = null;
    await this.advanceGame();
  }

  async handleBuild(side, build, socket) {
    if (this.meta.status !== 'waiting' || this.game) return this.send(socket, { type: 'error', message: '대기방에서만 덱을 바꿀 수 있다.' });
    const normalized = normalizeBuild(build);
    if (!normalized) return this.send(socket, { type: 'error', message: '덱 구성이 올바르지 않다.' });
    this.meta.players[side].build = normalized;
    await this.persist();
    this.broadcastRoom(`${this.meta.players[side].name}님이 덱을 변경했습니다.`);
  }

  async handleStart(side, socket) {
    if (side !== 'P') return this.send(socket, { type: 'error', message: '방장만 게임을 시작할 수 있다.' });
    if (this.meta.status !== 'waiting' || this.game) return this.send(socket, { type: 'error', message: '이미 시작했거나 시작할 수 없는 방이다.' });
    if (!this.meta.players.E) return this.send(socket, { type: 'error', message: '상대가 입장한 뒤 시작할 수 있다.' });
    if (!this.allConnected()) return this.send(socket, { type: 'error', message: '두 플레이어의 연결을 확인해 달라.' });
    this.startGame();
    await this.advanceGame();
  }

  async handleAction(side, action, socket) {
    if (!this.game || this.meta.status !== 'playing' || this.game.over) return this.send(socket, { type: 'error', message: '진행 중인 전투가 없다.' });
    if (!this.allConnected()) return this.send(socket, { type: 'error', message: '상대의 재접속을 기다리는 중이다.' });
    if (this.meta.turn !== side) return this.send(socket, { type: 'error', message: '현재 행동권이 없다.' });
    if (!action || typeof action.kind !== 'string' || typeof action.id !== 'string') return this.send(socket, { type: 'error', message: '잘못된 행동 요청이다.' });

    let ok = false;
    this.withGame(() => {
      if (action.kind === 'stance') {
        if (!DB.stances.some((stance) => stance.id === action.id)) return;
        ok = Battle.changeStance(side, action.id);
      } else if (action.kind === 'tech') ok = Battle.useTech(side, action.id, action.empowered === true);
      else if (action.kind === 'basic') ok = Battle.basic(side, action.id);
    });
    if (!ok) {
      this.send(socket, { type: 'error', message: '현재 상태에서는 그 행동을 사용할 수 없다.' });
      this.broadcastState();
      return;
    }
    if (action.kind === 'stance') {
      await this.persist();
      this.broadcastState();
    } else {
      this.meta.turn = null;
      await this.advanceGame();
    }
  }

  async webSocketMessage(socket, raw) {
    const attachment = socket.deserializeAttachment();
    if (!attachment || !this.meta?.players?.[attachment.side] || this.meta.players[attachment.side].token !== attachment.token) {
      socket.close(4003, '인증 정보가 올바르지 않음'); return;
    }
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > CONFIG.maxMessageBytes) {
      socket.close(1009, '메시지가 너무 큼'); return;
    }
    const now = Date.now();
    if (now - attachment.rateStarted > CONFIG.rateWindowMs) { attachment.rateStarted = now; attachment.rateCount = 0; }
    attachment.rateCount += 1;
    socket.serializeAttachment(attachment);
    if (attachment.rateCount > CONFIG.maxMessagesPerWindow) { socket.close(1008, '요청 제한'); return; }
    let message;
    try { message = JSON.parse(raw); } catch (error) { this.send(socket, { type: 'error', message: '요청 형식이 올바르지 않다.' }); return; }
    if (message.type === 'build') await this.handleBuild(attachment.side, message.build, socket);
    else if (message.type === 'start') await this.handleStart(attachment.side, socket);
    else if (message.type === 'action') await this.handleAction(attachment.side, message.action, socket);
    else if (message.type === 'forfeit') await this.forfeit(attachment.side, 'forfeit');
    else if (message.type === 'leave') await this.leave(attachment.side, socket);
    else this.send(socket, { type: 'error', message: '지원하지 않는 요청이다.' });
  }

  async webSocketClose(socket) {
    await this.socketEnded(socket);
  }

  async webSocketError(socket) {
    await this.socketEnded(socket);
  }

  async socketEnded(socket) {
    const attachment = socket.deserializeAttachment();
    const side = attachment?.side;
    if (!side || !this.meta || this.meta.players[side]?.bot || this.meta.status === 'finished') return;
    if (this.socketForSide(side)) return;
    this.meta.disconnectDeadlines[side] = Date.now() + CONFIG.disconnectGraceMs;
    this.meta.turn = null;
    await this.persist();
    await this.scheduleAlarm();
    if (this.game) this.broadcastState(); else this.broadcastRoom();
  }

  async leave(side, socket) {
    if (this.meta.status === 'playing' && !this.game.over) await this.forfeit(side, 'forfeit');
    else if (this.meta.status === 'waiting' && side === 'E') {
      const name = this.meta.players.E?.name || '2P';
      delete this.meta.players.E;
      delete this.meta.disconnectDeadlines.E;
      await this.persist();
      await this.scheduleAlarm();
      this.broadcastRoom(`${name}님이 퇴장했습니다.`);
    } else if (this.meta.status === 'waiting') await this.reset();
    try { socket.close(1000, '방 나가기'); } catch (error) {}
  }

  async forfeit(losingSide, reason) {
    if (!this.game || this.game.over) return;
    this.game.over = true;
    this.game.winner = swapSide(losingSide);
    await this.finish(reason);
  }

  async finish(reason) {
    this.meta.status = 'finished';
    this.meta.reason = reason;
    this.meta.turn = null;
    this.meta.botDueAt = 0;
    this.meta.cleanupAt = Date.now() + CONFIG.finishedTtlMs;
    await this.persist();
    await this.scheduleAlarm();
    this.broadcastState();
  }

  async persist() {
    const writes = [this.ctx.storage.put('meta', this.meta)];
    if (this.game) writes.push(this.ctx.storage.put('game', this.game));
    await Promise.all(writes);
  }

  async scheduleAlarm() {
    if (!this.meta) return;
    const times = [this.meta.waitingExpiresAt, this.meta.cleanupAt, this.meta.botDueAt,
      ...Object.values(this.meta.disconnectDeadlines || {})].filter((value) => value > 0);
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    await this.ready;
    if (!this.meta) return;
    const now = Date.now();
    if (this.meta.status === 'waiting' && this.meta.waitingExpiresAt && this.meta.waitingExpiresAt <= now) {
      await this.reset(); return;
    }
    if (this.meta.status === 'finished' && this.meta.cleanupAt && this.meta.cleanupAt <= now) {
      await this.reset(); return;
    }
    if (this.meta.status === 'playing') {
      for (const side of ['P', 'E']) {
        const deadline = this.meta.disconnectDeadlines[side];
        if (deadline && deadline <= now && !this.isConnected(side)) { await this.forfeit(side, 'disconnect'); return; }
        if (this.isConnected(side)) delete this.meta.disconnectDeadlines[side];
      }
      if (this.meta.botDueAt && this.meta.botDueAt <= now) { await this.botAct(this.meta.turn); return; }
    }
    await this.persist();
    await this.scheduleAlarm();
  }

  async reset() {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.close(1000, '방 만료'); } catch (error) {}
    }
    this.meta = null;
    this.game = null;
    await this.ctx.storage.deleteAll();
  }
}
