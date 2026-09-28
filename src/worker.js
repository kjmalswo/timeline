const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;
const FULL_INFO_TYPES = ['sequence', 'symbolGrid', 'logicGrid', 'spatial', 'miniSudoku', 'codeLock'];
const LIMITED_INFO_TYPES = ['indianPoker', 'turtleSoup', 'rankInference', 'cipher', 'probability', 'resource', 'auction', 'truthLie', 'memory', 'strategy', 'path', 'stateInference'];
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
function chooseMainType(previous) {
  const group = sample([FULL_INFO_TYPES, LIMITED_INFO_TYPES]);
  const pool = group.filter(type => type !== previous);
  return sample(pool.length ? pool : group);
}
function makeChoices(values, labels = {}) {
  return shuffle([...new Set(values.map(value => String(value)))])
    .map(value => ({ value, label: labels[value] == null ? value : String(labels[value]) }));
}
function optionValues(correct, distractors) {
  const values = [String(correct), ...distractors.map(String).filter(value => value !== String(correct))];
  return makeChoices([...new Set(values)]);
}
function rankName(rank) { return rank <= 10 ? String(rank) : ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[rank] || String(rank)); }
function permutations(items) {
  if (items.length <= 1) return [items];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    for (const tail of permutations([...items.slice(0, i), ...items.slice(i + 1)])) out.push([items[i], ...tail]);
  }
  return out;
}
function assignPrivate(players, fragments) {
  const buckets = Object.fromEntries(players.map(player => [player.id, []]));
  fragments.forEach((fragment, index) => buckets[players[index % players.length].id].push(fragment));
  for (const player of players) {
    buckets[player.id] = { heading: '비공개 정보', text: buckets[player.id].join('\n') || '추가 단서는 없습니다.' };
  }
  return buckets;
}
function rankOptions(players) {
  return players.map(player => ({ value: player.id, label: player.name }));
}
function makeChallenge(type, players) {
  const privateById = {};
  const tieBreak = Object.fromEntries(players.map(player => [player.id, randomInt(1_000_000)]));
  const base = { type, privateById, tieBreak };

  if (type === 'sequence') {
    const oddStart = randomInt(10) + 3;
    const oddStep = randomInt(7) + 2;
    const secondDifference = randomInt(4) + 2;
    const evenStart = randomInt(5) + 2;
    const evenMultiplier = randomInt(2) + 2;
    const terms = [];
    for (let index = 0; index < 10; index++) {
      const position = Math.floor(index / 2);
      terms.push(index % 2 === 0
        ? oddStart + oddStep * position + secondDifference * position * (position - 1) / 2
        : evenStart * evenMultiplier ** position);
    }
    const solution = oddStart + oddStep * 5 + secondDifference * 10;
    return { ...base, inputKind: 'number', title: '교차 수열',
      prompt: '홀수항은 두 번째 차분이 일정하고, 짝수항은 같은 수를 곱합니다. 11번째 항은?\n' + terms.join(' · ') + ' · ?',
      placeholder: '정수', maxLength: 4, solution,
      revealText: '정답: ' + solution };
  }

  if (type === 'symbolGrid') {
    let values;
    do {
      values = [randomInt(8) + 2, randomInt(8) + 2, randomInt(8) + 2, randomInt(8) + 2];
    } while (new Set(values).size < 4);
    const [triangle, square, circle, diamond] = values;
    const equations = [
      triangle + square,
      square + circle,
      circle + diamond,
      triangle + circle + diamond
    ];
    const solution = triangle * diamond + square * circle;
    return { ...base, inputKind: 'number', title: '연립식',
      prompt: '네 기호는 서로 다른 한 자리 수입니다. 네 식으로 값을 구한 뒤 △×◇ + □×○를 계산하세요.\n' +
        '△ + □ = ' + equations[0] + '\n□ + ○ = ' + equations[1] + '\n○ + ◇ = ' + equations[2] +
        '\n△ + ○ + ◇ = ' + equations[3],
      placeholder: '정수', maxLength: 4, solution,
      revealText: '△=' + triangle + ', □=' + square + ', ○=' + circle + ', ◇=' + diamond + ' · 정답 ' + solution };
  }

  if (type === 'logicGrid') {
    const names = ['가람', '나래', '다온', '라온', '마루'];
    const colors = ['빨강', '파랑', '초록', '노랑', '보라'];
    const states = [];
    for (const order of permutations(names)) {
      for (const colorOrder of permutations(colors)) {
        states.push({ order, colorByName: Object.fromEntries(names.map((name, index) => [name, colorOrder[index]])) });
      }
    }
    const target = sample(states);
    const facts = [];
    for (const name of names) {
      for (let rank = 1; rank <= names.length; rank++) {
        facts.push({ test: state => state.order.indexOf(name) + 1 === rank, text: name + '은(는) ' + rank + '위다.' });
      }
      for (const color of colors) {
        facts.push({ test: state => state.colorByName[name] === color, text: name + '의 표식은 ' + color + '이다.' });
      }
    }
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i], b = names[j];
        facts.push({ test: state => state.order.indexOf(a) < state.order.indexOf(b), text: a + '은(는) ' + b + '보다 앞선다.' });
        facts.push({ test: state => Math.abs(state.order.indexOf(a) - state.order.indexOf(b)) === 1, text: a + '과(와) ' + b + '은(는) 이웃한 순위다.' });
        for (const color of colors) {
          facts.push({ test: state => state.order.indexOf(a) < state.order.indexOf(names.find(name => state.colorByName[name] === color)),
            text: a + '은(는) ' + color + ' 표식 참가자보다 앞선다.' });
        }
      }
    }
    let remaining = states;
    const clues = [];
    while (remaining.length > 1) {
      const candidates = shuffle(facts.filter(fact => fact.test(target)).map(fact => ({
        fact, matches: remaining.filter(state => fact.test(state))
      })).filter(item => item.matches.length < remaining.length));
      if (!candidates.length) break;
      const bestCount = Math.min(...candidates.map(item => item.matches.length));
      const best = sample(candidates.filter(item => item.matches.length === bestCount));
      clues.push(best.fact.text);
      remaining = best.matches;
    }
    const rankedThird = target.order[2];
    const solution = target.colorByName[rankedThird];
    return { ...base, inputKind: 'choice', title: '순위·표식 논리',
      prompt: '다섯 참가자의 순위와 표식은 모두 다릅니다. 단서를 정리해 3위 참가자의 표식을 고르세요.\n' +
        clues.map((clue, index) => (index + 1) + '. ' + clue).join('\n'),
      options: makeChoices(colors), solution,
      revealText: '순위·표식: ' + target.order.map((name, index) => (index + 1) + '위 ' + name + '(' + target.colorByName[name] + ')').join(' · ') };
  }

  if (type === 'spatial') {
    const size = 5;
    const startRow = randomInt(size), startCol = randomInt(size);
    const start = String.fromCharCode(65 + startCol) + String(startRow + 1);
    const transformations = shuffle([
      { id: 'rotate', label: '시계 방향 90° 회전' },
      { id: 'leftRight', label: '좌우 반사' },
      { id: 'topBottom', label: '상하 반사' },
      { id: 'transpose', label: '대각선 반사' }
    ]).slice(0, 3);
    let row = startRow, col = startCol;
    for (const operation of transformations) {
      if (operation.id === 'rotate') [row, col] = [col, size - 1 - row];
      else if (operation.id === 'leftRight') col = size - 1 - col;
      else if (operation.id === 'topBottom') row = size - 1 - row;
      else [row, col] = [col, row];
    }
    const solution = String.fromCharCode(65 + col) + String(row + 1);
    const distractors = [];
    while (distractors.length < 4) {
      const value = String.fromCharCode(65 + randomInt(size)) + String(randomInt(size) + 1);
      if (value !== solution && !distractors.includes(value)) distractors.push(value);
    }
    return { ...base, inputKind: 'choice', title: '좌표 변환',
      prompt: 'A~E열, 1~5행 격자에서 ' + start + '를 다음 순서대로 변환하세요.\n' +
        transformations.map((operation, index) => (index + 1) + '. ' + operation.label).join('\n'),
      options: optionValues(solution, distractors), solution,
      revealText: '정답: ' + solution };
  }

  if (type === 'miniSudoku') {
    const baseGrid = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];
    const groupOrder = () => shuffle([0,1]).flatMap(group => shuffle([0,1]).map(offset => group * 2 + offset));
    const rowOrder = groupOrder(), columnOrder = groupOrder(), digitMap = shuffle([1,2,3,4]);
    const solved = rowOrder.map(row => columnOrder.map(column => digitMap[baseGrid[row][column] - 1]));
    const board = solved.map(row => [...row]);
    function countSolutions() {
      let count = 0;
      function search() {
        if (count >= 2) return;
        let bestCell = null, bestValues = null;
        for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
          if (board[row][column] !== 0) continue;
          const possible = [1,2,3,4].filter(value => {
            for (let index = 0; index < 4; index++) {
              if (board[row][index] === value || board[index][column] === value) return false;
            }
            const boxRow = Math.floor(row / 2) * 2, boxColumn = Math.floor(column / 2) * 2;
            for (let r = boxRow; r < boxRow + 2; r++) for (let c = boxColumn; c < boxColumn + 2; c++) {
              if (board[r][c] === value) return false;
            }
            return true;
          });
          if (!possible.length) return;
          if (!bestValues || possible.length < bestValues.length) { bestCell = [row, column]; bestValues = possible; }
        }
        if (!bestCell) { count++; return; }
        const [row, column] = bestCell;
        for (const value of bestValues) {
          board[row][column] = value;
          search();
          board[row][column] = 0;
          if (count >= 2) return;
        }
      }
      search();
      return count;
    }
    const removalOrder = shuffle(Array.from({ length: 16 }, (_, index) => ({ row: Math.floor(index / 4), column: index % 4 })));
    let blankCount = 0;
    for (const cell of removalOrder) {
      if (blankCount >= 9) break;
      board[cell.row][cell.column] = 0;
      if (countSolutions() === 1) blankCount++;
      else board[cell.row][cell.column] = solved[cell.row][cell.column];
    }
    const blanks = [];
    for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
      if (board[row][column] === 0) blanks.push({ row, column });
    }
    const solution = blanks.map(cell => solved[cell.row][cell.column]).join('');
    const distractorSet = new Set([solution]);
    for (let index = 0; index < solution.length && distractorSet.size < 4; index++) {
      for (let shift = 1; shift <= 3 && distractorSet.size < 4; shift++) {
        const replacement = String((Number(solution[index]) - 1 + shift) % 4 + 1);
        distractorSet.add(solution.slice(0, index) + replacement + solution.slice(index + 1));
      }
    }
    const values = [...distractorSet];
    const labels = Object.fromEntries(values.map(value => [value, [...value].join(' ')]));
    const gridText = board.map(row => row.map((value, column) =>
      (value || '?') + (column === 1 ? ' │' : '')).join(' ')).join('\n');
    return { ...base, inputKind: 'choice', title: '4×4 스도쿠',
      prompt: '각 행·열·2×2 상자에 1~4가 한 번씩 들어갑니다. 물음표를 행 순서대로 채우세요.\n' + gridText,
      options: makeChoices(values, labels), solution,
      revealText: '빈칸 순서대로: ' + [...solution].join(' ') };
  }

  if (type === 'codeLock') {
    const digits = '0123456789';
    const codes = [];
    function generateCodes(prefix, available) {
      if (prefix.length === 5) { codes.push(prefix); return; }
      for (const digit of available) generateCodes(prefix + digit, available.replace(digit, ''));
    }
    generateCodes('', digits);
    const secret = sample(codes);
    const feedback = (code, guess) => {
      const exact = [...guess].reduce((sum, digit, index) => sum + Number(digit === code[index]), 0);
      const present = [...guess].reduce((sum, digit) => sum + Number(code.includes(digit)), 0) - exact;
      return { exact, present };
    };
    let remaining = codes;
    const clues = [], used = new Set();
    while (remaining.length > 1 || clues.length < 5) {
      let guess;
      if (clues.length >= 10 && remaining.length > 1) {
        guess = sample(remaining.filter(code => code !== secret && !used.has(code)));
      } else {
        do { guess = [...shuffle([...digits])].slice(0, 5).join(''); } while (guess === secret || used.has(guess));
      }
      used.add(guess);
      const result = feedback(secret, guess);
      clues.push(guess + ': 자리까지 ' + result.exact + ' · 숫자만 ' + result.present);
      remaining = remaining.filter(code => {
        const candidate = feedback(code, guess);
        return candidate.exact === result.exact && candidate.present === result.present;
      });
    }
    const distractors = shuffle(codes.filter(code => code !== secret)).slice(0, 3);
    return { ...base, inputKind: 'choice', title: '5자리 암호',
      prompt: '0~9 중 서로 다른 숫자 5개의 암호를 찾으세요. “자리까지”는 숫자와 위치가 모두 맞고, “숫자만”은 다른 위치에 있는 숫자 수입니다.\n' +
        clues.map((clue, index) => (index + 1) + '. ' + clue).join('\n'),
      options: makeChoices([secret, ...distractors]), solution: secret,
      revealText: '암호: ' + secret };
  }

  if (type === 'indianPoker') {
    const deck = [];
    for (let copy = 0; copy < 2; copy++) for (let rank = 2; rank <= 14; rank++) for (let suit = 0; suit < 4; suit++) deck.push(rank);
    const dealt = shuffle(deck).slice(0, players.length);
    const hand = Object.fromEntries(players.map((player, index) => [player.id, dealt[index]]));
    for (const player of players) {
      const visible = players.filter(other => other.id !== player.id)
        .map(other => other.name + ': ' + rankName(hand[other.id]));
      privateById[player.id] = { heading: '내 카드', text: visible.length
        ? '내 앞 카드만 확인할 수 있습니다. 상대의 공개 카드: ' + visible.join(' · ')
        : '상대 카드가 없습니다.' };
    }
    return { ...base, inputKind: 'indianPoker', title: '더블덱 인디안 포커',
      prompt: '2~A 각 8장인 더블덱입니다. 공개된 상대 카드로 남은 분포를 계산해 내 숫자와 베팅(0~5)을 정하세요. 적중 4+베팅점, 오답은 베팅만큼 감점; 최고 카드 +1.',
      answerHint: '내 카드 예상과 베팅을 함께 제출하세요', hand,
      revealText: '' };
  }

  if (type === 'turtleSoup') {
    const cases = [
      {
        prompt: '술집에서 물을 청한 사람이 있습니다. 바텐더가 갑자기 소리치자, 그 사람은 감사하고 나갔습니다. 이유는?',
        options: [
          { value: 'A', label: '남자는 목이 말라 있었고, 바텐더는 물 대신 술을 건넸다.' },
          { value: 'B', label: '남자는 딸꾹질 중이었고, 바텐더가 놀라게 해 멈췄다.' },
          { value: 'C', label: '남자는 바텐더의 암호를 알아냈다.' },
          { value: 'D', label: '바텐더가 실수로 잔을 떨어뜨렸다.' }
        ],
        solution: 'B',
        clues: ['남자는 물을 마시기 전부터 딸꾹질을 하고 있었습니다.', '바텐더는 남자의 딸꾹질을 알아차렸습니다.', '큰 소리에 남자의 딸꾹질이 멈췄습니다.', '남자는 실제로 물을 받지 않았습니다.', '바텐더는 남자를 해치려는 의도가 없었습니다.', '남자는 목마름보다 갑작스러운 증상 때문에 물을 찾았습니다.', '큰 소리는 의도적으로 냈습니다.', '남자는 증상이 사라진 뒤 감사 인사를 했습니다.'],
        explanation: '남자는 딸꾹질을 멈추려고 물을 부탁했고, 바텐더는 놀라게 해 딸꾹질을 멈춰 주었습니다.'
      },
      {
        prompt: '밤에 등대 불이 꺼졌습니다. 다음 날 배 한 척이 항구에 오지 못했고, 등대지기는 자신이 원인임을 알았습니다. 무슨 일이 있었나요?',
        options: [
          { value: 'A', label: '등대지기가 안내등을 꺼 배가 암초를 피하지 못했다.' },
          { value: 'B', label: '배가 목적지를 바꿔 다른 항구로 갔다.' },
          { value: 'C', label: '선장이 등대 불빛을 보고 항로를 바로잡았다.' },
          { value: 'D', label: '아침에 정전이 시작되어 밤의 항해와 무관했다.' }
        ],
        solution: 'A',
        clues: ['이 사람의 직업은 등대지기입니다.', '배는 밤에 해안 가까이 항해하고 있었습니다.', '등대 불빛은 배가 암초를 피하는 항로 표지였습니다.', '등대의 불은 밤중에 꺼졌습니다.', '배는 그 밤 항구에 도착하지 못했습니다.', '밤의 불빛 상태가 항해에 직접 영향을 줬습니다.', '날씨는 맑았고 시야가 나쁘지 않았습니다.', '등대지기는 불을 끈 행동을 기억하고 있습니다.'],
        explanation: '등대지기가 불을 꺼 항로 표지가 사라졌고, 배가 암초를 피하지 못했습니다.'
      },
      {
        prompt: '열기구에 세 사람이 탔습니다. 기구가 내려가 짐을 버렸지만, 한 사람이 사막에 떨어졌습니다. 그 손에는 짧은 성냥이 있었습니다. 왜 떨어졌나요?',
        options: [
          { value: 'A', label: '그는 지도를 찾으려고 혼자 뛰어내렸다.' },
          { value: 'B', label: '성냥으로 불을 붙이려다 균형을 잃었다.' },
          { value: 'C', label: '세 사람이 짧은 성냥을 뽑았고, 가장 짧은 것을 뽑은 사람이 뛰어내렸다.' },
          { value: 'D', label: '열기구는 사막에 착륙했고 그는 걸어서 떠났다.' }
        ],
        solution: 'C',
        clues: ['사고 직전 열기구에는 세 명이 타고 있었습니다.', '짐을 버린 뒤에도 열기구가 내려갔습니다.', '탑승자들은 성냥으로 제비뽑기를 했습니다.', '손에 남은 성냥은 짧았습니다.', '한 사람이 뛰어내려야 나머지 둘이 살 수 있었습니다.', '사막에 불이나 연료가 있다는 단서는 없습니다.', '그 사람은 스스로 열기구에서 떨어졌습니다.', '성냥의 길이가 결과를 정했습니다.'],
        explanation: '세 사람은 성냥 길이로 제비뽑기를 했고, 가장 짧은 성냥을 뽑은 사람이 희생했습니다.'
      }
    ];
    const puzzle = sample(cases);
    const assigned = assignPrivate(players, puzzle.clues);
    Object.assign(privateById, Object.fromEntries(Object.entries(assigned).map(([id, clue]) => [id, {
      heading: '사건 기록 조각', text: clue.text
    }])));
    return { ...base, inputKind: 'choice', title: '상황 추리',
      prompt: puzzle.prompt, answerHint: '정답 선택', options: puzzle.options,
      solution: puzzle.solution, revealText: puzzle.explanation };
  }

  if (type === 'rankInference') {
    const ranks = shuffle(Array.from({ length: players.length }, (_, i) => i + 1));
    const rankById = Object.fromEntries(players.map((player, index) => [player.id, ranks[index]]));
    const weightedTotal = players.reduce((sum, player, index) => sum + (index + 1) * rankById[player.id], 0);
    const targetRank = weightedTotal % players.length + 1;
    for (const player of players) privateById[player.id] = {
      heading: '내 순위',
      text: '내 순위: ' + rankById[player.id] + '위'
    };
    const answer = players.find(player => rankById[player.id] === targetRank);
    return { ...base, inputKind: 'choice', title: '가중 순위 추론',
      prompt: '참가 순서대로 가중치 1, 2, 3…을 곱해 순위 합을 구하세요. 목표 순위는 합을 참가자 수로 나눈 나머지+1입니다. 해당 참가자는?',
      answerHint: '해당 순위의 참가자', options: rankOptions(players), rankById, targetRank,
      solution: answer.id,
      revealText: targetRank + '위는 ' + answer.name + '입니다.' };
  }

  if (type === 'cipher') {
    const words = ['PUZZLE', 'PLAYER', 'CIPHER', 'RIDDLE', 'REASON', 'WISDOM'];
    const solution = sample(words);
    const shifts = Array.from({ length: 3 }, () => randomInt(5) + 1);
    const shifted = [...solution].map((letter, index) =>
      String.fromCharCode(65 + (letter.charCodeAt(0) - 65 + shifts[index % 3]) % 26));
    const cipher = [0,2,4,1,3,5].map(index => shifted[index]).join('');
    const fragments = shifts.map((shift, index) => '반복 키 ' + (index + 1) + '번: 각 문자를 ' + shift + '칸 이동합니다.');
    Object.assign(privateById, assignPrivate(players, fragments));
    return { ...base, inputKind: 'choice', title: '전치·반복키 암호',
      prompt: '암호화할 때 반복 키로 이동한 뒤 홀수 위치를 앞에, 짝수 위치를 뒤에 붙였습니다. 역순으로 복호화하세요.\n암호문: ' + cipher,
      options: makeChoices(words), solution,
      revealText: '정답: ' + solution };
  }

  if (type === 'probability') {
    const redMajority = sample(['A', 'B']);
    const jarCounts = redMajority === 'A'
      ? { A: { red: 8, blue: 2 }, B: { red: 2, blue: 8 } }
      : { A: { red: 2, blue: 8 }, B: { red: 8, blue: 2 } };
    let sampleById = {};
    let likelihoodSignal = 0;
    for (let attempt = 0; attempt < 20 && likelihoodSignal === 0; attempt++) {
      sampleById = Object.fromEntries(players.map(player => [player.id, { A: [], B: [] }]));
      const totals = { A: { red: 0, blue: 0 }, B: { red: 0, blue: 0 } };
      for (const player of players) for (const jar of ['A', 'B']) {
        for (let draw = 0; draw < 3; draw++) {
          const color = randomInt(10) < jarCounts[jar].red ? '빨강' : '파랑';
          sampleById[player.id][jar].push(color);
          totals[jar][color === '빨강' ? 'red' : 'blue']++;
        }
      }
      likelihoodSignal = totals.A.red - totals.A.blue - totals.B.red + totals.B.blue;
    }
    for (const player of players) privateById[player.id] = {
      heading: '내 표본',
      text: 'A: ' + sampleById[player.id].A.map(color => color === '빨강' ? 'R' : 'B').join(' ') +
        ' · B: ' + sampleById[player.id].B.map(color => color === '빨강' ? 'R' : 'B').join(' ')
    };
    const solution = likelihoodSignal > 0 ? 'A' : 'B';
    return { ...base, inputKind: 'choice', title: '표본 확률 분석',
      prompt: 'A·B 중 한 곳은 빨강 8·파랑 2, 다른 곳은 빨강 2·파랑 8입니다. 표본은 복원 추출, 사전확률은 1:1입니다. 표본 전체에서 더 유력한 항아리를 고르세요.',
      options: makeChoices(['A', 'B']), solution,
      revealText: '표본의 우도 기준: ' + solution };
  }

  if (type === 'resource') {
    const shares = Object.fromEntries(players.map(player => [player.id, {
      energy: randomInt(3) + 1, data: randomInt(3) + 1
    }]));
    for (const player of players) privateById[player.id] = {
      heading: '내 자원', text: '에너지 ' + shares[player.id].energy + ' · 데이터 ' + shares[player.id].data
    };
    const energy = Object.values(shares).reduce((sum, share) => sum + share.energy, 0);
    const data = Object.values(shares).reduce((sum, share) => sum + share.data, 0);
    const projects = [
      { id: 'A', energy: 1, data: 1, reward: 9 },
      { id: 'B', energy: 1, data: 1, reward: 9 },
      { id: 'C', energy: randomInt(energy) + 1, data: randomInt(data) + 1, reward: randomInt(8) + 7 },
      { id: 'D', energy: randomInt(energy) + 1, data: randomInt(data) + 1, reward: randomInt(8) + 7 }
    ];
    const packages = [];
    for (let mask = 1; mask < 16; mask++) {
      const selected = projects.filter((_, index) => mask & (1 << index));
      const costEnergy = selected.reduce((sum, project) => sum + project.energy, 0);
      const costData = selected.reduce((sum, project) => sum + project.data, 0);
      const reward = selected.reduce((sum, project) => sum + project.reward, 0);
      packages.push({ id: selected.map(project => project.id).join('+'), costEnergy, costData, reward,
        feasible: costEnergy <= energy && costData <= data });
    }
    const feasible = packages.filter(item => item.feasible)
      .sort((a, b) => b.reward - a.reward || a.costEnergy + a.costData - b.costEnergy - b.costData || a.id.localeCompare(b.id));
    const best = feasible[0];
    const distractors = shuffle(packages.filter(item => item.id !== best.id)).slice(0, 3);
    const options = makeChoices([best, ...distractors].map(item => item.id),
      Object.fromEntries([best, ...distractors].map(item => [item.id, item.id.split('+').join(' + ')])));
    const projectText = projects.map(project => project.id + ': E' + project.energy + '/D' + project.data + ', ' + project.reward + '점').join(' · ');
    return { ...base, inputKind: 'choice', title: '다중 자원 최적화',
      prompt: '개인 자원을 합산해 가능한 프로젝트 조합 중 총 보상이 가장 큰 것을 고르세요.\n' + projectText,
      options, solution: best.id,
      revealText: '최적 조합: ' + best.id + ' · 보상 ' + best.reward };
  }

  if (type === 'auction') {
    const values = Object.fromEntries(players.map(player => [player.id, randomInt(9) + 3]));
    const budgets = Object.fromEntries(players.map(player => [player.id, randomInt(7) + 4]));
    for (const player of players) privateById[player.id] = { heading: '내 입찰 정보',
      text: '경매 물건의 내 가치는 ' + values[player.id] + '점, 내 입찰 한도는 ' + budgets[player.id] + '점입니다.' };
    return { ...base, inputKind: 'bid', title: '봉인 입찰',
      prompt: '각자 한 번 입찰합니다. 최고가가 낙찰되며, 동점은 추첨합니다. 점수는 내 가치에서 입찰액을 뺀 값입니다.',
      answerHint: '입찰액', values, budgets,
      revealText: '' };
  }

  if (type === 'truthLie') {
    const witnesses = ['가', '나', '다', '라'];
    const secret = randomInt(5) + 4;
    const liar = sample(witnesses);
    const statements = {};
    for (const witness of witnesses) {
      if (witness === liar) statements[witness] = secret <= 6
        ? [secret + 3, secret + 4]
        : [secret - 4, secret - 3];
      else statements[witness] = [secret - randomInt(3), secret + randomInt(3)];
    }
    const fragments = witnesses.map(witness => witness + '의 진술: 암호는 ' + statements[witness][0] + '부터 ' + statements[witness][1] + ' 사이입니다.');
    Object.assign(privateById, assignPrivate(players, fragments));
    return { ...base, inputKind: 'choice', title: '거짓 진술 한 개',
      prompt: '암호는 1~12입니다. 네 진술 중 하나만 거짓입니다. 나머지 세 구간에는 암호가 포함되고, 거짓 구간은 공통 범위와 겹치지 않습니다. 누가 거짓인가요?',
      answerHint: '거짓 진술자', options: makeChoices(witnesses), solution: liar, statements, secret,
      revealText: '거짓 진술자는 ' + liar + '입니다. 암호는 ' + secret + '입니다.' };
  }

  if (type === 'memory') {
    const memoryById = {};
    for (const player of players) {
      const sequence = Array.from({ length: 16 }, () => String(randomInt(10))).join('');
      memoryById[player.id] = sequence;
      privateById[player.id] = { heading: '내 숫자', text: '내 배열을 기억하세요.' };
    }
    return { ...base, inputKind: 'memory', title: '기억력 · 16자리',
      prompt: '16자리 숫자를 기억한 뒤 그대로 입력하세요.',
      placeholder: '16자리 숫자', maxLength: 16, memoryById, revealText: '' };
  }

  if (type === 'strategy') {
    const objectiveTypes = [
      { key: 'sum', text: '가져간 타일 숫자의 합을 최대화하세요.' },
      { key: 'even', text: '짝수 타일마다 3점을 얻습니다.' },
      { key: 'odd', text: '홀수 타일마다 3점을 얻습니다.' },
      { key: 'prime', text: '소수 타일마다 4점을 얻습니다.' },
      { key: 'triple', text: '3의 배수 타일마다 4점을 얻습니다.' },
      { key: 'low', text: '6 이하 타일마다 4점을 얻습니다.' }
    ];
    const cards = Array.from({ length: players.length * 2 }, (_, index) => ({
      id: 'T' + String(index + 1).padStart(2, '0'), value: randomInt(13) + 1
    }));
    const objectives = {};
    const shuffledObjectives = shuffle(objectiveTypes);
    for (const [index, player] of players.entries()) objectives[player.id] = shuffledObjectives[index % shuffledObjectives.length];
    return { ...base, inputKind: 'strategy', title: '타일 전략',
      prompt: '각자 목표에 맞춰 두 번씩 타일을 고르세요. 남은 타일과 선택은 공개됩니다.',
      answerHint: '타일 선택',
      privateById: Object.fromEntries(players.map(player => [player.id, { heading: '내 목표', text: objectives[player.id].text }])),
      cards, objectives, revealText: '' };
  }

  if (type === 'path') {
    const nodes = ['A', 'B', 'C', 'D'];
    const paths = nodes.map(node => ({ id: 'S-' + node + '-G', edges: ['S-' + node, node + '-G'] }));
    for (const first of nodes) for (const second of nodes) if (first !== second) {
      paths.push({ id: 'S-' + first + '-' + second + '-G', edges: ['S-' + first, first + '-' + second, second + '-G'] });
    }
    const edgeKeys = new Set(['S-A','S-B','S-C','S-D','A-G','B-G','C-G','D-G']);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) edgeKeys.add(nodes[i] + '-' + nodes[j]);
    const keys = [...edgeKeys];
    let edges, totals, shortest;
    for (let attempt = 0; attempt < 100; attempt++) {
      edges = Object.fromEntries(keys.map(key => [key, randomInt(20) + 1]));
      totals = Object.fromEntries(paths.map(path => [path.id, path.edges.reduce((sum, key) => sum + edges[key], 0)]));
      const minimum = Math.min(...Object.values(totals));
      shortest = paths.filter(path => totals[path.id] === minimum);
      if (shortest.length === 1) break;
    }
    const fragments = keys.map(key => key + ' 통로: ' + edges[key]);
    Object.assign(privateById, assignPrivate(players, fragments));
    const solution = shortest[0].id;
    return { ...base, inputKind: 'choice', title: '최단 경로',
      prompt: 'S에서 G까지 갈 수 있는 16개 후보입니다. 통로 길이를 합산해 가장 짧은 경로를 고르세요.',
      options: makeChoices(paths.map(path => path.id)), solution, totals,
      revealText: '정답: ' + solution + ' · 길이 ' + totals[solution] };
  }

  if (type === 'stateInference') {
    let state = Array.from({ length: 8 }, () => randomInt(2));
    const initial = [...state];
    const operations = [];
    for (let step = 0; step < 6; step++) {
      const kind = randomInt(3);
      if (kind === 0) {
        const index = randomInt(8);
        operations.push({ kind: 'flip', index, text: (index + 1) + '번 비트를 뒤집는다.' });
        state[index] = 1 - state[index];
      } else if (kind === 1) {
        const a = randomInt(8);
        let b = randomInt(8);
        while (a === b) b = randomInt(8);
        operations.push({ kind: 'swap', a, b, text: (a + 1) + '번과 ' + (b + 1) + '번 비트를 바꾼다.' });
        [state[a], state[b]] = [state[b], state[a]];
      } else {
        operations.push({ kind: 'rotate', text: '오른쪽 끝 비트를 맨 앞으로 한 칸 순환 이동한다.' });
        state = [state[7], ...state.slice(0, 7)];
      }
    }
    const fragments = initial.map((bit, index) => (index + 1) + '번 시작 비트는 ' + bit + '입니다.');
    Object.assign(privateById, assignPrivate(players, fragments));
    const solution = state.join('');
    return { ...base, inputKind: 'text', title: '8비트 상태 추론',
      prompt: '개인 단서를 합쳐 시작 상태를 복원하고 6개 연산을 순서대로 적용하세요.\n' +
        operations.map((operation, index) => (index + 1) + '. ' + operation.text).join('\n'),
      placeholder: '예: 10110110', maxLength: 8, operations, solution,
      revealText: '정답: ' + solution };
  }

  return { ...base, inputKind: 'number', title: '문제 오류', prompt: '문제를 다시 시작해 주세요.', solution: 0 };
}

function validateAnswer(game, playerId, value, meta) {
  const challenge = game.challenge;
  if (challenge.inputKind === 'strategy') return null;
  if (challenge.inputKind === 'choice') {
    const answer = String(value ?? '');
    return challenge.options.some(option => option.value === answer) ? answer : null;
  }
  if (challenge.inputKind === 'indianPoker') {
    if (!value || typeof value !== 'object') return null;
    const guess = Number(value.guess), wager = Number(value.wager);
    if (!Number.isInteger(guess) || guess < 2 || guess > 14 || !Number.isInteger(wager) || wager < 0 || wager > 5) return null;
    return { guess, wager };
  }
  if (challenge.inputKind === 'bid') {
    if (!value || typeof value !== 'object') return null;
    const bid = Number(value.bid), maxBid = challenge.budgets[playerId];
    if (!Number.isInteger(bid) || bid < 0 || bid > maxBid) return null;
    return { bid };
  }
  const answer = String(value ?? '').trim().toUpperCase();
  if (!answer || answer.length > 40) return null;
  if (challenge.inputKind === 'memory') return /^\d{12}$/.test(answer) ? answer : null;
  if (challenge.type === 'stateInference') return /^[01]{5}$/.test(answer) ? answer : null;
  if (!/^-?\d{1,4}$/.test(answer)) return null;
  const number = Number(answer);
  return Number.isSafeInteger(number) ? number : null;
}

function isPrime(value) {
  if (value < 2) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor++) if (value % divisor === 0) return false;
  return true;
}
function scoreChallenge(game, players) {
  const challenge = game.challenge;
  const points = Object.fromEntries(players.map(player => [player.id, 0]));
  const submitted = Object.fromEntries(players.map(player => [player.id, game.submissions[player.id]?.answer ?? null]));

  if (challenge.type === 'memory') {
    for (const player of players) {
      const answer = submitted[player.id];
      if (answer == null) continue;
      const target = challenge.memoryById[player.id];
      const matched = [...String(answer)].reduce((count, digit, index) => count + Number(digit === target[index]), 0);
      points[player.id] = Math.floor(matched / 2) + Number(matched === 12);
    }
    return points;
  }
  if (challenge.type === 'indianPoker') {
    const highest = Math.max(...Object.values(challenge.hand));
    for (const player of players) {
      const answer = submitted[player.id];
      if (!answer) continue;
      points[player.id] = answer.guess === challenge.hand[player.id] ? 4 + answer.wager : -answer.wager;
      if (challenge.hand[player.id] === highest) points[player.id] += 1;
    }
    return points;
  }
  if (challenge.type === 'auction') {
    const bids = players.filter(player => submitted[player.id] != null)
      .map(player => ({ player, bid: submitted[player.id].bid }));
    if (!bids.length) return points;
    const highest = Math.max(...bids.map(item => item.bid));
    const winner = bids.filter(item => item.bid === highest)
      .sort((a, b) => challenge.tieBreak[a.player.id] - challenge.tieBreak[b.player.id])[0];
    points[winner.player.id] = challenge.values[winner.player.id] - winner.bid;
    return points;
  }
  if (challenge.type === 'strategy') {
    const cardById = Object.fromEntries(challenge.cards.map(card => [card.id, card]));
    for (const player of players) {
      const picked = game.moves.filter(move => move.playerId === player.id).map(move => cardById[move.cardId]?.value).filter(Number.isInteger);
      const objective = challenge.objectives[player.id];
      const sum = picked.reduce((total, value) => total + value, 0);
      if (objective.key === 'sum') points[player.id] = Math.floor(sum / 3);
      else if (objective.key === 'even') points[player.id] = picked.filter(value => value % 2 === 0).length * 3;
      else if (objective.key === 'odd') points[player.id] = picked.filter(value => value % 2 === 1).length * 3;
      else if (objective.key === 'prime') points[player.id] = picked.filter(isPrime).length * 4;
      else if (objective.key === 'triple') points[player.id] = picked.filter(value => value % 3 === 0).length * 4;
      else if (objective.key === 'low') points[player.id] = picked.filter(value => value <= 6).length * 4;
    }
    return points;
  }

  const correct = players.filter(player => submitted[player.id] != null && String(submitted[player.id]) === String(challenge.solution));
  for (const player of correct) points[player.id] = 4;
  if (correct.length) {
    const fastest = Math.min(...correct.map(player => game.submissions[player.id].submittedAt));
    for (const player of correct) if (game.submissions[player.id].submittedAt === fastest) points[player.id] += 1;
  }
  return points;
}
function answerLabel(challenge, answer, playerId, game) {
  if (answer == null) return '시간 초과 · 미제출';
  if (challenge.type === 'indianPoker') return rankName(answer.guess) + ' 예상 · 실제 ' + rankName(challenge.hand[playerId]) + ' · ' + answer.wager + '점 베팅';
  if (challenge.type === 'auction') return answer.bid + '점 입찰 · 내 가치 ' + challenge.values[playerId] + '점';
  if (challenge.type === 'strategy') {
    const cardById = Object.fromEntries(challenge.cards.map(card => [card.id, card]));
    return game.moves.filter(move => move.playerId === playerId).map(move => cardById[move.cardId]?.value).join(', ') + ' 타일';
  }
  if (challenge.inputKind === 'choice') return challenge.options.find(option => option.value === String(answer))?.label || String(answer);
  return '답 ' + String(answer);
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
      if (snapshot?.meta?.schemaVersion === 2) { this.meta = snapshot.meta; this.game = snapshot.game; }
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
    this.meta = { schemaVersion: 2, code: body.code, maxPlayers: body.maxPlayers, hostId: playerId, status: 'waiting', seq: 1,
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
    const currentPlayerId = challenge?.type === 'strategy' ? this.game.turnOrder[this.game.turnIndex] : null;
    const availableCards = challenge?.type === 'strategy'
      ? challenge.cards.filter(card => !this.game.moves.some(move => move.cardId === card.id))
      : [];
    const moves = challenge?.type === 'strategy' ? this.game.moves.map(move => ({
      name: this.meta.players[move.playerId]?.name || '참가자',
      value: challenge.cards.find(card => card.id === move.cardId)?.value
    })) : [];
    const game = this.game ? {
      seq: this.game.seq, phaseId: this.game.phaseId, phase: this.game.phase, stage: this.game.stage,
      round: this.game.round, finalIndex: this.game.finalIndex,
      finalRoundCount: this.game.finalRoundCount || this.game.finalTypes?.length || 3, deadlineAt: this.game.deadlineAt,
      type: challenge.type, inputKind: challenge.inputKind,
      title: challenge.title, prompt: challenge.prompt,
      placeholder: challenge.placeholder, maxLength: challenge.maxLength,
      options: challenge.inputKind === 'choice' ? challenge.options : undefined,
      studySequence: this.game.phase === 'study' ? challenge.memoryById?.[playerId] : undefined,
      market: challenge.type === 'strategy' ? availableCards : undefined,
      moves: challenge.type === 'strategy' ? moves : undefined,
      turnNumber: challenge.type === 'strategy' ? this.game.turnIndex + 1 : undefined,
      turnCount: challenge.type === 'strategy' ? this.game.turnOrder.length : undefined,
      turnPlayerName: currentPlayerId ? this.meta.players[currentPlayerId]?.name : undefined,
      yourTurn: currentPlayerId === playerId,
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
      deadlineAt: 0, challenge: null, submissions: {}, moves: [], turnOrder: [], turnIndex: 0,
      result: null, winnerId: null, lastMainType: null };
    if (activePlayers(this.meta).length === 2) this.beginFinal();
    else this.beginChallenge('main', chooseMainType(null));
  }

  beginChallenge(stage, type) {
    const players = activePlayers(this.meta);
    for (const player of makePlayers(this.meta)) player.roundPoints = 0;
    const challenge = makeChallenge(type, players);
    this.game.stage = stage;
    this.game.challenge = challenge;
    this.game.submissions = {};
    this.game.moves = [];
    this.game.turnOrder = [];
    this.game.turnIndex = 0;
    this.game.result = null;
    this.game.phase = type === 'memory' ? 'study' : type === 'strategy' ? 'turn' : 'answer';
    if (stage === 'main') this.game.lastMainType = type;
    if (type === 'strategy') {
      const firstLap = shuffle(players.map(player => player.id));
      const secondLap = [...firstLap].reverse();
      if (secondLap.length > 1) secondLap.push(secondLap.shift());
      this.game.turnOrder = [...firstLap, ...secondLap];
    }
    this.game.phaseId++;
    this.game.deadlineAt = Date.now() + (type === 'memory' ? 12_000 : type === 'strategy' ? 20_000 : 75_000);
    this.meta.expires = Date.now() + 60 * 60_000;
    this.bump();
  }

  beginFinal() {
    this.game.stage = 'final';
    this.game.finalIndex = 1;
    this.game.finalRoundCount = this.meta.maxPlayers === 2 ? 10 : 3;
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
      if (this.meta.status !== 'playing' || player.eliminated)
        return this.send(playerId, { type: 'error', message: '현재 행동할 수 없습니다.' });
      if (message.phaseId !== this.game.phaseId) return this.send(playerId, { type: 'error', message: '문제가 바뀌었습니다. 최신 문제를 확인해 주세요.' });
      if (Date.now() >= this.game.deadlineAt) { await this.onDeadline(); await this.persistAndBroadcast(); return; }
      const actionId = String(message.actionId || '').slice(0, 80);
      if (!actionId) return this.send(playerId, { type: 'error', message: '제출 번호가 없습니다. 다시 시도해 주세요.' });

      if (this.game.phase === 'turn' && this.game.challenge.type === 'strategy') {
        const currentPlayerId = this.game.turnOrder[this.game.turnIndex];
        if (playerId !== currentPlayerId) return this.send(playerId, { type: 'error', message: '아직 내 차례가 아닙니다.' });
        const cardId = String(message.answer ?? '');
        const available = this.game.challenge.cards.find(card => card.id === cardId &&
          !this.game.moves.some(move => move.cardId === card.id));
        if (!available) return this.send(playerId, { type: 'error', message: '선택할 수 없는 타일입니다.' });
        this.game.moves.push({ playerId, cardId, actionId });
        this.game.turnIndex++;
        this.game.phaseId++;
        this.bump();
        if (this.game.turnIndex >= this.game.turnOrder.length) this.resolveChallenge();
        else this.game.deadlineAt = Date.now() + 20_000;
        await this.persistAndBroadcast();
        return;
      }

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
      let detail = answerLabel(challenge, answer, player.id, this.game);
      if (challenge.type === 'memory' && answer != null) {
        const target = challenge.memoryById[player.id];
        const hits = [...String(answer)].reduce((count, digit, index) => count + Number(digit === target[index]), 0);
        detail += ' · ' + hits + '/12자리 일치';
      }
      if (challenge.type === 'strategy') detail = '비공개 목표: ' + challenge.objectives[player.id].text;
      return { player, points: player.roundPoints, detail };
    }).sort((a, b) => b.points - a.points || a.player.name.localeCompare(b.player.name, 'ko'));
    let headline = challenge.title + ' 결과';
    if (challenge.type === 'auction') {
      const bids = players.filter(player => this.game.submissions[player.id]?.answer != null);
      if (!bids.length) headline = '입찰 없음';
      else {
        const highest = Math.max(...bids.map(player => this.game.submissions[player.id].answer.bid));
        const winner = bids.filter(player => this.game.submissions[player.id].answer.bid === highest)
          .sort((a, b) => challenge.tieBreak[a.id] - challenge.tieBreak[b.id])[0];
        headline = winner.name + ' 낙찰';
      }
    }
    if (challenge.type === 'indianPoker') headline = '더블덱 인디안 포커 결과';
    if (this.game.stage === 'main') {
      const order = [...players].sort((a, b) => a.roundPoints - b.roundPoints || a.score - b.score ||
        challenge.tieBreak[a.id] - challenge.tieBreak[b.id]);
      const eliminated = order[0];
      eliminated.eliminated = true;
      eliminated.eliminatedRound = this.game.round;
      headline = eliminated.name + ' 탈락 · ' + activePlayers(this.meta).length + '명 생존';
    }
    this.game.result = {
      headline, subline: challenge.revealText || '',
      lines: lines.map(item => ({ text: item.player.name + ' — ' + item.points + '점 · ' + item.detail }))
    };
    this.game.phaseId++;
    this.bump();

    if (this.game.stage === 'final' && this.game.finalIndex >= (this.game.finalRoundCount || this.game.finalTypes?.length || 3)) {
      const finalists = activePlayers(this.meta).sort((a, b) => b.finalScore - a.finalScore ||
        this.game.finalTieBreak[a.id] - this.game.finalTieBreak[b.id]);
      this.game.winnerId = finalists[0]?.id || null;
      this.game.phase = 'finished';
      this.game.deadlineAt = 0;
      this.meta.status = 'finished';
      this.meta.expires = Date.now() + 5 * 60_000;
      this.game.result.headline = (this.meta.players[this.game.winnerId]?.name || '우승자') + ' 최종 우승';
      return;
    }
    this.game.phase = 'result';
    this.game.deadlineAt = Date.now() + 8_000;
  }

  async advance() {
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
    if (this.game.phase === 'study') {
      this.game.phase = 'answer';
      this.game.phaseId++;
      this.game.deadlineAt = Date.now() + 40_000;
      this.bump();
    } else if (this.game.phase === 'turn' && this.game.challenge.type === 'strategy') {
      const playerId = this.game.turnOrder[this.game.turnIndex];
      const available = this.game.challenge.cards.filter(card => !this.game.moves.some(move => move.cardId === card.id));
      if (!playerId || !available.length) return this.resolveChallenge();
      this.game.moves.push({ playerId, cardId: sample(available).id, actionId: 'timeout-' + this.game.phaseId });
      this.game.turnIndex++;
      this.game.phaseId++;
      this.bump();
      if (this.game.turnIndex >= this.game.turnOrder.length) this.resolveChallenge();
      else this.game.deadlineAt = Date.now() + 20_000;
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
