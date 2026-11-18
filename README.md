# 여백 · 집필 스튜디오

여백은 표지와 책 판형을 고르고 장별로 원고를 쓰는 한국어 편집기입니다. 로그인하면 서재, 장 구성, 편집 서식, 마지막 작업 위치를 서버에 자동으로 저장합니다. 다른 기기에서 같은 사이트와 계정으로 로그인하면 이어 쓸 수 있습니다.

## 시작

Node.js 24 이상이 필요합니다.

```sh
npm ci
npm run dev
```

서버는 기본적으로 3000번 포트를 사용합니다. `npm test`는 별도의 임시 데이터베이스에서 계정 분리, 기기 간 복원, 동시 수정 충돌과 서버 재시작 후 저장을 확인합니다.

## 집필

- **신규 작성**에서 에세이, 소설, 시집, 논픽션 서식을 고르고 판형과 표지를 지정합니다.
- 편집기에서는 글꼴, 크기, 자간, 줄 간격, 정렬, 들여쓰기를 선택한 글자 또는 문단에 적용합니다. **판형 설정**에서는 전체 책의 판형, 여백, 기본 본문 서식을 바꿉니다.
- **인쇄**에서 책 전체를 인쇄하거나 브라우저의 인쇄 창에서 PDF로 저장할 수 있습니다. 페이지 나눔은 인쇄할 때 적용됩니다.
- 게스트가 이 브라우저에서 작성한 원고는 로그인 후 계정에 저장됩니다. 두 기기에서 같은 원고를 수정하면 저장된 버전을 열거나 내 수정본을 별도 책으로 보관할 수 있습니다.

## Cloudflare 자동 배포

GitHub `main` 브랜치에 연결된 Cloudflare Workers 프로젝트 `timeline`으로 배포합니다. 빌드가 성공하면 `dist/index.html`과 편집기 파일이 서비스되고, 같은 주소의 로그인 및 저장 API는 Cloudflare에서 실행됩니다. 계정과 원고는 SQLite 기반 Durable Object `YeobaekLibrary`에 보관합니다.

| Workers Builds 설정 | 값 |
| --- | --- |
| 프로덕션 브랜치 | `main` |
| 루트 디렉터리 | `/` |
| 빌드 명령 | `npm ci && npm run build` |
| 배포 명령 | `npx wrangler deploy` |

`npm run dev:worker`로 Cloudflare 런타임에서 실행할 수 있습니다. `npm run test:worker`는 로그인, 서식 있는 긴 원고의 저장 및 복원, Workers 재시작 후 데이터 유지를 임시 저장소에서 검증합니다. 배포 파일은 `npm run deploy:check`로 확인할 수 있습니다.

## Node.js로 직접 운영

한 서버에서 앱과 API를 함께 서비스합니다. 서버를 배포할 때 고정 HTTPS 주소와 재배포 이후에도 유지되는 데이터 디렉터리가 필요합니다.

```sh
npm ci
npm run build
DATA_DIR=/path/to/persistent-data PORT=3000 COOKIE_SECURE=1 npm start
```

HTTPS를 처리하는 역방향 프록시를 이 프로세스로 연결하세요. 신뢰하는 프록시 한 대만 통해 앱에 접속하는 구성이라면 `TRUST_PROXY=1`로 클라이언트 IP를 전달할 수 있습니다. 별도 저장 경로를 지정하지 않으면 `data/studio.sqlite`에 저장합니다.

Docker에서도 실행할 수 있습니다. 프록시는 예시에서 호스트의 3000번 포트로 연결합니다.

```sh
docker build -t yeobaek .
docker run -d --name yeobaek --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v yeobaek-data:/data -e COOKIE_SECURE=1 yeobaek
```

서버 상태 확인 경로는 `/api/health`입니다. SQLite 데이터 경로를 한 서비스 인스턴스에 연결하고 정기적으로 백업하세요.
