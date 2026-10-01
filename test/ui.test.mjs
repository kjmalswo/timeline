import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {makeChallenge} from '../src/challenges.js';

async function ui() {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const nodes=new Map(),intervals=new Map(),db=new Map(),ticks=[];let now=1_000_000,serial=0;
  function node(id='') {
    const classes=new Set(),attrs=new Map(),events=new Map();
    return {id,children:[],style:{setProperty(){}},hidden:false,value:'',innerHTML:'',textContent:'',
      classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k)},
      setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k),
      addEventListener:(name,fn)=>events.set(name,fn),fire:(name,event={})=>events.get(name)?.(event),
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},focus(){this.focused=true;}};
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);};
  const document={querySelector:get,querySelectorAll:()=>[],createElement:()=>node(),body:node('body'),hidden:false,addEventListener:(name,fn)=>get('document').addEventListener(name,fn)};
  const param={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
  class Audio {
    state='running';currentTime=0;destination={};resume(){this.state='running';return Promise.resolve();}
    createOscillator(){return {frequency:param,connect(){},disconnect(){},start(){ticks.push(now);},stop(){this.onended?.();}};}
    createGain(){return {gain:param,connect(){},disconnect(){}};}
  }
  const storage={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)};
  const context=vm.createContext({document,localStorage:storage,sessionStorage:storage,window:{AudioContext:Audio},
    WebSocket:{OPEN:1},Date:class extends Date {static now(){return now;}},crypto,
    setInterval:fn=>{intervals.set(++serial,fn);return serial;},clearInterval:id=>intervals.delete(id),setTimeout:()=>0,clearTimeout(){}});
  vm.runInContext(script.replace('  })();',`globalThis.api={updateTimer,stopTimePressure,showScreen,renderAnswer,renderPuzzleData,handleMessage,
    connectSocket(){socket={readyState:1};},getAnswer(){return chosenAnswer;}};\n  })();`),context);
  return {api:context.api,get,document,ticks,db,html,intervals,advance(ms){now+=ms;for(const fn of [...intervals.values()])fn();},now:()=>now};
}
const state=(now,seconds,extras={})=>({code:'ABC234',youId:'p1',players:[{id:'p1',eliminated:false}],
  game:{deadlineAt:now+seconds*1000,phase:'answer',phaseId:1,you:{submitted:false},...extras}});
test('배포 화면의 스크립트가 유효하고 타이머는 데스크톱·모바일에서 고정된다',async()=>{
  const {html}=await ui();const built=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');assert.equal(built,html);
  assert.match(html,/\.timer-wrap \{ position:fixed/);assert.match(html,/font-size:3rem/);assert.match(html,/#arena\.screen \{ padding-top:calc\(118px/);
  assert.match(html,/prefers-reduced-motion/);assert.doesNotMatch(html,/�|타일 .*선택|16자리 숫자/);
});
test('30초부터 비네트와 1초 효과음, 마지막 10초에는 0.5초 간격',async()=>{
  const t=await ui();t.api.connectSocket();t.get('document').fire('pointerdown');
  const data=state(t.now(),31);t.api.updateTimer(data.game,data);
  assert.ok(!t.document.body.classList.contains('time-pressure'));assert.equal(t.ticks.length,0);
  t.advance(1000);assert.ok(t.document.body.classList.contains('time-pressure'));assert.equal(t.get('#timer').textContent,'00:30');assert.equal(t.ticks.length,1);
  t.advance(100);assert.equal(t.ticks.length,1);t.advance(900);assert.equal(t.ticks.length,2);
  t.advance(19000);const before=t.ticks.length;t.advance(500);assert.equal(t.ticks.length,before+1);
  assert.match(t.get('#timeAnnouncement').textContent,/10초/);
});
test('효과음 끄기와 배경 탭은 소리를 막고, 제출·결과·종료·화면 이동은 경고를 멈춘다',async()=>{
  const t=await ui();t.api.connectSocket();t.get('document').fire('pointerdown');
  const data=state(t.now(),20);t.api.updateTimer(data.game,data);const before=t.ticks.length;
  t.get('#soundToggle').fire('click');t.advance(1000);assert.equal(t.ticks.length,before);assert.equal(t.db.get('timeline.sound'),'off');
  t.get('#soundToggle').fire('click');t.document.hidden=true;t.advance(1000);assert.equal(t.ticks.length,before);t.document.hidden=false;
  for(const extras of [{you:{submitted:true}},{phase:'result'},{deadlineAt:t.now()}]) {
    const next=state(t.now(),15,extras);t.api.updateTimer(next.game,next);assert.ok(!t.document.body.classList.contains('time-pressure'));
  }
  t.api.updateTimer(data.game,data);t.api.showScreen('home');assert.ok(!t.document.body.classList.contains('time-pressure'));assert.equal(t.intervals.size,0);
});
test('보기 선택은 버튼을 다시 만들지 않아 키보드 포커스가 유지된다',async()=>{
  const t=await ui();const game={phase:'answer',you:{submitted:false},options:[{value:'A',label:'가람'},{value:'B',label:'나래'}]};
  t.api.renderAnswer(game);const group=t.get('#answerBox').children[0],button=group.children[1];button.focus();button.fire('click');
  assert.equal(t.get('#answerBox').children[0],group);assert.equal(button.focused,true);assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(t.api.getAnswer(),'B');
});
test('모든 새 문제의 공개 데이터가 표현되고 문자·도형에는 접근 가능한 설명이 있다',async()=>{
  const t=await ui();for(const type of ['counterfeit','suspect','seating','switchboard','routePlan','teamSelection','operatorOrder','shapeOverlay','numberDuel','uniqueBid']) {
    const q=makeChallenge(type,[{id:'p1'}],max=>Math.floor(max/2));const html=t.api.renderPuzzleData(q.presentation);
    for(const detail of q.presentation.details)assert.ok(html.includes(detail));
    if(q.presentation.table) {assert.match(html,/<caption>/);assert.match(html,/scope="row"/);}
    if(q.presentation.boards) {assert.match(html,/role="img"/);assert.match(html,/aria-label="도형 1/);}
  }
  assert.equal(t.api.renderPuzzleData({details:['<script>evil</script>']}),'<ul class="data-lines"><li>&lt;script&gt;evil&lt;/script&gt;</li></ul>');
});
