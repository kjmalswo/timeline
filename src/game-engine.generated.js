/* 이 파일은 npm run build가 index.html에서 생성합니다. 직접 수정하지 마세요. */
const App={settings:{logDetail:'full',announce:false}};
const Ann={push(){},clear(){}};
const UI={flash(){},renderBattle(){},showScreen(){}};
const Run={difficulty:()=>({enemyHpMult:1,aiNoise:0})};

/* ==========================================================================================
   ■ 핵심 개발 지침 (절대 원칙):
     1. [하드코딩 절대 금지 및 DB화 위주 개발]:
        - 모든 수치와 비즈니스 로직 파라미터는 전용 DB 테이블에 중앙 집권화하여 관리한다.
        - 로직 및 렌더링 함수 내부에서 임의의 '매직 넘버(Magic Number)'나 인라인 하드코딩을 일체 금지하며,
          데이터 추가 및 밸런스 패치가 DB 수정만으로 완결되도록 구조화한다.
     2. [명칭 정제 및 기본형 중심 현실성 확보]:
        - 과장되거나 작위적인 미사여구 사용은 전면 배제하고, 담백하고 표준적인 기본 용어로 기입한다.
     3. [기존 지침 및 스타일 유지]:
        * 단일 파일 완결성(HTML/CSS/JS), 이모지 사용 전면 배제, 세련된 태그 시스템,
          라이트 테마의 반응형 애니메이션이 포함된 '뉴모피즘 UI'로 개발한다.
        * 또한 해당 지침 주석은 삭제하거나 간략화, 수정, 생략하지 말고 그대로 둔다. 하위의 코드만 수정한다.
     4. [버전 관리 규칙]:
        * 소규모 기능/버그/가시성 패치는 직전 버전에서 +0.1, 대규모 구조/시스템 업데이트는 +1.0으로 버전업한다.
          이번 업데이트 버전은 V0.1부터 시작한다.
     5. [가시성 개선과 시스템 복잡도 분리 원칙]:
        * 모든 편의성 및 가시성, 가독성, 직관성 개선의 목적은 사용자가 정보를 시각적으로 더 직관적이고
          효율적으로 파악하도록 만드는 데 있다.
        * 하지만 이는 로직, 알고리즘, 시스템 자체를 단순화하거나 의사결정 요소를 제거하라는 의미는 아니다.
        * 처음에는 싱글 플레이 먼저 개발 후, 추후 pvp 멀티플레이까지 확장 가능성을 염두에 두고 코드를 작성할 것.
   ========================================================================================== */

/* ==========================================================================================
   [DB] 전역 데이터 테이블 — 모든 수치/문구/규칙의 단일 원천
   ========================================================================================== */
const DB = {

  meta:{
    title:'THE TIMELINE', version:'V4.1', build:'CLOUDFLARE',
    footer:'싱글플레이 · Cloudflare 서버 판정 1 대 1 PvP',
    storageKey:'tld_save_v11',
    sides:{ SELF:'P', FOE:'E' },
    sideLabel:{ P:'아군', E:'적군' }
  },

  balance:{
    loop:{ maxIterations:900, aiDelayMs:400, aiDelayFastMs:90 },

    /* 전투 제한 시간 — 도달 시 체력 비율이 높은 쪽이 판정승한다.
       앞선 쪽은 시간을 끌 수 있고 뒤진 쪽은 무리해서라도 피해를 내야 하므로,
       체력 격차 자체가 매 순간의 판단 기준이 된다. */
    tick:{ start:0, maxTickGuard:170, warnRemaining:40 },

    distance:{ min:0, max:4, start:2, labels:['밀착','근접','중거리','원거리','이탈'] },

    resource:{
      staminaStart:7, staminaMax:16, staminaRegenPerTick:2,
      focusStart:0, focusMax:6, focusRegenPerTick:0, hpDefault:70,
      /* 전투가 끝나면 최대 체력의 이 비율만큼을 현재 체력에 더한다 (곱이 아니라 합) */
      postBattleHealRatio:0.80
    },

    /* 자세 바꾸기 — 시간이 아니라 기력을 소모한다.
       전환은 '행동'이 아니므로 시간축이 흐르지 않고, 전환 직후 곧바로 기술을 쓸 수 있다.
       기술마다 사용 후 이동하는 자세가 정해져 있어, 연계가 맞으면 전환 기력을 아끼고
       어긋나면 기력을 태워야 한다. 이것이 이 게임의 빌드 설계 축이다. */
    transition:{
      costPerStep:2, freeSelfLoop:true,
      desc:'자세를 바꾼다. 시간은 흐르지 않고 기력만 소모하며, 먼 자세일수록 비용이 늘어난다.'
    },

    basic:{
      wait:{ id:'wait', name:'대기', recovery:3, staminaGain:3, focusGain:1,
             desc:'시간축을 3틱 넘긴다. 기력 3과 집중 1을 회복한다. 상대 예고가 그만큼 다가온다.' },
      approach:{ id:'approach', name:'접근', recovery:2, move:-1, staminaCost:1,
             escalationPerUse:0, escalationDecayTicks:0, escalationMax:0,
             desc:'거리를 1 좁힌다. 기력 1을 소모하고 빈틈 2틱이 발생한다.' },
      retreat:{ id:'retreat', name:'이탈', recovery:3, move:1, staminaCost:1,
             escalationPerUse:1, escalationDecayTicks:12, escalationMax:6,
             desc:'거리를 1 벌린다. 접근보다 빈틈이 1틱 길고, 연속 이탈마다 기력 비용이 1씩 누적된다.' }
    },

    /* 몰아치기 — 자신이 유효한 피해를 내지 못한 시간이 길어지면 자신에게만 허점이 쌓인다.
       직접 피해가 아니라 취약성만 키우므로 승패는 끝까지 기술 전투으로 결정되며,
       무한 추격과 무한 회피가 모두 성립하지 않게 된다. */
    pressure:{
      enabled:true, name:'압박', status:'exposed',
      idleTicksBeforeStart:12, stackEveryTicks:3, stacksPerApply:1, maxStacks:10,
      resetOn:{ damageDealt:true, attackResolvedInRange:true, statusDamage:true },
      desc:'자신이 유효한 피해를 내지 못한 시간이 길어지면 허점이 쌓인다. 공격을 성공시키면 한 번에 사라진다.'
    },

    /* globalScale — 모든 피해에 곱해지는 단일 조정 계수.
       개별 기술 수치를 건드리지 않고 전투 속도 전체를 조절하기 위한 중앙 손잡이다. */
    damage:{ minimum:0, roundMode:'floor', globalScale:1.50 },
    combat:{ missOnRangeFail:true },
    empower:{ enabled:true, label:'집중 사용' },
    clamp:{ minCast:0, minRecovery:1, minCost:0 },
    slots:{ perStanceBase:3, perStanceMax:5 }
  },

  /* ---------- 공격 방향 ---------- */
  lines:{
    high:{ id:'high', name:'윗선', short:'상', tag:'t-high', css:'--L-high',
           desc:'위에서 내려오는 궤적. 낮게 버티는 자세를 정면으로 때린다.' },
    mid:{ id:'mid', name:'가운데선', short:'중', tag:'t-mid', css:'--L-mid',
           desc:'몸통을 향하는 직선 궤적. 몸을 비껴 선 자세를 파고든다.' },
    low:{ id:'low', name:'아랫선', short:'하', tag:'t-low', css:'--L-low',
           desc:'아래를 쓸어 올리는 궤적. 높이 든 자세의 빈 곳을 친다.' },
    side:{ id:'side', name:'바깥선', short:'측', tag:'t-side', css:'--L-side',
           desc:'바깥에서 감아 들어오는 궤적. 정면 막기를 우회한다.' },
    none:{ id:'none', name:'방향 없음', short:'무', tag:'t-none', css:'--L-none',
           desc:'공격 궤적이 없는 기술.' }
  },

  /* ---------- 자세 ----------
     guard  : 방어자가 그 자세일 때 각 공격 방향으로부터 받는 피해 배율
     mod    : 자신이 그 자세일 때의 기본 보정
     allow  : 사용 가능한 사거리 제한 (rear 자세는 근접 기술을 쓸 수 없다)
  ------------------------------------------------------------------------ */
  stances:[
    { id:'mid', name:'중단', sym:'square', color:'--L-mid',
      desc:'균형 자세. 어느 공격 방향에도 표준 피해를 받는다. 연계의 중심이 된다.',
      mod:{ dealt:1.00, taken:1.00, cast:1.00, staminaRegen:1.00 },
      guard:{ high:1.00, mid:1.00, low:1.00, side:1.00 } },

    { id:'high', name:'상단', sym:'up', color:'--L-high',
      desc:'칼을 높이 든 자세. 위력이 높고 준비이 짧지만 아랫선에 크게 허점된다.',
      mod:{ dealt:1.20, taken:1.00, cast:0.85, staminaRegen:0.80 },
      guard:{ high:0.75, mid:1.00, low:1.50, side:1.10 } },

    { id:'low', name:'하단', sym:'down', color:'--L-low',
      desc:'낮게 버티는 자세. 기력 회복이 빠르고 단단하지만 윗선에 크게 허점된다.',
      mod:{ dealt:0.90, taken:0.85, cast:1.10, staminaRegen:1.30 },
      guard:{ high:1.50, mid:1.00, low:0.75, side:1.05 } },

    { id:'side', name:'측면', sym:'diag', color:'--L-side',
      desc:'몸을 비껴 선 자세. 바깥선을 잘 흘리지만 가운데선이 그대로 들어온다.',
      mod:{ dealt:0.95, taken:0.95, cast:1.00, staminaRegen:1.00 },
      guard:{ high:1.05, mid:1.35, low:1.00, side:0.70 } },

    { id:'rear', name:'후방', sym:'ring', color:'--L-none',
      desc:'거리를 둔 자세. 모든 공격 방향을 덜 맞고 기력이 빠르게 차지만 근접 기술을 쓸 수 없다.',
      mod:{ dealt:0.90, taken:1.00, cast:1.00, staminaRegen:1.45 },
      guard:{ high:0.85, mid:0.85, low:0.85, side:0.85 } }
  ],
  stanceStart:'mid',
  /* 자세 인접 관계 — 전환 비용은 이 그래프의 최단 거리로 계산된다 */
  stanceGraph:{
    mid:['high','low','side','rear'],
    high:['mid','side'],
    low:['mid','side','rear'],
    side:['mid','high','low'],
    rear:['mid','low']
  },

  /* ---------- 상태 ---------- */
  statuses:{
    bleed:{ name:'출혈', tag:'t-high', desc:'매 틱 중첩 수만큼 피해. 매 틱 1 감소.',
      perTickDamagePerStack:1, decayPerTick:1 },
    slow:{ name:'둔화', tag:'t-side', desc:'중첩당 준비 시간 +20%. 매 틱 1 감소.',
      castPerStack:0.20, decayPerTick:1 },
    weak:{ name:'취약', tag:'t-side', desc:'중첩당 받는 피해 +12%. 매 틱 1 감소.',
      takenPerStack:0.12, decayPerTick:1 },
    exposed:{ name:'허점', tag:'t-dang', desc:'중첩당 받는 피해 +10%. 유효한 공격을 성공시키면 전부 사라진다.',
      takenPerStack:0.10, decayPerTick:0 },
    power:{ name:'강화', tag:'t-warn', desc:'중첩당 주는 피해 +15%. 공격 발동 시 전량 소모.',
      dealtPerStack:0.15, decayPerTick:0, consumeOnHit:true },
    /* 막기는 매 틱 줄어든다. 미리 쌓아두는 자원이 아니라 '맞기 직전에 올리는' 타이밍 선택이 되도록 한다 */
    guard:{ name:'막기', tag:'t-low', desc:'받는 피해를 수치만큼 흡수한다. 매 틱 2씩 사라진다.',
      decayPerTick:2, absorb:true },
    mark:{ name:'표식', tag:'t-mid', desc:'중첩당 피해 +2. 피격 시 전량 소모.',
      flatPerStack:2, decayPerTick:0, consumeOnHit:true },
    poise:{ name:'흐트러짐', tag:'t-warn', desc:'중첩당 자세 바꾸기 비용 +1. 매 틱 1 감소.',
      transitionPerStack:1, decayPerTick:1 }
  }
};

/* ==========================================================================================
   [DB] 기술 테이블
     stance   : 사용 가능한 자세 (다른 자세라면 전환 기력을 먼저 지불해야 한다)
     to       : 사용 후 이동하는 자세
     line     : 공격 방향 (방어자 자세와의 상성 배율이 곱해진다)
     cast     : 예고 후 발동까지의 틱 (0 = 즉시)
     recovery : 사용 후 다음 행동까지의 빈틈 틱
     range    : [최소, 최대] 거리. 판정은 발동 시점 기준
     onPlay   : 사용 즉시 효과 / onHit : 발동 시 효과
   ========================================================================================== */
DB.techs = {

  /* ===== 중단 ===== */
  pierce:{ id:'pierce', name:'찌르기', stance:'mid', to:'high', line:'mid', tier:'base',
    cost:2, cast:2, recovery:3, range:[1,2],
    text:'피해 7.', onHit:[{k:'damage',v:7}],
    empower:{ focus:2, text:'피해 11, 표식 2를 남긴다.',
      onHit:[{k:'damage',v:11},{k:'status',t:'foe',s:'mark',v:2}] } },

  brace_mid:{ id:'brace_mid', name:'막기', stance:'mid', to:'low', line:'none', tier:'base',
    cost:1, cast:0, recovery:2, range:[0,4],
    text:'막기 9를 얻는다.', onPlay:[{k:'status',t:'self',s:'guard',v:9}] },

  press:{ id:'press', name:'압박 전진', stance:'mid', to:'mid', line:'none', tier:'base',
    cost:1, cast:0, recovery:1, range:[0,4],
    text:'거리를 1 좁히고 집중 1을 얻는다.',
    onPlay:[{k:'move',v:-1},{k:'focus',t:'self',v:1}] },

  intercept:{ id:'intercept', name:'차단', stance:'mid', to:'side', line:'none', tier:'common',
    cost:3, cast:0, recovery:2, range:[0,4],
    text:'적의 대기 중인 행동 1개를 즉시 취소한다.',
    onPlay:[{k:'cancelQueue',t:'foe',n:1}] },

  double_mid:{ id:'double_mid', name:'연속 찌르기', stance:'mid', to:'mid', line:'mid', tier:'common',
    cost:3, cast:1, recovery:2, range:[1,2],
    text:'피해 5. 집중 1을 얻는다.',
    onHit:[{k:'damage',v:5},{k:'focus',t:'self',v:1}] },

  disarm:{ id:'disarm', name:'해제', stance:'mid', to:'mid', line:'mid', tier:'common',
    cost:3, cast:3, recovery:3, range:[1,2],
    text:'적 막기를 모두 제거하고 피해 8.',
    onHit:[{k:'strip',t:'foe',s:'guard'},{k:'damage',v:8}] },

  /* ===== 상단 ===== */
  overhead:{ id:'overhead', name:'내려베기', stance:'high', to:'mid', line:'high', tier:'base',
    cost:4, cast:4, recovery:4, range:[1,2],
    text:'피해 16. 준비이 길어 간파당하기 쉽다.', onHit:[{k:'damage',v:16}],
    empower:{ focus:3, text:'피해 22, 취약 3을 부여한다.',
      onHit:[{k:'damage',v:22},{k:'status',t:'foe',s:'weak',v:3}] } },

  quick_cut:{ id:'quick_cut', name:'빠른 베기', stance:'high', to:'high', line:'high', tier:'base',
    cost:2, cast:1, recovery:2, range:[1,2],
    text:'피해 6. 같은 자세로 남아 연속으로 이어진다.', onHit:[{k:'damage',v:6}] },

  feint:{ id:'feint', name:'견제', stance:'high', to:'side', line:'high', tier:'base',
    cost:2, cast:1, recovery:2, range:[1,3],
    text:'피해 3. 적 기력 -3, 흐트러짐 2를 부여한다.',
    onHit:[{k:'damage',v:3},{k:'stamina',t:'foe',v:-3},{k:'status',t:'foe',s:'poise',v:2}] },

  hasten:{ id:'hasten', name:'가속', stance:'high', to:'high', line:'none', tier:'common',
    cost:3, cast:0, recovery:2, range:[0,4],
    text:'대기 중인 내 행동 전부를 4틱 앞당긴다.',
    onPlay:[{k:'hasten',t:'self',v:4,n:99}] },

  charge_high:{ id:'charge_high', name:'예열', stance:'high', to:'high', line:'none', tier:'common',
    cost:2, cast:0, recovery:2, range:[0,4],
    text:'강화 3을 얻는다. 다음 공격 발동 시 소모된다.',
    onPlay:[{k:'status',t:'self',s:'power',v:3}] },

  finisher:{ id:'finisher', name:'결정타', stance:'high', to:'mid', line:'high', tier:'rare',
    cost:5, cast:3, recovery:5, range:[1,2],
    text:'피해 13. 적 체력이 40% 이하면 피해 두 배.',
    onHit:[{k:'damage',v:13,bonusFoeHpBelow:{ratio:0.40,mult:2.0}}] },

  /* ===== 하단 ===== */
  sweep:{ id:'sweep', name:'후리기', stance:'low', to:'mid', line:'low', tier:'base',
    cost:3, cast:2, recovery:3, range:[1,2],
    text:'피해 8. 둔화 3을 부여한다.',
    onHit:[{k:'damage',v:8},{k:'status',t:'foe',s:'slow',v:3}],
    empower:{ focus:2, text:'피해 8, 둔화 6과 흐트러짐 3을 부여한다.',
      onHit:[{k:'damage',v:8},{k:'status',t:'foe',s:'slow',v:6},{k:'status',t:'foe',s:'poise',v:3}] } },

  hold:{ id:'hold', name:'버티기', stance:'low', to:'low', line:'none', tier:'base',
    cost:1, cast:0, recovery:2, range:[0,4],
    text:'막기 11과 기력 3을 얻는다.',
    onPlay:[{k:'status',t:'self',s:'guard',v:11},{k:'stamina',t:'self',v:3}] },

  counter:{ id:'counter', name:'반격 자세', stance:'low', to:'mid', line:'none', tier:'base',
    cost:2, cast:0, recovery:2, range:[0,4],
    text:'7틱 동안, 피격 시 피해 7을 흡수하고 적에게 피해 9를 되돌린다.',
    onPlay:[{k:'reaction',t:'self',window:7,absorb:7,trigger:'onDamaged',
             effects:[{k:'damage',v:9,direct:true}]}] },

  rend:{ id:'rend', name:'절단', stance:'low', to:'low', line:'low', tier:'common',
    cost:3, cast:3, recovery:3, range:[1,2],
    text:'피해 5. 출혈 5를 부여한다.',
    onHit:[{k:'damage',v:5},{k:'status',t:'foe',s:'bleed',v:5}] },

  read:{ id:'read', name:'간파', stance:'low', to:'side', line:'none', tier:'common',
    cost:2, cast:0, recovery:1, range:[0,4],
    text:'9틱 동안, 받는 피해를 50% 줄이고 집중 1을 얻는다.',
    onPlay:[{k:'reaction',t:'self',window:9,reduce:0.5,trigger:'onDamaged',
             effects:[{k:'focus',t:'self',v:1}]}] },

  mend:{ id:'mend', name:'응급 처치', stance:'low', to:'low', line:'none', tier:'rare',
    cost:3, cast:0, recovery:3, range:[0,4],
    text:'체력 12를 회복한다.', onPlay:[{k:'heal',t:'self',v:12}] },

  /* ===== 측면 ===== */
  side_cut:{ id:'side_cut', name:'측면 베기', stance:'side', to:'side', line:'side', tier:'base',
    cost:3, cast:2, recovery:2, range:[1,2],
    text:'피해 9. 같은 자세로 남는다.', onHit:[{k:'damage',v:9}] },

  slip:{ id:'slip', name:'흘리기', stance:'side', to:'rear', line:'none', tier:'base',
    cost:1, cast:0, recovery:1, range:[0,4],
    text:'거리를 1 벌리고 막기 6을 얻는다.',
    onPlay:[{k:'move',v:1},{k:'status',t:'self',s:'guard',v:6}] },

  circle:{ id:'circle', name:'우회', stance:'side', to:'high', line:'none', tier:'base',
    cost:2, cast:0, recovery:1, range:[0,4],
    text:'집중 2를 얻고 상단으로 돌아 들어간다.',
    onPlay:[{k:'focus',t:'self',v:2}] },

  delay:{ id:'delay', name:'지연', stance:'side', to:'mid', line:'none', tier:'common',
    cost:2, cast:0, recovery:2, range:[0,4],
    text:'적의 대기 중인 모든 행동을 4틱 늦춘다.',
    onPlay:[{k:'delayQueue',t:'foe',v:4,n:99}] },

  flank:{ id:'flank', name:'측방 돌입', stance:'side', to:'mid', line:'side', tier:'common',
    cost:3, cast:2, recovery:3, range:[1,3],
    text:'사용 즉시 거리를 1 좁힌다. 발동 시 피해 10.',
    onPlay:[{k:'move',v:-1}], onHit:[{k:'damage',v:10}] },

  bind:{ id:'bind', name:'속박', stance:'side', to:'side', line:'side', tier:'common',
    cost:3, cast:2, recovery:3, range:[1,3],
    text:'피해 4. 둔화 4와 흐트러짐 3을 부여한다.',
    onHit:[{k:'damage',v:4},{k:'status',t:'foe',s:'slow',v:4},{k:'status',t:'foe',s:'poise',v:3}] },

  /* ===== 후방 ===== */
  throw_blade:{ id:'throw_blade', name:'투척', stance:'rear', to:'rear', line:'mid', tier:'base',
    cost:2, cast:2, recovery:3, range:[3,4],
    text:'피해 8.', onHit:[{k:'damage',v:8}] },

  regroup:{ id:'regroup', name:'정비', stance:'rear', to:'mid', line:'none', tier:'base',
    cost:0, cast:0, recovery:3, range:[0,4],
    text:'기력 5와 집중 1을 얻는다.',
    onPlay:[{k:'stamina',t:'self',v:5},{k:'focus',t:'self',v:1}] },

  long_shot:{ id:'long_shot', name:'원사', stance:'rear', to:'rear', line:'high', tier:'common',
    cost:3, cast:3, recovery:3, range:[3,4],
    text:'피해 11.', onHit:[{k:'damage',v:11}],
    empower:{ focus:2, text:'피해 11. 막기를 무시하고 취약 3을 부여한다.',
      onHit:[{k:'damage',v:11,pierce:true},{k:'status',t:'foe',s:'weak',v:3}] } },

  snare:{ id:'snare', name:'덫 설치', stance:'rear', to:'low', line:'low', tier:'common',
    cost:2, cast:6, recovery:2, range:[0,1],
    text:'6틱 뒤 발동. 그 시점 거리가 1 이하면 피해 15.',
    onHit:[{k:'damage',v:15}] },

  compress:{ id:'compress', name:'시간 압축', stance:'rear', to:'mid', line:'none', tier:'rare',
    cost:4, cast:0, recovery:2, range:[0,4],
    text:'적의 대기 중인 모든 행동을 6틱 늦추고 내 행동을 3틱 앞당긴다.',
    onPlay:[{k:'delayQueue',t:'foe',v:6,n:99},{k:'hasten',t:'self',v:3,n:99}] }
};

/* ---------- 유파 ---------- */
DB.schools = [
  { id:'direct', name:'직도류', tag:'t-high',
    desc:'중단과 상단을 오가며 정면에서 결판을 낸다. 연계가 짧고 피해가 높지만, 상단에 머무르면 아랫선에 크게 맞는다.',
    focus:'높은 피해 · 짧은 연계', hpBonus:0, staminaBonus:0, weapon:'standard',
    techs:['pierce','brace_mid','quick_cut','overhead','hold','press'] },

  { id:'foot', name:'보법류', tag:'t-side',
    desc:'측면과 후방을 돌며 거리를 지배한다. 한 방은 약하지만 상대 예고을 흘리고 사거리를 어긋나게 만든다.',
    focus:'거리 지배 · 회피', hpBonus:-6, staminaBonus:3, weapon:'shortblade',
    techs:['pierce','slip','circle','side_cut','throw_blade','regroup'] },

  { id:'counterblade', name:'반격류', tag:'t-low',
    desc:'하단에서 버티다가 받아친다. 기력 회복이 빨라 오래 버티며, 상대가 큰 기술을 예고한 순간이 승부처다.',
    focus:'방어 · 반격', hpBonus:8, staminaBonus:0, weapon:'longblade',
    techs:['pierce','hold','counter','sweep','brace_mid','feint'] }
];

/* ==========================================================================================
   [DB] 무기 — 한 자루만 든다. 모든 기술의 사거리·준비·빈틈·피해·기력을 한꺼번에 바꾼다.
   같은 기술 구성이라도 무기가 다르면 전혀 다른 전투가 되므로, 판마다 결이 달라진다.
   ========================================================================================== */
DB.weapons = {
  standard:{ id:'standard', name:'표준 도검', tag:'t-key',
    desc:'보정 없음. 어떤 구성에도 무난하게 맞는다.',
    mod:{} },
  longblade:{ id:'longblade', name:'장검', tag:'t-mid',
    desc:'사거리 +1, 피해 +22%. 대신 준비가 1틱 늘고 기력이 1 더 든다.',
    mod:{ rangeMax:1, dealt:0.22, cast:1, cost:1 } },
  shortblade:{ id:'shortblade', name:'단검', tag:'t-side',
    desc:'준비 -1틱, 빈틈 -1틱. 대신 피해 -30%, 최대 사거리 -1.',
    mod:{ cast:-1, recovery:-1, dealt:-0.30, rangeMax:-1 } },
  greatblade:{ id:'greatblade', name:'대검', tag:'t-high',
    desc:'피해 +55%. 준비가 1틱, 빈틈이 1틱 늘고 기력이 1 더 든다.',
    mod:{ dealt:0.55, cast:1, recovery:1, cost:1 } },
  twinblade:{ id:'twinblade', name:'쌍검', tag:'t-low',
    desc:'빈틈 -1틱, 자세 바꾸기 비용 -1. 대신 피해 -30%.',
    mod:{ recovery:-1, transitionDiscount:1, dealt:-0.30 } },
  polearm:{ id:'polearm', name:'장병기', tag:'t-none',
    desc:'최소 사거리 +1, 최대 사거리 +1, 피해 +10%. 밀착에서는 쓸 수 없게 된다.',
    mod:{ rangeMin:1, rangeMax:1, dealt:0.10 } }
};
DB.weaponStart = 'standard';

/* ==========================================================================================
   [DB] 연계 — 특정 자세 경로(어느 자세에서 어느 자세로 이동했는가)에 보상을 건다.
   기술마다 '사용 후 이동할 자세'가 정해져 있으므로, 연계를 갖추면 순환 경로를 설계하게 된다.
   자세 그래프 자체를 빌드 대상으로 만드는 축이다.
   ========================================================================================== */
DB.chains = {
  c_mid_high:{ id:'c_mid_high', name:'올려치기 연결', from:'mid', to:'high',
    desc:'중단에서 상단으로 이동하면 강화 2를 얻는다.',
    effects:[{k:'status',t:'self',s:'power',v:2}] },
  c_high_mid:{ id:'c_high_mid', name:'되돌리기', from:'high', to:'mid',
    desc:'상단에서 중단으로 이동하면 기력 3을 얻는다.',
    effects:[{k:'stamina',t:'self',v:3}] },
  c_mid_low:{ id:'c_mid_low', name:'가라앉히기', from:'mid', to:'low',
    desc:'중단에서 하단으로 이동하면 막기 6을 얻는다.',
    effects:[{k:'status',t:'self',s:'guard',v:6}] },
  c_low_mid:{ id:'c_low_mid', name:'받아넘기기', from:'low', to:'mid',
    desc:'하단에서 중단으로 이동하면 집중 1을 얻는다.',
    effects:[{k:'focus',t:'self',v:1}] },
  c_side_high:{ id:'c_side_high', name:'감아올리기', from:'side', to:'high',
    desc:'측면에서 상단으로 이동하면 적에게 표식 2를 남긴다.',
    effects:[{k:'status',t:'foe',s:'mark',v:2}] },
  c_high_high:{ id:'c_high_high', name:'연속 내려치기', from:'high', to:'high',
    desc:'상단에서 상단으로 이어지면 내 예고를 1틱 앞당긴다.',
    effects:[{k:'hasten',t:'self',v:1,n:99}] },
  c_side_side:{ id:'c_side_side', name:'돌아 들어가기', from:'side', to:'side',
    desc:'측면에서 측면으로 이어지면 적 예고를 1틱 늦춘다.',
    effects:[{k:'delayQueue',t:'foe',v:1,n:99}] },
  c_rear_mid:{ id:'c_rear_mid', name:'거리 좁히기', from:'rear', to:'mid',
    desc:'후방에서 중단으로 이동하면 거리를 1 좁힌다.',
    effects:[{k:'move',v:-1}] },
  c_low_side:{ id:'c_low_side', name:'흘려 비끼기', from:'low', to:'side',
    desc:'하단에서 측면으로 이동하면 적에게 둔화 2를 부여한다.',
    effects:[{k:'status',t:'foe',s:'slow',v:2}] },
  c_mid_side:{ id:'c_mid_side', name:'비껴 서기', from:'mid', to:'side',
    desc:'중단에서 측면으로 이동하면 체력 4를 회복한다.',
    effects:[{k:'heal',t:'self',v:4}] }
};
DB.chainSlots = 3;

/* ---------- 단련 (패시브) ---------- */
DB.sigils = {
  s_even:{ id:'s_even', name:'짝수 박자', cond:'tickParity', v:0,
    desc:'짝수 틱에 발동한 내 공격은 피해 +5.', bonus:{ damage:5 } },
  s_odd:{ id:'s_odd', name:'홀수 박자', cond:'tickParity', v:1,
    desc:'홀수 틱에 발동한 내 공격은 피해 +5.', bonus:{ damage:5 } },
  s_early:{ id:'s_early', name:'선제 각인', cond:'tickBefore', v:24,
    desc:'24틱 이전에 발동한 내 공격은 피해 +7.', bonus:{ damage:7 } },
  s_late:{ id:'s_late', name:'지구 각인', cond:'tickAfter', v:70,
    desc:'70틱 이후 내 공격은 피해 +10.', bonus:{ damage:10 } },
  s_quick:{ id:'s_quick', name:'속공 각인', cond:'castAtMost', v:1,
    desc:'준비 1틱 이하 공격은 피해 +4, 집중 1을 얻는다.', bonus:{ damage:4, focus:1 } },
  s_heavy:{ id:'s_heavy', name:'중격 각인', cond:'castAtLeast', v:4,
    desc:'준비 4틱 이상 공격은 피해 +12.', bonus:{ damage:12 } },
  s_double:{ id:'s_double', name:'겹박자', cond:'sameTick', v:2,
    desc:'같은 틱에 내 공격이 둘 이상 발동하면 각각 피해 +8.', bonus:{ damage:8 } },
  s_close:{ id:'s_close', name:'접근 각인', cond:'distanceAt', v:1,
    desc:'거리 근접에서 발동한 공격은 피해 +6.', bonus:{ damage:6 } },
  s_far:{ id:'s_far', name:'원격 각인', cond:'distanceAt', v:3,
    desc:'거리 원거리에서 발동한 공격은 피해 +6.', bonus:{ damage:6 } },
  s_bleed:{ id:'s_bleed', name:'출혈 각인', cond:'tickParity', v:1,
    desc:'홀수 틱에 발동한 공격은 출혈 3을 추가한다.', bonus:{ bleed:3 } }
};
DB.sigilSlots = 3;

/* ==========================================================================================
   [DB] 전환점 — 규칙 자체를 바꾸는 큰 선택. 지도의 정해진 지점에서 하나만 고른다.
   장점과 단점을 함께 지니므로, 지금까지 쌓은 구성에 맞춰 골라야 한다.
   ========================================================================================== */
DB.milestones = {
  m_swift:{ id:'m_swift', name:'속공 전환', desc:'모든 준비 -1틱. 대신 주는 피해 -12%.',
    mod:{ cast:-1, dealt:-0.12 } },
  m_heavy:{ id:'m_heavy', name:'중압 전환', desc:'주는 피해 +28%. 대신 모든 빈틈 +1틱.',
    mod:{ dealt:0.28, recovery:1 } },
  m_fluid:{ id:'m_fluid', name:'유동 전환', desc:'자세 바꾸기 비용 -2. 대신 최대 기력 -3.',
    mod:{ transitionDiscount:2, staminaMax:-3 } },
  m_solid:{ id:'m_solid', name:'견고 전환', desc:'받는 피해 -20%. 대신 주는 피해 -10%.',
    mod:{ taken:-0.20, dealt:-0.10 } },
  m_sharp:{ id:'m_sharp', name:'예리 전환', desc:'자세 상성의 유불리가 1.5배로 증폭된다.',
    mod:{ lineAmp:0.5 } },
  m_reach:{ id:'m_reach', name:'간격 전환', desc:'모든 기술의 최소·최대 사거리 +1.',
    mod:{ rangeMin:1, rangeMax:1 } },
  m_vigor:{ id:'m_vigor', name:'지구 전환', desc:'최대 체력 +25, 기력 회복 +0.5.',
    mod:{ hpMax:25, staminaRegen:0.5 } },
  m_edge:{ id:'m_edge', name:'예봉 전환', desc:'허점이 쌓인 적에게 주는 피해 +30%.',
    mod:{ vsExposed:0.30 } }
};
DB.milestoneLayers = [2,4];

/* ==========================================================================================
   [DB] 개전 설계 — 시작 구성을 직접 조립한다.
   정해진 유파를 고르는 것이 아니라, 설계 점수를 나눠 써서 무기 · 기술 · 각인 · 연계 ·
   기본 능력치를 스스로 정한다. 프리셋은 빠른 시작을 위한 참고안일 뿐 강제가 아니다.
   ========================================================================================== */
DB.setup = {
  points:18, minTechs:4, maxTechs:9,
  cost:{ techBase:1, techCommon:2, techRare:3,
         weapon:{ standard:0, longblade:2, shortblade:2, polearm:2, twinblade:3, greatblade:3 },
         sigil:3, chain:2, trait:3, hpStep:1, staminaStep:1, focusStep:2 },
  step:{ hp:8, stamina:2, focus:1 },
  maxStep:{ hp:3, stamina:3, focus:2 },
  base:{ hp:64, stamina:13, focus:5 },
  presets:[
    { id:'direct', name:'직도류', tag:'t-high', desc:'중단과 상단을 오가며 정면에서 결판을 낸다.',
      weapon:'standard', techs:['pierce','brace_mid','quick_cut','overhead','hold','press'],
      sigils:['s_heavy'], chains:['c_mid_high'], hp:1, stamina:0, focus:0 },
    { id:'foot', name:'보법류', tag:'t-side', desc:'측면과 후방을 돌며 거리를 지배한다.',
      weapon:'shortblade', techs:['pierce','slip','circle','side_cut','throw_blade','regroup'],
      sigils:['s_quick'], chains:['c_side_side'], hp:0, stamina:2, focus:0 },
    { id:'counterblade', name:'반격류', tag:'t-low', desc:'하단에서 버티다가 받아친다.',
      weapon:'longblade', techs:['pierce','hold','counter','sweep','brace_mid','feint'],
      sigils:['s_even'], chains:['c_mid_low'], hp:2, stamina:0, focus:0 }
  ]
};

DB.traits = {
  vigor:{ id:'vigor', name:'지구력', desc:'최대 체력 +10', mod:{ hpMax:10 } },
  breath:{ id:'breath', name:'호흡법', desc:'최대 기력 +3', mod:{ staminaMax:3 } },
  tempo:{ id:'tempo', name:'박자', desc:'기력 회복 +0.3 / 틱', mod:{ staminaRegen:0.3 } },
  footwork:{ id:'footwork', name:'보법 단련', desc:'자세 바꾸기 비용 -1 (최소 1)', mod:{ transitionDiscount:1 } },
  focus_t:{ id:'focus_t', name:'집중 수련', desc:'최대 집중 +2, 전투 시작 시 집중 2', mod:{ focusMax:2, focusStart:2 } },
  edge:{ id:'edge', name:'날 세우기', desc:'주는 피해 +8%', mod:{ dealt:0.08 } },
  plate:{ id:'plate', name:'경갑', desc:'받는 피해 -8%', mod:{ taken:-0.08 } },
  swift:{ id:'swift', name:'속기', desc:'준비 시간 -10%', mod:{ cast:-0.10 } },
  slot_high:{ id:'slot_high', name:'상단 수련', desc:'상단 자세 기술 슬롯 +1', mod:{ slot:'high' } },
  slot_low:{ id:'slot_low', name:'하단 수련', desc:'하단 자세 기술 슬롯 +1', mod:{ slot:'low' } },
  slot_side:{ id:'slot_side', name:'측면 수련', desc:'측면 자세 기술 슬롯 +1', mod:{ slot:'side' } },
  slot_mid:{ id:'slot_mid', name:'중단 수련', desc:'중단 자세 기술 슬롯 +1', mod:{ slot:'mid' } },
  slot_rear:{ id:'slot_rear', name:'후방 수련', desc:'후방 자세 기술 슬롯 +1', mod:{ slot:'rear' } },
  opening:{ id:'opening', name:'허점 포착', desc:'허점이 쌓인 적에게 주는 피해 +15%', mod:{ vsExposed:0.15 } },
  guardup:{ id:'guardup', name:'방패술', desc:'막기 획득량 +40%', mod:{ guardGain:0.40 } }
};

/* ---------- 적 ---------- */
DB.enemies = {
  dummy:{ id:'dummy', name:'훈련 상대', tier:'tutorial', hp:46, stance:'mid',
    stamina:8, staminaMax:12, staminaRegen:1, focusMax:3,
    desc:'정해진 순서로만 움직인다. 예고을 읽고 대응하는 연습용.',
    techs:['pierce','overhead','brace_mid','quick_cut'],
    ai:'script', script:['pierce','wait','overhead','wait','brace_mid','quick_cut'] },

  scout:{ id:'scout', name:'정찰병', tier:'normal', hp:44, stance:'rear',
    stamina:7, staminaMax:12, staminaRegen:1, focusMax:4,
    desc:'후방에 머물며 투척으로 갉아먹는다. 붙지 못하면 일방적으로 맞는다.',
    techs:['throw_blade','regroup','slip','circle','pierce','brace_mid'],
    ai:'kiter' },

  shieldman:{ id:'shieldman', name:'방패병', tier:'normal', hp:62, stance:'low',
    stamina:8, staminaMax:13, staminaRegen:1, focusMax:4,
    desc:'하단에서 막기를 쌓고 버틴다. 윗선 공격과 막기 해제가 유효하다.',
    techs:['hold','sweep','brace_mid','pierce','rend','overhead'],
    ai:'bruiser' },

  duelist:{ id:'duelist', name:'결투병', tier:'normal', hp:50, stance:'high',
    stamina:8, staminaMax:13, staminaRegen:1, focusMax:5,
    desc:'상단에 머무르며 짧은 준비으로 몰아친다. 아랫선으로 받아치는 것이 정석이다.',
    techs:['quick_cut','feint','overhead','press','pierce','charge_high'],
    ai:'tempo' },

  saboteur:{ id:'saboteur', name:'교란병', tier:'elite', hp:66, stance:'side',
    stamina:9, staminaMax:14, staminaRegen:1, focusMax:5,
    desc:'예고을 지우고 자세를 흐트러뜨린다. 전환 비용이 늘어나 연계가 끊긴다.',
    techs:['delay','intercept','bind','side_cut','feint','brace_mid'],
    ai:'control' },

  breaker:{ id:'breaker', name:'중장병', tier:'elite', hp:88, stance:'mid',
    stamina:9, staminaMax:15, staminaRegen:1, focusMax:5,
    desc:'거리를 강제로 좁히고 큰 기술을 예고한다. 차단하거나 사거리 밖으로 빼야 한다.',
    techs:['overhead','press','disarm','hold','charge_high','sweep'],
    ai:'bruiser' },

  master:{ id:'master', name:'검술 교관', tier:'boss', hp:124, stance:'mid',
    stamina:10, staminaMax:17, staminaRegen:2, focusMax:6,
    desc:'다섯 자세를 모두 쓴다. 자세를 읽고 상성이 맞는 공격 방향을 골라야 뚫린다.',
    techs:['pierce','overhead','sweep','side_cut','throw_blade','intercept',
           'counter','charge_high','hold','circle'],
    ai:'master' }
};

/* ---------- AI 가중치 ---------- */
DB.ai = {
  profiles:{
    kiter:{ wDamage:1.05, wRisk:1.30, wEvade:3.00, wRangeFit:2.10, wStamina:0.42, wFocus:0.25,
            wTempo:0.70, wStatus:1.05, wGuard:0.95, wKill:150, wStall:1.40, wPressure:1.20,
            wStanceSafe:1.30, wTrans:0.55, prefDist:3 },
    bruiser:{ wDamage:1.35, wRisk:0.78, wEvade:0.90, wRangeFit:2.20, wStamina:0.32, wFocus:0.20,
            wTempo:0.45, wStatus:0.95, wGuard:1.25, wKill:150, wStall:1.10, wPressure:1.00,
            wStanceSafe:0.90, wTrans:0.40, prefDist:1 },
    tempo:{ wDamage:1.18, wRisk:0.95, wEvade:1.55, wRangeFit:2.00, wStamina:0.35, wFocus:0.30,
            wTempo:1.15, wStatus:0.90, wGuard:0.80, wKill:150, wStall:1.55, wPressure:1.30,
            wStanceSafe:1.10, wTrans:0.50, prefDist:1 },
    control:{ wDamage:0.88, wRisk:1.10, wEvade:1.75, wRangeFit:1.75, wStamina:0.45, wFocus:0.35,
            wTempo:0.80, wStatus:1.70, wGuard:0.95, wKill:150, wStall:1.30, wPressure:1.10,
            wStanceSafe:1.20, wTrans:0.45, prefDist:2 },
    master:{ wDamage:1.22, wRisk:1.05, wEvade:1.65, wRangeFit:2.10, wStamina:0.40, wFocus:0.35,
            wTempo:0.85, wStatus:1.25, wGuard:1.05, wKill:150, wStall:1.35, wPressure:1.15,
            wStanceSafe:1.45, wTrans:0.45, prefDist:2 }
  },
  distancePenaltyPerStep:0.55,
  incomingLookahead:8,
  /* 막기는 실제로 막아낼 피해만큼만 가치가 있다. 위협이 없을 때 쌓는 막기는 거의 값이 없다 */
  guardValue:{ idleRatio:0.15, cap:1.0 },
  lowHpRatio:0.35,
  lowHpGuardBonus:1.8,
  stall:{ historyLength:8, penaltyPerRepeat:1.6, appliesTo:['approach','retreat','wait'] },
  pressureAversion:{ waitMult:1.6, retreatMult:1.3, techMult:0.4 }
};

/* ---------- 난이도 ---------- */
DB.difficulties = [
  { id:'train', name:'훈련', desc:'적 체력 -20%. 적 의도와 예상 피해를 모두 공개한다.',
    enemyHpMult:0.80, aiNoise:0.30, intent:'full' },
  { id:'std', name:'표준', desc:'기준 밸런스. 적 의도와 예상 피해를 모두 공개한다.',
    enemyHpMult:1.00, aiNoise:0.10, intent:'full' },
  { id:'hard', name:'고난도', desc:'적 체력 +20%. 적 예고은 이름과 공격 방향만 공개한다.',
    enemyHpMult:1.20, aiNoise:0.04, intent:'partial' }
];
DB.difficultyDefault = 'std';

/* ---------- 지도 ---------- */
DB.map = {
  layers:[
    { count:1, types:['battle'] },
    { count:2, types:['battle','rest'] },
    { count:3, types:['battle','battle','elite'] },
    { count:1, types:['turn'] },
    { count:2, types:['rest','supply'] },
    { count:3, types:['battle','elite','elite'] },
    { count:1, types:['turn'] },
    { count:2, types:['rest','supply'] },
    { count:1, types:['boss'] }
  ],
  nodeTypes:{
    battle:{ name:'전투', desc:'일반 상대와 겨룬다.', pool:['scout','shieldman','duelist'] },
    elite:{ name:'정예', desc:'강한 상대. 보상 선택지가 늘어난다.', pool:['saboteur','breaker'] },
    rest:{ name:'정비', desc:'회복 또는 단련을 선택한다.', pool:[] },
    supply:{ name:'보급', desc:'물자으로 기술·단련·회복을 얻는다.', pool:[] },
    boss:{ name:'결전', desc:'최종 상대.', pool:['master'] },
    turn:{ name:'전환점', desc:'규칙 자체를 바꾸는 선택을 한 번 한다.', pool:[] }
  },
  rest:{ healRatio:0.30, traitOptions:3 },
  supply:{ techCost:35, techOptions:3, traitCost:45, traitOptions:3,
           chainCost:40, chainOptions:3, sigilCost:45, sigilOptions:3,
           weaponCost:55, weaponOptions:3,
           healCost:20, healAmount:14, startParts:40,
           partsPerBattle:20, partsPerElite:34, partsPerBoss:0 },
  reward:{ techOptions:3, eliteTechOptions:4, traitChanceElite:1, chainOptions:2,
           sigilOptions:2, eliteWeaponOptions:2, skipParts:22 }
};

/* ---------- 설정 ---------- */
DB.settingsDefault = { animations:true, fontScale:1.00, logDetail:'full',
  aiSpeed:'normal', confirmQuit:true, difficulty:'std', showMultiplier:true, announce:true };
DB.settingsSchema = [
  { key:'difficulty', label:'난이도', hint:'새 게임 시작 시 적용된다.', type:'seg',
    options:[{v:'train',l:'훈련'},{v:'std',l:'표준'},{v:'hard',l:'고난도'}] },
  { key:'announce', label:'중앙 알림', hint:'전투 중 주요 사건을 화면 가운데에 크게 띄운다.', type:'toggle' },
  { key:'showMultiplier', label:'상성 배율 표시', hint:'기술 카드에 현재 상대 자세 기준 피해 배율을 띄운다.', type:'toggle' },
  { key:'animations', label:'애니메이션', hint:'전환 및 반응 효과 사용 여부.', type:'toggle' },
  { key:'aiSpeed', label:'적 행동 속도', hint:'적 연속 행동의 진행 속도.', type:'seg',
    options:[{v:'normal',l:'보통'},{v:'fast',l:'빠름'}] },
  { key:'logDetail', label:'전투 기록', hint:'기록에 남길 정보의 양.', type:'seg',
    options:[{v:'full',l:'상세'},{v:'brief',l:'요약'}] },
  { key:'fontScale', label:'글자 크기', hint:'전체 인터페이스 글자 배율.', type:'seg',
    options:[{v:0.92,l:'작게'},{v:1.00,l:'보통'},{v:1.12,l:'크게'}] },
  { key:'confirmQuit', label:'전투 포기 확인', hint:'포기 시 확인 창을 띄운다.', type:'toggle' }
];

/* ---------- UI 문구 ---------- */
DB.ui = {
  window:16, majorEvery:4,
  /* 기술을 지금 쓸 수 없는 이유 — 카드에 그대로 표시한다 */
  blockReason:{
    stamina:'기력 {need} 필요 (현재 {have})',
    focus:'집중 {need} 필요',
    turn:'상대 차례',
    locked:'튜토리얼에서 잠김'
  },
  brief:{
    none:'예고된 적 공격 없음. 지금은 자리를 잡거나 기력을 모을 때.',
    incoming:'{tech} 발동까지 {in}틱 · 지금 자세로 {dmg} 피해',
    safeStance:'{stance} 자세면 {dmg}로 줄어듦',
    outrange:'거리를 {dir} 하면 빗나감',
    yourTurn:'내 차례',
    foeTurn:'상대 차례'
  },
  laneSelf:'아군 예고', laneFoe:'적군 예고',
  menu:[
    { id:'newrun', label:'새 게임' },
    { id:'continue', label:'이어하기' },
    { id:'tutorial', label:'튜토리얼 (실전 진행)' },
    { id:'codex', label:'규칙 안내' },
    { id:'multi', label:'멀티플레이' },
    { id:'settings', label:'설정' }
  ],
  /* 중앙 알림 — 화면 한가운데에 잠깐 떠오르는 굵은 안내. 흐름의 분기만 띄운다 */
  announce:{
    durationMs:1400, maxStack:3,
    tpl:{
      start:{ text:'전투 시작 — {foe}', kind:'info' },
      queue:{ text:'{tech} 예고 · {at}틱에 발동', kind:'info' },
      resolve:{ text:'{tech} 발동', kind:'info' },
      damage:{ text:'{v} 피해', kind:'dmg' },
      miss:{ text:'{tech} 빗나감 · 거리 {dist}', kind:'warn' },
      cancelled:{ text:'{tech} 끊김', kind:'warn' },
      reaction:{ text:'반격 발동', kind:'info' },
      chain:{ text:'연계 · {name}', kind:'info' },
      sigil:{ text:'각인 · {name}', kind:'info' },
      pressure:{ text:'몰아치기 부족 — 허점 {v}', kind:'warn' },
      stance:{ text:'자세 {v}', kind:'info' },
      timeout:{ text:'제한 시간 — 체력 비율 판정', kind:'warn' },
      win:{ text:'승리', kind:'info' },
      lose:{ text:'패배', kind:'warn' }
    }
  },

  log:{
    start:'전투 시작. 상대는 {foe}.',
    queue:'{side} {tech} 예고 · 발동 {at}틱',
    resolve:'{side} {tech} 발동',
    miss:'{side} {tech} 빗나감 · 거리 {dist}',
    cancelled:'{side} {tech} 취소됨',
    damage:'{side} 피해 {v}',
    multi:'{side} {line} 대 {stance} · 배율 {v}배',
    heal:'{side} 체력 {v} 회복',
    guard:'{side} 막기 {v}',
    status:'{side} {st} {v} 중첩',
    strip:'{side} {st} 제거됨',
    move:'거리 {v}',
    wait:'{side} 대기',
    approach:'{side} 접근',
    retreat:'{side} 이탈',
    retreatCost:'{side} 이탈 비용 {v}',
    stance:'{side} 자세 바꾸기 · {v}',
    bleed:'{side} 출혈 피해 {v}',
    reaction:'{side} 반격 발동',
    chain:'{side} 연계 · {name}',
    sigil:'{side} 각인 · {name}',
    delayQueue:'{side} 예고 {v}틱 지연',
    cancelQueue:'{side} 예고 차단',
    hasten:'{side} 예고 {v}틱 단축',
    pressureStart:'{side} 공세 부족. 압박이 시작된다.',
    pressure:'{side} 허점 {v} 중첩',
    timeout:'제한 시간 도달. 체력 비율로 판정한다.',
    win:'전투 종료. 승리.',
    lose:'전투 종료. 패배.'
  }
};

/* ==========================================================================================
   [DB] 튜토리얼 대본 — 실제 전투 화면 위에서 각 요소를 직접 가리키며 진행한다.
     focus   : 강조할 화면 요소 선택자
     require : 이 단계를 넘기기 위해 반드시 해야 하는 행동 (없으면 다음 버튼으로 진행)
     allow   : 이 단계에서 허용되는 행동 목록 (나머지는 잠긴다)
     setup   : 단계 진입 시 전투 상태를 강제로 맞춘다
   ========================================================================================== */
DB.tutorial = {
  enemy:'dummy',
  school:'direct',
  /* lock : 이 단계에서 잠긴 조작을 눌렀을 때 보여줄 안내
     do   : 순서대로 눌러야 하는 조작을 글로 명시한다 (버튼 위치와 용도 설명) */
  lockMsg:'지금 단계에서는 그 조작이 잠겨 있다. 아래 안내대로 진행한다.',
  steps:[
  { t:'화면은 네 층으로 나뉜다', focus:null,
    b:'맨 위가 양쪽 상태, 그 아래가 시간축, 그 아래가 자세 칸, 맨 아래가 기술과 조작 버튼이다. 위에서 아래로 읽으면 된다. 지금 무슨 일이 일어나는지는 화면 한가운데에 큼직하게 떠오른다.' },

  { t:'시간축을 먼저 읽는다', focus:'#tlBox',
    b:'이 게임의 모든 행동은 즉시 일어나지 않는다. 기술을 쓰면 시간축 위에 예고되고, 정해진 틱이 지나야 발동한다. 가운데 눈금이 시간, 위가 상대 예고, 아래가 내 예고다. 세로 막대는 각자 다음 행동이 가능해지는 시점이다.' },

  { t:'거리는 발동 순간에 판정된다', focus:'#tlBox .dist',
    b:'오른쪽 다섯 칸이 거리다. 칠해진 칸이 현재 거리이며, 연한 칸은 지금 고른 기술이 닿는 범위다. 중요한 것은 기술을 쓴 순간이 아니라 발동하는 순간의 거리라는 점이다. 상대가 빠지면 내 공격도 빗나간다.' },

  { t:'자세 칸을 본다', focus:'#ringBox',
    b:'자세는 다섯 가지다. 각 자세는 쓸 수 있는 기술과, 각 공격 방향으로부터 받는 피해 배율을 동시에 정한다. 칸을 누르면 그 자세로 바뀐다. 자세 바꾸기는 시간을 쓰지 않고 기력만 쓰므로, 바꾼 뒤에도 이번 차례에 기술을 쓸 수 있다.' },

  { t:'기술 한 장을 읽는 법', focus:'[data-tech="pierce"]',
    b:'위쪽 색 띠가 공격 방향, 오른쪽 원이 기술 자체의 기력 비용이다. 가운데 작은 막대는 준비와 빈틈을 길이로 보여준다 — 진한 칸이 효과가 터지기까지, 연한 칸이 내가 다시 움직이기까지다. 그 아래 줄의 굵은 숫자가 자세 바꾸기까지 포함한 실제 기력이다. 점 다섯 개는 사거리, 맨 밑은 쓰고 나서 이동할 자세다.' },

  { t:'아래 버튼들의 용도', focus:'#actBox',
    b:'맨 아래 줄이 조작 버튼이다. 왼쪽부터 순서대로 읽으면 된다.',
    steps:['<b>사용</b> — 위에서 고른 기술을 실제로 쓴다. 기술을 먼저 고르지 않으면 나타나지 않는다.',
           '<b>집중 사용</b> — 집중을 써서 같은 기술을 강화한다. 집중이 모자라면 눌리지 않는다.',
           '<b>선택 해제</b> — 고른 기술을 취소한다. 아무것도 소모하지 않는다.',
           '<b>대기</b> — 시간축을 3틱 넘기고 기력과 집중을 회복한다.',
           '<b>접근 · 이탈</b> — 거리를 한 칸 좁히거나 벌린다. 기력을 쓰고 빈틈이 생긴다.'] },

  { t:'비용은 두 가지다', focus:'#selfPanel',
    b:'헷갈리기 쉬운 부분이다. 기력은 초록 막대에서 빠지는 자원이고, 틱은 시간축 위에서 흐르는 시간이다. 기술을 고르면 초록 막대에 빗금이 생겨 이번에 빠져나갈 기력이 미리 보이고, 옆에 빠질 양이 붉게 적힌다. 반대로 준비와 빈틈은 기력이 아니라 시간을 쓴다.' },

  { t:'첫 기술을 써 본다', focus:'#techBox [data-tech="pierce"]',
    b:'고르는 순간 시간축에 점선으로 발동 예정 위치가 찍히고, 버튼 위 줄에 발동 시각과 예상 피해가 계산되어 나온다. 밝게 표시된 곳만 누르면 된다.',
    hint:'찌르기 카드를 누른다 → 왼쪽 아래 사용 버튼을 누른다.',
    require:{ type:'tech', id:'pierce' }, allow:{ techs:['pierce'] } },

  { t:'지금 상황 줄을 읽는다', focus:'#briefBox',
    b:'버튼 바로 위 줄이 현재 판단에 필요한 정보를 한 문장으로 정리해 준다. 내 차례인지, 상대의 어떤 공격이 몇 틱 뒤에 오는지, 지금 자세로 맞으면 몇 피해인지, 어느 자세로 바꾸면 얼마나 줄어드는지까지 나온다.',
    setup:{ foeQueue:'sweep' } },

  { t:'자세 칸의 숫자가 답을 준다', focus:'#ringBox',
    b:'상대가 아랫선 기술을 예고했다. 자세 칸마다 뜬 작은 숫자가 그 자세로 맞을 때의 피해 배율이다. 붉으면 더 맞고, 푸르면 덜 맞는다. 지금 상단 자세는 아랫선을 1.5배로 맞고, 하단 자세는 0.75배로 흘린다.' },

  { t:'유리한 자세로 옮긴다', focus:'[data-stance="low"]',
    b:'칸 아래 적힌 숫자가 그 자세로 옮기는 데 드는 기력이며, 멀리 떨어진 자세일수록 비싸다. 밝게 표시된 하단 칸을 누른다.',
    hint:'자세 줄에서 하단 칸을 누른다.',
    require:{ type:'stance', id:'low' }, allow:{ stances:['low'] } },

  { t:'맞기 직전에 막기를 올린다', focus:'#techBox [data-tech="hold"]',
    b:'막기는 받는 피해를 흡수하지만 매 틱 2씩 사라진다. 미리 쌓아두는 자원이 아니라 상대 공격이 발동하는 시점에 맞춰 올리는 타이밍 선택이다. 하단의 버티기는 준비 0틱이라 누르는 즉시 적용된다.',
    hint:'버티기 카드를 누른다 → 사용 버튼을 누른다.',
    require:{ type:'tech', id:'hold' }, allow:{ techs:['hold'] } },

  { t:'유리한 수 표시', focus:'#techBox',
    b:'상대 공격보다 먼저 발동하면서 사거리에도 드는 공격이 있으면, 그 카드에 유리한 수 표시가 붙고 테두리가 초록으로 바뀐다. 정답이라는 뜻은 아니고 후보라는 뜻이다. 막을지 때릴지 뺄지는 여전히 직접 정한다.' },

  { t:'대기는 자원을 만든다', focus:'[data-act="wait"]',
    b:'대기는 시간축을 3틱 넘기고 기력과 집중을 회복한다. 다만 그동안 상대 예고도 그만큼 다가온다. 기다림 자체가 비용이 있는 선택이다.',
    hint:'밝게 표시된 대기 버튼을 누른다.',
    require:{ type:'basic', id:'wait' }, allow:{ basics:['wait'] } },

  { t:'몰아치기와 제한 시간', focus:'#tlBox .tl-top',
    b:'윗줄의 제한 표시는 전투 제한 시간이다. 도달하면 체력 비율이 높은 쪽이 판정승한다. 상태 줄의 몰아치기 표시는 내가 유효한 피해를 내지 못한 채 시간이 흐르면 나에게만 허점이 쌓인다는 뜻이다. 공격을 성공시키면 한 번에 사라진다.' },

  { t:'빌드는 네 가지로 쌓인다', focus:null,
    b:'전투에서 이기면 보상을 고른다. 기술은 자세별 자리에 들어가고, 연계는 특정 자세 경로에 보상을 걸어 순환을 만들며, 단련은 늘 적용되는 능력치이고, 무기는 모든 기술의 사거리와 준비 · 빈틈 · 피해를 한꺼번에 바꾼다. 같은 기술을 들어도 무기와 연계가 다르면 전혀 다른 전투가 된다.' },

  { t:'남은 것은 실전이다', focus:null,
    b:'이제 자유롭게 진행한다. 상대를 쓰러뜨리면 튜토리얼이 끝난다. 정리하면 이 게임은 네 층을 동시에 보는 싸움이다. 시간축의 순서, 거리, 자세와 공격 방향의 상성, 그리고 기력과 집중의 배분. 규칙이 헷갈리면 아래 규칙 버튼에서 상성표를 언제든 볼 수 있다.',
    free:true }
  ]
};

/* ==========================================================================================
   [CORE] 유틸
   ========================================================================================== */
const U = {
  clamp:(v,a,b)=> v<a?a:(v>b?b:v),
  floor:v=>Math.floor(v),
  rnd:n=>Math.floor(Math.random()*n),
  pick:a=>a[U.rnd(a.length)],
  shuffle(a){const r=a.slice();for(let i=r.length-1;i>0;i--){const j=U.rnd(i+1);[r[i],r[j]]=[r[j],r[i]];}return r;},
  fmt:(t,o)=>String(t).replace(/\{(\w+)\}/g,(m,k)=>(o&&k in o)?o[k]:m),
  esc:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  r2:v=>Math.round(v*100)/100,
  stance:id=>DB.stances.find(s=>s.id===id)||DB.stances[0],
  line:id=>DB.lines[id]||DB.lines.none
};

/* 자세 그래프 최단 거리 — 전환 비용 계산의 기준 */
const StanceDist = (()=>{
  const ids=DB.stances.map(s=>s.id), M={};
  ids.forEach(a=>{
    M[a]={}; ids.forEach(b=>M[a][b]=Infinity); M[a][a]=0;
    const q=[a];
    while(q.length){ const c=q.shift();
      (DB.stanceGraph[c]||[]).forEach(n=>{ if(M[a][n]===Infinity){ M[a][n]=M[a][c]+1; q.push(n); } });
    }
  });
  return M;
})();

/* ==========================================================================================
   [CORE] 전투 — 양측이 동일한 actor 구조를 쓰므로 controller 만 바꾸면 PvP로 확장된다
   ========================================================================================== */
const Battle = {
  st:null, awaitInput:false, selected:null, empowered:false,

  makeActor(side,cfg){
    return {
      side, name:cfg.name,
      hp:cfg.hp, hpMax:cfg.hpMax!=null?cfg.hpMax:cfg.hp,
      stamina:cfg.stamina, staminaMax:cfg.staminaMax, staminaRegen:cfg.staminaRegen,
      focus:cfg.focus||0, focusMax:cfg.focusMax,
      stance:cfg.stance, readyAt:DB.balance.tick.start,
      statuses:{}, techs:cfg.techs.slice(),
      traits:cfg.traits||[], weapon:cfg.weapon||DB.weaponStart, chains:cfg.chains||[],
      milestones:cfg.milestones||[], sigils:cfg.sigils||[], mods:Battle.modsOf(cfg),
      controller:cfg.controller, aiProfile:cfg.aiProfile||null,
      script:cfg.script?cfg.script.slice():null, scriptAt:0,
      moveStacks:{}, moveStackTick:{}, history:[], lastDealtTick:DB.balance.tick.start
    };
  },

  /* ---------- 수정치 스택 ----------
     무기 · 단련 · 전환점은 모두 같은 형식의 mod 객체를 낸다.
     교전 시작 시 한 번 합산해 두고, 이후 모든 계산은 Battle.mod() 한 곳만 본다. */
  buildMods(sources){
    const m={};
    (sources||[]).forEach(o=>{ if(!o) return;
      for(const k in o){ if(typeof o[k]==='number') m[k]=(m[k]||0)+o[k]; } });
    return m;
  },
  modsOf(cfg){
    const src=[(DB.weapons[cfg.weapon||DB.weaponStart]||{}).mod];
    (cfg.traits||[]).forEach(id=>{ if(DB.traits[id]) src.push(DB.traits[id].mod); });
    (cfg.milestones||[]).forEach(id=>{ if(DB.milestones[id]) src.push(DB.milestones[id].mod); });
    return Battle.buildMods(src);
  },
  mod(a,key){ return (a.mods&&a.mods[key])||0; },
  traitSum(a,key){ return Battle.mod(a,key); },

  start(enemyId, playerCfg, onEnd, opt){
    opt=opt||{};
    const diff=Run.difficulty(), e=DB.enemies[enemyId], R=DB.balance.resource;

    const P=Battle.makeActor(DB.meta.sides.SELF,{
      name:DB.meta.sideLabel.P, hp:playerCfg.hp, hpMax:playerCfg.hpMax,
      stamina:R.staminaStart+0, staminaMax:playerCfg.staminaMax,
      staminaRegen:R.staminaRegenPerTick, focusMax:playerCfg.focusMax,
      focus:playerCfg.focusStart||0,
      stance:DB.stanceStart, techs:playerCfg.techs, traits:playerCfg.traits,
      weapon:playerCfg.weapon, chains:playerCfg.chains,
      sigils:playerCfg.sigils, milestones:playerCfg.milestones, controller:'human'
    });
    P.staminaRegen += Battle.traitSum(P,'staminaRegen');
    P.stamina = U.clamp(P.stamina, 0, P.staminaMax);

    const E=Battle.makeActor(DB.meta.sides.FOE,{
      name:e.name, hp:Math.round(e.hp*diff.enemyHpMult), stamina:e.stamina,
      staminaMax:e.staminaMax, staminaRegen:e.staminaRegen, focusMax:e.focusMax,
      stance:e.stance, techs:e.techs, weapon:e.weapon||DB.weaponStart, chains:e.chains||[],
      sigils:e.sigils||[], milestones:e.milestones||[],
      controller:'ai', aiProfile:e.ai, script:e.script
    });

    Battle.st={ tick:DB.balance.tick.start, distance:DB.balance.distance.start,
      actors:{P,E}, queue:[], reactions:[], log:[], seq:0,
      over:false, winner:null, finished:false, onEnd, enemyId, tutorial:!!opt.tutorial };
    Battle.awaitInput=false; Battle.selected=null; Battle.empowered=false;
    Ann.clear();
    Battle.log('start',{foe:e.name},'n');
    Battle.announce('start',{foe:e.name});
    UI.showScreen('battle');
    Battle.loop();
  },

  A:s=>Battle.st.actors[s],
  other:s=>s===DB.meta.sides.SELF?DB.meta.sides.FOE:DB.meta.sides.SELF,
  sideLabel:s=>DB.meta.sideLabel[s],

  /* 알림으로도 띄울 사건 */
  announce(key,vars,side){ if(App.settings.announce!==false) Ann.push(key,vars,side); },

  log(key,vars,cls){
    const s=Battle.st;
    if(App.settings.logDetail==='brief' && cls==='n' && !['start','win','lose','timeout'].includes(key)) return;
    s.log.push({ t:s.tick, text:U.fmt(DB.ui.log[key]||key, vars||{}), cls:cls||'n' });
  },

  /* ---------- 계산 ---------- */
  stacks:(a,k)=>a.statuses[k]||0,
  addStatus(a,k,v){ if(!DB.statuses[k])return; a.statuses[k]=(a.statuses[k]||0)+v; if(a.statuses[k]<=0) delete a.statuses[k]; },
  stripStatus(a,k){ delete a.statuses[k]; },

  effCost(a,def){ return Math.max(DB.balance.clamp.minCost, def.cost + Battle.mod(a,'cost')); },
  effRange(a,def){
    const D=DB.balance.distance;
    let lo=U.clamp(def.range[0]+Battle.mod(a,'rangeMin'),D.min,D.max);
    let hi=U.clamp(def.range[1]+Battle.mod(a,'rangeMax'),D.min,D.max);
    if(hi<lo) hi=lo;
    return [lo,hi];
  },
  effRecovery(a,def){
    return Math.max(DB.balance.clamp.minRecovery, Math.round(def.recovery)+Battle.mod(a,'recovery'));
  },

  castTimeOf(a,def){
    const st=U.stance(a.stance).mod.cast;
    const slow=1+Battle.stacks(a,'slow')*DB.statuses.slow.castPerStack;
    const tr=1+Battle.traitSum(a,'cast');
    return Math.max(DB.balance.clamp.minCast,
      Math.round(def.cast*st*slow*tr) + Battle.mod(a,'cast'));
  },
  recoveryOf(a,def){ return Battle.effRecovery(a,def); },

  /* 공격 방향 × 방어 자세 상성 배율 */
  lineMult(defender, line, attacker){
    if(!line || line==='none') return 1;
    const g=U.stance(defender.stance).guard;
    let v=g[line]!=null?g[line]:1;
    const amp=attacker?Battle.mod(attacker,'lineAmp'):0;   /* 전환점: 상성 차이를 증폭한다 */
    if(amp) v=1+(v-1)*(1+amp);
    return Math.max(0,v);
  },
  dealtMult(a,foe){
    let m=U.stance(a.stance).mod.dealt
      * (1+Battle.stacks(a,'power')*DB.statuses.power.dealtPerStack)
      * (1+Battle.mod(a,'dealt'));
    if(foe && Battle.stacks(foe,'exposed')>0) m*=(1+Battle.traitSum(a,'vsExposed'));
    return m;
  },
  takenMult(a){
    return U.stance(a.stance).mod.taken
      * (1+Battle.stacks(a,'weak')*DB.statuses.weak.takenPerStack
          + Battle.stacks(a,'exposed')*DB.statuses.exposed.takenPerStack)
      * (1+Battle.traitSum(a,'taken'));
  },
  transitionCost(a,to){
    if(a.stance===to) return 0;
    const T=DB.balance.transition;
    const steps=StanceDist[a.stance][to];
    const poise=Battle.stacks(a,'poise')*DB.statuses.poise.transitionPerStack;
    const disc=Battle.mod(a,'transitionDiscount');
    return Math.max(1, steps*T.costPerStep + poise - disc);
  },
  canUse(a,def){
    if(def.stance!=='rear' && a.stance==='rear' && def.stance!=='rear') { /* 후방 제약은 자세 바꾸기으로 해소 */ }
    return true;
  },

  /* ---------- 압박 ---------- */
  pressureIdle:side=>DB.balance.pressure.enabled?(Battle.st.tick-Battle.A(side).lastDealtTick):0,
  pressureAmount:side=>Battle.stacks(Battle.A(side), DB.balance.pressure.status),
  markActivity(reason, side){
    const P=DB.balance.pressure; if(!P.resetOn[reason]||!side) return;
    const a=Battle.A(side); a.lastDealtTick=Battle.st.tick;
    if(Battle.stacks(a,P.status)>0) Battle.stripStatus(a,P.status);
  },
  pressureTick(side){
    const P=DB.balance.pressure; if(!P.enabled) return;
    const a=Battle.A(side), idle=Battle.pressureIdle(side);
    if(idle<P.idleTicksBeforeStart) return;
    if((idle-P.idleTicksBeforeStart)%P.stackEveryTicks!==0) return;
    if(Battle.stacks(a,P.status)>=P.maxStacks) return;
    const before=Battle.stacks(a,P.status);
    Battle.addStatus(a,P.status,P.stacksPerApply);
    const cls=side===DB.meta.sides.SELF?'s':'f';
    if(before===0){ Battle.log('pressureStart',{side:Battle.sideLabel(side)},cls);
      Battle.announce('pressure',{v:Battle.stacks(a,P.status)},side); }
    Battle.log('pressure',{side:Battle.sideLabel(side),v:Battle.stacks(a,P.status)},cls);
  },

  /* ---------- 시간 ---------- */
  tickForward(dt){
    const s=Battle.st;
    for(let i=0;i<dt;i++){
      s.tick++;
      for(const side of [DB.meta.sides.SELF,DB.meta.sides.FOE]){
        const a=Battle.A(side);
        a.stamina=U.clamp(a.stamina + a.staminaRegen*U.stance(a.stance).mod.staminaRegen, 0, a.staminaMax);
        a.focus=U.clamp(a.focus+DB.balance.resource.focusRegenPerTick,0,a.focusMax);
        Battle.pressureTick(side);
        const bl=Battle.stacks(a,'bleed');
        if(bl>0){
          const d=bl*DB.statuses.bleed.perTickDamagePerStack;
          a.hp=Math.max(0,a.hp-d);
          Battle.markActivity('statusDamage', Battle.other(side));
          Battle.log('bleed',{side:Battle.sideLabel(side),v:d}, side===DB.meta.sides.SELF?'s':'f');
        }
        for(const k in DB.statuses){ const dc=DB.statuses[k].decayPerTick; if(dc>0&&a.statuses[k]) Battle.addStatus(a,k,-dc); }
      }
      s.reactions=s.reactions.filter(r=>r.until>s.tick);
      if(Battle.checkEnd()) return;
    }
  },
  resolveDue(){
    const s=Battle.st; let g=0;
    while(!s.over && g++<DB.balance.loop.maxIterations){
      const due=s.queue.filter(q=>q.status==='pending'&&q.resolveAt<=s.tick)
                       .sort((a,b)=>a.resolveAt-b.resolveAt||a.seq-b.seq);
      if(!due.length) break;
      Battle.resolveEntry(due[0]);
    }
  },
  advanceTo(target){
    const s=Battle.st; Battle.resolveDue(); if(s.over) return;
    let g=0;
    while(s.tick<target && !s.over && g++<DB.balance.loop.maxIterations){
      let next=target;
      for(const q of s.queue) if(q.status==='pending'&&q.resolveAt>s.tick&&q.resolveAt<next) next=q.resolveAt;
      Battle.tickForward(next-s.tick);
      if(s.over) return;
      Battle.resolveDue();
    }
  },

  resolveEntry(q){
    const s=Battle.st; q.status='resolved';
    const lbl=Battle.sideLabel(q.owner), cls=q.owner===DB.meta.sides.SELF?'s':'f';
    const needRange=(q.onHit||[]).length>0;
    if(needRange && DB.balance.combat.missOnRangeFail){
      if(s.distance<q.range[0]||s.distance>q.range[1]){
        Battle.log('miss',{side:lbl,tech:q.name,dist:DB.balance.distance.labels[s.distance]},'n');
        Battle.announce('miss',{tech:q.name,dist:DB.balance.distance.labels[s.distance]},q.owner);
        return;
      }
    }
    Battle.log('resolve',{side:lbl,tech:q.name},cls);
    Battle.announce('resolve',{tech:q.name},q.owner);
    if((q.onHit||[]).some(e=>e.k==='damage')) Battle.markActivity('attackResolvedInRange', q.owner);
    const sg=Battle.sigilBonus(q);
    if(sg.names.length){
      Battle.log('sigil',{side:lbl,name:sg.names.join(' · ')},cls);
      Battle.announce('sigil',{name:sg.names.join(' · ')},q.owner);
    }
    Battle.applyEffects(q.owner, q.onHit||[], q.line, sg);
    if(sg.focus){ const me=Battle.A(q.owner); me.focus=U.clamp(me.focus+sg.focus,0,me.focusMax); }
    if(sg.bleed) Battle.addStatus(Battle.A(Battle.other(q.owner)),'bleed',sg.bleed);
  },

  /* ---------- 시간축 각인 ----------
     '무엇을 쓰는가'가 아니라 '몇 틱에 터지는가'를 보고 조건에 맞는 각인을 모은다. */
  sigilBonus(q){
    const s=Battle.st, a=Battle.A(q.owner);
    const out={ damage:0, focus:0, bleed:0, names:[] };
    if(!a.sigils||!a.sigils.length) return out;
    const sameTick=s.queue.filter(x=>x.owner===q.owner&&x.resolveAt===q.resolveAt
      &&(x.onHit||[]).some(e=>e.k==='damage')).length;
    a.sigils.forEach(id=>{
      const g=DB.sigils[id]; if(!g) return;
      let ok=false;
      switch(g.cond){
        case 'tickParity': ok=(q.resolveAt%2)===g.v; break;
        case 'tickBefore': ok=q.resolveAt<g.v; break;
        case 'tickAfter': ok=q.resolveAt>=g.v; break;
        case 'castAtMost': ok=(q.cast||0)<=g.v; break;
        case 'castAtLeast': ok=(q.cast||0)>=g.v; break;
        case 'sameTick': ok=sameTick>=g.v; break;
        case 'distanceAt': ok=s.distance===g.v; break;
      }
      if(!ok) return;
      out.damage+=g.bonus.damage||0; out.focus+=g.bonus.focus||0; out.bleed+=g.bonus.bleed||0;
      out.names.push(g.name);
    });
    return out;
  },

  applyEffects(owner, effects, line, bonus){
    const s=Battle.st, me=Battle.A(owner), foe=Battle.A(Battle.other(owner));
    const lm=Battle.sideLabel(owner), lf=Battle.sideLabel(Battle.other(owner));
    const cm=owner===DB.meta.sides.SELF?'s':'f', cf=owner===DB.meta.sides.SELF?'f':'s';
    for(const ef of effects){
      if(s.over) return;
      switch(ef.k){
        case 'damage':{
          let base=ef.v;
          if(ef.bonusFoeHpBelow && foe.hp<=foe.hpMax*ef.bonusFoeHpBelow.ratio) base*=ef.bonusFoeHpBelow.mult;
          base += Battle.stacks(foe,'mark')*DB.statuses.mark.flatPerStack;
          if(bonus&&bonus.damage) base += bonus.damage;
          const lmul=Battle.lineMult(foe, line, me);
          if(line && line!=='none' && lmul!==1){
            Battle.log('multi',{side:lf,line:U.line(line).name,stance:U.stance(foe.stance).name,v:U.r2(lmul)},'n');
            s.lastMultNote=`${U.line(line).name} 대 ${U.stance(foe.stance).name} <span class="mult ${lmul>1?'up':'dn'}">${U.r2(lmul)}배</span>`;
          } else s.lastMultNote='';
          let d=base*Battle.dealtMult(me,foe)*Battle.takenMult(foe)*lmul*DB.balance.damage.globalScale;
          d=Math.max(DB.balance.damage.minimum,U.floor(d));
          Battle.dealDamage(foe,d,!!ef.pierce,owner);
          if(Battle.stacks(me,'power')>0&&DB.statuses.power.consumeOnHit) Battle.stripStatus(me,'power');
          if(Battle.stacks(foe,'mark')>0&&DB.statuses.mark.consumeOnHit) Battle.stripStatus(foe,'mark');
          break; }
        case 'heal':{ const t=ef.t==='foe'?foe:me; t.hp=U.clamp(t.hp+ef.v,0,t.hpMax);
          Battle.log('heal',{side:ef.t==='foe'?lf:lm,v:ef.v}, ef.t==='foe'?cf:cm); break; }
        case 'status':{ const t=ef.t==='foe'?foe:me;
          let v=ef.v;
          if(ef.s==='guard'&&ef.t!=='foe') v=Math.round(v*(1+Battle.traitSum(me,'guardGain')));
          Battle.addStatus(t,ef.s,v);
          Battle.log(ef.s==='guard'?'guard':'status',
            {side:ef.t==='foe'?lf:lm, st:DB.statuses[ef.s].name, v}, ef.t==='foe'?cf:cm); break; }
        case 'strip':{ const t=ef.t==='foe'?foe:me;
          if(t.statuses[ef.s]){ Battle.stripStatus(t,ef.s);
            Battle.log('strip',{side:ef.t==='foe'?lf:lm,st:DB.statuses[ef.s].name}, ef.t==='foe'?cf:cm); } break; }
        case 'move':{ const D=DB.balance.distance, b=s.distance;
          s.distance=U.clamp(s.distance+ef.v,D.min,D.max);
          if(b!==s.distance) Battle.log('move',{v:D.labels[s.distance]},'n'); break; }
        case 'stamina':{ const t=ef.t==='foe'?foe:me; t.stamina=U.clamp(t.stamina+ef.v,0,t.staminaMax); break; }
        case 'focus':{ const t=ef.t==='foe'?foe:me; t.focus=U.clamp(t.focus+ef.v,0,t.focusMax); break; }
        case 'delayQueue': case 'cancelQueue': case 'hasten':{
          const tgt=ef.t==='foe'?Battle.other(owner):owner;
          const list=s.queue.filter(q=>q.status==='pending'&&q.owner===tgt)
                            .sort((a,b)=>a.resolveAt-b.resolveAt).slice(0,ef.n||1);
          const tl=Battle.sideLabel(tgt), tc=tgt===DB.meta.sides.SELF?'s':'f';
          if(ef.k==='delayQueue'){ list.forEach(q=>q.resolveAt+=ef.v);
            if(list.length) Battle.log('delayQueue',{side:tl,v:ef.v},tc); }
          else if(ef.k==='hasten'){ list.forEach(q=>q.resolveAt=Math.max(s.tick,q.resolveAt-ef.v));
            if(list.length) Battle.log('hasten',{side:tl,v:ef.v},tc); }
          else list.forEach(q=>{ q.status='cancelled'; Battle.log('cancelled',{side:tl,tech:q.name},tc);
            Battle.announce('cancelled',{tech:q.name},tgt); });
          break; }
        case 'reaction':
          s.reactions.push({ owner, until:s.tick+ef.window, absorb:ef.absorb||0,
            reduce:ef.reduce||0, trigger:ef.trigger, effects:ef.effects||[] });
          break;
      }
      Battle.checkEnd();
    }
  },

  dealDamage(target,dmg,pierce,fromSide){
    const s=Battle.st, lbl=Battle.sideLabel(target.side);
    const cls=target.side===DB.meta.sides.SELF?'s':'f';
    const rx=s.reactions.filter(r=>r.owner===target.side&&r.trigger==='onDamaged'&&r.until>s.tick);
    if(rx.length){
      const r=rx[0];
      if(r.reduce>0) dmg=U.floor(dmg*(1-r.reduce));
      if(r.absorb>0){ const u=Math.min(r.absorb,dmg); dmg-=u; r.absorb-=u; }
      Battle.log('reaction',{side:lbl},cls);
      Battle.announce('reaction',{},target.side);
      s.reactions=s.reactions.filter(x=>x!==r);
      if(r.effects.length) Battle.applyEffects(target.side, r.effects.map(e=>Object.assign({},e)), null);
      if(s.over) return;
    }
    if(!pierce){ const g=Battle.stacks(target,'guard');
      if(g>0){ const u=Math.min(g,dmg); Battle.addStatus(target,'guard',-u); dmg-=u; } }
    dmg=Math.max(DB.balance.damage.minimum,U.floor(dmg));
    target.hp=Math.max(0,target.hp-dmg);
    if(dmg>0) Battle.markActivity('damageDealt', fromSide||Battle.other(target.side));
    Battle.log('damage',{side:lbl,v:dmg},cls);
    if(dmg>0) Battle.announce('damage',{v:dmg,extra:s.lastMultNote||''},target.side);
    s.lastMultNote='';
    UI.flash(target.side);
    Battle.checkEnd();
  },

  /* ---------- 행동 ---------- */
  changeStance(side,to){
    const a=Battle.A(side); if(a.stance===to) return false;
    const c=Battle.transitionCost(a,to);
    if(a.stamina<c) return false;
    a.stamina-=c; a.stance=to;
    Battle.log('stance',{side:Battle.sideLabel(side),v:U.stance(to).name}, side===DB.meta.sides.SELF?'s':'f');
    return true;
  },

  useTech(side, techId, empowered){
    const s=Battle.st, a=Battle.A(side), def=DB.techs[techId];
    if(!def || a.techs.indexOf(techId)<0) return false;
    if(a.stance!==def.stance){ if(!Battle.changeStance(side,def.stance)) return false; }
    const emp = empowered && def.empower && DB.balance.empower.enabled;
    const cost=Battle.effCost(a,def), fcost=emp?def.empower.focus:0;
    if(a.stamina<cost||a.focus<fcost) return false;
    a.stamina-=cost; a.focus-=fcost;

    const onPlay = emp&&def.empower.onPlay?def.empower.onPlay:(def.onPlay||[]);
    const onHit  = emp&&def.empower.onHit ?def.empower.onHit :(def.onHit||[]);
    if(onPlay.length) Battle.applyEffects(side,onPlay,null);
    if(s.over) return true;

    const name=def.name+(emp?' (강화)':'');
    if(onHit.length){
      const cast=Battle.castTimeOf(a,def);
      s.queue.push({ seq:++s.seq, owner:side, techId, name, line:def.line, onHit, cast,
        resolveAt:s.tick+cast, status:'pending', range:Battle.effRange(a,def) });
      Battle.log('queue',{side:Battle.sideLabel(side),tech:name,at:s.tick+cast}, side===DB.meta.sides.SELF?'s':'f');
      Battle.announce('queue',{tech:name,at:s.tick+cast},side);
      if(cast===0) Battle.resolveDue();
    }else Battle.log('resolve',{side:Battle.sideLabel(side),tech:name}, side===DB.meta.sides.SELF?'s':'f');

    const fromStance=def.stance;
    a.stance=def.to;
    a.readyAt=s.tick+Battle.recoveryOf(a,def);
    Battle.fireChains(side, fromStance, def.to);
    return true;
  },

  /* 연계 — 이번 기술이 만든 자세 경로와 일치하는 연계를 발동시킨다 */
  fireChains(side, from, to){
    const a=Battle.A(side); if(!a.chains||!a.chains.length) return;
    a.chains.forEach(id=>{
      const c=DB.chains[id]; if(!c||c.from!==from||c.to!==to) return;
      Battle.log('chain',{side:Battle.sideLabel(side),name:c.name}, side===DB.meta.sides.SELF?'s':'f');
      Battle.announce('chain',{name:c.name},side);
      Battle.applyEffects(side, c.effects.map(e=>Object.assign({},e)), null);
    });
  },

  basic(side,id){
    const s=Battle.st,a=Battle.A(side),B=DB.balance.basic,D=DB.balance.distance;
    const lbl=Battle.sideLabel(side),cls=side===DB.meta.sides.SELF?'s':'f';
    if(id===B.wait.id){
      a.stamina=U.clamp(a.stamina+B.wait.staminaGain,0,a.staminaMax);
      a.focus=U.clamp(a.focus+B.wait.focusGain,0,a.focusMax);
      a.readyAt=s.tick+B.wait.recovery; Battle.log('wait',{side:lbl},cls); return true;
    }
    const cfg = id===B.approach.id?B.approach:(id===B.retreat.id?B.retreat:null);
    if(!cfg) return false;
    const cost=Battle.moveCost(a,cfg);
    if(a.stamina<cost) return false;
    a.stamina-=cost;
    if(cfg.escalationPerUse){ a.moveStacks[cfg.id]=(a.moveStacks[cfg.id]||0)+1; a.moveStackTick[cfg.id]=s.tick; }
    s.distance=U.clamp(s.distance+cfg.move,D.min,D.max);
    a.readyAt=s.tick+cfg.recovery;
    Battle.log(id,{side:lbl},cls);
    if(cost>cfg.staminaCost) Battle.log('retreatCost',{side:lbl,v:cost},cls);
    Battle.log('move',{v:D.labels[s.distance]},'n');
    return true;
  },
  moveCost(a,cfg){
    if(!cfg.escalationPerUse) return cfg.staminaCost;
    const s=Battle.st,last=a.moveStackTick[cfg.id];
    let st=a.moveStacks[cfg.id]||0;
    if(last!=null&&cfg.escalationDecayTicks>0) st=Math.max(0, st-Math.floor((s.tick-last)/cfg.escalationDecayTicks));
    a.moveStacks[cfg.id]=st;
    return cfg.staminaCost+Math.min(cfg.escalationMax, st*cfg.escalationPerUse);
  },
  note(side,key){ const a=Battle.A(side),L=DB.ai.stall.historyLength;
    a.history.push(key); if(a.history.length>L) a.history.shift(); },

  /* ---------- 종료 ---------- */
  finishByTimeout(){
    const s=Battle.st,P=Battle.A(DB.meta.sides.SELF),E=Battle.A(DB.meta.sides.FOE);
    s.over=true; Battle.log('timeout',{},'n'); Battle.announce('timeout',{});
    s.winner=(P.hp/P.hpMax)>=(E.hp/E.hpMax)?DB.meta.sides.SELF:DB.meta.sides.FOE;
    Battle.log(s.winner===DB.meta.sides.SELF?'win':'lose',{},'n');
  },
  checkEnd(){
    const s=Battle.st; if(s.over) return true;
    const P=Battle.A(DB.meta.sides.SELF),E=Battle.A(DB.meta.sides.FOE);
    if(P.hp<=0||E.hp<=0){ s.over=true;
      s.winner=(E.hp<=0&&P.hp>0)?DB.meta.sides.SELF:DB.meta.sides.FOE;
      Battle.log(s.winner===DB.meta.sides.SELF?'win':'lose',{},'n');
      Battle.announce(s.winner===DB.meta.sides.SELF?'win':'lose',{}); return true; }
    if(s.tick>DB.balance.tick.maxTickGuard){ Battle.finishByTimeout(); return true; }
    return false;
  },
  finish(state){
    const s=state||Battle.st; if(!s||s.finished) return;
    s.finished=true; const cb=s.onEnd; s.onEnd=null;
    if(cb) cb(s.winner===DB.meta.sides.SELF, s.actors[DB.meta.sides.SELF].hp);
  },

  loop(){
    const s=Battle.st; let guard=0;
    const done=()=>{ UI.renderBattle(); setTimeout(()=>Battle.finish(s), DB.balance.loop.aiDelayMs); };
    const step=()=>{
      if(Battle.st!==s) return;
      if(s.over){ done(); return; }
      if(guard++>DB.balance.loop.maxIterations){ Battle.finishByTimeout(); done(); return; }
      const P=Battle.A(DB.meta.sides.SELF),E=Battle.A(DB.meta.sides.FOE);
      const active=(P.readyAt<=E.readyAt)?DB.meta.sides.SELF:DB.meta.sides.FOE;
      Battle.advanceTo(Battle.A(active).readyAt);
      if(s.over){ done(); return; }
      if(Battle.A(active).controller==='human'){ Battle.awaitInput=true; UI.renderBattle(); return; }
      UI.renderBattle();
      const d=App.settings.aiSpeed==='fast'?DB.balance.loop.aiDelayFastMs:DB.balance.loop.aiDelayMs;
      setTimeout(()=>{ if(Battle.st!==s) return; AI.act(active); step(); }, App.settings.animations?d:0);
    };
    step();
  },

  humanAct(fn){
    if(!Battle.awaitInput) return;
    if(fn()===false) return;
    Battle.awaitInput=false; Battle.selected=null; Battle.empowered=false;
    Battle.loop();
  }
};


DB.meta.sideLabel={P:'1P',E:'2P'};
export {DB,U,Battle};
