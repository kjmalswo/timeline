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
    for (let index = 0; index < 14; index++) {
      const position = Math.floor(index / 2);
      terms.push(index % 2 === 0
        ? oddStart + oddStep * position + secondDifference * position * (position - 1) / 2
        : evenStart * evenMultiplier ** position);
    }
    const solution = oddStart + oddStep * 7 + secondDifference * 21;
    return { ...base, inputKind: 'number', title: '교차 수열',
      prompt: '홀수항은 두 번째 차분이 일정하고, 짝수항은 같은 수를 곱합니다. 15번째 항은?\n' + terms.join(' · ') + ' · ?',
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
    return { ...base, inputKind: 'text', title: '순위·표식 논리',
      prompt: '다섯 참가자의 순위와 표식은 모두 다릅니다. 관계 단서를 정리해 3위 참가자의 표식을 입력하세요.\n' +
        clues.map((clue, index) => (index + 1) + '. ' + clue).join('\n'),
      placeholder: '표식 이름', maxLength: 12, solution,
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
    return { ...base, inputKind: 'text', title: '좌표 변환',
      prompt: 'A~E열, 1~5행 격자에서 ' + start + '를 다음 순서대로 변환하세요. 좌표 하나만 입력하세요.\n' +
        transformations.map((operation, index) => (index + 1) + '. ' + operation.label).join('\n'),
      placeholder: '예: C4', maxLength: 2, solution,
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
    const gridText = board.map((row, rowIndex) => row
      .map((value, column) => String(value || '·').padStart(2, ' ') + (column === 2 ? ' │' : ''))
      .join(' ') + (rowIndex === 1 || rowIndex === 3 ? '\n------+-------' : '')).join('\n');
    return { ...base, inputKind: 'text', title: '6×6 스도쿠',
      prompt: '각 행·열·2×3 상자에 1~6이 한 번씩 들어갑니다. 빈칸을 위에서 아래, 왼쪽에서 오른쪽 순서로 공백 없이 입력하세요.\n' + gridText,
      placeholder: '빈칸 ' + solution.length + '개를 순서대로 입력', maxLength: solution.length, solution,
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
return { ...base, inputKind: 'text', title: '5자리 암호',
      prompt: '0~9 중 서로 다른 숫자 5개의 암호를 찾으세요. “자리까지”는 숫자와 위치가 모두 맞고, “숫자만”은 다른 위치에 있는 숫자 수입니다. 서로 다른 다섯 숫자를 입력하세요.\n' +
        clues.map((clue, index) => (index + 1) + '. ' + clue).join('\n'),
      placeholder: '서로 다른 숫자 5개', maxLength: 5, solution: secret,
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
        prompt: '네 사람은 1·2·7·10분이 걸립니다. 손전등 하나로 한 번에 두 명까지 건널 수 있고, 함께 건너면 느린 사람의 시간이 걸립니다. 모두 건너는 최소 시간과 왕복 순서를 근거와 함께 쓰세요.',
        answer: '17분',
        keywordGroups: [['17'], ['1분'], ['2분'], ['7분'], ['10분'], ['돌아', '복귀', '되돌', '왕복']],
        clues: ['A의 단독 통과 시간은 1분입니다.', 'B의 단독 통과 시간은 2분입니다.', 'C의 단독 통과 시간은 7분입니다.', 'D의 단독 통과 시간은 10분입니다.', '두 명이 함께 건너면 느린 사람의 시간이 걸립니다.', '손전등은 다리를 건널 때마다 필요합니다.', '손전등을 든 사람은 반대편에서 되돌아올 수 있습니다.', '목표는 네 사람 모두를 최소 시간에 반대편으로 보내는 것입니다.'],
        explanation: '최소 17분입니다. 1·2분인 두 사람이 손전등을 왕복시키고, 7·10분인 두 사람이 함께 건너는 순서가 최적입니다.'
      },
      {
        prompt: '방 밖의 스위치 세 개는 안쪽의 전구 세 개와 각각 하나씩 연결되어 있습니다. 전구가 있는 방에는 한 번만 들어갈 수 있습니다. 빛과 열만 이용해 세 연결을 모두 알아내는 조작 순서를 설명하세요.',
        answer: '첫 스위치를 켜 전구를 데운 뒤 끄고, 둘째 스위치를 켠 채 들어가 빛과 열로 구분한다.',
        keywordGroups: [['첫째', '1번', '첫 스위치'], ['켜', '불을 붙'], ['끄', '끈'], ['둘째', '2번', '두 번째'], ['따뜻', '열', '온도'], ['빛', '켜진']],
        clues: ['스위치마다 연결된 전구는 정확히 하나입니다.', '스위치가 켜진 전구만 빛납니다.', '전구는 켜져 있으면 열이 나고, 끈 뒤에도 한동안 따뜻합니다.', '방에는 한 번만 들어갈 수 있습니다.', '방에 들어간 뒤에는 스위치를 조작할 수 없습니다.', '입장 전에는 스위치를 여러 번 켜고 끌 수 있습니다.', '빛과 손으로 느끼는 온도만 관찰할 수 있습니다.', '세 전구와 세 스위치의 대응을 모두 밝혀야 합니다.'],
        explanation: '첫 스위치를 몇 분 켜 전구를 데운 뒤 끕니다. 둘째를 켜고 들어가면 켜진 전구는 둘째, 꺼졌지만 따뜻한 전구는 첫째, 차가운 전구는 셋째에 연결됩니다.'
      },
      {
        prompt: '불균등하게 타는 밧줄 두 개는 각각 완전히 타는 데 60분이 걸립니다. 밧줄의 어느 구간이 몇 분 타는지는 알 수 없고 성냥만 있습니다. 정확히 45분을 재는 방법을 순서대로 설명하세요.',
        answer: '첫 밧줄 양끝과 둘째 밧줄 한쪽 끝에 동시에 불을 붙인다. 첫 밧줄이 다 타면 둘째의 반대쪽에도 불을 붙여 15분 뒤를 잰다.',
        keywordGroups: [['45'], ['양끝', '양쪽 끝'], ['30'], ['반대쪽', '다른 쪽'], ['15']],
        clues: ['각 밧줄은 한쪽에서 태우면 정확히 60분 후 모두 탑니다.', '밧줄의 길이와 타는 속도는 일정하지 않습니다.', '밧줄의 양끝에 동시에 불을 붙일 수 있습니다.', '두 밧줄을 동시에 태울 수 있습니다.', '불은 붙은 뒤 꺼지지 않고 계속 탑니다.', '첫 밧줄이 양끝에서 타면 전체가 30분 후 끝납니다.', '둘째 밧줄은 처음에 한쪽 끝에서 타고 있습니다.', '정확히 45분이 되는 순간을 알아내야 합니다.'],
        explanation: '첫 밧줄을 양끝에서 태우면 30분입니다. 그때 둘째의 반대쪽에도 불을 붙이면 남은 연소 시간이 절반으로 줄어 15분 뒤 끝납니다.'
      },
      {
        prompt: '겉모습이 같은 공 8개 중 하나가 더 무겁습니다. 양팔저울은 양쪽의 무게 비교만 보여 주며 추가 추는 없습니다. 두 번의 비교만으로 반드시 무거운 공을 찾는 전략을 각 결과에 따라 설명하세요.',
        answer: '처음 3개씩 비교한다. 균형이면 남은 두 개를 비교하고, 기울면 무거운 쪽 후보 셋 중 두 개를 비교한다.',
        keywordGroups: [['3개씩', '3개 대 3개'], ['균형'], ['남은', '올리지 않은'], ['기울', '무거운 쪽'], ['두 번째', '한 번 더', '두 개를 비교']],
        clues: ['위조 공은 정확히 하나이며 정상 공보다 무겁습니다.', '공은 눈으로 구별할 수 없습니다.', '저울은 왼쪽 무거움·오른쪽 무거움·균형만 보여 줍니다.', '첫 비교에서 균형이면 위조 공은 올리지 않은 두 공 중 하나입니다.', '첫 비교에서 기울면 위조 공은 무거운 쪽의 세 공 중 하나입니다.', '두 번째 비교는 첫 결과에 따라 대상을 고를 수 있습니다.', '두 번 비교한 뒤에는 공 하나를 특정해야 합니다.', '정상 공의 무게를 아는 기준 추는 없습니다.'],
        explanation: '3개 대 3개를 잽니다. 균형이면 남은 두 개를 서로 비교하고, 기울면 무거운 쪽 세 공 중 두 개를 비교해 균형 여부로 세 번째 공까지 구분합니다.'
      },
      {
        prompt: '닫힌 문 100개를 1번 사람은 모두 바꾸고, n번 사람은 n의 배수 번호 문만 한 번씩 엽니다/닫습니다. 100번째 사람까지 끝났을 때 열린 문이 몇 개인지, 왜 그런지 설명하세요.',
        answer: '10개. 완전제곱수 번호만 약수가 홀수 개다.',
        keywordGroups: [['10'], ['제곱수'], ['홀수'], ['약수']],
        clues: ['문은 처음에 모두 닫혀 있습니다.', '사람은 1번부터 100번까지 차례로 행동합니다.', 'n번 사람은 n의 배수 번호인 문만 뒤집습니다.', '문 번호의 약수인 사람 수만큼 해당 문 상태가 바뀝니다.', '약수는 보통 서로 짝을 이룹니다.', '완전제곱수는 제곱근과 같은 약수 하나가 짝을 이루지 않습니다.', '홀수 번 뒤집힌 문만 마지막에 열려 있습니다.', '100 이하의 완전제곱수는 1²부터 10²까지입니다.'],
        explanation: '완전제곱수만 홀수 개의 약수를 가지므로 1²부터 10²까지 총 10개 문이 열립니다.'
      },
      {
        prompt: '죄수 100명과 상자 100개에 1~100의 번호가 무작위 순열로 하나씩 들어 있습니다. 각자 상자 50개까지만 열 수 있고, 한 명이라도 자기 번호를 못 찾으면 모두 실패합니다. 사전 합의할 최선의 탐색 규칙과 성공 조건을 설명하세요.',
        answer: '각자 자기 번호 상자에서 시작해 상자 안 번호가 가리키는 다음 상자를 따라간다. 길이 50 이하인 순환만 있으면 전원이 성공한다.',
        keywordGroups: [['자기 번호', '자신의 번호'], ['다음 번호', '상자 안 번호', '번호가 가리키'], ['50'], ['순환', '사이클']],
        clues: ['상자 안의 번호는 1~100의 순열이라 중복이 없습니다.', '죄수들은 시작 전 전략을 합의할 수 있습니다.', '상자를 열어도 번호를 바꾸지 않고 다시 닫을 수 있습니다.', '각 죄수는 자기 번호를 찾아야 합니다.', '각 죄수는 상자 50개까지만 열 수 있습니다.', '자기 번호가 든 상자에서 시작하는 규칙을 고려하세요.', '상자에서 본 번호를 다음에 열 상자 번호로 삼을 수 있습니다.', '이 연결은 순열을 서로 겹치지 않는 순환들로 나눕니다.'],
        explanation: '자기 번호 상자에서 시작해 상자 안의 번호를 다음 상자로 따라갑니다. 순열의 모든 순환 길이가 50 이하일 때만 전원이 번호를 찾습니다.'
      },
      {
        prompt: '모자는 검정 둘·흰색 둘입니다. A는 B와 C를 보고, B는 C만 보며, C는 아무도 보지 못합니다. 모두 규칙을 알고 있고 A가 침묵한 뒤 B가 자기 색을 알아냈습니다. B의 색과 그 추론을 설명하세요.',
        answer: 'B는 C와 반대 색이다. A의 침묵은 B와 C의 색이 서로 달라 A가 자기 색을 확정하지 못했다는 뜻이다.',
        keywordGroups: [['A의 침묵', 'A가 침묵', '침묵'], ['B와 C 다르', '색이 다르', '서로 다른 색', '서로 달라'], ['C와 반대', 'C의 반대', '반대 색']],
        clues: ['네 사람에게 검정 모자 둘과 흰색 모자 둘을 씌웠습니다.', 'A는 B와 C의 모자를 볼 수 있습니다.', 'B는 C의 모자만 볼 수 있습니다.', 'C는 앞의 벽 때문에 아무 모자도 볼 수 없습니다.', '각자는 전체 모자 수를 알고 있습니다.', '색을 확정할 수 있으면 즉시 말해야 합니다.', 'A는 충분히 생각한 뒤에도 아무 말도 하지 않았습니다.', '그 침묵을 들은 B는 C의 모자를 보고 자기 색을 말했습니다.'],
        explanation: 'B와 C가 같은 색이면 A는 남은 색으로 자기 모자까지 확정할 수 있습니다. A의 침묵은 두 색이 다름을 뜻하므로 B는 C와 반대 색입니다.'
      },
      {
        prompt: '말 25마리의 속도는 일정하지만 시간 기록 장치는 없습니다. 한 경주에 최대 5마리만 달릴 수 있습니다. 가장 빠른 세 마리를 확정하는 최소 경주 횟수와 마지막 후보 구성을 설명하세요.',
        answer: '최소 7회다. 다섯 조 경주와 조 1위 경주 뒤 A2·A3·B1·B2·C1을 겨룬다.',
        keywordGroups: [['7'], ['다섯 조', '조별'], ['A2'], ['A3'], ['B1'], ['B2'], ['C1'], ['1위', '우승']],
        clues: ['말을 A~E 다섯 조로 나누어 각 조 다섯 마리씩 경주시킬 수 있습니다.', '각 경주의 순위는 알지만 완주 시간은 알 수 없습니다.', '다섯 조의 경주 순서를 먼저 알아야 합니다.', '각 조의 1위끼리 달린 경주 순서는 A1, B1, C1, D1, E1입니다.', 'A1은 전체에서 가장 빠르고, D1·E1은 상위 세 마리에 들 수 없습니다.', '상위 후보는 A1, A2, A3, B1, B2, C1뿐입니다.', 'A1은 이미 1위이므로 나머지 다섯 후보가 마지막 경주를 합니다.', '마지막 경주에서 가장 빠른 두 말이 전체 2위와 3위입니다.'],
        explanation: '조별 5회, 각 조 1위 경주 1회, A1을 제외한 후보 경주 1회로 최소 7회입니다. A2·A3·B1·B2·C1 중 상위 두 마리가 전체 2·3위입니다.'
      }
    ];
    const puzzle = sample(cases);
    const assigned = assignPrivate(players, puzzle.clues);
    Object.assign(privateById, Object.fromEntries(Object.entries(assigned).map(([id, clue]) => [id, {
      heading: '사건 기록 조각', text: clue.text
    }])));
    return { ...base, inputKind: 'essay', title: '분산 단서 서술 추리',
      prompt: puzzle.prompt, placeholder: '추론 근거를 포함해 1~2문장으로 작성',
      maxLength: 240, solution: puzzle.answer, answerKeywordGroups: puzzle.keywordGroups,
      revealText: puzzle.explanation };
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
    return { ...base, inputKind: 'number', title: '가중 순위 추론',
      prompt: '참가 순서는 ' + players.map((player, index) => (index + 1) + '. ' + player.name).join(' · ') + '. 이 순서대로 가중치를 곱한 순위 합에 각 순위의 제곱을 더하세요. 합을 인원수로 나눈 나머지+1이 목표 순위입니다. 목표 순위를 정수로 입력하세요.',
      placeholder: '목표 순위', maxLength: 2, rankById, targetRank,
      solution: targetRank,
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
    return { ...base, inputKind: 'text', title: '전치·반복키 암호',
      prompt: '8글자 암호입니다. 반복 키로 이동한 뒤 홀수 위치를 앞에, 짝수 위치를 뒤에 붙였습니다. 역순으로 복호화해 8글자 평문을 입력하세요.\n암호문: ' + cipher,
      placeholder: '8글자 평문', maxLength: 8, solution,
      revealText: '정답: ' + solution };
  }

  if (type === 'probability') {
    const redMajority = sample(['A', 'B']);
    const jarCounts = redMajority === 'A'
      ? { A: { red: 8, blue: 2 }, B: { red: 2, blue: 8 } }
      : { A: { red: 2, blue: 8 }, B: { red: 8, blue: 2 } };
    let sampleById = {};
    let redDifference = 0;
    for (let attempt = 0; attempt < 20 && redDifference === 0; attempt++) {
      sampleById = Object.fromEntries(players.map(player => [player.id, { A: [], B: [] }]));
      const totals = { A: { red: 0, blue: 0 }, B: { red: 0, blue: 0 } };
      for (const player of players) for (const jar of ['A', 'B']) {
        for (let draw = 0; draw < 4; draw++) {
          const color = randomInt(10) < jarCounts[jar].red ? '빨강' : '파랑';
          sampleById[player.id][jar].push(color);
          totals[jar][color === '빨강' ? 'red' : 'blue']++;
        }
      }
      redDifference = totals.A.red - totals.B.red;
    }
    for (const player of players) for (const jar of ['A', 'B']) {
      privateById[player.id] = {
        heading: '내 표본',
        text: jar + ' 항아리: ' + sampleById[player.id][jar].join(' ')
      };
    }
    const exponent = 2 * Math.abs(redDifference);
    const likelihood = 4n ** BigInt(exponent);
    const numerator = redDifference > 0 ? likelihood : 1n;
    const denominator = likelihood + 1n;
    const solution = numerator + '/' + denominator;
    return { ...base, inputKind: 'text', title: '베이즈 표본 추론',
      prompt: 'A와 B 중 하나는 빨강 8·파랑 2, 다른 하나는 빨강 2·파랑 8입니다. 각 참가자는 각 항아리에서 4회씩 복원 추출한 표본 일부를 받았습니다. 두 가설의 사전확률이 같을 때 “A가 빨강 8·파랑 2인 항아리”일 사후확률을 기약분수로 입력하세요. 표본을 합쳐 우도를 계산해야 합니다.',
      placeholder: '예: 16/17', maxLength: 100, solution,
      revealText: 'A 항아리가 빨강 8·파랑 2일 사후확률은 ' + solution + '입니다.' };
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
    const projectText = projects.map(project => project.id + ': E' + project.energy + '/D' + project.data + ', ' + project.reward + '점').join(' · ');
    return { ...base, inputKind: 'text', title: '다중 자원 최적화',
      prompt: '개인 자원을 합산해 가능한 프로젝트 조합 중 보상이 가장 큰 것을 찾으세요. 동점이면 자원 소모가 적은 조합, 그래도 같으면 이름이 앞선 조합을 고르세요. 선택한 프로젝트 문자를 A+B처럼 알파벳 순으로 입력하세요.\n' + projectText,
      placeholder: '예: A+C', maxLength: 9, solution: best.id,
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
    return { ...base, inputKind: 'text', title: '거짓 진술 한 개',
      prompt: '암호는 1~12입니다. 여덟 진술 중 하나만 거짓입니다. 참 진술의 구간에는 암호가 포함되고 거짓 진술의 구간에는 포함되지 않습니다. 거짓 진술자의 이름을 입력하세요.',
      placeholder: '거짓 진술자', maxLength: 3, solution: liar, statements, secret,
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
    return { ...base, inputKind: 'text', title: '최단 경로',
      prompt: 'S에서 G까지 갈 수 있습니다. 통로 길이를 합산해 가장 짧은 경로를 찾고, 경로를 S-A-G처럼 입력하세요.',
      placeholder: '예: S-A-C-G', maxLength: 9, solution, totals,
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
  const answer = String(value ?? '').normalize('NFKC').trim();
  if (!answer || answer.length > (challenge.maxLength || 40)) return null;
  if (challenge.inputKind === 'essay') return answer.replace(/\s+/gu, ' ');
  const comparable = answer.toUpperCase();
  if (challenge.inputKind === 'memory') return /^\d{16}$/.test(comparable) ? comparable : null;
  if (challenge.type === 'stateInference') return /^[01]{8}$/.test(comparable) ? comparable : null;
  if (challenge.type === 'miniSudoku') return comparable.length === challenge.solution.length && /^[1-6]+$/.test(comparable) ? comparable : null;
  if (challenge.type === 'codeLock') return /^\d{5}$/.test(comparable) && new Set(comparable).size === 5 ? comparable : null;
  if (challenge.inputKind === 'number') {
    if (!/^-?\d{1,4}$/.test(comparable)) return null;
    const number = Number(comparable);
    return Number.isSafeInteger(number) ? number : null;
  }
  if (challenge.inputKind === 'text') return comparable;
  return null;
}

function normalizeAnswer(value) {
  return String(value ?? '').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
}
function answerMatches(challenge, answer) {
  const normalized = normalizeAnswer(answer);
  if (challenge.answerKeywordGroups?.length) {
    return challenge.answerKeywordGroups.every(group =>
      group.some(keyword => normalized.includes(normalizeAnswer(keyword))));
  }
  return normalized === normalizeAnswer(challenge.solution);
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

  const correct = players.filter(player => submitted[player.id] != null && answerMatches(challenge, submitted[player.id]));
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
      if (snapshot?.meta?.schemaVersion === 3) { this.meta = snapshot.meta; this.game = snapshot.game; }
      else {
        // Drop rooms with the old multiple-choice challenge format.
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
      prompt: challenge.prompt,
      placeholder: challenge.placeholder, maxLength: challenge.maxLength,
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
    this.game.deadlineAt = Date.now() + (type === 'memory' ? 18_000 : type === 'strategy' ? 20_000 : 75_000);
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
