# THE TIMELINE V4.1 — Cloudflare 1 대 1 PvP

싱글플레이 HTML과 서버 판정형 1 대 1 PvP를 한 GitHub 저장소에서 관리하고 Cloudflare Workers에 함께 배포하는 프로젝트입니다.

- 프론트엔드: Worker Static Assets
- API와 WebSocket: Cloudflare Worker
- 방 상태와 실시간 연결: Durable Objects
- 자동 검증: GitHub Actions

## 저장소 구조

```text
.
├── index.html
├── src/
│   ├── worker.js
│   └── game-engine.generated.js
├── scripts/build.mjs
├── test/build.test.mjs
├── .github/workflows/ci.yml
├── wrangler.jsonc
├── package.json
└── package-lock.json
```

`index.html`의 DB와 `Battle` 코어가 전투 규칙의 단일 원천입니다. `npm run build`가 이 부분을 Worker용 모듈로 생성하므로 프론트와 백엔드 수치를 따로 고칠 필요가 없습니다.

## 로컬 실행

Node.js 20 이상이 필요합니다.

```bash
npm ci
npm run dev
```

Wrangler가 표시한 로컬 주소를 엽니다. 실제 1 대 1 확인은 창 두 개를 사용하고, 혼자 확인할 때는 `혼자 테스트하는 임시방`을 선택합니다.

```bash
npm run check
```

## GitHub에 업로드

GitHub에서 빈 저장소를 만든 다음 이 프로젝트 폴더에서 실행합니다.

```bash
git init
git add .
git commit -m "Add Cloudflare multiplayer deployment"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPOSITORY.git
git push -u origin main
```

이미 Git 저장소라면 `git init`과 `git remote add`는 생략합니다. `node_modules`, 로컬 Wrangler 데이터와 `dist`는 `.gitignore`에 포함되어 있습니다.

## Cloudflare에서 GitHub 연결 배포

1. Cloudflare 대시보드에서 **Workers & Pages → Create application → Import a repository**로 이동합니다.
2. GitHub 계정을 연결하고 이 저장소를 선택합니다.
3. 프로젝트 설정을 다음처럼 입력합니다.

| 항목 | 값 |
| --- | --- |
| Root directory | `/` |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |

4. 저장 후 배포합니다. `wrangler.jsonc`가 Worker, 정적 파일, `GAME_ROOMS` Durable Object와 SQLite 저장소를 선언합니다.
5. 배포된 `workers.dev` 주소에서 멀티플레이 방을 생성해 확인합니다.

이후 `main` 브랜치에 푸시할 때마다 Cloudflare가 자동으로 새 버전을 빌드하고 배포합니다. Durable Object가 포함된 Worker는 PR Preview URL 생성에 제한이 있을 수 있습니다.

## CLI로 직접 배포할 때

```bash
npx wrangler login
npm run deploy
```

Cloudflare 계정에서 Durable Objects 사용 권한이 필요합니다. 커스텀 도메인은 배포 후 Worker의 **Settings → Domains & Routes**에서 연결합니다.

## 멀티플레이 동작

- `POST /api/rooms`: 방 또는 봇 임시방 생성
- `POST /api/rooms/:code/join`: 6자리 코드로 참가
- `GET /ws/:code?token=...`: 방별 WebSocket 연결
- 방별 Durable Object가 행동권, 피해, 거리, 상태 효과와 승패를 최종 판정
- 연결 종료 후 30초 동안 같은 탭의 세션 토큰으로 재접속 가능
- 대기방은 30분, 종료된 방은 5분 뒤 자동 정리

세션 토큰은 URL 쿼리에 전달되므로 외부 분석 로그를 사용한다면 쿼리 문자열을 마스킹하는 것이 좋습니다.
