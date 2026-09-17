# 내전 팀 밸런서

발로란트 5v5 내전용 팀 밸런싱 + 맵 밴픽 웹 서비스. Riot ID를 입력하면 최고 티어
기준으로 팀을 나누고, 팀장 두 명이 각자 접속해서 실시간으로 맵 밴픽을 진행합니다.

## 기능

- Riot ID(닉네임#태그) 최대 10개 입력 → HenrikDev API로 최고 티어 조회
- 최고 티어 기준 그리디 밸런싱으로 5:5 팀 자동 분배 (밴픽 시작 전 수동으로 두 명 맞바꾸기 가능)
- BO3 / BO5 선택, "경쟁전 로테이션" 프리셋 또는 "자율맵" 직접 선택(정확히 7개 필요)
- 실제 발로란트 e스포츠 방식의 밴픽 시퀀스
  - BO3: 밴-밴-픽(상대 공수선택)-픽(상대 공수선택)-밴-밴-데사이더(1팀 공수선택)
  - BO5: 밴-밴-픽-픽-픽-픽(공수선택 번갈아)-데사이더(1팀 공수선택)
- 팀장 2명이 각자 브라우저에서 "이 팀 주장으로 참가"를 눌러 전용 토큰을 받고,
  자기 차례에만 밴/픽 가능 (다른 사람은 관전만 가능)
- 방 상태는 1.2~1.5초 폴링으로 동기화 (별도 서버 없이 Vercel에 바로 배포 가능)

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev
```

`.env.local`에 `KV_REST_API_URL` / `KV_REST_API_TOKEN`을 비워두면 메모리 저장소로
동작합니다(개발 서버 재시작 시 방 데이터가 초기화됨, 로컬 테스트용).

## 환경변수

| 변수 | 설명 |
|---|---|
| `HENRIKDEV_API_KEY` | 필수. 티어 조회용. 아래 "HenrikDev API 키 발급" 참고 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 배포 시 필수(로컬은 생략 가능). 방 상태 저장용 Redis |

### HenrikDev API 키 발급

1. https://discord.gg/X3GaVkX2YN 디스코드 서버 가입 (키 발급이 이 계정과 연동됨)
2. `api.henrikdev.xyz/dashboard/`에서 로그인 후 **Basic Key** 즉시 발급 (분당 30회 제한, 개인/소규모 프로젝트용. 내전 10명 조회 정도엔 충분)
3. 발급받은 키를 `HENRIKDEV_API_KEY`에 설정

이 API는 Riot 비공식 API라 정책 변경/일시 중단 가능성이 있습니다. 응답 스키마가
바뀌면 `lib/valorant-api.ts`의 `extractTier` 파싱 로직을 최신 문서
(https://docs.henrikdev.xyz)에 맞게 수정해주세요.

## Vercel 배포

1. 이 프로젝트를 GitHub 리포지토리로 push
2. Vercel에서 New Project → 해당 리포지토리 Import
3. **Storage 연결**: Vercel 프로젝트 → Storage 탭 → Marketplace에서 **Upstash Redis**
   (구 "Vercel KV") 추가 → 프로젝트에 연결하면 `KV_REST_API_URL`,
   `KV_REST_API_TOKEN`이 자동으로 환경변수에 채워집니다.
   (연결 안 하면 서버리스 인스턴스마다 상태가 따로 놀아서 팀장끼리 밴픽이
   동기화되지 않습니다 — 실서비스에는 반드시 필요)
4. 프로젝트 Settings → Environment Variables에 `HENRIKDEV_API_KEY` 추가
5. Deploy

## 맵 로테이션 업데이트하기

발로란트 경쟁전 맵 로테이션은 패치마다 바뀝니다. `lib/maps.ts`의
`ALL_MAPS` 배열에서 각 맵의 `defaultRotation` 값을 최신 상태로 수정하고
다시 배포하면, 방 생성 화면의 "경쟁전 로테이션 적용" 버튼이 최신 맵으로
채워집니다. 방장은 밴픽 설정 화면에서 이 프리셋과 상관없이 자유롭게
맵을 켜고 끌 수 있습니다(자율맵).

## 알아두면 좋은 점

- 팀장 인증은 회원가입 없이 "선착순 참가 + 브라우저 로컬 저장 토큰" 방식입니다.
  친구들끼리 쓰는 내전 도구 용도로 설계했고, 그 이상의 보안이 필요하면
  별도 인증을 추가해야 합니다.
- 픽한 맵의 공수 선택은 밴픽 진행을 막지 않고 별도 배너로 표시됩니다(상대 팀장이
  아무 때나 선택 가능). 시퀀스 자체를 막고 싶다면 `lib/veto.ts`의
  `applyAction`에서 다음 스텝으로 넘어가기 전에 이전 픽의 side가 채워졌는지
  검사하도록 수정하면 됩니다.
- 방 데이터는 12시간 후 자동 만료됩니다(`lib/store.ts`의 `TTL_SECONDS`).
