import test from 'node:test';
import assert from 'node:assert/strict';
import {GameRoom} from '../src/worker.js';
import {CHALLENGE_TYPES,challengeDuration} from '../src/challenges.js';

async function roomWith(count=2,maxPlayers=count,saved=null) {
  const records=new Map(saved?[['snapshot',saved]]:[]),sockets=[],alarms=[];
  const ctx={storage:{get:key=>records.get(key),put:(key,value)=>records.set(key,value),deleteAll:()=>records.clear(),setAlarm:at=>alarms.push(at)},
    blockConcurrencyWhile:callback=>callback(),getWebSockets:id=>sockets.filter(s=>!id||s.id===id)};
  const room=new GameRoom(ctx);await room.ready;
  if(!saved) {
    await room.create(new Request('https://room.internal/create',{method:'POST',body:JSON.stringify({name:'참가자 1',code:'ABC234',maxPlayers})}));
    for(let i=1;i<count;i++)await room.join(new Request('https://room.internal/join',{method:'POST',body:JSON.stringify({name:'참가자 '+(i+1)})}));
  }
  for(const p of Object.values(room.meta.players))sockets.push({id:p.id,readyState:1,messages:[],send(message){this.messages.push(JSON.parse(message));},close(){},deserializeAttachment:()=>({playerId:p.id,token:p.token})});
  return {room,sockets,records,alarms};
}
const act=(room,socket,answer,extras={})=>room.webSocketMessage(socket,JSON.stringify({type:'action',phaseId:room.game.phaseId,actionId:crypto.randomUUID(),answer,...extras}));

test('2인 결승은 서로 다른 10개 유형, 늘어난 제한 시간, 정상 종료를 지원한다',async()=>{
  const {room,sockets}=await roomWith();await room.start();
  assert.equal(new Set(room.game.finalTypes).size,10);
  const seen=[];
  for(let i=0;i<10;i++) {
    const q=room.game.challenge;seen.push(q.type);
    assert.equal(room.game.phase,'answer');assert.ok(room.game.deadlineAt-Date.now()>=challengeDuration(q.type)-1000);
    const state=room.stateFor(sockets[0].id);
    assert.ok(state.game.presentation);assert.ok(!('solution' in state.game));assert.ok(!('tieBreak' in state.game));
    await act(room,sockets[0],q.type==='uniqueBid'?'1':q.solution);
    assert.equal(room.stateFor(sockets[1].id).game.you.answer,null);
    await act(room,sockets[1],q.type==='uniqueBid'?'2':q.solution);
    if(i<9) {assert.equal(room.game.phase,'result');await room.advance();}
  }
  assert.deepEqual([...seen].sort(),[...CHALLENGE_TYPES].sort());assert.equal(room.game.phase,'finished');assert.equal(room.meta.status,'finished');
});
test('잘못된 선택, 중복 제출, 이전 라운드 제출은 점수와 제출을 바꾸지 못한다',async()=>{
  const {room,sockets}=await roomWith();await room.start();
  await act(room,sockets[0],'INVALID');assert.equal(Object.keys(room.game.submissions).length,0);
  await act(room,sockets[0],room.game.challenge.solution??'1',{phaseId:-1});assert.equal(Object.keys(room.game.submissions).length,0);
  await act(room,sockets[0],room.game.challenge.solution??'1');const original=room.game.submissions[sockets[0].id];
  await act(room,sockets[0],'2');assert.deepEqual(room.game.submissions[sockets[0].id],original);
});
test('시간 초과는 미제출 0점으로 판정하고 다음 문제로 넘어간다',async()=>{
  const {room}=await roomWith();await room.start();await room.onDeadline();
  assert.equal(room.game.phase,'result');assert.ok(Object.values(room.meta.players).every(p=>p.roundPoints===0));
  await room.onDeadline();assert.equal(room.game.phase,'answer');assert.equal(room.game.finalIndex,2);
});
test('1인 훈련은 모든 새 분야를 포함하고 가상 상대의 선택을 결과에서만 보여 준다',async()=>{
  const {room,sockets}=await roomWith(1);await room.start();const covered=new Set();
  for(let i=0;i<10;i++) {
    covered.add(room.game.trainingCategory);assert.ok(room.game.deadlineAt-Date.now()>80_000);
    const q=room.game.challenge;
    const answer=q.type==='uniqueBid'?String(Array.from({length:10},(_,j)=>j+1).find(n=>!q.bots.includes(n))):q.solution;
    await act(room,sockets[0],answer);
    if(i<9)await room.advance();
  }
  assert.equal(covered.size,4);assert.equal(room.game.trainingHistory.length,10);assert.equal(room.game.phase,'finished');
  const {room:solo,sockets:one}=await roomWith(1);await solo.start();solo.beginChallenge('final','uniqueBid');
  const publicState=solo.stateFor(one[0].id).game;assert.ok(!('bots' in publicState.presentation));
  await act(solo,one[0],'10');assert.match(solo.game.result.subline,/가상 상대/);
});
test('8인 본선에서 2명 결승까지 진행하며 이전 문제를 반복하지 않는다',async()=>{
  const {room,sockets}=await roomWith(8);await room.start();let previous=null;
  while(room.game.stage==='main') {
    assert.notEqual(room.game.challenge.type,previous);previous=room.game.challenge.type;
    for(const s of sockets.filter(s=>!room.meta.players[s.id].eliminated))await act(room,s,room.game.challenge.solution??'1');
    assert.equal(room.game.phase,'result');await room.advance();
  }
  assert.equal(Object.values(room.meta.players).filter(p=>!p.eliminated).length,2);assert.equal(room.game.finalRoundCount,3);
});
test('이전 저장 방을 읽으면 점수와 참가자는 유지하고 제거된 문제만 교체한다',async()=>{
  const {room}=await roomWith();await room.start();
  room.meta.schemaVersion=2;Object.values(room.meta.players)[0].finalScore=17;room.game.challenge={type:'strategy'};
  const saved=structuredClone({meta:room.meta,game:room.game});
  const {room:restored}=await roomWith(2,2,saved);
  assert.equal(restored.meta.schemaVersion,3);assert.equal(Object.values(restored.meta.players)[0].finalScore,17);
  assert.ok(CHALLENGE_TYPES.includes(restored.game.challenge.type));assert.equal(restored.game.phase,'answer');
});
