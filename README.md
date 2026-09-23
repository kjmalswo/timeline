# THE TIMELINE — 턴제 거리 결투

싱글플레이와 1 대 1 PvP가 같은 무기, 카드, Peak 룬 구성을 사용하는 브라우저 게임입니다. Cloudflare Worker가 정적 화면을 제공하고 Durable Object가 PvP 방과 라운드 결과를 판정합니다.

## 실행과 배포

Node.js 20 이상에서 `npm ci`, `npm run check`, `npm run dev` 순서로 로컬 확인이 가능합니다. Cloudflare 연결 배포의 빌드 명령은 `npm ci && npm run build`, 배포 명령은 `npx wrangler deploy`입니다. 설정은 `wrangler.jsonc`에 있습니다.

`index.html`의 무기·카드·Peak 정의가 원본입니다. `npm run build`는 이 정의에서 `src/turn-rules.generated.js`를 만들고, 화면과 이미지 자산을 `dist/`에 복사합니다. 생성 파일은 직접 수정하지 않습니다.

## 게임 규칙

- 각 무기는 카드 8장의 기본 덱을 제공합니다. 시작 전에 카드를 교체하고 Peak 룬을 최대 3개까지 선택할 수 있습니다.
- 한 라운드에 양쪽이 카드 한 장씩 선택합니다. 속도가 높은 카드부터 이동, 방어, 공격을 처리합니다.
- 공격은 카드 사거리 안에서만 적중합니다. 방어 카드는 해당 라운드의 피해를 줄입니다.
- 싱글플레이는 상대 카드를 먼저 예고합니다. PvP에서는 선택한 카드를 양쪽 모두 제출한 뒤 공개합니다.
- 싱글플레이의 진행 중 결투는 브라우저 로컬 저장소에서 이어할 수 있습니다.

PvP는 `POST /api/rooms`, `POST /api/rooms/:code/join`, `GET /ws/:code?token=...`를 사용합니다. 방 생성·입장 시 무기, 카드 8장, Peak 선택을 서버가 검증합니다.

