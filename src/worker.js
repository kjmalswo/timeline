const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;
const MAIN_TYPES = ['memory', 'perfect', 'hidden', 'deduction', 'team'];
const FINAL_TYPES = ['memory', 'perfect', 'hidden'];
const TYPE_LABELS = { memory: '메모리', perfect: '완전정보', hidden: '불완전정보', deduction: '추리', team: '임시 팀전' };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const fail = (message, status = 400) => json({ message }, status);
const other = side => side === 'P' ? 'E' : 'P';

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

function makeChallenge(type, players) {
  const privateById = {};
  const tieBreak = Object.fromEntries(players.map(player => [player.id, Math.random()]));
  const base = { type, typeLabel: TYPE_LABELS[type], privateById, tieBreak };

  if (type === 'memory') {
    const sequence = Array.from({ length: 6 }, () => String(randomInt(9) + 1)).join('');
    return { ...base, title: '기억의 배열', prompt: '잠시 공개되는 숫자 6개의 순서를 기억하세요. 공개 시간이 끝나면 같은 순서로 입력해야 합니다.',
      answerHint: '기억한 숫자 6자리를 입력하세요', placeholder: '예: 481729', sequence };
  }

  if (type === 'perfect') {
    const a = randomInt(8) + 2, b = randomInt(8) + 2, c = randomInt(9) + 1;
    return { ...base, title: '공개된 수식', prompt: `수식의 값을 계산하세요. 모든 정보는 공개되어 있습니다: (${a} × ${b}) + ${c}`, answerHint: '계산 결과를 입력하세요',
      placeholder: '정수 답안', solution: a * b + c };
  }

  if (type === 'hidden') {
    const secret = randomInt(16);
    for (const [index, player] of players.entries()) {
      const bit = (secret >> (index % 4)) & 1;
      privateById[player.id] = { heading: '비공개 단서', text: `금고 숫자의 4비트 자리 ${index % 4 + 1} 값은 ${bit}입니다. 다른 참가자의 단서와 합치면 숫자를 좁힐 수 있습니다.` };
    }
    return { ...base, title: '잠긴 금고', prompt: '금고 숫자는 0부터 15 사이입니다. 각자 받은 비트 단서를 공유해 정답을 찾아내세요.', answerHint: '금고 숫자 (0~15)', placeholder: '0~15', solution: secret };
  }

  if (type === 'deduction') {
    const culprit = sample(players);
    for (const player of players) {
      if (player.id === culprit.id) {
        privateById[player.id] = { heading: '비밀 역할 · 용의자', text: '당신은 용의자입니다. 정체를 숨기며 다른 참가자에게 의심이 향하게 하세요.' };
      } else {
        const decoys = players.filter(candidate => candidate.id !== culprit.id && candidate.id !== player.id);
        const decoy = decoys.length ? sample(decoys) : null;
        const text = decoy
          ? `사건 진술: 용의자는 ${culprit.name} 또는 ${decoy.name}입니다. 다른 참가자와 단서를 비교하세요.`
          : '사건 기록은 서로 모순됩니다. 다른 참가자와 정보를 비교해 용의자를 지목하세요.';
        privateById[player.id] = { heading: '비공개 진술', text };
      }
    }
    return { ...base, title: '마지막 진술', prompt: '각자 비공개 정보를 확인하고, 사건의 용의자 한 명을 지목하세요.', answerHint: '용의자로 지목할 참가자를 고르세요',
      culpritId: culprit.id };
  }

  const teams = shuffle(players.map(player => player.id));
  const split = Math.ceil(teams.length / 2);
  const teamById = Object.fromEntries(teams.map((id, index) => [id, index < split ? 'A' : 'B']));
  const targetByTeam = { A: randomInt(6) + 1, B: randomInt(6) + 1 };
  const teamMembers = { A: players.filter(player => teamById[player.id] === 'A'), B: players.filter(player => teamById[player.id] === 'B') };
  for (const team of ['A', 'B']) {
    for (const [index, player] of teamMembers[team].entries()) {
      const target = targetByTeam[team];
      const clues = teamMembers[team].length === 1
        ? [`목표 숫자는 ${target % 2 ? '홀수' : '짝수'}입니다.`, `목표 숫자를 3으로 나눈 나머지는 ${target % 3}입니다.`]
        : index % 2 === 0
          ? [`팀 목표 숫자는 ${target % 2 ? '홀수' : '짝수'}입니다.`]
          : [`팀 목표 숫자를 3으로 나눈 나머지는 ${target % 3}입니다.`];
      privateById[player.id] = { heading: `임시 동맹 · ${team}팀`, text: clues.join(' ') };
    }
  }
  return { ...base, title: '임시 동맹', prompt: '같은 팀끼리 단서를 공유하세요. 팀원들이 같은 숫자를 제출해 팀 목표를 맞히면 팀 전체가 승점을 얻습니다.',
    answerHint: '팀 목표 숫자 (1~6)', placeholder: '1~6', teamById, targetByTeam };
}

function validateAnswer(game, playerId, value, meta) {
  const answer = String(value ?? '').trim();
  if (!answer || answer.length > 40) return null;
  if (game.challenge.type === 'deduction') {
    return activePlayers(meta).some(player => player.id === answer) ? answer : null;
  }
  if (game.challenge.type === 'memory') return /^\d{6}$/.test(answer) ? answer : null;
  if (!/^\d{1,2}$/.test(answer)) return null;
  const number = Number(answer);
  const ranges = { perfect: [0, 99], hidden: [0, 15], team: [1, 6] };
  const [min, max] = ranges[game.challenge.type] || [0, 99];
  return number >= min && number <= max ? number : null;
}

function scoreChallenge(game, players) {
  const challenge = game.challenge;
  const points = Object.fromEntries(players.map(player => [player.id, 0]));
  const submitted = Object.fromEntries(players.map(player => [player.id, game.submissions[player.id]?.answer ?? null]));

  if (challenge.type === 'memory') {
    for (const player of players) {
      const answer = submitted[player.id];
      if (answer == null) continue;
      points[player.id] = [...String(answer)].reduce((count, digit, index) => count + Number(digit === challenge.sequence[index]), 0);
    }
  } else if (challenge.type === 'perfect') {
    const answers = players.filter(player => submitted[player.id] != null);
    const exact = answers.filter(player => submitted[player.id] === challenge.solution);
    if (exact.length) exact.forEach(player => { points[player.id] = 3; });
    else if (answers.length) {
      const best = Math.min(...answers.map(player => Math.abs(submitted[player.id] - challenge.solution)));
      answers.filter(player => Math.abs(submitted[player.id] - challenge.solution) === best).forEach(player => { points[player.id] = 1; });
    }
  } else if (challenge.type === 'hidden') {
    for (const player of players) if (submitted[player.id] === challenge.solution) points[player.id] = 3;
  } else if (challenge.type === 'deduction') {
    for (const player of players) if (submitted[player.id] === challenge.culpritId) points[player.id] = 3;
    const culprit = players.find(player => player.id === challenge.culpritId);
    const votes = players.map(player => submitted[player.id]).filter(Boolean);
    if (culprit && submitted[culprit.id] != null && !votes.includes(culprit.id)) points[culprit.id] += 1;
  } else {
    const teams = ['A', 'B'];
    for (const team of teams) {
      const members = players.filter(player => challenge.teamById[player.id] === team);
      if (!members.length) continue;
      const counts = new Map();
      for (const player of members) {
        const answer = submitted[player.id];
        if (answer != null) counts.set(answer, (counts.get(answer) || 0) + 1);
        if (answer === challenge.targetByTeam[team]) points[player.id] += 1;
      }
      const maximum = Math.max(0, ...counts.values());
      const leaders = [...counts.entries()].filter(([, count]) => count === maximum);
      if (leaders.length === 1 && leaders[0][0] === challenge.targetByTeam[team] && maximum > members.length / 2) {
        members.forEach(player => { points[player.id] += 2; });
      }
    }
  }

  return points;
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
      if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > MAX_PLAYERS) return fail('방 인원은 2명에서 8명 사이로 설정해 주세요.');
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
      if (snapshot) { this.meta = snapshot.meta; this.game = snapshot.game; }
      else {
        // Rooms created by the previous 1v1 rules cannot be resumed under the new game state.
        await ctx.storage.deleteAll();
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
    this.meta = { code: body.code, maxPlayers: body.maxPlayers, hostId: playerId, status: 'waiting', seq: 1,
      expires: Date.now() + 30 * 60_000, players: { [playerId]: { id: playerId, name: body.name, token,
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
      roundPoints: player.roundPoints, finalScore: player.finalScore, eliminated: player.eliminated,
      eliminatedRound: player.eliminatedRound
    }));
  }

  stateFor(playerId) {
    const challenge = this.game?.challenge;
    const submission = this.game?.submissions[playerId];
    const privateInfo = challenge?.privateById?.[playerId] || null;
    const game = this.game ? {
      seq: this.game.seq, phaseId: this.game.phaseId, phase: this.game.phase, stage: this.game.stage,
      round: this.game.round, finalIndex: this.game.finalIndex, deadlineAt: this.game.deadlineAt,
      type: challenge.type, typeLabel: challenge.typeLabel, title: challenge.title, prompt: challenge.prompt,
      answerHint: challenge.answerHint, placeholder: challenge.placeholder,
      options: challenge.type === 'deduction' ? this.playersView().filter(player => !player.eliminated).map(player => ({ value: player.id, label: player.name })) : undefined,
      studySequence: this.game.phase === 'study' ? challenge.sequence : undefined,
      privateInfo, you: { submitted: Boolean(submission), answer: this.game.phase === 'result' || this.game.phase === 'finished' ? submission?.answer ?? null : null },
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
      deadlineAt: 0, challenge: null, submissions: {}, result: null, winnerId: null };
    if (activePlayers(this.meta).length === 2) this.beginFinal();
    else this.beginChallenge('main', sample(MAIN_TYPES));
  }

  beginChallenge(stage, type) {
    const players = activePlayers(this.meta);
    for (const player of makePlayers(this.meta)) player.roundPoints = 0;
    this.game.stage = stage; this.game.phase = type === 'memory' ? 'study' : 'answer';
    this.game.challenge = makeChallenge(type, players); this.game.submissions = {}; this.game.result = null;
    this.game.phaseId++; this.game.deadlineAt = Date.now() + (type === 'memory' ? 9_000 : 30_000);
    this.meta.expires = Date.now() + 60 * 60_000; this.bump();
  }

  beginFinal() {
    this.game.stage = 'final'; this.game.finalIndex = 1; this.game.finalTieBreak = Object.fromEntries(activePlayers(this.meta).map(player => [player.id, Math.random()]));
    this.beginChallenge('final', sample(FINAL_TYPES));
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
      if (message.type === 'start') {
        const allConnected = makePlayers(this.meta).every(item => this.connected(item.id));
        if (playerId !== this.meta.hostId || this.meta.status !== 'waiting' || makePlayers(this.meta).length < 2 || !allConnected)
          return this.send(playerId, { type: 'error', message: '2명 이상 참가하고 모든 참가자가 접속한 뒤 방장이 시작할 수 있습니다.' });
        await this.start(); await this.persistAndBroadcast(); return;
      }
      if (message.type === 'leave') {
        if (this.meta.status !== 'waiting') return this.send(playerId, { type: 'error', message: '진행 중인 게임에서는 방을 나갈 수 없습니다.' });
        if (playerId === this.meta.hostId) { this.meta.status = 'closed'; this.meta.expires = Date.now() + 60_000; }
        else delete this.meta.players[playerId];
        this.bump(); await this.save(); await this.alarmAt(this.meta.expires); this.broadcast(); return;
      }
      if (message.type !== 'action') return;
      if (this.meta.status !== 'playing' || this.game.phase !== 'answer' || player.eliminated)
        return this.send(playerId, { type: 'error', message: '현재 답을 제출할 수 없습니다.' });
      if (message.phaseId !== this.game.phaseId) return this.send(playerId, { type: 'error', message: '문제가 바뀌었습니다. 최신 문제를 확인해 주세요.' });
      if (Date.now() >= this.game.deadlineAt) { await this.onDeadline(); await this.persistAndBroadcast(); return; }
      const actionId = String(message.actionId || '').slice(0, 80);
      if (!actionId) return this.send(playerId, { type: 'error', message: '제출 번호가 없습니다. 다시 시도해 주세요.' });
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
      player.roundPoints = points[player.id] || 0;
      if (this.game.stage === 'final') player.finalScore += player.roundPoints;
      else player.score += player.roundPoints;
    }
    const lines = players.map(player => {
      const answer = this.game.submissions[player.id]?.answer;
      let detail = answer == null ? '시간 초과 · 미제출' : `${challenge.type === 'deduction' ? '지목 완료' : `답 ${answer}`}`;
      if (challenge.type === 'memory' && answer != null) {
        const hits = [...String(answer)].reduce((count, digit, index) => count + Number(digit === challenge.sequence[index]), 0);
        detail += ` · ${hits}/6개 순서 일치`;
      }
      return { player, points: player.roundPoints, detail };
    }).sort((a,b) => b.points-a.points || a.player.name.localeCompare(b.player.name, 'ko'));
    let headline = `${challenge.typeLabel} 결과`;
    if (challenge.type === 'memory') headline += ` · 정답 ${challenge.sequence}`;
    if (challenge.type === 'perfect') headline += ` · 계산값 ${challenge.solution}`;
    if (challenge.type === 'hidden') headline += ` · 금고 숫자 ${challenge.solution}`;
    if (challenge.type === 'deduction') headline += ` · 용의자 ${this.meta.players[challenge.culpritId].name}`;
    if (challenge.type === 'team') headline += ` · A팀 목표 ${challenge.targetByTeam.A} / B팀 목표 ${challenge.targetByTeam.B}`;

    let eliminatedName = null;
    if (this.game.stage === 'main') {
      const order = [...players].sort((a,b) => a.roundPoints-b.roundPoints || a.score-b.score ||
        challenge.tieBreak[a.id]-challenge.tieBreak[b.id]);
      const eliminated = order[0]; eliminated.eliminated = true; eliminated.eliminatedRound = this.game.round;
      eliminatedName = eliminated.name;
      headline = `${eliminated.name} 탈락 · ${activePlayers(this.meta).length}명 생존`;
    }
    this.game.result = { headline, lines: lines.map(item => ({ text: `${item.player.name} — ${item.points}점 · ${item.detail}` })) };
    this.game.phaseId++; this.bump();

    if (this.game.stage === 'final' && this.game.finalIndex >= 3) {
      const finalists = activePlayers(this.meta).sort((a,b) => b.finalScore-a.finalScore || this.game.finalTieBreak[a.id]-this.game.finalTieBreak[b.id]);
      this.game.winnerId = finalists[0]?.id || null; this.game.phase = 'finished'; this.game.deadlineAt = 0;
      this.meta.status = 'finished'; this.meta.expires = Date.now() + 5 * 60_000;
      this.game.result.headline = `${this.meta.players[this.game.winnerId]?.name || '우승자'} 최종 우승`;
      return;
    }

    this.game.phase = 'result'; this.game.deadlineAt = Date.now() + (this.game.stage === 'main' ? 7_000 : 6_000);
  }

  async advance() {
    if (this.game.stage === 'main') {
      if (activePlayers(this.meta).length === 2) this.beginFinal();
      else { this.game.round++; this.beginChallenge('main', sample(MAIN_TYPES)); }
    } else {
      this.game.finalIndex++;
      this.beginChallenge('final', sample(FINAL_TYPES));
    }
  }

  async onDeadline() {
    if (!this.game || this.meta.status !== 'playing') return;
    if (this.game.phase === 'study') {
      this.game.phase = 'answer'; this.game.phaseId++; this.game.deadlineAt = Date.now() + 25_000; this.bump();
    } else if (this.game.phase === 'answer') {
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
