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

const TRAINING_TYPE_POOLS = {
  logic: ['sequence', 'symbolGrid', 'logicGrid', 'spatial', 'miniSudoku', 'codeLock', 'truthLie'],
  information: ['turtleSoup', 'cipher', 'probability', 'path', 'stateInference'],
  strategy: ['resource', 'strategy'],
  memory: ['memory']
};
const TRAINING_CATEGORY_LABELS = {
  logic: '논리·제약조건',
  information: '정보·확률 추론',
  strategy: '자원·전략',
  memory: '기억·패턴'
};
const TRAINING_TIPS = {
  sequence: '홀수항과 짝수항의 규칙을 나누고, 찾은 규칙을 다음 항에 대입해 확인하세요.',
  symbolGrid: '식의 차이를 이용해 기호를 좁힌 뒤, 구한 값을 마지막 계산에 다시 대입하세요.',
  logicGrid: '강한 제약부터 표로 정리하고, 답 후보가 모든 단서를 만족하는지 확인하세요.',
  spatial: '각 변환을 순서대로 적용하고, 좌표가 격자 안에 있는지 마지막에 확인하세요.',
  miniSudoku: '행·열·상자 제약을 따로 적용해 후보를 줄이고 빈칸을 검산하세요.',
  codeLock: '후보를 줄인 뒤 암호가 모든 위치·숫자 단서를 만족하는지 재검증하세요.',
  turtleSoup: '사건의 원인과 결과를 분리하고, 질문마다 가능한 가설이 얼마나 줄었는지 보세요.',
  cipher: '변환의 순서를 거꾸로 풀고, 복호화 결과가 알려진 후보와 일치하는지 확인하세요.',
  probability: '사전확률과 관측 우도를 분리해 비교하고, 직관 대신 전체 표본을 반영하세요.',
  resource: '가능한 조합부터 걸러낸 뒤 보상을 비교하고, 자원 제약을 마지막에 다시 확인하세요.',
  truthLie: '사람별 추측 대신 각 진술을 변수화하고, 거짓 진술이 정확히 하나인지 검증하세요.',
  memory: '숫자를 일정한 묶음으로 나누어 기억한 뒤, 입력 전 원래 순서를 확인하세요.',
  strategy: '내 목표와 남은 타일을 함께 보고, 지금 선택이 다음 선택지를 어떻게 바꾸는지 계산하세요.',
  path: '후보 경로를 나열하고 간선 비용을 합산해 최소 경로를 직접 비교하세요.',
  stateInference: '초기 상태와 연산을 분리해 기록하고, 연산을 순서대로 적용한 뒤 전체 비트를 검산하세요.'
};
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
  if (average >= 0.85) return { label: '★★★★★ · 시간 압박', multiplier: 0.8 };
  return { label: '★★★★ · 실전 기본', multiplier: 1 };
}
function trainingDuration(type, history, category, phase = 'answer') {
  const base = phase === 'study' ? 18_000
    : type === 'memory' ? 40_000
    : type === 'strategy' ? 20_000
    : 75_000;
  return Math.round(base * trainingLevel(history, category).multiplier);
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
    buckets[player.id] = { heading: '내 단서', text: buckets[player.id].join('\n') || '단서 없음' };
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
    const position = (state, name) => state.order.indexOf(name);
    const colorHolder = (state, color) => names.find(name => state.colorByName[name] === color);
    const facts = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i], b = names[j];
        facts.push({ test: state => position(state, a) < position(state, b), text: a + '은(는) ' + b + '보다 앞선다.' });
        facts.push({ test: state => Math.abs(position(state, a) - position(state, b)) === 2, text: a + '과(와) ' + b + ' 사이에는 한 명이 있다.' });
        facts.push({ test: state => position(state, a) + 1 === position(state, b), text: a + ' 바로 뒤에 ' + b + '가 선다.' });
        facts.push({ test: state => position(state, b) + 1 === position(state, a), text: b + ' 바로 뒤에 ' + a + '가 선다.' });
      }
    }
    for (const name of names) for (const color of colors) {
      facts.push({ test: state => position(state, name) < position(state, colorHolder(state, color)),
        text: name + '은(는) ' + color + ' 표식 참가자보다 앞선다.' });
      facts.push({ test: state => position(state, name) + 1 === position(state, colorHolder(state, color)),
        text: name + ' 바로 뒤에 ' + color + ' 표식 참가자가 선다.' });
      facts.push({ test: state => position(state, name) + 2 === position(state, colorHolder(state, color)),
        text: name + '보다 두 자리 앞에 ' + color + ' 표식 참가자가 선다.' });
    }
    const wordCount = Math.ceil(states.length / 32);
    const clueMasks = facts.map(fact => {
      const mask = new Uint32Array(wordCount);
      for (let index = 0; index < states.length; index++) {
        if (fact.test(states[index])) mask[index >>> 5] |= 1 << (index & 31);
      }
      return mask;
    });
    const popcount = value => {
      value >>>= 0;
      value -= (value >>> 1) & 0x55555555;
      value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
      return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    };
    const targetIndex = states.indexOf(target);
    const targetWord = targetIndex >>> 5, targetBit = 1 << (targetIndex & 31);
    let remainingMask = new Uint32Array(wordCount).fill(0xffffffff);
    let remainingCount = states.length;
    const clues = [];
    while (remainingCount > 1) {
      let bestIndex = -1, bestCount = remainingCount;
      const order = shuffle(facts.map((_, index) => index));
      for (const factIndex of order) {
        if ((clueMasks[factIndex][targetWord] & targetBit) === 0) continue;
        let matches = 0;
        for (let word = 0; word < wordCount; word++) {
          matches += popcount(remainingMask[word] & clueMasks[factIndex][word]);
          if (matches >= bestCount) break;
        }
        if (matches < bestCount) { bestIndex = factIndex; bestCount = matches; }
      }
      if (bestIndex < 0) break;
      clues.push(facts[bestIndex].text);
      for (let word = 0; word < wordCount; word++) remainingMask[word] &= clueMasks[bestIndex][word];
      remainingCount = bestCount;
    }
    const solution = target.colorByName[target.order[2]];
    return { ...base, inputKind: 'choice', title: '순위·표식 논리',
      prompt: '다섯 참가자의 순위와 표식은 모두 다릅니다. 관계 단서를 정리해 3위 참가자의 표식을 고르세요.\n' +
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
    const size = 6;
    const baseGrid = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => (row * 3 + Math.floor(row / 2) + column) % size + 1));
    const groupedOrder = groupSize => shuffle(Array.from({ length: size / groupSize }, (_, group) => group))
      .flatMap(group => shuffle(Array.from({ length: groupSize }, (_, offset) => group * groupSize + offset)));
    const rowOrder = groupedOrder(2), columnOrder = groupedOrder(3), digitMap = shuffle([1,2,3,4,5,6]);
    const solved = rowOrder.map(row => columnOrder.map(column => digitMap[baseGrid[row][column] - 1]));
    const board = solved.map(row => [...row]);
    function countSolutions() {
      let count = 0;
      function search() {
        if (count >= 2) return;
        let bestCell = null, bestValues = null;
        for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
          if (board[row][column] !== 0) continue;
          const possible = Array.from({ length: size }, (_, index) => index + 1).filter(value => {
            for (let index = 0; index < size; index++) {
              if (board[row][index] === value || board[index][column] === value) return false;
            }
            const boxRow = Math.floor(row / 2) * 2, boxColumn = Math.floor(column / 3) * 3;
            for (let r = boxRow; r < boxRow + 2; r++) for (let c = boxColumn; c < boxColumn + 3; c++) {
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
    const removalOrder = shuffle(Array.from({ length: size * size }, (_, index) => ({
      row: Math.floor(index / size), column: index % size
    })));
    let blankCount = 0;
    for (const cell of removalOrder) {
      if (blankCount >= 18) break;
      board[cell.row][cell.column] = 0;
      if (countSolutions() === 1) blankCount++;
      else board[cell.row][cell.column] = solved[cell.row][cell.column];
    }
    const blanks = [];
    for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
      if (board[row][column] === 0) blanks.push({ row, column });
    }
    const solution = blanks.map(cell => solved[cell.row][cell.column]).join('');
    const distractorSet = new Set([solution]);
    for (let index = 0; index < solution.length && distractorSet.size < 4; index++) {
      for (let shift = 1; shift < size && distractorSet.size < 4; shift++) {
        const replacement = String((Number(solution[index]) - 1 + shift) % size + 1);
        distractorSet.add(solution.slice(0, index) + replacement + solution.slice(index + 1));
      }
    }
    const values = [...distractorSet];
    const labels = Object.fromEntries(values.map(value => [value, [...value].join(' ')]));
    const gridText = board.map((row, rowIndex) => row
      .map((value, column) => String(value || '·').padStart(2, ' ') + (column === 2 ? ' │' : ''))
      .join(' ') + (rowIndex === 1 || rowIndex === 3 ? '\n------+-------' : '')).join('\n');
    return { ...base, inputKind: 'choice', title: '6×6 스도쿠',
      prompt: '각 행·열·2×3 상자에 1~6이 한 번씩 들어갑니다. 물음표를 행 순서대로 채우세요.\n' + gridText,
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
      privateById[player.id] = { heading: '내 카드', text: visible.length ? '상대 공개 카드: ' + visible.join(' · ') : '상대 카드 없음' };
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
      },
      {
        prompt: '한 사람이 맑은 날에는 15층에서 내려 5층을 걷고, 비 오는 날에는 20층까지 갑니다. 이유는?',
        options: [
          { value: 'A', label: '비 오는 날에는 엘리베이터가 20층까지 운행한다.' },
          { value: 'B', label: '키가 작아 버튼에 닿지 않지만, 비 오는 날 우산으로 20층을 누른다.' },
          { value: 'C', label: '20층 버튼은 방장이 눌러야 한다.' },
          { value: 'D', label: '비 오는 날에는 계단이 잠긴다.' }
        ],
        solution: 'B',
        clues: ['그 사람은 20층에 삽니다.', '엘리베이터는 모든 층에 정상적으로 섭니다.', '그 사람은 키가 작아 높은 버튼에 손이 닿지 않습니다.', '맑은 날에는 우산이 없습니다.', '비 오는 날에는 긴 우산을 가지고 있습니다.', '우산 끝으로 20층 버튼을 누를 수 있습니다.', '15층에서 20층까지 계단으로 갈 수 있습니다.'],
        explanation: '우산 끝으로 높은 층 버튼을 누릅니다.'
      },
      {
        prompt: '문이 잠긴 방에 물웅덩이와 유리 조각, 죽은 물고기가 있습니다. 무슨 일이 있었나요?',
        options: [
          { value: 'A', label: '열린 창문으로 들어온 바람이 어항을 떨어뜨렸다.' },
          { value: 'B', label: '누군가 문을 열고 물고기를 가져갔다.' },
          { value: 'C', label: '수도관이 터져 물고기가 빠져나왔다.' },
          { value: 'D', label: '물고기가 어항 밖으로 뛰어내렸다.' }
        ],
        solution: 'A',
        clues: ['방에는 사람의 출입 흔적이 없습니다.', '살아 있던 생물은 금붕어 한 마리뿐입니다.', '금붕어는 유리 어항에 있었습니다.', '어항은 열린 창문 옆 선반에 놓여 있었습니다.', '당시 커튼이 바람에 크게 흔들렸습니다.', '바닥의 유리 조각은 어항과 같은 재질입니다.', '문은 안쪽에서 잠겨 있었습니다.'],
        explanation: '창문으로 들어온 바람에 어항이 떨어져 깨졌습니다.'
      },
      {
        prompt: '사람이 들판에서 발견됐고, 곁에는 열리지 않은 가방이 있었습니다. 가방에는 무엇이 있었나요?',
        options: [
          { value: 'A', label: '열리지 않은 낙하산' },
          { value: 'B', label: '구급상자' },
          { value: 'C', label: '음식과 물' },
          { value: 'D', label: '도구 상자' }
        ],
        solution: 'A',
        clues: ['그 사람은 높은 곳에서 떨어졌습니다.', '가방은 낙하 속도를 줄이기 위한 장비였습니다.', '가방은 땅에 닿을 때까지 열리지 않았습니다.', '그 사람은 비행기에서 뛰어내렸습니다.', '비행에는 낙하산이 필요했습니다.', '가방은 정상적인 낙하산 가방이었습니다.'],
        explanation: '낙하산이 펼쳐지지 않았습니다.'
      },
      {
        prompt: '남자가 호텔 앞에서 자동차를 밀자 전 재산을 잃었습니다. 왜일까요?',
        options: [
          { value: 'A', label: '자동차가 고장 나 호텔에 부딪혔다.' },
          { value: 'B', label: '보드게임에서 자동차 말을 움직여 호텔 칸에 도착했다.' },
          { value: 'C', label: '호텔 주차 요금을 내지 못했다.' },
          { value: 'D', label: '자동차가 도난당했다.' }
        ],
        solution: 'B',
        clues: ['그 남자는 실제 도로에 있지 않았습니다.', '자동차는 손바닥 크기의 게임 말입니다.', '호텔은 게임판의 부동산 칸에 있습니다.', '남자는 상대의 호텔이 있는 칸에 도착했습니다.', '그 게임에서는 상대 호텔에 도착하면 통행료를 냅니다.', '남자는 가진 돈보다 통행료가 많았습니다.'],
        explanation: '보드게임에서 호텔 칸에 걸려 파산했습니다.'
      },
      {
        prompt: '네 사람이 1분·2분·7분·10분 걸립니다. 한 번에 두 명까지 다리를 건널 수 있고 손전등은 하나뿐입니다. 모두 건너는 최소 시간은?',
        options: [
          { value: 'A', label: '15분' },
          { value: 'B', label: '17분' },
          { value: 'C', label: '19분' },
          { value: 'D', label: '21분' }
        ],
        solution: 'B',
        clues: ['A의 단독 통과 시간은 1분입니다.', 'B의 단독 통과 시간은 2분입니다.', 'C의 단독 통과 시간은 7분입니다.', 'D의 단독 통과 시간은 10분입니다.', '두 명이 함께 건너면 느린 사람의 시간이 걸립니다.', '손전등은 건널 때마다 필요하고 한 번에 한쪽 방향으로만 이동합니다.', '다리를 건넌 사람은 손전등을 들고 되돌아올 수 있습니다.', '모두가 도착해야 종료하며, 이동 중에는 다리 양쪽에 사람이 남을 수 있습니다.'],
        explanation: '1·2분인 두 사람이 손전등을 왕복시키고, 7·10분인 두 사람이 함께 건너면 최소 17분입니다.'
      },
      {
        prompt: '방 밖에 스위치 세 개, 안쪽 방에 전구 세 개가 있습니다. 방에 한 번만 들어가 스위치와 전구를 모두 짝지으려면?',
        options: [
          { value: 'A', label: '첫 스위치를 켠 채 들어가 빛만 확인한다.' },
          { value: 'B', label: '첫 스위치를 잠시 켰다 끄고, 둘째를 켠 뒤 들어가 빛과 열을 확인한다.' },
          { value: 'C', label: '세 스위치를 차례로 한 번씩 켜고 바로 들어간다.' },
          { value: 'D', label: '셋째 스위치를 켰다 끄고 들어가 전구 위치를 추측한다.' }
        ],
        solution: 'B',
        clues: ['스위치 하나는 전구 하나에만 연결됩니다.', '방 안은 스위치가 켜진 전구만 빛나도록 어둡습니다.', '전구는 켜져 있으면 빛으로 확인할 수 있습니다.', '전구는 꺼진 직후에도 잠시 열을 유지합니다.', '방에는 딱 한 번 들어갈 수 있고 다시 나와 조작할 수 없습니다.', '입장 전에는 스위치를 여러 번 켜거나 끌 수 있습니다.', '입장 뒤에는 스위치를 만질 수 없습니다.', '다른 측정 도구나 사람의 도움은 없습니다.'],
        explanation: '첫 전구를 데운 뒤 끄고 둘째를 켭니다. 들어가서 켜진 전구, 꺼졌지만 따뜻한 전구, 차가운 전구를 구분합니다.'
      },
      {
        prompt: '불균등하게 타는 밧줄 두 개와 성냥이 있습니다. 각 밧줄은 완전히 타는 데 정확히 60분 걸립니다. 정확히 45분을 재는 방법은?',
        options: [
          { value: 'A', label: '첫 밧줄을 한쪽에서 태운 뒤 45분쯤에 끈다.' },
          { value: 'B', label: '첫 밧줄은 양끝에서, 둘째는 한쪽에서 동시에 태운다. 첫 밧줄이 끝나면 둘째의 반대쪽도 태운다.' },
          { value: 'C', label: '두 밧줄을 한쪽씩 동시에 태워 첫 번째가 끝날 때까지 기다린다.' },
          { value: 'D', label: '첫 밧줄을 양끝에서 태우고 끝난 뒤 둘째를 한쪽에서 태운다.' }
        ],
        solution: 'B',
        clues: ['각 밧줄 하나는 불이 붙은 뒤 완전히 타는 데 60분이 걸립니다.', '밧줄의 어느 구간이 몇 분 타는지는 균일하지 않습니다.', '밧줄 양끝에 동시에 불을 붙일 수 있습니다.', '불이 한쪽에서 붙은 밧줄은 꺼지지 않고 계속 탑니다.', '첫 밧줄 양끝을 태우면 전체가 30분 뒤 끝납니다.', '그동안 둘째 밧줄은 한쪽에서만 타고 있습니다.', '둘째 밧줄은 반대쪽에도 불을 붙일 수 있습니다.', '성냥 외에 시계나 자를 사용할 수 없습니다.'],
        explanation: '첫 밧줄은 양끝에서 30분 만에 탑니다. 그때 둘째 밧줄의 반대쪽에도 불을 붙이면 남은 부분이 15분 만에 타서 총 45분입니다.'
      },
      {
        prompt: '겉모습이 같은 공 8개 중 하나만 더 무겁습니다. 양팔저울로 두 번만 재서 반드시 찾으려면 첫 비교는?',
        options: [
          { value: 'A', label: '공 3개와 공 3개' },
          { value: 'B', label: '공 4개와 공 4개' },
          { value: 'C', label: '공 2개와 공 2개' },
          { value: 'D', label: '공 1개와 공 1개' }
        ],
        solution: 'A',
        clues: ['위조 공은 정확히 하나이며 정상 공보다 무겁습니다.', '공은 눈으로 구별할 수 없습니다.', '양팔저울은 왼쪽이 무거움·오른쪽이 무거움·균형 세 결과를 냅니다.', '정상 공의 무게를 재는 추가 추는 없습니다.', '첫 비교 뒤 결과에 따라 두 번째 비교 대상을 정할 수 있습니다.', '두 번의 비교가 끝나면 공 하나를 특정해야 합니다.', '첫 비교에서 균형이면 위조 공은 양쪽에 올리지 않은 공들 중 하나입니다.', '첫 비교에서 기울면 더 무거운 쪽에 위조 공이 있습니다.'],
        explanation: '3개씩 비교하면 균형일 때 남은 2개, 기울 때 무거운 쪽 3개가 후보입니다. 둘째 비교 한 번으로 어느 경우든 찾을 수 있습니다.'
      },
      {
        prompt: '문 100개가 모두 닫혀 있습니다. 1번 사람은 모든 문을, 2번 사람은 2의 배수 번호 문을, n번 사람은 n의 배수 번호 문을 한 번씩 바꿉니다. 마지막에 열린 문은 몇 개인가요?',
        options: [
          { value: 'A', label: '9개' },
          { value: 'B', label: '10개' },
          { value: 'C', label: '50개' },
          { value: 'D', label: '100개' }
        ],
        solution: 'B',
        clues: ['사람은 1번부터 100번까지 한 명씩 차례로 행동합니다.', 'n번 사람은 n의 배수 번호인 문만 바꿉니다.', '문을 바꾼다는 것은 닫힘과 열림을 서로 뒤집는 것입니다.', '문 번호의 약수인 사람 수만큼 그 문 상태가 바뀝니다.', '약수는 보통 짝을 이룹니다.', '서로 다른 약수끼리 짝지을 수 없는 번호는 제곱수입니다.', '짝수 번 바뀐 문은 닫히고 홀수 번 바뀐 문은 열립니다.', '100 이하의 제곱수 개수를 세어야 합니다.'],
        explanation: '홀수 개의 약수를 가진 문은 제곱수 번호입니다. 1²부터 10²까지 총 10개가 열립니다.'
      },
      {
        prompt: '죄수 100명과 상자 100개에 각각 1~100 번호가 무작위로 하나씩 들어 있습니다. 각 죄수는 상자 50개만 열 수 있습니다. 전원이 자기 번호를 찾을 확률을 높이는 사전 전략은?',
        options: [
          { value: 'A', label: '각자 무작위로 50개를 고른다.' },
          { value: 'B', label: '상자 번호를 따라가며 시작 번호가 나온 상자부터 최대 50개를 연다.' },
          { value: 'C', label: '모두 같은 번호의 상자 50개를 열어 결과를 공유한다.' },
          { value: 'D', label: '죄수 번호 순서대로 상자 번호가 작은 것부터 연다.' }
        ],
        solution: 'B',
        clues: ['각 상자에는 서로 다른 죄수 번호 하나씩이 들어 있습니다.', '상자 번호와 안에 든 번호는 무작위 순열입니다.', '죄수들은 시작 전에 전략을 합의할 수 있습니다.', '죄수들은 상자를 연 뒤 다시 닫을 수 있습니다.', '각 죄수는 자기 번호를 찾으면 성공입니다.', '한 명이라도 번호를 못 찾으면 전원이 실패합니다.', '각 죄수는 최대 50개만 열 수 있습니다.', '상자 번호를 따라가면 순열의 사이클을 차례로 탐색할 수 있습니다.'],
        explanation: '자기 번호 상자에서 시작해 그 안의 번호를 다음 상자로 따라갑니다. 모두가 순열의 사이클 길이 50 이하에 속하면 전원이 성공합니다.'
      },
      {
        prompt: 'A는 B와 C의 모자를 봅니다. B는 C만 보고, C는 벽을 봅니다. 검은 모자 둘·흰 모자 둘을 썼을 때 A가 침묵했습니다. B가 자기 모자 색을 알아낸 근거는?',
        options: [
          { value: 'A', label: 'A가 침묵했으므로 B와 C는 같은 색이다.' },
          { value: 'B', label: 'A의 침묵으로 B와 C가 다름을 알고, C의 색에서 자기 색을 추론한다.' },
          { value: 'C', label: '벽 뒤의 D가 B에게 색을 알려 줬다.' },
          { value: 'D', label: '검은 모자가 둘이므로 B는 검은색이다.' }
        ],
        solution: 'B',
        clues: ['네 사람의 모자는 검은색 둘, 흰색 둘입니다.', '모든 사람은 모자 수와 배치를 알고 있습니다.', 'A, B, C는 한 줄로 서서 앞을 봅니다.', 'A는 B와 C의 모자를 볼 수 있습니다.', 'B는 C의 모자만 볼 수 있습니다.', 'C는 앞의 벽 때문에 아무 모자도 볼 수 없습니다.', 'D는 벽 반대편에 있어 다른 사람을 볼 수 없습니다.', '모자 색을 알면 즉시 말하고, A는 침묵했습니다.'],
        explanation: 'B와 C가 같은 색이라면 A는 자기 색을 알 수 있습니다. A의 침묵은 둘의 색이 다르다는 뜻이므로 B는 C와 반대 색입니다.'
      },
      {
        prompt: '25마리 말 중 가장 빠른 세 마리를 찾으려 합니다. 한 번에 다섯 마리만 경주할 수 있고 시간 기록은 없습니다. 최소 경주 횟수는?',
        options: [
          { value: 'A', label: '6회' },
          { value: 'B', label: '7회' },
          { value: 'C', label: '8회' },
          { value: 'D', label: '9회' }
        ],
        solution: 'B',
        clues: ['말은 다섯 마리씩 다섯 조로 나눌 수 있습니다.', '한 경주에는 최대 다섯 마리만 참가합니다.', '각 경주에서는 결승 순서만 알 수 있고 정확한 시간은 모릅니다.', '말의 속도는 경주마다 같으며 다시 출전할 수 있습니다.', '다섯 조의 경주 순서를 각각 알아야 합니다.', '각 조 1위끼리 한 번 더 달린 결과는 A1, B1, C1, D1, E1 순입니다.', 'A1은 전체에서 가장 빠르고, 상위 세 마리 후보는 A1·A2·A3·B1·B2·C1입니다.', 'A1을 제외한 다섯 후보를 한 경주에 달리게 해 2·3위를 정할 수 있습니다.'],
        explanation: '조별 5회, 각 조 1위 경주 1회, 남은 상위 후보 경주 1회로 최소 7회입니다.'
      }
    ];
    const puzzle = randomInt(4) === 0 ? sample(cases.slice(0, 7)) : sample(cases.slice(7));
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
    const weightedTotal = players.reduce((sum, player, index) => sum + (index + 1) * rankById[player.id] + rankById[player.id] ** 2, 0);
    const targetRank = weightedTotal % players.length + 1;
    for (const player of players) privateById[player.id] = {
      heading: '내 순위',
      text: '내 순위: ' + rankById[player.id] + '위'
    };
    const answer = players.find(player => rankById[player.id] === targetRank);
    return { ...base, inputKind: 'choice', title: '가중 순위 추론',
      prompt: '참가 순서는 ' + players.map((player, index) => (index + 1) + '. ' + player.name).join(' · ') + '. 이 순서대로 가중치를 곱한 순위 합에 각 순위의 제곱을 더하세요. 합을 인원수로 나눈 나머지+1이 목표 순위입니다. 해당 참가자는?',
      answerHint: '해당 순위의 참가자', options: rankOptions(players), rankById, targetRank,
      solution: answer.id,
      revealText: targetRank + '위는 ' + answer.name + '입니다.' };
  }

  if (type === 'cipher') {
    const words = ['STRATEGY', 'PATIENCE', 'SEQUENCE', 'ANALYSIS', 'THINKING', 'EVIDENCE', 'DECIPHER', 'REASONER'];
    const solution = sample(words);
    const shifts = Array.from({ length: 3 }, () => randomInt(5) + 1);
    const shifted = [...solution].map((letter, index) =>
      String.fromCharCode(65 + (letter.charCodeAt(0) - 65 + shifts[index % 3]) % 26));
    const cipher = [0,2,4,6,1,3,5,7].map(index => shifted[index]).join('');
    const fragments = shifts.map((shift, index) => '반복 키 ' + (index + 1) + '번: 각 문자를 ' + shift + '칸 이동합니다.');
    Object.assign(privateById, assignPrivate(players, fragments));
    return { ...base, inputKind: 'choice', title: '전치·반복키 암호',
      prompt: '8글자 암호입니다. 반복 키로 이동한 뒤 홀수 위치를 앞에, 짝수 위치를 뒤에 붙였습니다. 역순으로 복호화하세요.\n암호문: ' + cipher,
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
        for (let draw = 0; draw < 4; draw++) {
          const color = randomInt(10) < jarCounts[jar].red ? '빨강' : '파랑';
          sampleById[player.id][jar].push(color);
          totals[jar][color === '빨강' ? 'red' : 'blue']++;
        }
      }
      likelihoodSignal = totals.A.red - totals.A.blue - totals.B.red + totals.B.blue;
    }
    for (const player of players) privateById[player.id] = {
      heading: '내 표본',
      text: 'A: ' + sampleById[player.id].A.join(' ') +
        ' · B: ' + sampleById[player.id].B.join(' ')
    };
    const solution = likelihoodSignal > 0 ? 'A' : 'B';
    return { ...base, inputKind: 'choice', title: '표본 확률 분석',
      prompt: 'A·B 중 한 곳은 빨강 8·파랑 2, 다른 곳은 빨강 2·파랑 8입니다. 각 항아리에서 4회씩 복원 추출했습니다. 사전확률은 1:1입니다. 전체 표본의 우도가 더 큰 항아리를 고르세요.',
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
      { id: 'D', energy: randomInt(energy) + 1, data: randomInt(data) + 1, reward: randomInt(8) + 7 },
      { id: 'E', energy: randomInt(energy) + 1, data: randomInt(data) + 1, reward: randomInt(10) + 8 }
    ];
    const packages = [];
    for (let mask = 1; mask < 32; mask++) {
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
      prompt: '개인 자원을 합산해 가능한 프로젝트 조합 중 보상이 가장 큰 것을 고르세요. 동점이면 자원 소모가 적은 조합, 그래도 같으면 이름이 앞선 조합을 고르세요.\n' + projectText,
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
    const witnesses = ['가', '나', '다', '라', '마', '바', '사', '아'];
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
      prompt: '암호는 1~12입니다. 여덟 진술 중 하나만 거짓입니다. 참 진술의 구간에는 암호가 포함되고 거짓 진술의 구간에는 포함되지 않습니다. 누가 거짓인가요?',
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
    const cardCount = players.length === 1 ? 6 : players.length * 2;
    const cards = Array.from({ length: cardCount }, (_, index) => ({
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
    const nodes = ['A', 'B', 'C', 'D', 'E'];
    const link = (a, b) => a === 'S' || b === 'G' ? a + '-' + b : [a, b].sort().join('-');
    const paths = nodes.map(node => ({ id: 'S-' + node + '-G', edges: [link('S', node), link(node, 'G')] }));
    for (const first of nodes) for (const second of nodes) if (first !== second) {
      paths.push({ id: 'S-' + first + '-' + second + '-G', edges: [link('S', first), link(first, second), link(second, 'G')] });
    }
    const edgeKeys = new Set([...nodes.map(node => 'S-' + node), ...nodes.map(node => node + '-G')]);
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
      prompt: 'S에서 G까지 갈 수 있는 25개 후보입니다. 통로 길이를 합산해 가장 짧은 경로를 고르세요.',
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
  if (challenge.inputKind === 'memory') return /^\d{16}$/.test(answer) ? answer : null;
  if (challenge.type === 'stateInference') return /^[01]{8}$/.test(answer) ? answer : null;
  if (!/^-?\d{1,4}$/.test(answer)) return null;
  const number = Number(answer);
  return Number.isSafeInteger(number) ? number : null;
}

function isPrime(value) {
  if (value < 2) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor++) if (value % divisor === 0) return false;
  return true;
}
function strategyPoints(values, objective) {
  const sum = values.reduce((total, value) => total + value, 0);
  if (objective.key === 'sum') return Math.floor(sum / 3);
  if (objective.key === 'even') return values.filter(value => value % 2 === 0).length * 3;
  if (objective.key === 'odd') return values.filter(value => value % 2 === 1).length * 3;
  if (objective.key === 'prime') return values.filter(isPrime).length * 4;
  if (objective.key === 'triple') return values.filter(value => value % 3 === 0).length * 4;
  if (objective.key === 'low') return values.filter(value => value <= 6).length * 4;
  return 0;
}
function trainingPerformance(game, playerId) {
  const challenge = game.challenge;
  if (challenge.type === 'strategy') {
    const cardById = Object.fromEntries(challenge.cards.map(card => [card.id, card]));
    const picked = game.moves.filter(move => move.playerId === playerId && !move.actionId.startsWith('timeout-'))
      .map(move => cardById[move.cardId]?.value).filter(Number.isInteger);
    if (picked.length !== 2) return 0;
    const objective = challenge.objectives[playerId];
    const best = challenge.cards.flatMap((card, index) => challenge.cards.slice(index + 1)
      .map(next => strategyPoints([card.value, next.value], objective))).reduce((max, value) => Math.max(max, value), 0);
    return best ? Math.min(1, strategyPoints(picked, objective) / best) : 1;
  }
  const submission = game.submissions[playerId];
  if (!submission) return 0;
  if (challenge.type === 'memory') {
    const target = challenge.memoryById[playerId];
    const matched = [...String(submission.answer)].reduce((count, digit, index) => count + Number(digit === target[index]), 0);
    return matched / 16;
  }
  return String(submission.answer) === String(challenge.solution) ? 1 : 0;
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
      points[player.id] = Math.floor(matched / 2) + Number(matched === 16);
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
      const timedOut = game.trainingMode && game.moves.some(move => move.playerId === player.id && move.actionId.startsWith('timeout-'));
      points[player.id] = timedOut ? 0 : strategyPoints(picked, objective);
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
      trainingMode: Boolean(this.game.trainingMode), trainingCategory: this.game.trainingCategory || null,
      trainingCategoryLabel: this.game.trainingCategory ? TRAINING_CATEGORY_LABELS[this.game.trainingCategory] : null,
      trainingLevel: this.game.trainingLevel || null,
      trainingHistory: this.game.phase === 'finished' && this.game.trainingMode ? this.game.trainingHistory : undefined,
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
    this.game.deadlineAt = Date.now() + (this.game.trainingMode
      ? trainingDuration(type, this.game.trainingHistory, this.game.trainingCategory, this.game.phase === 'study' ? 'study' : 'answer')
      : type === 'memory' ? 18_000 : type === 'strategy' ? 20_000 : 75_000);
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
        detail += ' · ' + hits + '/16자리 일치';
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

    if (this.game.trainingMode) {
      const player = players[0];
      const performance = trainingPerformance(this.game, player.id);
      const category = this.game.trainingCategory;
      const categoryLabel = TRAINING_CATEGORY_LABELS[category];
      const outcome = performance >= 0.999 ? '정답·최선 선택' : performance > 0 ? '부분 해결' : '미해결';
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
    this.game.deadlineAt = Date.now() + (this.game.trainingMode ? 20_000 : 8_000);
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
    if (this.game.phase === 'study') {
      this.game.phase = 'answer';
      this.game.phaseId++;
      this.game.deadlineAt = Date.now() + (this.game.trainingMode
        ? trainingDuration('memory', this.game.trainingHistory, this.game.trainingCategory, 'answer')
        : 40_000);
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
