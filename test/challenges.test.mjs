import test from 'node:test';
import assert from 'node:assert/strict';
import {CHALLENGE_TYPES,TRAINING_TYPE_POOLS,makeChallenge,challengeDuration,permutations,uniqueBidOutcome} from '../src/challenges.js';
const players=[{id:'p1',name:'가람'},{id:'p2',name:'나래'}];
const rng=seed=>max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/2**32*max);};
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const uniqueMax=values=>{const max=Math.max(...values);assert.equal(values.filter(n=>n===max).length,1);return values.indexOf(max);};
const allTeams=()=>Array.from({length:6},(_,i)=>i).flatMap(a=>Array.from({length:6},(_,i)=>i).filter(b=>b>a).flatMap(b=>Array.from({length:6},(_,i)=>i).filter(c=>c>b).map(c=>[a,b,c])));
function solve(q) {
  const p=q.presentation;
  if(q.type==='counterfeit') {
    const candidates=q.options.filter(o=>p.table.rows.every(([left,right,result])=>
      result==='왼쪽이 무거워요'?left.includes(o.value):result==='오른쪽이 무거워요'?right.includes(o.value):!left.includes(o.value)&&!right.includes(o.value)));
    assert.equal(candidates.length,1);return candidates[0].value;
  }
  if(q.type==='suspect') {
    const owners=q.options.filter(o=>p.details.filter(text=>{
      const negative=text.includes('없어요');return negative?!text.includes(o.value):text.includes(o.value);
    }).length===2);
    assert.equal(owners.length,1);return owners[0].value;
  }
  if(q.type==='seating') {
    const names=['가람','나래','다온','라온','마루'];
    const valid=permutations(names).filter(order=>p.details.every(text=>{
      const present=names.filter(n=>text.includes(n));
      if(text.includes('번째'))return order.indexOf(present[0])+1===Number(text.match(/(\d)번째/)[1]);
      const a=names.find(n=>text.startsWith(n)),b=present.find(n=>n!==a);
      if(text.includes('딱 한 사람'))return Math.abs(order.indexOf(a)-order.indexOf(b))===2;
      if(text.includes('바로 오른쪽'))return order.indexOf(a)+1===order.indexOf(b);
      return order.indexOf(a)<order.indexOf(b);
    }));
    assert.equal(valid.length,1);return valid[0].join(',');
  }
  if(q.type==='switchboard') {
    const rows=p.table.rows,initial=rows[0].slice(1).map(s=>s==='켜짐'?1:0),effects=rows.slice(1).map(row=>row.slice(1).map(s=>s==='바뀜'?1:0));
    const valid=Array.from({length:16},(_,i)=>i).filter(mask=>initial.every((v,i)=>effects.reduce((value,e,j)=>value^((mask>>j&1)*e[i]),v)===1));
    assert.equal(valid.length,1);return String(valid[0]);
  }
  if(q.type==='routePlan') {
    const grid=p.table.rows.map(row=>row.slice(1).map(Number)),totals=[];
    const walk=(r,c,total)=>{total+=grid[r][c];if(r===3&&c===3){totals.push(total);return;}if(r<3)walk(r+1,c,total);if(c<3)walk(r,c+1,total);};
    walk(0,0,0);return String(uniqueMax(totals));
  }
  if(q.type==='teamSelection') {
    const rows=p.table.rows,budget=Number(p.conditions[0].match(/(\d+) 이하/)[1]);
    const conflict=rows.map((row,i)=>p.conditions[1].includes(row[0])?i:null).filter(i=>i!==null);
    const totals=allTeams().map(team=>sum(team.map(i=>Number(rows[i][1])))>budget||conflict.every(i=>team.includes(i))?-1:sum(team.map(i=>Number(rows[i][2]))));
    return String(uniqueMax(totals));
  }
  if(q.type==='operatorOrder') {
    const nums=p.details[0].split('  □  ').map(Number);
    const totals=permutations(['+','−','×']).map(ops=>ops.reduce((v,op,i)=>op==='+'?v+nums[i+1]:op==='−'?v-nums[i+1]:v*nums[i+1],nums[0]));
    return String(uniqueMax(totals));
  }
  if(q.type==='shapeOverlay') {
    const merged=p.boards[0].cells.map((row,r)=>row.map((_,c)=>p.boards.map(b=>b.cells[r][c]).reduce((a,b)=>a^b,0)));
    const valid=q.options.filter(o=>JSON.stringify(o.board)===JSON.stringify(merged));assert.equal(valid.length,1);return valid[0].value;
  }
  if(q.type==='numberDuel') {
    const rival=p.details[0].replace('상대 카드: ','').split(' · ').map(Number);
    const totals=p.table.rows.map(([card,reward])=>rival.filter(n=>n<Number(card)).length*Number(reward.replace('점','')));
    return p.table.rows[uniqueMax(totals)][0];
  }
}
test('10개 새 유형만 선택 풀에 있고 모든 분야에서 선택할 수 있다',()=>{
  assert.equal(CHALLENGE_TYPES.length,10);
  assert.deepEqual([...new Set(Object.values(TRAINING_TYPE_POOLS).flat())].sort(),[...CHALLENGE_TYPES].sort());
  for(const type of CHALLENGE_TYPES)assert.ok(challengeDuration(type)>=90_000);
  assert.throws(()=>makeChallenge('strategy',players,rng(1)));
});
for(const type of CHALLENGE_TYPES.filter(t=>t!=='uniqueBid'))test(type+': 100개 무작위 문제를 공개 정보만으로 독립 풀이',()=>{
  for(let seed=1;seed<=100;seed++) {
    const q=makeChallenge(type,players,rng(seed));
    assert.equal(solve(q),q.solution,'seed '+seed);
    assert.equal(q.inputKind,'choice');
    assert.equal(new Set(q.options.map(o=>o.value)).size,q.options.length);
    assert.ok(q.options.some(o=>o.value===q.solution));
    assert.ok(q.options.every(o=>!/answer|decoy/.test(o.value)));
    assert.ok(q.presentation.question&&q.presentation.example&&q.presentation.conditions.length);
    assert.doesNotMatch(JSON.stringify(q.presentation),/solution|tieBreak|bots/);
  }
});
test('생성기의 예외 경로도 정답 하나를 보장한다',()=>{
  for(const type of CHALLENGE_TYPES.filter(t=>t!=='uniqueBid')) {
    const q=makeChallenge(type,players,()=>0);assert.equal(solve(q),q.solution,type);
  }
});
test('비공개 숫자 독식: 겹친 수를 지우고 가장 낮은 단독 수에 승리',()=>{
  const q=makeChallenge('uniqueBid',players,rng(3));
  const result=uniqueBidOutcome(q,{p1:{answer:'1'},p2:{answer:'1'},p3:{answer:'3'},p4:{answer:'5'}});
  assert.equal(result.winner.id,'p3');
  assert.equal(uniqueBidOutcome(q,{p1:{answer:'2'},p2:{answer:'2'}}).winner,null);
  assert.equal(uniqueBidOutcome(q,{}).winner,null);
  const solo=makeChallenge('uniqueBid',players.slice(0,1),rng(3));
  assert.equal(solo.bots.length,3);assert.ok(!('bots' in solo.presentation));
});
