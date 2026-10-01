// Original puzzles: public presentation and server-only answers live separately.
export const CHALLENGE_TYPES = [
  'counterfeit', 'suspect', 'seating', 'switchboard', 'routePlan',
  'teamSelection', 'operatorOrder', 'shapeOverlay', 'numberDuel', 'uniqueBid'
];
export const TRAINING_TYPE_POOLS = {
  logic: ['counterfeit', 'suspect', 'seating'],
  information: ['switchboard', 'numberDuel'],
  strategy: ['teamSelection', 'operatorOrder', 'uniqueBid'],
  observation: ['routePlan', 'shapeOverlay']
};
export const TRAINING_CATEGORY_LABELS = {
  logic: '단서와 논리', information: '정보와 판단', strategy: '선택과 전략', observation: '관찰과 공간'
};
export const TRAINING_TIPS = {
  counterfeit: '저울 결과 하나씩 적용해 후보를 지워 보세요. 마지막 후보가 모든 결과와 맞는지 확인하면 돼요.',
  suspect: '한 사람씩 칩을 가졌다고 가정하고, 맞는 말이 몇 개인지 세어 보세요.',
  seating: '바로 옆에 앉는 사람들을 먼저 묶고, 남은 조건에 맞춰 자리를 채워 보세요.',
  switchboard: '두 번 바뀐 불은 원래대로 돌아와요. 각 불을 바꾸는 스위치의 개수가 홀수인지 확인해 보세요.',
  routePlan: '각 칸까지 모을 수 있는 최대 점수를 적어 보세요. 왼쪽과 위쪽 중 더 큰 값을 이어 가면 돼요.',
  teamSelection: '함께할 수 없는 조합을 먼저 지우고, 남은 팀의 두 능력 합계를 비교해 보세요.',
  operatorOrder: '곱셈 전에 값을 키우면 유리할 수 있어요. 여섯 순서를 왼쪽부터 계산해 비교해 보세요.',
  shapeOverlay: '같은 칸에 블록이 홀수 개 겹치면 남고, 짝수 개 겹치면 사라져요.',
  numberDuel: '이기는 상대 카드의 보상을 모두 더해 보세요. 높은 숫자가 항상 가장 유리한 건 아니에요.',
  uniqueBid: '낮은 수는 유리하지만 겹치면 탈락해요. 상대가 고를 법한 수와 내 선택을 함께 생각해 보세요.'
};

export function challengeDuration(type) {
  return ({ counterfeit: 150, suspect: 150, seating: 180, switchboard: 150, routePlan: 150,
    teamSelection: 180, operatorOrder: 120, shapeOverlay: 150, numberDuel: 120, uniqueBid: 90 }[type] || 150) * 1000;
}

export function permutations(items) {
  if (!items.length) return [[]];
  return items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(tail => [item, ...tail]));
}
const combinations = (items, size) => size === 0 ? [[]] : items.flatMap((item, i) =>
  combinations(items.slice(i + 1), size - 1).map(tail => [item, ...tail]));
const sum = values => values.reduce((a, b) => a + b, 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function makeChallenge(type, players, randomInt) {
  if (!CHALLENGE_TYPES.includes(type)) throw new Error('알 수 없는 문제 유형: ' + type);
  const shuffle = items => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const sample = items => items[randomInt(items.length)];
  const base = { type, inputKind: 'choice', privateById: {},
    tieBreak: Object.fromEntries(players.map(p => [p.id, randomInt(1_000_000)])) };
  const finish = (title, question, conditions, example, details, choices, solution, explanation, extra = {}) => {
    const { bots, ...publicExtra } = extra;
    return { ...base, title, prompt: question, solution, revealText: explanation, bots,
      options: shuffle(choices.map(item => typeof item === 'object' ? item : { value: String(item), label: String(item) })),
      presentation: { question, conditions, example, details, submissionHint: '보기 하나를 고른 뒤 ‘답 제출’을 눌러 주세요.', ...publicExtra }
    };
  };
  const options = (correct, candidates, count = 6) => shuffle([correct,
    ...shuffle(candidates.filter(item => String(item.value ?? item) !== String(correct.value ?? correct))).slice(0, count - 1)]);

  if (type === 'counterfeit') {
    // Every column has a distinct ternary signature; all pans hold the same number of coins.
    const coins = shuffle(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    const patterns = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,0],[0,1],[1,-1],[1,0],[1,1]];
    const fake = randomInt(9);
    const weights = [0, 1].map(k => {
      const left = coins.filter((_, i) => patterns[i][k] === -1);
      const right = coins.filter((_, i) => patterns[i][k] === 1);
      return [left.join(' · '), right.join(' · '), patterns[fake][k] === -1 ? '왼쪽이 무거워요' : patterns[fake][k] === 1 ? '오른쪽이 무거워요' : '무게가 같아요'];
    });
    return finish('가짜 동전을 찾아라', '동전 9개 중 딱 하나가 더 무거워요. 가짜 동전은 무엇일까요?',
      ['나머지 8개는 무게가 모두 같아요.', '아래 두 번의 저울 결과는 정확해요.'],
      '왼쪽이 무겁다면 가짜는 왼쪽 접시 위에 있어요. 무게가 같다면 양쪽 접시 밖에 있어요.', [],
      coins.map(value => ({ value, label: value + ' 동전' })), coins[fake],
      '정답은 ' + coins[fake] + ' 동전이에요. 두 저울 결과를 모두 만족하는 위치에 있는 동전은 이것 하나예요.',
      { table: { caption: '두 번의 저울 결과', headers: ['왼쪽 접시', '오른쪽 접시', '결과'], rows: weights } });
  }

  if (type === 'suspect') {
    const names = shuffle(['가람', '나래', '다온', '라온', '마루']);
    const facts = names.flatMap((name, i) => [
      { text: '칩은 ' + name + '에게 있어요.', owners: [i] },
      { text: '칩은 ' + name + '에게 없어요.', owners: [0,1,2,3,4].filter(j => i !== j) },
      ...names.slice(i + 1).map((other, j) => ({ text: '칩은 ' + name + ' 또는 ' + other + '에게 있어요.', owners: [i, i + 1 + j] }))
    ]);
    let statements, candidates;
    for (let tries = 0; tries < 200; tries++) {
      statements = shuffle(facts).slice(0, 5);
      candidates = names.map((_, i) => i).filter(i => statements.filter(f => f.owners.includes(i)).length === 2);
      if (candidates.length === 1) break;
    }
    if (candidates.length !== 1) {
      statements = [facts.find(f => same(f.owners,[0,1])), facts.find(f => same(f.owners,[0,2])),
        facts.find(f => same(f.owners,[1,2])), facts.find(f => same(f.owners,[0,1,2,4])), facts.find(f => same(f.owners,[4]))];
      candidates = [4];
    }
    const owner = names[candidates[0]];
    const truths = statements.map((f,i) => f.owners.includes(candidates[0]) ? i + 1 : null).filter(Boolean);
    return finish('진실 두 개, 숨겨진 칩', '다섯 명 중 한 명이 칩을 숨겼어요. 누가 갖고 있을까요?',
      ['아래 다섯 말 중 정확히 두 개만 사실이에요.', '나머지 세 개는 모두 거짓이에요. 말한 사람과 칩 주인은 관계없어요.'],
      '“가람에게 없어요”가 거짓이라면, 칩은 가람에게 있어요.', statements.map((f,i) => (i + 1) + '번 말: ' + f.text),
      names, owner, owner + '에게 칩이 있어요. 이때 ' + truths.join('번과 ') + '번 말만 사실이고, 나머지는 거짓이에요.');
  }

  if (type === 'seating') {
    const names = ['가람', '나래', '다온', '라온', '마루'];
    const orders = permutations(names), target = sample(orders);
    const facts = [];
    for (const a of names) {
      for (const b of names.filter(n => n !== a)) {
        facts.push({ text: a + '의 자리는 ' + b + '보다 왼쪽이에요.', test: o => o.indexOf(a) < o.indexOf(b) });
        facts.push({ text: a + '의 바로 오른쪽 자리는 ' + b + '의 자리예요.', test: o => o.indexOf(a) + 1 === o.indexOf(b) });
        facts.push({ text: a + ', ' + b + ' 사이에는 딱 한 사람이 앉아요.', test: o => Math.abs(o.indexOf(a) - o.indexOf(b)) === 2 });
      }
      facts.push({ text: a + '의 자리는 왼쪽에서 ' + (target.indexOf(a) + 1) + '번째예요.', test: o => o.indexOf(a) === target.indexOf(a) });
    }
    let remaining = orders;
    const clues = [];
    const validFacts = shuffle(facts.filter(f => f.test(target)));
    while (remaining.length > 1) {
      const fact = [...validFacts].sort((a,b) => remaining.filter(a.test).length - remaining.filter(b.test).length)[0];
      clues.push(fact); remaining = remaining.filter(fact.test); validFacts.splice(validFacts.indexOf(fact),1);
    }
    const asOption = order => ({ value: order.join(','), label: order.join(' → ') });
    const solution = target.join(',');
    return finish('비밀 회의의 다섯 자리', '다섯 명의 자리를 정해 주세요. 모든 단서에 맞는 배치는 무엇일까요?',
      ['자리는 한 줄로 다섯 개예요. 한 사람은 한 자리에만 앉아요.', '보기의 순서는 왼쪽 자리부터 오른쪽 자리까지예요.'],
      '“가람의 바로 오른쪽에 나래”라면 두 사람은 붙어 앉고, 가람이 왼쪽이에요.', shuffle(clues).map(f => f.text),
      options(asOption(target), orders.map(asOption)), solution,
      '왼쪽부터 ' + target.join(' → ') + '이에요. 이 배치만 모든 자리 단서를 만족해요.');
  }

  if (type === 'switchboard') {
    const lamps = ['A', 'B', 'C', 'D', 'E', 'F'];
    // Distinct pivot bits make every switch combination produce a unique board.
    const effects = shuffle([0,1,2,3]).map(pivot => lamps.map((_,i) => i < 4 ? Number(i === pivot) : randomInt(2)));
    const targetMask = randomInt(30) % 15 + 1;
    const initial = lamps.map((_,i) => 1 ^ effects.reduce((v,e,j) => v ^ ((targetMask >> j & 1) * e[i]),0));
    const all = Array.from({length:16},(_,mask) => ({ value: String(mask),
      label: mask === 0 ? '아무것도 누르지 않기' : effects.map((_,j) => mask >> j & 1 ? j + 1 : null).filter(Boolean).join('번 + ') + '번 누르기' }));
    return finish('불을 모두 켜라', '스위치를 골라 여섯 개의 불을 모두 켜 주세요.',
      ['스위치를 누르면 연결된 불이 바뀌어요. 켜진 불은 꺼지고, 꺼진 불은 켜져요.', '각 스위치는 한 번씩만 누를 수 있어요. 누르는 순서는 상관없어요.'],
      'A를 바꾸는 스위치 두 개를 누르면 A는 두 번 바뀌어 원래 상태로 돌아와요.', [],
      options(all[targetMask], all, 8), String(targetMask),
      '정답은 ' + all[targetMask].label + '예요. 이 조합을 적용하면 A~F가 모두 켜져요.',
      { table: { caption: '현재 불과 스위치 연결', headers: ['항목', ...lamps], rows: [
        ['현재 상태', ...initial.map(v => v ? '켜짐' : '꺼짐')],
        ...effects.map((e,j) => ['스위치 ' + (j + 1), ...e.map(v => v ? '바뀜' : '그대로')])
      ] } });
  }

  if (type === 'routePlan') {
    const paths = [];
    const walk = (r,c,moves,cells) => {
      if (r === 3 && c === 3) { paths.push({moves,cells}); return; }
      if (r < 3) walk(r+1,c,[...moves,'아래'],[...cells,[r+1,c]]);
      if (c < 3) walk(r,c+1,[...moves,'오른쪽'],[...cells,[r,c+1]]);
    };
    walk(0,0,[],[[0,0]]);
    let grid, scores;
    for (let tries = 0; tries < 200; tries++) {
      grid = Array.from({length:4},() => Array.from({length:4},() => randomInt(9)+1));
      scores = paths.map(p => sum(p.cells.map(([r,c]) => grid[r][c])));
      if (scores.filter(v => v === Math.max(...scores)).length === 1) break;
    }
    if (scores.filter(v => v === Math.max(...scores)).length !== 1) {
      grid = [[9,9,9,9],[1,1,1,9],[1,1,1,9],[1,1,1,9]];
      scores = paths.map(p => sum(p.cells.map(([r,c]) => grid[r][c])));
    }
    const best = scores.indexOf(Math.max(...scores));
    const choices = paths.map((p,i) => ({value:String(i),label:p.moves.join(' → ')}));
    return finish('가장 값진 탈출 경로', '출발에서 도착까지 가며 보석을 모아요. 가장 많은 보석을 얻는 길은 무엇일까요?',
      ['왼쪽 위가 출발, 오른쪽 아래가 도착이에요.', '한 번에 오른쪽이나 아래로 한 칸만 이동해요. 지나간 칸의 숫자를 모두 더해요.', '출발 칸과 도착 칸의 보석도 포함해요.'],
      '2 → 5 → 3을 지나면 총 10개를 모아요.', [], options(choices[best], choices), String(best),
      '정답 경로는 ' + choices[best].label + '예요. 지나간 칸의 보석 ' + paths[best].cells.map(([r,c]) => grid[r][c]).join(' + ') + ' = ' + scores[best] + '개를 모아요.',
      { table: { caption: '보석 지도 · 출발 1행 1열 / 도착 4행 4열', headers: ['행 / 열','1열','2열','3열','4열'],
        rows: grid.map((row,i) => [(i+1)+'행',...row.map(String)]) } });
  }

  if (type === 'teamSelection') {
    const names = ['가람','나래','다온','라온','마루','보라'];
    const teams = combinations([0,1,2,3,4,5],3);
    let stats, scores, eligible;
    const conflict = shuffle([0,1,2,3,4,5]).slice(0,2);
    const budget = 15 + randomInt(5);
    for (let tries = 0; tries < 200; tries++) {
      stats = names.map(() => ({cost:randomInt(5)+2,skill:randomInt(12)+3}));
      eligible = teams.map((t,i) => sum(t.map(j => stats[j].cost)) <= budget && !conflict.every(j => t.includes(j)) ? i : -1).filter(i => i >= 0);
      scores = teams.map(t => sum(t.map(j => stats[j].skill)));
      const best = Math.max(...eligible.map(i => scores[i]));
      if (eligible.length >= 4 && eligible.filter(i => scores[i] === best).length === 1) break;
    }
    // Guarantee a unique optimum even with a pathological random source.
    if (!eligible.length || eligible.filter(i => scores[i] === Math.max(...eligible.map(j => scores[j]))).length !== 1) {
      stats = names.map((_,i) => ({cost:2,skill:2 ** i}));
      eligible = teams.map((t,i) => !conflict.every(j => t.includes(j)) ? i : -1).filter(i => i >= 0);
      scores = teams.map(t => sum(t.map(j => stats[j].skill)));
    }
    const best = eligible.sort((a,b) => scores[b]-scores[a])[0];
    const choices = teams.map((t,i) => ({value:String(i),label:t.map(j => names[j]).join(' · ')}));
    return finish('최강의 세 사람', '세 명을 골라 팀을 만들어요. 조건을 지키면서 실력 합계가 가장 큰 팀은 누구일까요?',
      ['팀원은 정확히 세 명이에요. 비용 합계는 ' + budget + ' 이하로 맞춰 주세요.',
        conflict.map(i => names[i]).join(' · ') + ' 두 사람은 같은 팀에 들어갈 수 없어요.'],
      '비용은 더하고, 실력도 더해요. 예산을 넘은 팀은 실력이 높아도 선택할 수 없어요.', [], options(choices[best],choices), String(best),
      choices[best].label + ' 팀이에요. 비용 ' + sum(teams[best].map(i => stats[i].cost)) + '로 예산 안에 들어오고, 가능한 팀 중 실력 합계 ' + scores[best] + '가 가장 커요.',
      { table: {caption:'팀원 정보',headers:['이름','비용','실력'],rows:names.map((n,i) => [n,String(stats[i].cost),String(stats[i].skill)])} });
  }

  if (type === 'operatorOrder') {
    const arrangements = permutations(['+','−','×']);
    const calculate = (nums,ops) => ops.reduce((value,op,i) => op === '+' ? value+nums[i+1] : op === '−' ? value-nums[i+1] : value*nums[i+1], nums[0]);
    let nums, scores;
    for (let tries = 0; tries < 200; tries++) {
      nums = Array.from({length:4},() => randomInt(8)+2); scores = arrangements.map(ops => calculate(nums,ops));
      if (scores.filter(v => v === Math.max(...scores)).length === 1) break;
    }
    if (scores.filter(v => v === Math.max(...scores)).length !== 1) {
      nums = [3,8,5,2]; scores = arrangements.map(ops => calculate(nums,ops));
    }
    const best = scores.indexOf(Math.max(...scores));
    const choices = arrangements.map((ops,i) => ({value:String(i),label:nums.map((n,j) => j < 3 ? n + ' ' + ops[j] : String(n)).join(' ')}));
    return finish('수식 배틀', '빈칸에 +, −, ×를 하나씩 넣어 가장 큰 값을 만들어 주세요.',
      ['숫자의 순서는 바꿀 수 없어요. 세 연산 기호는 각각 한 번씩 써요.', '이 게임에서는 곱셈도 먼저 하지 않아요. 무조건 왼쪽부터 차례대로 계산해요.'],
      '2 + 3 × 4는 (2 + 3) × 4 = 20이에요.', [nums.join('  □  ')], choices, String(best),
      choices[best].label + ' 순서가 정답이에요. 왼쪽부터 계산하면 ' + scores[best] + '로, 여섯 순서 중 가장 커요.');
  }

  if (type === 'shapeOverlay') {
    const size = 4;
    const boards = Array.from({length:3},(_,i) => ({caption:'도형 '+(i+1),cells:Array.from({length:size},() => Array.from({length:size},() => randomInt(2)))}));
    const merged = boards[0].cells.map((row,r) => row.map((_,c) => boards.reduce((v,b) => v ^ b.cells[r][c],0)));
    const choices = [{value:'answer',label:'도형',board:merged}];
    for (let i = 0; i < 5; i++) {
      const cells = merged.map(row => [...row]);
      const pos = i * 3; cells[Math.floor(pos/size)][pos%size] ^= 1;
      choices.push({value:'decoy-'+i,label:'도형',board:cells});
    }
    const ordered = shuffle(choices).map((o,i) => ({value:String(i),board:o.board,label:'도형 '+(i+1)}));
    const solution = ordered.find(o => same(o.board,merged)).value;
    return finish('겹치면 사라지는 도형', '세 도형을 같은 자리에 겹쳐요. 마지막에 남는 도형은 무엇일까요?',
      ['검은 칸은 블록이 없는 칸, 금색 칸은 블록이 있는 칸이에요.', '같은 칸의 블록이 1개나 3개면 남아요. 0개나 2개면 비어 있어요.', '도형을 돌리거나 옮기지 않고 그대로 겹쳐 주세요.'],
      '한 칸이 ‘블록 · 블록 · 빈칸’이면 두 블록이 사라져 빈칸이 돼요.', [], ordered, solution,
      '정답은 ' + ordered.find(o => o.value === solution).label + '이에요. 각 칸의 블록 개수를 세어 홀수인 칸만 남기면 이 모양이 나와요.', {boards});
  }

  if (type === 'numberDuel') {
    const myCards = shuffle([2,3,4,5,6,7,8,9]).slice(0,4).sort((a,b) => a-b);
    const rival = shuffle([1,2,3,4,5,6,7,8]).slice(0,4).sort((a,b) => a-b);
    let rewards, totals;
    for (let tries = 0; tries < 200; tries++) {
      rewards = myCards.map(() => randomInt(9)+2);
      totals = myCards.map((card,i) => rewards[i] * rival.filter(n => card > n).length);
      if (totals.filter(v => v === Math.max(...totals)).length === 1) break;
    }
    if (totals.filter(v => v === Math.max(...totals)).length !== 1) {
      rewards = myCards.map((_,i) => 2 ** i); totals = myCards.map((card,i) => rewards[i]*rival.filter(n => card > n).length);
    }
    const best = totals.indexOf(Math.max(...totals));
    return finish('높은 카드의 함정', '상대는 카드 한 장을 무작위로 내요. 내가 어떤 카드를 내야 평균 보상이 가장 클까요?',
      ['내 숫자가 상대보다 크면 내 카드의 보상을 받아요. 같거나 작으면 0점이에요.', '상대의 네 카드는 각각 뽑힐 가능성이 같아요.', '가장 유리한 카드 하나를 고르는 추리 문제예요. 실제 무작위 승부는 하지 않아요.'],
      '보상 8점인 카드가 상대 네 장 중 두 장을 이기면 평균 보상은 (8 + 8 + 0 + 0) ÷ 4 = 4점이에요.',
      ['상대 카드: ' + rival.join(' · ')], myCards.map(n => ({value:String(n),label:n+' 카드'})), String(myCards[best]),
      myCards[best] + ' 카드가 정답이에요. 상대 카드 ' + rival.filter(n => myCards[best] > n).join(' · ') + '를 이겨 평균 ' + totals[best]/4 + '점을 얻어요.',
      {table:{caption:'내 카드와 승리 보상',headers:['내 카드','이기면 받는 보상'],rows:myCards.map((n,i) => [String(n),rewards[i]+'점'])}});
  }

  // Simultaneous hidden choices replace turn-by-turn number picking completely.
  const bots = players.length === 1 ? [randomInt(6)+1,randomInt(8)+1,randomInt(10)+1] : [];
  return finish('낮은 숫자 독식', '다른 사람과 겹치지 않는 가장 낮은 숫자를 골라 6점을 가져가세요.',
    ['모두 1~10 중 숫자 하나를 비공개로 골라요.', '두 명 이상 고른 숫자는 모두 탈락해요. 남은 숫자 중 가장 낮은 숫자 한 명이 6점을 받아요.',
      '남은 숫자가 없으면 모두 0점이에요. 제출한 선택은 바꿀 수 없어요.',
      players.length === 1 ? '혼자 훈련할 때는 가상 상대 세 명도 숫자를 골라요. 상대의 선택은 결과에서 공개해요.' : '이 문제에는 고정된 정답이 없어요. 다른 참가자의 선택까지 읽어야 이길 수 있어요.'],
    '네 명이 1, 1, 3, 5를 고르면 1은 겹쳐 탈락하고, 3을 고른 사람이 이겨요.', [],
    Array.from({length:10},(_,i) => ({value:String(i+1),label:String(i+1)})), null,
    '겹친 숫자를 지우고, 한 명만 고른 숫자 중 가장 작은 수를 확인해요.', {competitive:true, bots});
}

export function uniqueBidOutcome(challenge, submissions) {
  const entries = Object.entries(submissions).map(([id,s]) => ({id,number:Number(s.answer)}));
  entries.push(...(challenge.bots || []).map((number,i) => ({id:'bot-'+i,number})));
  const unique = entries.filter(e => entries.filter(other => other.number === e.number).length === 1);
  const winner = unique.sort((a,b) => a.number-b.number)[0] || null;
  return {entries,winner};
}
