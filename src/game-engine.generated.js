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
    title:'THE TIMELINE', version:'V8.1', build:'CF',
    footer:'싱글플레이 · PvP 멀티플레이',
    storageKey:'tld_save_v11',
    sides:{ SELF:'P', FOE:'E' },
    sideLabel:{ P:'아군', E:'적군' }
  },

  balance:{
    loop:{ maxIterations:900, aiDelayMs:400, aiDelayFastMs:90, tickDelayMs:260, tickDelayFastMs:90 },

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
      desc:'자세를 전환합니다. 시간은 흐르지 않고 기력만 소모하며, 먼 자세일수록 비용이 늘어납니다.'
    },

    basic:{
      wait:{ id:'wait', name:'대기', recovery:3, staminaGain:3, focusGain:1,
             desc:'시간축을 3틱 넘깁니다. 기력 3과 집중 1을 회복합니다. 상대의 예고가 3틱 다가옵니다.' },
      approach:{ id:'approach', name:'접근', recovery:2, move:-1, staminaCost:1,
             escalationPerUse:0, escalationDecayTicks:0, escalationMax:0,
             desc:'거리를 1만큼 좁힙니다. 기력 1을 소모하고 빈틈 2틱이 발생합니다.' },
      retreat:{ id:'retreat', name:'이탈', recovery:3, move:1, staminaCost:1,
             escalationPerUse:1, escalationDecayTicks:12, escalationMax:6,
             desc:'거리를 1만큼 벌립니다. 빈틈이 접근보다 1틱 길며, 연속으로 이탈할 때마다 기력 비용이 1씩 누적됩니다.' }
    },

    /* 압박 — 자신이 유효한 피해를 내지 못한 시간이 길어지면 자신에게만 약점이 쌓인다.
       직접 피해가 아니라 약점만 키우므로 승패는 끝까지 기술 전투로 결정되며,
       무한 추격과 무한 회피가 모두 성립하지 않게 된다. */
    pressure:{
      enabled:true, name:'압박', status:'exposed',
      idleTicksBeforeStart:12, stackEveryTicks:3, stacksPerApply:1, maxStacks:10,
      resetOn:{ damageDealt:true, attackResolvedInRange:true, statusDamage:true },
      desc:'자신이 유효한 피해를 내지 못한 시간이 길어지면 약점이 쌓입니다. 공격을 성공시키면 한 번에 사라집니다.'
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
    high:{ id:'high', name:'탑', short:'상', tag:'t-high', css:'--L-high',
           desc:'위에서 내리꽂는 궤적입니다. 낮게 버티는 자세를 강하게 타격합니다.' },
    mid:{ id:'mid', name:'미드', short:'중', tag:'t-mid', css:'--L-mid',
           desc:'몸통을 향하는 직선 궤적입니다. 측면에 선 자세를 강하게 파고듭니다.' },
    low:{ id:'low', name:'바텀', short:'하', tag:'t-low', css:'--L-low',
           desc:'아래에서 위로 강하게 쓸어 올리는 궤적입니다. 높은 자세를 강하게 타격합니다.' },
    side:{ id:'side', name:'사이드', short:'측', tag:'t-side', css:'--L-side',
           desc:'측면에서 감아 때리는 궤적입니다. 정면 막기를 무력화합니다.' },
    none:{ id:'none', name:'클린', short:'무', tag:'t-none', css:'--L-none',
           desc:'궤적이 없는 기술.' }
  },

  /* ---------- 자세 ----------
     guard  : 방어자가 그 자세일 때 각 공격 방향으로부터 받는 피해 배율
     mod    : 자신이 그 자세일 때의 기본 보정
     allow  : 사용 가능한 사거리 제한 (rear 자세는 근접 기술을 쓸 수 없다)
  ------------------------------------------------------------------------ */
  stances:[
    { id:'mid', name:'중단', sym:'square', color:'--L-mid',
      desc:'밸런스 포지션입니다. 어느 공격 방향이든 같은 피해를 받습니다.',
      mod:{ dealt:1.00, taken:1.00, cast:1.00, staminaRegen:1.00 },
      guard:{ high:1.00, mid:1.00, low:1.00, side:1.00 } },

    { id:'high', name:'상단', sym:'up', color:'--L-high',
      desc:'높은 무게중심을 유지합니다. 위력이 높고 준비가 짧지만, 바텀에 약합니다.',
      mod:{ dealt:1.20, taken:1.00, cast:0.85, staminaRegen:0.80 },
      guard:{ high:0.75, mid:1.00, low:1.50, side:1.10 } },

    { id:'low', name:'하단', sym:'down', color:'--L-low',
      desc:'낮게 버티는 자세입니다. 기력 회복이 빠르고 단단하지만, 탑에 약합니다.',
      mod:{ dealt:0.90, taken:0.85, cast:1.10, staminaRegen:1.30 },
      guard:{ high:1.50, mid:1.00, low:0.75, side:1.05 } },

    { id:'side', name:'측단', sym:'diag', color:'--L-side',
      desc:'몸을 비껴 선 자세입니다. 사이드를 잘 흘리지만, 미드에게 약합니다.',
      mod:{ dealt:0.95, taken:0.95, cast:1.00, staminaRegen:1.00 },
      guard:{ high:1.05, mid:1.35, low:1.00, side:0.70 } },

    { id:'rear', name:'후방', sym:'ring', color:'--L-none',
      desc:'상대와의 거리를 유지합니다. 모든 공격 방향에 대해 피해를 덜 받고 기력 회복이 빠르지만, 근접 기술을 사용할 수 없습니다.',
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
    bleed:{ name:'출혈', tag:'t-high', desc:'매 틱 중첩 수만큼 피해를 받고 중첩이 1 감소합니다.',
      perTickDamagePerStack:1, decayPerTick:1 },
    slow:{ name:'둔화', tag:'t-side', desc:'중첩마다 준비 시간이 20% 늘고, 매 틱 중첩이 1 감소합니다.',
      castPerStack:0.20, decayPerTick:1 },
    weak:{ name:'피로', tag:'t-side', desc:'중첩마다 받는 피해가 12% 늘고, 매 틱 중첩이 1 감소합니다.',
      takenPerStack:0.12, decayPerTick:1 },
    exposed:{ name:'약점', tag:'t-dang', desc:'중첩마다 받는 피해가 10% 늘어납니다. 유효한 공격에 성공하면 모두 사라집니다.',
      takenPerStack:0.10, decayPerTick:0 },
    power:{ name:'강화', tag:'t-warn', desc:'중첩마다 주는 피해가 15% 늘어납니다. 공격이 발동하면 모두 소모됩니다.',
      dealtPerStack:0.15, decayPerTick:0, consumeOnHit:true },
    /* 막기는 매 틱 줄어든다. 미리 쌓아두는 자원이 아니라 '맞기 직전에 올리는' 타이밍 선택이 되도록 한다 */
    guard:{ name:'막기', tag:'t-low', desc:'받는 피해를 수치만큼 흡수하며, 매 틱 2씩 감소합니다.',
      decayPerTick:2, absorb:true },
    mark:{ name:'표식', tag:'t-mid', desc:'중첩마다 피해가 2 증가합니다. 공격받으면 모두 소모됩니다.',
      flatPerStack:2, decayPerTick:0, consumeOnHit:true },
    poise:{ name:'흐트러짐', tag:'t-warn', desc:'중첩마다 자세 전환 비용이 1 늘고, 매 틱 중첩이 1 감소합니다.',
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
    empower:{ focus:2, text:'피해 11, 표식 2를 남깁니다.',
      onHit:[{k:'damage',v:11},{k:'status',t:'foe',s:'mark',v:2}] } },

  brace_mid:{ id:'brace_mid', name:'막기', stance:'mid', to:'low', line:'none', tier:'base',
    cost:1, cast:0, recovery:2, range:[0,4],
    text:'막기 9를 얻습니다.', onPlay:[{k:'status',t:'self',s:'guard',v:9}] },

  press:{ id:'press', name:'압박 전진', stance:'mid', to:'mid', line:'none', tier:'base',
    cost:1, cast:0, recovery:1, range:[0,4],
    text:'거리를 1만큼 좁히고 집중 1을 얻습니다.',
    onPlay:[{k:'move',v:-1},{k:'focus',t:'self',v:1}] },

  intercept:{ id:'intercept', name:'차단', stance:'mid', to:'side', line:'none', tier:'common',
    cost:3, cast:0, recovery:2, range:[0,4],
    text:'상대가 준비 중인 행동 1개를 즉시 취소합니다.',
    onPlay:[{k:'cancelQueue',t:'foe',n:1}] },

  double_mid:{ id:'double_mid', name:'연속 찌르기', stance:'mid', to:'mid', line:'mid', tier:'common',
    cost:3, cast:1, recovery:2, range:[1,2],
    text:'피해 5. 집중 1을 얻습니다.',
    onHit:[{k:'damage',v:5},{k:'focus',t:'self',v:1}] },

  disarm:{ id:'disarm', name:'해제', stance:'mid', to:'mid', line:'mid', tier:'common',
    cost:3, cast:3, recovery:3, range:[1,2],
    text:'상대의 막기를 모두 제거하고 피해 8을 줍니다.',
    onHit:[{k:'strip',t:'foe',s:'guard'},{k:'damage',v:8}] },

  /* ===== 상단 ===== */
  overhead:{ id:'overhead', name:'내려베기', stance:'high', to:'mid', line:'high', tier:'base',
    cost:4, cast:4, recovery:4, range:[1,2],
    text:'피해 16. 준비 시간이 길어 상대가 대응하기 쉽습니다.', onHit:[{k:'damage',v:16}],
    empower:{ focus:3, text:'피해 22를 주고 피로 3을 부여합니다.',
      onHit:[{k:'damage',v:22},{k:'status',t:'foe',s:'weak',v:3}] } },

  quick_cut:{ id:'quick_cut', name:'빠른 베기', stance:'high', to:'high', line:'high', tier:'base',
    cost:2, cast:1, recovery:2, range:[1,2],
    text:'피해 6. 같은 자세를 유지해 연속 공격으로 이어집니다.', onHit:[{k:'damage',v:6}] },

  feint:{ id:'feint', name:'견제', stance:'high', to:'side', line:'high', tier:'base',
    cost:2, cast:1, recovery:2, range:[1,3],
    text:'피해 3을 주고 상대의 기력을 3 줄인 뒤 흐트러짐 2를 부여합니다.',
    onHit:[{k:'damage',v:3},{k:'stamina',t:'foe',v:-3},{k:'status',t:'foe',s:'poise',v:2}] },

  hasten:{ id:'hasten', name:'가속', stance:'high', to:'high', line:'none', tier:'common',
    cost:3, cast:0, recovery:2, range:[0,4],
    text:'준비 중인 내 행동을 모두 4틱 앞당깁니다.',
    onPlay:[{k:'hasten',t:'self',v:4,n:99}] },

  charge_high:{ id:'charge_high', name:'예열', stance:'high', to:'high', line:'none', tier:'common',
    cost:2, cast:0, recovery:2, range:[0,4],
    text:'강화 3을 얻습니다. 다음 공격이 발동하면 모두 소모됩니다.',
    onPlay:[{k:'status',t:'self',s:'power',v:3}] },

  finisher:{ id:'finisher', name:'결정타', stance:'high', to:'mid', line:'high', tier:'rare',
    cost:5, cast:3, recovery:5, range:[1,2],
    text:'피해 13. 상대 체력이 40% 이하면 피해가 두 배가 됩니다.',
    onHit:[{k:'damage',v:13,bonusFoeHpBelow:{ratio:0.40,mult:2.0}}] },

  /* ===== 하단 ===== */
  sweep:{ id:'sweep', name:'후리기', stance:'low', to:'mid', line:'low', tier:'base',
    cost:3, cast:2, recovery:3, range:[1,2],
    text:'피해 8. 둔화 3을 부여합니다.',
    onHit:[{k:'damage',v:8},{k:'status',t:'foe',s:'slow',v:3}],
    empower:{ focus:2, text:'피해 8, 둔화 6과 흐트러짐 3을 부여합니다.',
      onHit:[{k:'damage',v:8},{k:'status',t:'foe',s:'slow',v:6},{k:'status',t:'foe',s:'poise',v:3}] } },

  hold:{ id:'hold', name:'버티기', stance:'low', to:'low', line:'none', tier:'base',
    cost:1, cast:0, recovery:2, range:[0,4],
    text:'막기 11과 기력 3을 얻습니다.',
    onPlay:[{k:'status',t:'self',s:'guard',v:11},{k:'stamina',t:'self',v:3}] },

  counter:{ id:'counter', name:'반격 자세', stance:'low', to:'mid', line:'none', tier:'base',
    cost:2, cast:0, recovery:2, range:[0,4],
    text:'7틱 동안, 공격받으면 피해 7을 흡수하고 상대에게 피해 9를 되돌려 줍니다.',
    onPlay:[{k:'reaction',t:'self',window:7,absorb:7,trigger:'onDamaged',
             effects:[{k:'damage',v:9,direct:true}]}] },

  rend:{ id:'rend', name:'절단', stance:'low', to:'low', line:'low', tier:'common',
    cost:3, cast:3, recovery:3, range:[1,2],
    text:'피해 5. 출혈 5를 부여합니다.',
    onHit:[{k:'damage',v:5},{k:'status',t:'foe',s:'bleed',v:5}] },

  read:{ id:'read', name:'간파', stance:'low', to:'side', line:'none', tier:'common',
    cost:2, cast:0, recovery:1, range:[0,4],
    text:'9틱 동안, 받는 피해를 50% 줄이고 집중 1을 얻습니다.',
    onPlay:[{k:'reaction',t:'self',window:9,reduce:0.5,trigger:'onDamaged',
             effects:[{k:'focus',t:'self',v:1}]}] },

  mend:{ id:'mend', name:'응급 처치', stance:'low', to:'low', line:'none', tier:'rare',
    cost:3, cast:0, recovery:3, range:[0,4],
    text:'체력 12를 회복합니다.', onPlay:[{k:'heal',t:'self',v:12}] },

  /* ===== 측면 ===== */
  side_cut:{ id:'side_cut', name:'측면 베기', stance:'side', to:'side', line:'side', tier:'base',
    cost:3, cast:2, recovery:2, range:[1,2],
    text:'피해 9. 같은 자세를 유지합니다.', onHit:[{k:'damage',v:9}] },

  slip:{ id:'slip', name:'흘리기', stance:'side', to:'rear', line:'none', tier:'base',
    cost:1, cast:0, recovery:1, range:[0,4],
    text:'거리를 1만큼 벌리고 막기 6을 얻습니다.',
    onPlay:[{k:'move',v:1},{k:'status',t:'self',s:'guard',v:6}] },

  circle:{ id:'circle', name:'우회', stance:'side', to:'high', line:'none', tier:'base',
    cost:2, cast:0, recovery:1, range:[0,4],
    text:'집중 2를 얻고 상단으로 돌아갑니다.',
    onPlay:[{k:'focus',t:'self',v:2}] },

  delay:{ id:'delay', name:'지연', stance:'side', to:'mid', line:'none', tier:'common',
    cost:2, cast:0, recovery:2, range:[0,4],
    text:'상대가 준비 중인 모든 행동을 4틱 늦춥니다.',
    onPlay:[{k:'delayQueue',t:'foe',v:4,n:99}] },

  flank:{ id:'flank', name:'측방 돌입', stance:'side', to:'mid', line:'side', tier:'common',
    cost:3, cast:2, recovery:3, range:[1,3],
    text:'사용 즉시 거리를 1만큼 좁히고, 발동하면 피해 10을 줍니다.',
    onPlay:[{k:'move',v:-1}], onHit:[{k:'damage',v:10}] },

  bind:{ id:'bind', name:'속박', stance:'side', to:'side', line:'side', tier:'common',
    cost:3, cast:2, recovery:3, range:[1,3],
    text:'피해 4. 둔화 4와 흐트러짐 3을 부여합니다.',
    onHit:[{k:'damage',v:4},{k:'status',t:'foe',s:'slow',v:4},{k:'status',t:'foe',s:'poise',v:3}] },

  /* ===== 후방 ===== */
  throw_blade:{ id:'throw_blade', name:'투척', stance:'rear', to:'rear', line:'mid', tier:'base',
    cost:2, cast:2, recovery:3, range:[3,4],
    text:'피해 8.', onHit:[{k:'damage',v:8}] },

  regroup:{ id:'regroup', name:'정비', stance:'rear', to:'mid', line:'none', tier:'base',
    cost:0, cast:0, recovery:3, range:[0,4],
    text:'기력 5와 집중 1을 얻습니다.',
    onPlay:[{k:'stamina',t:'self',v:5},{k:'focus',t:'self',v:1}] },

  long_shot:{ id:'long_shot', name:'원사', stance:'rear', to:'rear', line:'high', tier:'common',
    cost:3, cast:3, recovery:3, range:[3,4],
    text:'피해 11.', onHit:[{k:'damage',v:11}],
    empower:{ focus:2, text:'피해 11을 줍니다. 막기를 무시하고 피로 3을 부여합니다.',
      onHit:[{k:'damage',v:11,pierce:true},{k:'status',t:'foe',s:'weak',v:3}] } },

  snare:{ id:'snare', name:'덫 설치', stance:'rear', to:'low', line:'low', tier:'common',
    cost:2, cast:6, recovery:2, range:[0,1],
    text:'6틱 뒤에 발동합니다. 그때 거리가 1 이하면 피해 15를 줍니다.',
    onHit:[{k:'damage',v:15}] },

  compress:{ id:'compress', name:'시간 압축', stance:'rear', to:'mid', line:'none', tier:'rare',
    cost:4, cast:0, recovery:2, range:[0,4],
    text:'상대가 준비 중인 모든 행동을 6틱 늦추고 내 행동을 3틱 앞당깁니다.',
    onPlay:[{k:'delayQueue',t:'foe',v:6,n:99},{k:'hasten',t:'self',v:3,n:99}] }
};

/* ---------- 유파 ---------- */
DB.schools = [
  { id:'direct', name:'직도류', tag:'t-high',
    desc:'중단과 상단을 오가며 정면 승부를 펼칩니다. 연계가 짧고 피해가 높지만, 상단에 머무르면 바텀 공격에 큰 피해를 받습니다.',
    focus:'높은 피해 · 짧은 연계', hpBonus:0, staminaBonus:0, weapon:'standard',
    techs:['pierce','brace_mid','quick_cut','overhead','hold','press'] },

  { id:'foot', name:'보법류', tag:'t-side',
    desc:'측단과 후방을 오가며 거리를 주도합니다. 한 번의 피해는 낮지만 상대의 예고를 피하고 사거리를 벗어나게 만듭니다.',
    focus:'거리 지배 · 회피', hpBonus:-6, staminaBonus:3, weapon:'shortblade',
    techs:['pierce','slip','circle','side_cut','throw_blade','regroup'] },

  { id:'counterblade', name:'반격류', tag:'t-low',
    desc:'하단에서 버틴 뒤 반격합니다. 기력 회복이 빨라 오래 버틸 수 있으며, 상대가 큰 기술을 예고했을 때가 승부처입니다.',
    focus:'방어 · 반격', hpBonus:8, staminaBonus:0, weapon:'longblade',
    techs:['pierce','hold','counter','sweep','brace_mid','feint'] }
];

/* ==========================================================================================
   [DB] 무기 — 한 자루만 든다. 모든 기술의 사거리·준비·빈틈·피해·기력을 한꺼번에 바꾼다.
   같은 기술 구성이라도 무기가 다르면 전혀 다른 전투가 되므로, 판마다 결이 달라진다.
   ========================================================================================== */
DB.weapons = {
  standard:{ id:'standard', name:'표준 도검', tag:'t-key',
    desc:'별도 보정이 없어 어떤 구성에도 무난하게 어울립니다.',
    mod:{} },
  longblade:{ id:'longblade', name:'장검', tag:'t-mid',
    desc:'사거리와 피해가 증가합니다. 대신 준비 시간이 1틱 늘고 기력이 1 더 필요합니다.',
    mod:{ rangeMax:1, dealt:0.22, cast:1, cost:1 } },
  shortblade:{ id:'shortblade', name:'단검', tag:'t-side',
    desc:'준비 -1틱, 빈틈 -1틱. 대신 피해 -30%, 최대 사거리 -1.',
    mod:{ cast:-1, recovery:-1, dealt:-0.30, rangeMax:-1 } },
  greatblade:{ id:'greatblade', name:'대검', tag:'t-high',
    desc:'피해가 크게 증가합니다. 대신 준비 시간과 빈틈이 각각 1틱 늘고 기력이 1 더 필요합니다.',
    mod:{ dealt:0.55, cast:1, recovery:1, cost:1 } },
  twinblade:{ id:'twinblade', name:'쌍검', tag:'t-low',
    desc:'빈틈 -1틱, 자세 바꾸기 비용 -1. 대신 피해 -30%.',
    mod:{ recovery:-1, transitionDiscount:1, dealt:-0.30 } },
  polearm:{ id:'polearm', name:'장병기', tag:'t-none',
    desc:'최소·최대 사거리와 피해가 증가합니다. 대신 밀착 거리에서는 사용할 수 없습니다.',
    mod:{ rangeMin:1, rangeMax:1, dealt:0.10 } }
};
DB.weaponStart = 'standard';

/* ==========================================================================================
   [DB] 전투 연출 — 배경·무기·모션·프레임을 데이터만 추가해 확장한다
   ========================================================================================== */
DB.visual = {
  scene:{
    background:'assets/battle/grassland.png',
    alt:'푸른 하늘과 초원이 펼쳐진 전투장',
    movementMs:600,
    zones:{ count:5, startPct:10, stepPct:20, contactOffsetPct:3, start:{P:1,E:3} },
    groundRatio:0.812,
    hud:{
      segments:{ hp:16, focus:6 },
      colors:{
        P:{ hp:'#43bca9', stamina:'#ffd43b', focus:'#ff873a' },
        E:{ hp:'#dc7097', stamina:'#ffd43b', focus:'#ff873a' }
      }
    }
  },
  weapons:{
    standard:{
      name:'표준 도검',
      hud:{topPct:30,mobileTopPct:34,shortTopPct:32},
      motions:{
        idle:{ frameMs:0, loop:true, footOffsets:[0], frames:['assets/battle/standard/idle.png'] },
        advance:{ frameMs:200, loop:false, scale:0.89, footOffsets:[3.45,4.42,6.77], frames:[
          'assets/battle/standard/advance-1.png',
          'assets/battle/standard/advance-2.png',
          'assets/battle/standard/advance-3.png'
        ]},
        retreat:{ frameMs:200, loop:false, scale:0.89, footOffsets:[3.87,0,0], frames:[
          'assets/battle/standard/retreat-1.png',
          'assets/battle/standard/retreat-2.png',
          'assets/battle/standard/retreat-3.png'
        ]},
        attack:{ frameMs:300, loop:false, scale:0.89, footOffsets:[0,3.59], frames:[
          'assets/battle/standard/attack-1.png','assets/battle/standard/attack-2.png'] },
        hit:{ frameMs:300, loop:false, scale:0.89, footOffsets:[4.70,3.59], frames:[
          'assets/battle/standard/hit-1.png','assets/battle/standard/hit-2.png'] }
      }
    },
    longblade:{
      name:'장검', hud:{topPct:30,mobileTopPct:34,shortTopPct:32}, motions:{
        idle:{frameMs:0,loop:true,footOffsets:[0],frames:['assets/battle/longblade/idle.png']},
        advance:{frameMs:200,loop:false,scale:0.89,footOffsets:[0,2.21,5.66],frames:[
          'assets/battle/longblade/advance-1.png','assets/battle/longblade/advance-2.png','assets/battle/longblade/advance-3.png']},
        retreat:{frameMs:200,loop:false,scale:0.89,footOffsets:[2.35,4.14,4.28],frames:[
          'assets/battle/longblade/retreat-1.png','assets/battle/longblade/retreat-2.png','assets/battle/longblade/retreat-3.png']},
        attack:{frameMs:300,loop:false,scale:0.89,footOffsets:[0,0],frames:[
          'assets/battle/longblade/attack-1.png','assets/battle/longblade/attack-2.png']},
        hit:{frameMs:300,loop:false,scale:0.89,footOffsets:[1.66,2.07],frames:[
          'assets/battle/longblade/hit-1.png','assets/battle/longblade/hit-2.png']}
      }
    },
    shortblade:{
      name:'단검', hud:{topPct:30,mobileTopPct:34,shortTopPct:32}, motions:{
        idle:{frameMs:0,loop:true,footOffsets:[1.35],frames:['assets/battle/shortblade/idle.png']},
        advance:{frameMs:200,loop:false,scale:0.89,footOffsets:[3.87,2.90,4.14],frames:[
          'assets/battle/shortblade/advance-1.png','assets/battle/shortblade/advance-2.png','assets/battle/shortblade/advance-3.png']},
        retreat:{frameMs:200,loop:false,scale:0.89,footOffsets:[0,0,2.49],frames:[
          'assets/battle/shortblade/retreat-1.png','assets/battle/shortblade/retreat-2.png','assets/battle/shortblade/retreat-3.png']},
        attack:{frameMs:300,loop:false,scale:0.89,footOffsets:[0,0],frames:[
          'assets/battle/shortblade/attack-1.png','assets/battle/shortblade/attack-2.png']},
        hit:{frameMs:300,loop:false,scale:0.89,footOffsets:[1.80,1.80],frames:[
          'assets/battle/shortblade/hit-1.png','assets/battle/shortblade/hit-2.png']}
      }
    },
    greatblade:{
      name:'대검', hud:{topPct:30,mobileTopPct:34,shortTopPct:32}, motions:{
        idle:{frameMs:0,loop:true,footOffsets:[0],frames:['assets/battle/greatblade/idle.png']},
        advance:{frameMs:200,loop:false,scale:0.89,footOffsets:[2.21,2.62,0],frames:[
          'assets/battle/greatblade/advance-1.png','assets/battle/greatblade/advance-2.png','assets/battle/greatblade/advance-3.png']},
        retreat:{frameMs:200,loop:false,scale:0.89,footOffsets:[8.98,5.25,5.25],frames:[
          'assets/battle/greatblade/retreat-1.png','assets/battle/greatblade/retreat-2.png','assets/battle/greatblade/retreat-3.png']},
        attack:{frameMs:300,loop:false,scale:0.89,footOffsets:[0,0],frames:[
          'assets/battle/greatblade/attack-1.png','assets/battle/greatblade/attack-2.png']},
        hit:{frameMs:300,loop:false,scale:0.89,footOffsets:[0,0],frames:[
          'assets/battle/greatblade/hit-1.png','assets/battle/greatblade/hit-2.png']}
      }
    },
    twinblade:{
      name:'쌍검', hud:{topPct:30,mobileTopPct:34,shortTopPct:32}, motions:{
        idle:{frameMs:0,loop:true,footOffsets:[2.70],frames:['assets/battle/twinblade/idle.png']},
        advance:{frameMs:200,loop:false,scale:0.89,footOffsets:[4.01,3.04,4.56],frames:[
          'assets/battle/twinblade/advance-1.png','assets/battle/twinblade/advance-2.png','assets/battle/twinblade/advance-3.png']},
        retreat:{frameMs:200,loop:false,scale:0.89,footOffsets:[2.90,0,1.93],frames:[
          'assets/battle/twinblade/retreat-1.png','assets/battle/twinblade/retreat-2.png','assets/battle/twinblade/retreat-3.png']},
        attack:{frameMs:300,loop:false,scale:0.89,footOffsets:[2.07,1.80],frames:[
          'assets/battle/twinblade/attack-1.png','assets/battle/twinblade/attack-2.png']},
        hit:{frameMs:300,loop:false,scale:0.89,footOffsets:[2.76,2.07],frames:[
          'assets/battle/twinblade/hit-1.png','assets/battle/twinblade/hit-2.png']}
      }
    },
    polearm:{
      name:'장병기', hud:{topPct:30,mobileTopPct:34,shortTopPct:32}, motions:{
        idle:{frameMs:0,loop:true,footOffsets:[0],frames:['assets/battle/polearm/idle.png']},
        advance:{frameMs:200,loop:false,scale:0.89,footOffsets:[2.62,3.18,3.45],frames:[
          'assets/battle/polearm/advance-1.png','assets/battle/polearm/advance-2.png','assets/battle/polearm/advance-3.png']},
        retreat:{frameMs:200,loop:false,scale:0.89,footOffsets:[2.76,0,0],frames:[
          'assets/battle/polearm/retreat-1.png','assets/battle/polearm/retreat-2.png','assets/battle/polearm/retreat-3.png']},
        attack:{frameMs:300,loop:false,scale:0.89,footOffsets:[2.55,4.47],frames:[
          'assets/battle/polearm/attack-1.png','assets/battle/polearm/attack-2.png']},
        hit:{frameMs:300,loop:false,scale:0.89,footOffsets:[3.31,0],frames:[
          'assets/battle/polearm/hit-1.png','assets/battle/polearm/hit-2.png']}
      }
    }
  },
  actionMotion:{
    basic:{ approach:'advance', retreat:'retreat' },
    attack:{damage:'attack'}, impact:{damage:'hit'}
  },
  fallbackMotion:'idle'
};


/* ==========================================================================================
   [DB] 연계 — 특정 자세 경로(어느 자세에서 어느 자세로 이동했는가)에 보상을 건다.
   기술마다 '사용 후 이동할 자세'가 정해져 있으므로, 연계를 갖추면 순환 경로를 설계하게 된다.
   자세 그래프 자체를 빌드 대상으로 만드는 축이다.
   ========================================================================================== */
DB.chains = {
  c_mid_high:{ id:'c_mid_high', name:'올려치기 연결', from:'mid', to:'high',
    desc:'중단에서 상단으로 이동하면 강화 2를 얻습니다.',
    effects:[{k:'status',t:'self',s:'power',v:2}] },
  c_high_mid:{ id:'c_high_mid', name:'되돌리기', from:'high', to:'mid',
    desc:'상단에서 중단으로 이동하면 기력 3을 얻습니다.',
    effects:[{k:'stamina',t:'self',v:3}] },
  c_mid_low:{ id:'c_mid_low', name:'가라앉히기', from:'mid', to:'low',
    desc:'중단에서 하단으로 이동하면 막기 6을 얻습니다.',
    effects:[{k:'status',t:'self',s:'guard',v:6}] },
  c_low_mid:{ id:'c_low_mid', name:'받아넘기기', from:'low', to:'mid',
    desc:'하단에서 중단으로 이동하면 집중 1을 얻습니다.',
    effects:[{k:'focus',t:'self',v:1}] },
  c_side_high:{ id:'c_side_high', name:'감아올리기', from:'side', to:'high',
    desc:'측단에서 상단으로 이동하면 상대에게 표식 2를 남깁니다.',
    effects:[{k:'status',t:'foe',s:'mark',v:2}] },
  c_high_high:{ id:'c_high_high', name:'연속 내려치기', from:'high', to:'high',
    desc:'상단 자세를 이어서 사용하면 내 예고를 1틱 앞당깁니다.',
    effects:[{k:'hasten',t:'self',v:1,n:99}] },
  c_side_side:{ id:'c_side_side', name:'돌아 들어가기', from:'side', to:'side',
    desc:'측단 자세를 이어서 사용하면 상대의 예고를 1틱 늦춥니다.',
    effects:[{k:'delayQueue',t:'foe',v:1,n:99}] },
  c_rear_mid:{ id:'c_rear_mid', name:'거리 좁히기', from:'rear', to:'mid',
    desc:'후방에서 중단으로 이동하면 거리를 1만큼 좁힙니다.',
    effects:[{k:'move',v:-1}] },
  c_low_side:{ id:'c_low_side', name:'흘려 비끼기', from:'low', to:'side',
    desc:'하단에서 측단으로 이동하면 상대에게 둔화 2를 부여합니다.',
    effects:[{k:'status',t:'foe',s:'slow',v:2}] },
  c_mid_side:{ id:'c_mid_side', name:'비껴 서기', from:'mid', to:'side',
    desc:'중단에서 측단으로 이동하면 체력 4를 회복합니다.',
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
    desc:'준비 시간이 1틱 이하인 공격은 피해가 4 증가하고 집중 1을 얻습니다.', bonus:{ damage:4, focus:1 } },
  s_heavy:{ id:'s_heavy', name:'중격 각인', cond:'castAtLeast', v:4,
    desc:'준비 4틱 이상 공격은 피해 +12.', bonus:{ damage:12 } },
  s_double:{ id:'s_double', name:'겹박자', cond:'sameTick', v:2,
    desc:'같은 틱에 내 공격이 두 개 이상 발동하면 각각의 피해가 8 증가합니다.', bonus:{ damage:8 } },
  s_close:{ id:'s_close', name:'접근 각인', cond:'distanceAt', v:1,
    desc:'거리 근접에서 발동한 공격은 피해 +6.', bonus:{ damage:6 } },
  s_far:{ id:'s_far', name:'원격 각인', cond:'distanceAt', v:3,
    desc:'거리 원거리에서 발동한 공격은 피해 +6.', bonus:{ damage:6 } },
  s_bleed:{ id:'s_bleed', name:'출혈 각인', cond:'tickParity', v:1,
    desc:'홀수 틱에 발동한 공격은 출혈 3을 추가합니다.', bonus:{ bleed:3 } }
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
  m_sharp:{ id:'m_sharp', name:'예리 전환', desc:'자세 상성에 따른 피해 차이가 1.5배 커집니다.',
    mod:{ lineAmp:0.5 } },
  m_reach:{ id:'m_reach', name:'간격 전환', desc:'모든 기술의 최소·최대 사거리 +1.',
    mod:{ rangeMin:1, rangeMax:1 } },
  m_vigor:{ id:'m_vigor', name:'지구 전환', desc:'최대 체력 +25, 기력 회복 +0.5.',
    mod:{ hpMax:25, staminaRegen:0.5 } },
  m_edge:{ id:'m_edge', name:'예봉 전환', desc:'약점이 쌓인 상대에게 주는 피해가 30% 증가합니다.',
    mod:{ vsExposed:0.30 } }
};
DB.milestoneLayers = [2,4];

/* ==========================================================================================
   [DB] 초기 빌드 구성 — 시작 구성을 직접 조립한다.
   정해진 유파를 고르는 것이 아니라, 구성 점수를 나눠 써서 무기 · 기술 · 각인 · 연계 ·
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
    { id:'direct', name:'직도류', tag:'t-high', desc:'중단과 상단을 오가며 정면 승부를 펼칩니다.',
      weapon:'standard', techs:['pierce','brace_mid','quick_cut','overhead','hold','press'],
      sigils:['s_heavy'], chains:['c_mid_high'], hp:1, stamina:0, focus:0 },
    { id:'foot', name:'보법류', tag:'t-side', desc:'측단과 후방을 오가며 거리를 주도합니다.',
      weapon:'shortblade', techs:['pierce','slip','circle','side_cut','throw_blade','regroup'],
      sigils:['s_quick'], chains:['c_side_side'], hp:0, stamina:2, focus:0 },
    { id:'counterblade', name:'반격류', tag:'t-low', desc:'하단에서 버틴 뒤 반격합니다.',
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
  slot_side:{ id:'slot_side', name:'측단 수련', desc:'측단 자세 기술 슬롯 +1', mod:{ slot:'side' } },
  slot_mid:{ id:'slot_mid', name:'중단 수련', desc:'중단 자세 기술 슬롯 +1', mod:{ slot:'mid' } },
  slot_rear:{ id:'slot_rear', name:'후방 수련', desc:'후방 자세 기술 슬롯 +1', mod:{ slot:'rear' } },
  opening:{ id:'opening', name:'약점 포착', desc:'약점이 쌓인 상대에게 주는 피해가 15% 증가합니다.', mod:{ vsExposed:0.15 } },
  guardup:{ id:'guardup', name:'방패술', desc:'막기 획득량 +40%', mod:{ guardGain:0.40 } }
};

/* ---------- 적 ---------- */
DB.enemies = {
  dummy:{ id:'dummy', name:'훈련 상대', tier:'tutorial', hp:46, stance:'mid',
    stamina:8, staminaMax:12, staminaRegen:1, focusMax:3,
    desc:'정해진 순서대로 행동합니다. 예고를 읽고 대응하는 연습에 적합합니다.',
    techs:['pierce','overhead','brace_mid','quick_cut'],
    ai:'script', script:['pierce','wait','overhead','wait','brace_mid','quick_cut'] },

  scout:{ id:'scout', name:'정찰병', tier:'normal', hp:44, stance:'rear',
    stamina:7, staminaMax:12, staminaRegen:1, focusMax:4,
    desc:'후방에서 투척 공격을 이어갑니다. 가까이 접근하지 못하면 계속 공격받을 수 있습니다.',
    techs:['throw_blade','regroup','slip','circle','pierce','brace_mid'],
    ai:'kiter' },

  shieldman:{ id:'shieldman', name:'방패병', tier:'normal', hp:62, stance:'low',
    stamina:8, staminaMax:13, staminaRegen:1, focusMax:4,
    desc:'하단에서 막기를 쌓으며 버팁니다. 탑 공격이나 막기 해제 기술이 효과적입니다.',
    techs:['hold','sweep','brace_mid','pierce','rend','overhead'],
    ai:'bruiser' },

  duelist:{ id:'duelist', name:'결투병', tier:'normal', hp:50, stance:'high',
    stamina:8, staminaMax:13, staminaRegen:1, focusMax:5,
    desc:'상단에서 준비 시간이 짧은 공격을 이어갑니다. 바텀 공격으로 대응하는 것이 좋습니다.',
    techs:['quick_cut','feint','overhead','press','pierce','charge_high'],
    ai:'tempo' },

  saboteur:{ id:'saboteur', name:'교란병', tier:'elite', hp:66, stance:'side',
    stamina:9, staminaMax:14, staminaRegen:1, focusMax:5,
    desc:'예고를 지우고 자세를 흐트러뜨립니다. 전환 비용이 늘어나 연계가 끊길 수 있습니다.',
    techs:['delay','intercept','bind','side_cut','feint','brace_mid'],
    ai:'control' },

  breaker:{ id:'breaker', name:'중장병', tier:'elite', hp:88, stance:'mid',
    stamina:9, staminaMax:15, staminaRegen:1, focusMax:5,
    desc:'거리를 강제로 좁힌 뒤 강력한 기술을 예고합니다. 행동을 차단하거나 사거리 밖으로 피해야 합니다.',
    techs:['overhead','press','disarm','hold','charge_high','sweep'],
    ai:'bruiser' },

  master:{ id:'master', name:'검술 교관', tier:'boss', hp:124, stance:'mid',
    stamina:10, staminaMax:17, staminaRegen:2, focusMax:6,
    desc:'다섯 자세를 모두 사용합니다. 상대 자세를 확인하고 유리한 공격 방향을 선택해야 합니다.',
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
  { id:'train', name:'훈련', desc:'상대 체력이 20% 감소합니다. 상대의 의도와 예상 피해를 모두 보여 줍니다.',
    enemyHpMult:0.80, aiNoise:0.30, intent:'full' },
  { id:'std', name:'표준', desc:'기본 난이도입니다. 상대의 의도와 예상 피해를 모두 보여 줍니다.',
    enemyHpMult:1.00, aiNoise:0.10, intent:'full' },
  { id:'hard', name:'고난도', desc:'상대 체력이 20% 증가합니다. 상대의 예고는 이름과 공격 방향만 보여 줍니다.',
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
    battle:{ name:'전투', desc:'일반 상대와 전투합니다.', pool:['scout','shieldman','duelist'] },
    elite:{ name:'정예', desc:'강한 상대와 전투합니다. 보상 선택지가 늘어납니다.', pool:['saboteur','breaker'] },
    rest:{ name:'정비', desc:'회복 또는 단련을 선택합니다.', pool:[] },
    supply:{ name:'보급', desc:'물자를 사용해 기술·단련·회복을 얻습니다.', pool:[] },
    boss:{ name:'결전', desc:'최종 상대.', pool:['master'] },
    turn:{ name:'전환점', desc:'전투 규칙을 바꾸는 선택을 한 번 합니다.', pool:[] }
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
  { key:'difficulty', label:'난이도', hint:'새 게임을 시작할 때 적용됩니다.', type:'seg',
    options:[{v:'train',l:'훈련'},{v:'std',l:'표준'},{v:'hard',l:'고난도'}] },
  { key:'announce', label:'전투 알림', hint:'전투 중 주요 사건을 화면 오른쪽 위에 간결하게 표시합니다.', type:'toggle' },
  { key:'showMultiplier', label:'상성 배율 표시', hint:'기술 카드에 현재 상대 자세를 기준으로 한 피해 배율을 표시합니다.', type:'toggle' },
  { key:'animations', label:'애니메이션', hint:'전환 및 반응 효과 사용 여부.', type:'toggle' },
  { key:'aiSpeed', label:'상대 행동 속도', hint:'상대가 연속으로 행동할 때의 진행 속도입니다.', type:'seg',
    options:[{v:'normal',l:'보통'},{v:'fast',l:'빠름'}] },
  { key:'logDetail', label:'전투 기록', hint:'기록에 남길 정보의 양.', type:'seg',
    options:[{v:'full',l:'상세'},{v:'brief',l:'요약'}] },
  { key:'fontScale', label:'글자 크기', hint:'전체 인터페이스 글자 배율.', type:'seg',
    options:[{v:0.92,l:'작게'},{v:1.00,l:'보통'},{v:1.12,l:'크게'}] },
  { key:'confirmQuit', label:'전투 포기 확인', hint:'전투를 포기할 때 확인 창을 표시합니다.', type:'toggle' }
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
    none:'예고된 상대 공격이 없습니다. 지금은 위치를 조정하거나 기력을 모을 때입니다.',
    incoming:'{tech} 발동까지 {in}틱 · 지금 자세로 {dmg} 피해',
    safeStance:'{stance} 자세에서는 피해 {dmg}',
    outrange:'거리를 {dir} 공격이 빗나갑니다',
    yourTurn:'내 차례',
    foeTurn:'상대 차례'
  },
  laneSelf:'내 예고', laneFoe:'상대 예고',
  menu:[
    { id:'newrun', label:'새 게임' },
    { id:'multi', label:'멀티플레이' },
    { id:'continue', label:'이어하기' },
    { id:'tutorial', label:'튜토리얼' },
    { id:'codex', label:'규칙 안내' },
    { id:'settings', label:'설정' }
  ],
  /* 전투 알림 — 화면 오른쪽 위에 잠깐 표시한다. */
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
      pressure:{ text:'공세 부족 — 약점 {v}', kind:'warn' },
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
    pressureStart:'{side} 공세가 부족해 압박이 시작됩니다.',
    pressure:'{side} 약점 {v} 중첩',
    timeout:'제한 시간에 도달했습니다. 남은 체력 비율로 승패를 판정합니다.',
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
  lockMsg:'지금 단계에서는 이 조작을 사용할 수 없습니다. 화면의 안내에 따라 진행해 주세요.',
  steps:[
  { t:'전투 화면 살펴보기', focus:null,
    b:'전투 화면은 네 구역으로 구성됩니다. 위에서부터 양쪽 상태, 시간축, 자세, 기술과 조작 버튼 순서입니다. 중요한 전투 상황은 화면 가운데에도 크게 표시됩니다.' },

  { t:'시간축 읽기', focus:'#tlBox',
    b:'모든 행동이 즉시 발동하는 것은 아닙니다. 기술을 사용하면 시간축에 예고가 표시되고, 정해진 틱이 지나면 발동합니다. 가운데 숫자는 현재 시간이며, 위쪽에는 상대의 예고, 아래쪽에는 내 예고가 표시됩니다. 세로 막대는 각 플레이어가 다시 행동할 수 있는 시점입니다.' },

  { t:'사거리 확인하기', focus:'#battleActors .battle-zones',
    b:'전장은 다섯 구역으로 나뉩니다. 나와 적의 발밑 표식이 현재 구역을 가리키고, 두 구역 번호의 차이가 거리 칸 수입니다. 접근과 이탈은 한 구역씩 이동하며, 기술의 사거리는 실제 발동 시점의 거리로 판정됩니다.' },

  { t:'자세 이해하기', focus:'#ringBox',
    b:'자세는 모두 다섯 가지입니다. 각 자세에 따라 사용할 수 있는 기술과 공격 방향별 피해 배율이 달라집니다. 자세 칸을 누르면 기력을 사용해 자세를 바꿀 수 있습니다. 자세 전환에는 시간이 들지 않으므로 전환한 뒤에도 바로 기술을 사용할 수 있습니다.' },

  { t:'기술 카드 읽기', focus:'[data-tech="pierce"]',
    b:'카드 위쪽의 색은 공격 방향을, 오른쪽 원은 기술의 기력 비용을 나타냅니다. 가운데 막대에서 진한 부분은 발동까지 걸리는 준비 시간, 옅은 부분은 다시 행동하기까지의 빈틈입니다. 굵은 숫자는 자세 전환 비용을 포함한 총 기력이며, 다섯 개의 점은 사거리입니다. 카드 아래쪽에서는 기술 사용 후의 자세를 확인할 수 있습니다.' },

  { t:'조작 버튼 알아보기', focus:'#actBox',
    b:'화면 맨 아래에는 전투에 사용하는 버튼이 있습니다.',
    steps:['<b>사용</b> — 선택한 기술을 사용합니다. 먼저 기술 카드를 선택해야 표시됩니다.',
           '<b>집중 사용</b> — 집중을 소비해 선택한 기술을 강화합니다.',
           '<b>선택 해제</b> — 선택한 기술을 취소합니다. 자원은 소비되지 않습니다.',
           '<b>대기</b> — 시간축을 3틱 진행하고 기력과 집중을 회복합니다.',
           '<b>접근 · 이탈</b> — 기력을 사용해 거리를 한 칸 좁히거나 벌립니다. 행동 후에는 빈틈이 생깁니다.'] },

  { t:'기력과 틱 구분하기', focus:'#selfPanel',
    b:'기력은 초록색 막대로 표시되는 자원이고, 틱은 시간축에서 흐르는 시간입니다. 기술을 선택하면 사용할 기력이 빗금과 붉은 숫자로 미리 표시됩니다. 준비 시간과 빈틈은 기력이 아니라 시간을 사용한다는 점을 기억해 주세요.' },

  { t:'첫 기술 사용하기', focus:'#techBox [data-tech="pierce"]',
    b:'기술 카드를 선택하면 시간축에 예상 발동 위치가 점선으로 표시되고, 버튼 위에는 발동 시점과 예상 피해가 나타납니다. 밝게 강조된 항목을 순서대로 눌러 보세요.',
    hint:'찌르기 카드를 선택한 뒤 왼쪽 아래의 사용 버튼을 눌러 주세요.',
    require:{ type:'tech', id:'pierce' }, allow:{ techs:['pierce'] } },

  { t:'지금 상황 확인하기', focus:'#briefBox',
    b:'버튼 바로 위의 지금 상황 줄에는 현재 판단에 필요한 정보가 한 문장으로 정리됩니다. 누구의 차례인지, 상대 공격이 몇 틱 뒤에 발동하는지, 현재 자세에서 받을 피해와 더 안전한 자세를 확인할 수 있습니다.',
    setup:{ foeQueue:'sweep' } },

  { t:'자세별 피해 배율 보기', focus:'#ringBox',
    b:'상대가 바텀 기술을 예고했습니다. 자세 칸의 작은 숫자는 해당 자세로 공격받을 때의 피해 배율입니다. 붉은 숫자는 더 큰 피해를, 푸른 숫자는 더 적은 피해를 뜻합니다. 현재 상단은 바텀 공격에 1.5배의 피해를 받고, 하단은 0.75배만 받습니다.' },

  { t:'안전한 자세로 전환하기', focus:'[data-stance="low"]',
    b:'자세 칸 아래의 숫자는 해당 자세로 전환하는 데 필요한 기력입니다. 멀리 떨어진 자세일수록 더 많은 기력이 필요합니다. 밝게 표시된 하단 자세를 선택해 주세요.',
    hint:'자세 영역에서 하단 칸을 눌러 주세요.',
    require:{ type:'stance', id:'low' }, allow:{ stances:['low'] } },

  { t:'공격 직전에 막기 사용하기', focus:'#techBox [data-tech="hold"]',
    b:'막기는 피해를 대신 흡수하지만 매 틱 2씩 감소합니다. 오래 쌓아 두기보다 상대 공격이 발동하기 직전에 사용하는 것이 좋습니다. 하단의 버티기는 준비 시간이 0틱이므로 선택 즉시 효과가 적용됩니다.',
    hint:'버티기 카드를 선택한 뒤 사용 버튼을 눌러 주세요.',
    require:{ type:'tech', id:'hold' }, allow:{ techs:['hold'] } },

  { t:'유리한 수 활용하기', focus:'#techBox',
    b:'상대 공격보다 먼저 발동하고 사거리에도 들어오는 공격이 있으면 카드에 유리한 수 표시가 나타납니다. 추천할 만한 선택지라는 뜻이며, 반드시 정답이라는 뜻은 아닙니다. 막기, 공격, 거리 조절 중 상황에 맞는 행동을 직접 선택해 주세요.' },

  { t:'대기로 자원 회복하기', focus:'[data-act="wait"]',
    b:'대기를 사용하면 시간축이 3틱 진행되고 기력과 집중을 회복합니다. 그동안 상대의 예고도 3틱 가까워지므로 안전한 상황인지 먼저 확인해야 합니다.',
    hint:'밝게 표시된 대기 버튼을 눌러 주세요.',
    require:{ type:'basic', id:'wait' }, allow:{ basics:['wait'] } },

  { t:'압박과 제한 시간 이해하기', focus:'#tlBox .tl-top',
    b:'시간축 위쪽에서 남은 제한 시간을 확인할 수 있습니다. 제한 시간에 도달하면 남은 체력 비율로 승패를 판정합니다. 오랫동안 유효한 피해를 주지 못하면 약점이 쌓여 받는 피해가 증가하며, 공격에 성공하면 쌓인 약점이 모두 사라집니다.' },

  { t:'빌드 구성 이해하기', focus:null,
    b:'전투에서 승리하면 보상을 선택할 수 있습니다. 기술은 자세별 슬롯을 사용하고, 연계는 특정 자세 이동 경로에 추가 효과를 부여합니다. 단련은 항상 적용되는 능력치이며, 무기는 모든 기술의 사거리, 준비 시간, 빈틈과 피해에 영향을 줍니다. 같은 기술을 사용해도 무기와 연계에 따라 전투 방식이 달라집니다.' },

  { t:'이제 직접 전투해 보기', focus:null,
    b:'이제 자유롭게 전투해 보세요. 상대를 쓰러뜨리면 튜토리얼이 완료됩니다. 시간축의 행동 순서, 거리, 자세와 공격 방향의 상성, 기력과 집중의 배분을 함께 살펴보는 것이 중요합니다. 규칙이 헷갈릴 때는 아래의 규칙 버튼에서 언제든 다시 확인할 수 있습니다.',
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
      visualEvents:[], visual:{seq:0,side:null,motion:DB.visual.fallbackMotion,
        zones:Object.assign({},DB.visual.scene.zones.start),
        coords:Battle.zoneCoords(DB.visual.scene.zones.start)},
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
    if(def.range[0]===D.min&&def.range[1]===D.max) return [D.min,D.max];
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
          if(b!==s.distance){ Battle.log('move',{v:D.labels[s.distance]},'n'); Battle.visualAction(owner,'effect',null,s.distance-b); } break; }
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
    if(dmg>0) Battle.visualAction(target.side,'impact','damage');
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


  zoneCoords(zones){
    const Z=DB.visual.scene.zones;
    const p=Z.startPct+zones.P*Z.stepPct, e=Z.startPct+zones.E*Z.stepPct;
    return zones.P===zones.E
      ? {P:p-Z.contactOffsetPct,E:e+Z.contactOffsetPct}
      : {P:p,E:e};
  },
  sceneZones(distance,visual){
    const Z=DB.visual.scene.zones;
    const raw=visual&&visual.zones&&Number.isFinite(visual.zones.P)
      ? visual.zones.P
      : Math.round(((visual&&visual.coords?visual.coords.P:Battle.zoneCoords(Z.start).P)-Z.startPct)/Z.stepPct);
    const p=U.clamp(raw,0,Z.count-1-distance);
    return {P:p,E:p+distance};
  },
  visualAction(side, kind, id, move){
    if(!Battle.st||!DB.visual) return;
    const s=Battle.st, Z=DB.visual.scene.zones, current=s.visual||{seq:0};
    const map=DB.visual.actionMotion&&DB.visual.actionMotion[kind];
    const motion=map&&map[id];
    const oldP=current.zones&&Number.isFinite(current.zones.P)
      ? current.zones.P
      : Math.round(((current.coords?current.coords.P:Battle.zoneCoords(Z.start).P)-Z.startPct)/Z.stepPct);
    const oldE=current.zones&&Number.isFinite(current.zones.E)
      ? current.zones.E
      : Math.round(((current.coords?current.coords.E:Battle.zoneCoords(Z.start).E)-Z.startPct)/Z.stepPct);
    const delta=move!=null?move:s.distance-(oldE-oldP);
    const desiredP=side===DB.meta.sides.SELF?oldP-delta:oldE+delta-s.distance;
    const zones={P:U.clamp(desiredP,0,Z.count-1-s.distance)};
    zones.E=zones.P+s.distance;
    s.visual={
      seq:(current.seq||0)+(motion?1:0),
      side:motion?side:current.side,
      motion:motion||current.motion||DB.visual.fallbackMotion,
      fromCoords:Battle.zoneCoords({P:oldP,E:oldE}),
      zones,
      coords:Battle.zoneCoords(zones)
    };
    if(motion){
      if(!s.visualEvents) s.visualEvents=[];
      s.visualEvents.push(s.visual);
      if(s.visualEvents.length>24) s.visualEvents.shift();
    }
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
    if(onHit.some(effect=>effect.k==='damage')) Battle.visualAction(side,'attack','damage');

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
    if(a.stamina<cost || s.distance+cfg.move<D.min || s.distance+cfg.move>D.max) return false;
    a.stamina-=cost;
    if(cfg.escalationPerUse){ a.moveStacks[cfg.id]=(a.moveStacks[cfg.id]||0)+1; a.moveStackTick[cfg.id]=s.tick; }
    s.distance=U.clamp(s.distance+cfg.move,D.min,D.max);
    a.readyAt=s.tick+cfg.recovery;
    Battle.log(id,{side:lbl},cls);
    if(cost>cfg.staminaCost) Battle.log('retreatCost',{side:lbl,v:cost},cls);
    Battle.log('move',{v:D.labels[s.distance]},'n');
    Battle.visualAction(side,'basic',id,cfg.move);
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
    const done=()=>{ UI.renderBattle(); setTimeout(()=>Battle.finish(s),
      Math.max(DB.balance.loop.aiDelayMs,UI.motionRemaining())); };
    const step=()=>{
      if(Battle.st!==s) return;
      if(s.over){ done(); return; }
      if(guard++>DB.balance.loop.maxIterations){ Battle.finishByTimeout(); done(); return; }
      if(s.visual&&s.visual.seq!==UI.motionSeq) UI.renderBattle();
      const motionWait=UI.motionRemaining();
      if(motionWait>0){ setTimeout(step,motionWait); return; }
      const P=Battle.A(DB.meta.sides.SELF),E=Battle.A(DB.meta.sides.FOE);
      const active=(P.readyAt<=E.readyAt)?DB.meta.sides.SELF:DB.meta.sides.FOE;
      const target=Battle.A(active).readyAt;
      const hasPending=s.queue.some(q=>q.status==='pending'&&q.resolveAt>s.tick);
      if(App.settings.animations&&hasPending&&s.tick<target){
        Battle.advanceTo(s.tick+1);
        UI.renderBattle();
        if(s.over){ done(); return; }
        const delay=App.settings.aiSpeed==='fast'
          ? DB.balance.loop.tickDelayFastMs : DB.balance.loop.tickDelayMs;
        setTimeout(step,delay);
        return;
      }
      Battle.advanceTo(target);
      if(s.over){ done(); return; }
      if(s.visual&&s.visual.seq!==UI.motionSeq) UI.renderBattle();
      if(Battle.A(active).controller==='human'){
        const readyMotionWait=UI.motionRemaining();
        if(readyMotionWait>0){ setTimeout(step,readyMotionWait); return; }
        Battle.awaitInput=true; UI.renderBattle(); return;
      }
      UI.renderBattle();
      const d=App.settings.aiSpeed==='fast'?DB.balance.loop.aiDelayFastMs:DB.balance.loop.aiDelayMs;
      setTimeout(()=>{ if(Battle.st!==s) return; AI.act(active); step(); },
        App.settings.animations?Math.max(d,UI.motionRemaining()):0);
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
