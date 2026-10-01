import { CHALLENGE_TYPES, TRAINING_TYPE_POOLS, TRAINING_CATEGORY_LABELS, TRAINING_TIPS,
  challengeDuration, makeChallenge as createChallenge, uniqueBidOutcome } from './challenges.js';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;
const FULL_INFO_TYPES = CHALLENGE_TYPES.filter(type => type !== 'uniqueBid');
const LIMITED_INFO_TYPES = ['uniqueBid'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const fail = (message, status = 400) => json({ message }, status);

function safeName(value) {
  return String(value || '').replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, 18);
}

function randomInt(max) {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return Math.floor((bytes[0] / 0x100000000) * max);
}

function randomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
}

function sample(items) { return items[randomInt(items.length)]; }
function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function makePlayers(meta) { return Object.values(meta.players); }
function activePlayers(meta) { return makePlayers(meta).filter(player => !player.eliminated); }
function chooseMainType(previous) { return sample(CHALLENGE_TYPES.filter(type => type !== previous)); }

function trainingCategory(type) {
  return Object.keys(TRAINING_TYPE_POOLS).find(category => TRAINING_TYPE_POOLS[category].includes(type)) || 'logic';
}
function trainingAverage(history, category) {
  const results = (history || []).filter(item => item.category === category && Number.isFinite(item.performance));
  return results.length ? results.reduce((sum, item) => sum + item.performance, 0) / results.length : null;
}
function trainingLevel(history, category) {
  const average = trainingAverage(history, category);
  if (average == null) return { label: '★★★★ · 실전 기본', multiplier: 1 };
  if (average < 0.45) return { label: '★★★ · 보완 집중 · 시간 여유', multiplier: 1.25 };
  if (average >= 0.85) return { label: '★★★★★ · 실전 도전', multiplier: 0.9 };
  return { label: '★★★★ · 실전 기본', multiplier: 1 };
}
function trainingDuration(type, history, category) {
  return Math.round(challengeDuration(type) * trainingLevel(history, category).multiplier);
}
function chooseTrainingType(history = []) {
  const categories = Object.keys(TRAINING_TYPE_POOLS);
  const previousType = history.at(-1)?.type;
  if (history.length < categories.length) {
    const uncovered = categories.filter(category => !history.some(item => item.category === category));
    const category = sample(uncovered);
    return sample(TRAINING_TYPE_POOLS[category].filter(type => type !== previousType));
  }
  const averages = categories.map(category => ({ category, average: trainingAverage(history, category) ?? 0 }));
  const weakest = Math.min(...averages.map(item => item.average));
  const previousCategory = history.at(-1)?.category;
  let candidates = averages.filter(item => item.average <= weakest + 0.12 && item.category !== previousCategory);
  if (!candidates.length) candidates = averages.filter(item => item.category !== previousCategory);
  const category = sample(candidates).category;
  const pool = TRAINING_TYPE_POOLS[category].filter(type => type !== previousType);
  return sample(pool.length ? pool : TRAINING_TYPE_POOLS[category]);
}
function makeChallenge(type, players) { return createChallenge(type, players, randomInt); }
function validateAnswer(game, playerId, value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const answer = String(value);
  return game.challenge.options.some(option => option.value === answer) ? answer : null;
}
function trainingPerformance(game, playerId) {
  const answer = game.submissions[playerId]?.answer;
  if (answer == null) return 0;
  if (game.challenge.type === 'uniqueBid') return Number(uniqueBidOutcome(game.challenge,game.submissions).winner?.id === playerId);
  return Number(String(answer) === String(game.challenge.solution));
}
function scoreChallenge(game, players) {
  const points = Object.fromEntries(players.map(player => [player.id, 0]));
  if (game.challenge.type === 'uniqueBid') {
    const winner = uniqueBidOutcome(game.challenge,game.submissions).winner;
    if (winner && Object.hasOwn(points,winner.id)) points[winner.id] = 6;
    return points;
  }
  const correct = players.filter(player => game.submissions[player.id] &&
    game.submissions[player.id].answer === String(game.challenge.solution));
  for (const player of correct) points[player.id] = 4;
  if (correct.length) {
    const fastest = Math.min(...correct.map(player => game.submissions[player.id].submittedAt));
    for (const player of correct) if (game.submissions[player.id].submittedAt === fastest) points[player.id] += 1;
  }
  return points;
}
function answerLabel(challenge, answer) {
  if (answer == null) return '시간 초과 · 미제출';
  return challenge.options.find(option => option.value === String(answer))?.label || String(answer);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, game: 'timeline-survival-v1' });
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      let body;
      try { body = await request.json(); } catch { return fail('요청 형식이 올바르지 않습니다.'); }
      const name = safeName(body.name);
      const maxPlayers = Number(body.maxPlayers);
      if (!name) return fail('참가자 이름을 입력해 주세요.');
      if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > MAX_PLAYERS) return fail('훈련은 1명, 대전은 2명에서 8명까지 설정할 수 있습니다.');
      for (let attempt = 0; attempt < 12; attempt++) {
        const code = randomCode();
        const room = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code));
        const response = await room.fetch('https://room.internal/create', { method: 'POST', body: JSON.stringify({ code, name, maxPlayers }) });
        if (response.status !== 409) return response;
      }
      return fail('방 코드를 만들 수 없습니다. 다시 시도해 주세요.', 503);
    }
    const join = url.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})\/join$/);
    if (request.method === 'POST' && join) {
      let body;
      try { body = await request.json(); } catch { return fail('요청 형식이 올바르지 않습니다.'); }
      const name = safeName(body.name);
      if (!name) return fail('참가자 이름을 입력해 주세요.');
      return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(join[1])).fetch('https://room.internal/join', {
        method: 'POST', body: JSON.stringify({ name })
      });
    }
    const socket = url.pathname.match(/^\/ws\/([A-HJ-NP-Z2-9]{6})$/);
    if (socket) {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return fail('WebSocket 연결이 필요합니다.', 426);
      return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(socket[1])).fetch(request);
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return fail('경로를 찾을 수 없습니다.', 404);
    if (url.pathname === '/' || url.pathname === '/index.html') return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
    return env.ASSETS.fetch(request);
  }
};

export class GameRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.meta = null;
    this.game = null;
    this.tail = Promise.resolve();
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const snapshot = await ctx.storage.get('snapshot');
      if ([2,3].includes(snapshot?.meta?.schemaVersion)) {
        this.meta = snapshot.meta; this.game = snapshot.game; this.meta.schemaVersion = 3;
        if (this.game && this.meta.status === 'playing' && !CHALLENGE_TYPES.includes(this.game.challenge?.type)) {
          this.game.finalTypes = shuffle(CHALLENGE_TYPES).slice(0,this.game.finalRoundCount || 3);
          this.beginChallenge(this.game.stage, this.game.stage === 'final'
            ? this.game.finalTypes[this.game.finalIndex - 1] : chooseMainType(null));
        }
      }
      else {
        // Drop rooms whose saved challenge format predates the expanded challenge engine.
        await ctx.storage.deleteAll();
        this.meta = null; this.game = null;
      }
    });
  }

  exclusive(work) {
    const result = this.tail.then(work, work);
    this.tail = result.catch(() => {});
    return result;
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.hostname === 'room.internal' && url.pathname === '/create') return this.exclusive(() => this.create(request));
    if (url.hostname === 'room.internal' && url.pathname === '/join') return this.exclusive(() => this.join(request));
    if (url.pathname.startsWith('/ws/')) return this.connect(request);
    return fail('방을 찾을 수 없습니다.', 404);
  }

  async save() { await this.ctx.storage.put('snapshot', { meta: this.meta, game: this.game }); }
  async alarmAt(timestamp) { await this.ctx.storage.setAlarm(timestamp); }
  bump() { if (this.game) this.game.seq++; else if (this.meta) this.meta.seq++; }

  async create(request) {
    const body = await request.json();
    if (this.meta && this.meta.expires > Date.now()) return fail('이미 사용 중인 방 코드입니다.', 409);
    const playerId = crypto.randomUUID();
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    this.meta = { schemaVersion: 3, code: body.code, maxPlayers: body.maxPlayers, hostId: playerId, status: 'waiting', seq: 1,
      chat: [], chatLastSent: {}, expires: Date.now() + 30 * 60_000, players: { [playerId]: { id: playerId, name: body.name, token,
        connected: false, score: 0, roundPoints: 0, finalScore: 0, eliminated: false, eliminatedRound: null, joinedAt: Date.now() } } };
    this.game = null;
    await this.save(); await this.alarmAt(this.meta.expires);
    return json({ code: body.code, playerId, token, status: 'waiting' }, 201);
  }

  async join(request) {
    const body = await request.json();
    if (!this.meta || this.meta.status !== 'waiting' || this.meta.expires <= Date.now()) return fail('입장할 수 없는 방입니다.', 404);
    const players = makePlayers(this.meta);
    if (players.length >= this.meta.maxPlayers) return fail('방 인원이 가득 찼습니다.', 409);
    const playerId = crypto.randomUUID();
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    this.meta.players[playerId] = { id: playerId, name: body.name, token, connected: false, score: 0, roundPoints: 0,
      finalScore: 0, eliminated: false, eliminatedRound: null, joinedAt: Date.now() };
    this.meta.expires = Date.now() + 30 * 60_000; this.bump();
    await this.save(); await this.alarmAt(this.meta.expires); this.broadcast();
    return json({ code: this.meta.code, playerId, token, status: 'waiting' }, 201);
  }

  socket(playerId) { return this.ctx.getWebSockets(playerId).find(item => item.readyState === 1); }
  connected(playerId) { return Boolean(this.socket(playerId)); }

  connect(request) {
    if (!this.meta) return fail('방이 만료되었습니다.', 404);
    const token = new URL(request.url).searchParams.get('token');
    const player = makePlayers(this.meta).find(item => item.token === token);
    if (!player || !token) return fail('방 접속 정보가 올바르지 않습니다.', 403);
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    const previous = this.socket(player.id);
    if (previous) previous.close(4001, '새 연결');
    this.ctx.acceptWebSocket(server, [player.id]);
    server.serializeAttachment({ playerId: player.id, token });
    this.exclusive(async () => { this.bump(); await this.save(); this.broadcast(); });
    return new Response(null, { status: 101, webSocket: client });
  }

  send(playerId, message) { try { this.socket(playerId)?.send(JSON.stringify(message)); } catch {} }

  playersView() {
    return makePlayers(this.meta).sort((a,b) => a.joinedAt-b.joinedAt).map(player => ({
      id: player.id, name: player.name, connected: this.connected(player.id), score: player.score,
      roundPoints: player.roundPoints, finalScore: player.finalScore,
      team: this.game?.challenge?.teamById?.[player.id] || null, eliminated: player.eliminated,
      eliminatedRound: player.eliminatedRound
    }));
  }

  stateFor(playerId) {
    const challenge = this.game?.challenge;
    const submission = this.game?.submissions?.[playerId];
    const game = this.game ? {
      seq: this.game.seq, phaseId: this.game.phaseId, phase: this.game.phase, stage: this.game.stage,
      round: this.game.round, finalIndex: this.game.finalIndex,
      finalRoundCount: this.game.finalRoundCount || this.game.finalTypes?.length || 3, deadlineAt: this.game.deadlineAt,
      type: challenge.type, inputKind: challenge.inputKind,
      title: challenge.title, prompt: challenge.prompt, presentation: challenge.presentation,
      trainingMode: Boolean(this.game.trainingMode), trainingCategory: this.game.trainingCategory || null,
      trainingCategoryLabel: this.game.trainingCategory ? TRAINING_CATEGORY_LABELS[this.game.trainingCategory] : null,
      trainingLevel: this.game.trainingLevel || null,
      trainingHistory: this.game.phase === 'finished' && this.game.trainingMode ? this.game.trainingHistory : undefined,
      placeholder: challenge.placeholder, maxLength: challenge.maxLength,
      options: challenge.inputKind === 'choice' ? challenge.options : undefined,
      privateInfo: challenge.privateById?.[playerId] || null,
      chat: (this.meta.chat || []).map(message => ({ id: message.id, playerId: message.playerId,
        name: this.meta.players[message.playerId]?.name || '참가자', text: message.text, at: message.at })),
      you: { submitted: Boolean(submission), answer: this.game.phase === 'result' || this.game.phase === 'finished' ? submission?.answer ?? null : null },
      result: this.game.result, winnerId: this.game.winnerId
    } : null;
    return { type: this.game ? 'state' : 'room', code: this.meta.code, status: this.meta.status,
      seq: this.game?.seq ?? this.meta.seq, hostId: this.meta.hostId, maxPlayers: this.meta.maxPlayers,
      youId: playerId, isHost: playerId === this.meta.hostId, players: this.playersView(), game };
  }

  broadcast() {
    if (!this.meta) return;
    for (const player of makePlayers(this.meta)) this.send(player.id, this.stateFor(player.id));
  }

  async start() {
    this.meta.status = 'playing';
    this.game = { seq: this.meta.seq, phaseId: 0, phase: 'answer', stage: 'main', round: 1, finalIndex: 0,
      deadlineAt: 0, challenge: null, submissions: {},
      result: null, winnerId: null, lastMainType: null, trainingMode: false, trainingHistory: [] };
    if (this.meta.maxPlayers === 1) this.beginTraining();
    else if (activePlayers(this.meta).length === 2) this.beginFinal();
    else this.beginChallenge('main', chooseMainType(null));
  }

  beginTraining() {
    this.game.trainingMode = true;
    this.game.stage = 'final';
    this.game.finalIndex = 1;
    this.game.finalRoundCount = 10;
    this.game.finalTypes = [];
    this.game.finalTieBreak = Object.fromEntries(activePlayers(this.meta).map(player => [player.id, randomInt(1_000_000)]));
    this.beginChallenge('final', chooseTrainingType(this.game.trainingHistory));
  }

  beginChallenge(stage, type) {
    const players = activePlayers(this.meta);
    for (const player of makePlayers(this.meta)) player.roundPoints = 0;
    const challenge = makeChallenge(type, players);
    this.game.stage = stage;
    this.game.challenge = challenge;
    if (this.game.trainingMode) {
      this.game.trainingCategory = trainingCategory(type);
      this.game.trainingLevel = trainingLevel(this.game.trainingHistory, this.game.trainingCategory).label;
    }
    this.game.submissions = {};
    this.game.result = null;
    this.game.phase = 'answer';
    if (stage === 'main') this.game.lastMainType = type;
    this.game.phaseId++;
    this.game.deadlineAt = Date.now() + (this.game.trainingMode
      ? trainingDuration(type, this.game.trainingHistory, this.game.trainingCategory)
      : challengeDuration(type));
    this.meta.expires = Date.now() + 60 * 60_000;
    this.bump();
  }

  beginFinal() {
    this.game.stage = 'final';
    this.game.finalIndex = 1;
    this.game.finalRoundCount = this.meta.maxPlayers === 2 ? 10 : 3;
    this.game.trainingMode = false;
    this.game.finalTypes = shuffle([...FULL_INFO_TYPES, ...LIMITED_INFO_TYPES]).slice(0, this.game.finalRoundCount);
    this.game.finalTieBreak = Object.fromEntries(activePlayers(this.meta).map(player => [player.id, randomInt(1_000_000)]));
    this.beginChallenge('final', this.game.finalTypes[0]);
  }

  async persistAndBroadcast() {
    await this.save();
    await this.alarmAt(this.game?.deadlineAt || this.meta.expires);
    this.broadcast();
  }

  async webSocketMessage(socket, raw) {
    await this.ready;
    return this.exclusive(async () => {
      const auth = socket.deserializeAttachment(), playerId = auth?.playerId;
      if (!playerId || this.meta?.players[playerId]?.token !== auth.token) return socket.close(4003, '인증 실패');
      if (typeof raw !== 'string' || raw.length > 8192) return socket.close(1009, '요청이 너무 큽니다.');
      let message;
      try { message = JSON.parse(raw); } catch { return this.send(playerId, { type: 'error', message: '요청 형식이 올바르지 않습니다.' }); }
      const player = this.meta.players[playerId];

      if (message.type === 'sync') { this.send(playerId, this.stateFor(playerId)); return; }
      if (message.type === 'chat') {
        if (this.meta.status !== 'playing') return this.send(playerId, { type: 'error', message: '게임 진행 중에만 대화할 수 있습니다.' });
        const text = String(message.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240);
        if (!text) return;
        const now = Date.now();
        this.meta.chatLastSent ||= {};
        if (now - (this.meta.chatLastSent[playerId] || 0) < 650) return;
        this.meta.chatLastSent[playerId] = now;
        this.meta.chat ||= [];
        this.meta.chat.push({ id: crypto.randomUUID(), playerId, text, at: now });
        if (this.meta.chat.length > 60) this.meta.chat.splice(0, this.meta.chat.length - 60);
        this.bump(); await this.save(); this.broadcast(); return;
      }
      if (message.type === 'start') {
        const allConnected = makePlayers(this.meta).every(item => this.connected(item.id));
        const minimumPlayers = this.meta.maxPlayers === 1 ? 1 : 2;
        if (playerId !== this.meta.hostId || this.meta.status !== 'waiting' || makePlayers(this.meta).length < minimumPlayers || !allConnected)
          return this.send(playerId, { type: 'error', message: '훈련은 혼자, 대전은 2명 이상 전원이 접속한 뒤 시작할 수 있습니다.' });
        await this.start(); await this.persistAndBroadcast(); return;
      }
      if (message.type === 'continueTraining') {
        if (playerId !== this.meta.hostId || !this.game?.trainingMode || this.game.phase !== 'result')
          return this.send(playerId, { type: 'error', message: '훈련 결과 화면에서만 다음 문제로 넘어갈 수 있습니다.' });
        await this.advance(); await this.persistAndBroadcast(); return;
      }
      if (message.type === 'leave') {
        if (this.meta.status !== 'waiting') return this.send(playerId, { type: 'error', message: '진행 중인 게임에서는 방을 나갈 수 없습니다.' });
        if (playerId === this.meta.hostId) { this.meta.status = 'closed'; this.meta.expires = Date.now() + 60_000; }
        else delete this.meta.players[playerId];
        this.bump(); await this.save(); await this.alarmAt(this.meta.expires); this.broadcast(); return;
      }
      if (message.type !== 'action') return;
      if (this.meta.status !== 'playing' || player.eliminated)
        return this.send(playerId, { type: 'error', message: '현재 행동할 수 없습니다.' });
      if (message.phaseId !== this.game.phaseId) return this.send(playerId, { type: 'error', message: '문제가 바뀌었습니다. 최신 문제를 확인해 주세요.' });
      if (Date.now() >= this.game.deadlineAt) { await this.onDeadline(); await this.persistAndBroadcast(); return; }
      const actionId = String(message.actionId || '').slice(0, 80);
      if (!actionId) return this.send(playerId, { type: 'error', message: '제출 번호가 없습니다. 다시 시도해 주세요.' });

      if (this.game.phase !== 'answer') return this.send(playerId, { type: 'error', message: '현재 답을 제출할 수 없습니다.' });
      const previous = this.game.submissions[playerId];
      if (previous) {
        if (previous.actionId === actionId) this.send(playerId, this.stateFor(playerId));
        else this.send(playerId, { type: 'error', message: '이미 이 라운드의 답을 제출했습니다.' });
        return;
      }
      const answer = validateAnswer(this.game, playerId, message.answer, this.meta);
      if (answer == null) return this.send(playerId, { type: 'error', message: '답안 형식을 확인해 주세요.' });
      this.game.submissions[playerId] = { answer, actionId, submittedAt: Date.now() };
      const active = activePlayers(this.meta);
      if (active.every(item => this.game.submissions[item.id])) this.resolveChallenge();
      else this.bump();
      await this.persistAndBroadcast();
    });
  }

  resolveChallenge() {
    const players = activePlayers(this.meta), challenge = this.game.challenge;
    const points = scoreChallenge(this.game, players);
    for (const player of players) {
      player.roundPoints = points[player.id] ?? 0;
      if (this.game.stage === 'final') player.finalScore += player.roundPoints;
      else player.score += player.roundPoints;
    }
    const lines = players.map(player => {
      const answer = this.game.submissions[player.id]?.answer;
      const detail = answerLabel(challenge, answer);
      return { player, points: player.roundPoints, detail };
    }).sort((a, b) => b.points - a.points || a.player.name.localeCompare(b.player.name, 'ko'));
    let headline = challenge.title + ' 결과';
    if (this.game.stage === 'main') {
      const order = [...players].sort((a, b) => a.roundPoints - b.roundPoints || a.score - b.score ||
        challenge.tieBreak[a.id] - challenge.tieBreak[b.id]);
      const eliminated = order[0];
      eliminated.eliminated = true;
      eliminated.eliminatedRound = this.game.round;
      headline = eliminated.name + ' 탈락 · ' + activePlayers(this.meta).length + '명 생존';
    }
    this.game.result = {
      headline, subline: challenge.type === 'uniqueBid' ? (() => {
        const {entries,winner} = uniqueBidOutcome(challenge,this.game.submissions);
        return entries.map(e => (this.meta.players[e.id]?.name || '가상 상대 ' + (Number(e.id.slice(4))+1)) + ': ' + e.number).join(' · ') +
          (winner ? ' / ' + (this.meta.players[winner.id]?.name || '가상 상대') + '의 ' + winner.number + '이 가장 낮은 단독 숫자예요.' : ' / 모든 숫자가 겹쳐 승자가 없어요.');
      })() : challenge.revealText || '',
      lines: lines.map(item => ({ text: item.player.name + ' — ' + item.points + '점 · ' + item.detail }))
    };
    this.game.phaseId++;
    this.bump();

    if (this.game.trainingMode) {
      const player = players[0];
      const performance = trainingPerformance(this.game, player.id);
      const category = this.game.trainingCategory;
      const categoryLabel = TRAINING_CATEGORY_LABELS[category];
      const outcome = performance >= 0.999 ? (challenge.type === 'uniqueBid' ? '독식 성공' : '정답') : performance > 0 ? '부분 해결' : '미해결';
      const record = { round: this.game.finalIndex, type: challenge.type, title: challenge.title,
        category, categoryLabel, performance, points: player.roundPoints, outcome };
      this.game.trainingHistory.push(record);
      this.game.result.trainingFeedback = { categoryLabel, level: this.game.trainingLevel, outcome,
        performance: Math.round(performance * 100), tip: TRAINING_TIPS[challenge.type] };
    }

    if (this.game.stage === 'final' && this.game.finalIndex >= (this.game.finalRoundCount || this.game.finalTypes?.length || 3)) {
      const finalists = activePlayers(this.meta).sort((a, b) => b.finalScore - a.finalScore ||
        this.game.finalTieBreak[a.id] - this.game.finalTieBreak[b.id]);
      this.game.winnerId = finalists[0]?.id || null;
      this.game.phase = 'finished';
      this.game.deadlineAt = 0;
      this.meta.status = 'finished';
      this.meta.expires = Date.now() + 5 * 60_000;
      this.game.result.headline = this.game.trainingMode
        ? '개인 훈련 완료'
        : (this.meta.players[this.game.winnerId]?.name || '우승자') + ' 최종 우승';
      return;
    }
    this.game.phase = 'result';
    this.game.deadlineAt = Date.now() + (this.game.trainingMode ? 60_000 : 20_000);
  }

  async advance() {
    if (this.game.trainingMode) {
      this.game.finalIndex++;
      this.beginChallenge('final', chooseTrainingType(this.game.trainingHistory));
      return;
    }
    if (this.game.stage === 'main') {
      if (activePlayers(this.meta).length === 2) this.beginFinal();
      else {
        this.game.round++;
        this.beginChallenge('main', chooseMainType(this.game.lastMainType));
      }
    } else {
      this.game.finalIndex++;
      this.beginChallenge('final', this.game.finalTypes[this.game.finalIndex - 1]);
    }
  }

  async onDeadline() {
    if (!this.game || this.meta.status !== 'playing') return;
    if (this.game.phase === 'answer') {
      this.resolveChallenge();
    } else if (this.game.phase === 'result') {
      await this.advance();
    }
  }

  async webSocketClose(socket) {
    await this.ready;
    return this.exclusive(async () => { if (!this.meta) return; this.bump(); await this.save(); this.broadcast(); });
  }
  async webSocketError(socket) { return this.webSocketClose(socket); }

  async alarm() {
    await this.ready;
    return this.exclusive(async () => {
      if (!this.meta) return;
      if (this.meta.status === 'closed' || this.meta.status === 'finished' || this.meta.expires <= Date.now()) {
        for (const socket of this.ctx.getWebSockets()) try { socket.close(1000, '방 만료'); } catch {}
        this.meta = null; this.game = null; await this.ctx.storage.deleteAll(); return;
      }
      if (this.game && this.game.deadlineAt && this.game.deadlineAt <= Date.now()) await this.onDeadline();
      await this.save(); await this.alarmAt(this.game?.deadlineAt || this.meta.expires); this.broadcast();
    });
  }
}
