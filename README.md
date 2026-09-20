# 발로란트 내전 매니저 (Next.js / Vercel)

made by 이현

## 배포

```bash
cd next
npm install
npm run dev      # http://localhost:3000
```

Vercel: 이 `next/` 폴더를 루트로 하는 프로젝트로 임포트하면 빌드 설정 없이 바로 배포됩니다.
(리포지토리 루트가 상위 폴더라면 Vercel 프로젝트 설정의 Root Directory를 `next`로 지정하세요.)

## 환경 변수

| 이름 | 용도 | 없을 때 |
|---|---|---|
| `HENRIKDEV_API_KEY` | HenrikDev 티어 조회 (`/api/rank`) | 조회 실패 (503) → 해당 참가자는 "언랭"으로 표시, 밸런싱 계산에서는 최하위 티어로 취급 (가짜 티어를 만들어 넣지 않음) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 방/전적/명단 공유 저장소 (Supabase) | 아래 KV로 대체 시도 |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | 방/전적/명단 공유 저장소 (Vercel KV 또는 Upstash Redis) | 인스턴스 메모리에만 저장 (개발용) |
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 (맵 풀 변경, 전적 삭제). 미설정 시 관리자 기능 비활성 | 없음 |

`lib/store.js`는 Supabase → KV/Redis → 인스턴스 메모리 순으로 사용 가능한 저장소를 자동 선택합니다.
여러 사람이 같은 방을 공유하려면 둘 중 하나는 반드시 연결해야 합니다.

### Supabase로 연결하기

1. https://supabase.com 에서 프로젝트 생성
2. SQL Editor에서 아래 테이블 생성:
   ```sql
   create table if not exists kv_store (
     key text primary key,
     value jsonb not null,
     expires_at timestamptz,
     updated_at timestamptz not null default now()
   );
   alter table kv_store enable row level security;
   ```
   (service role 키는 RLS를 우회하므로 별도 policy 없이도 서버에서 읽고 쓸 수 있고, RLS를 켜두면 anon/authenticated 키로는 접근이 막힙니다.)
3. 프로젝트 Settings → API에서 **Project URL**과 **service_role key**를 확인
4. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 환경변수로 설정 (Vercel Marketplace에서 Supabase 연동을 추가하면 비슷한 이름의 변수가 자동 주입되니, 이름이 다르면 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`로 다시 매핑해주세요)

## API

| 라우트 | 메서드 | 설명 |
|---|---|---|
| `/api/rank?name=닉네임&tag=KR1` | GET | HenrikDev v2 MMR → 최고 티어(한글 라벨) |
| `/api/role?name=닉네임&tag=KR1` | GET | HenrikDev v3 최근 30경기 → 사용 요원 기반 포지션 추론(과반 역할 없으면 '플렉스') + 최다 사용 요원 top 3 |
| `/api/stats?name=닉네임&tag=KR1` | GET | HenrikDev **v4** 이번 시즌 경쟁전 전체(최대 100경기, 10개씩 페이지네이션) → ACS/ADR/KPR/APR/HS%/K:D/K/Kmax + 최다 사용 요원 top 3(아이콘 포함) |
| `/api/seasonstats` | GET / POST | `/api/stats` 조회 결과를 Riot ID 기준으로 캐싱 — 방과 별개로 영구 보관되고, 다른 사람 화면에도 폴링으로 뜸. UI의 "새로고침" 버튼을 누르면 `/api/stats`를 다시 불러와 여기 저장 |
| `/api/room?code=MAIN` | GET | 방 상태 조회 (폴링) |
| `/api/room` | POST | 방 상태 저장, `version` 기반 stale write 차단(캡틴 자리·밴픽 진행 상태는 동시 쓰기로부터 필드 단위 보호), TTL 없음(영구 저장, "방 초기화" 전까지 유지) |
| `/api/records` | GET / POST | Riot ID 기준 누적 전적 (승·패·날짜·티어 스냅샷) |
| `/api/roster` | GET / POST | 상시 멤버 명단 (닉네임 + 포지션) |

## 구조

```
next/
  app/
    layout.js          폰트 · 메타데이터
    globals.css        리셋 · 키프레임 · 호버 규칙
    page.js            전체 UI (클라이언트 컴포넌트, 7개 화면)
    api/rank|room|records|roster/route.js
  lib/
    constants.js       티어 표 · 맵 목록 · 밴픽 시퀀스 · 포맷터
    store.js           Supabase ↔ KV REST ↔ 메모리 폴백 저장소
  public/
    logo.png, maps/*.png
```

## 방 공유

`?room=` 쿼리 없이 접속하면 모두 같은 공유 방(`MAIN`)에 들어오고, `?room=KR-1234`처럼 직접 지정하면
별도의 방을 쓸 수도 있습니다. 3초 폴링으로 참가자·팀·밴픽 상태가 동기화됩니다. 방 데이터는 TTL 없이
영구 저장되며, 헤더의 "방 초기화" 버튼을 눌러야만 비워집니다.

## 주장 토큰

"이 팀 주장으로 참가"를 누른 브라우저에만 발급된 토큰이 로컬에 저장되고, 그 토큰을 가진 브라우저만
해당 팀 차례의 밴픽 권한(및 자리 취소)이 있습니다. 다른 브라우저에서는 그 자리가 "다른 사람이 참가함"
으로 잠기고 뺏을 수 없습니다. 두 캡틴이 거의 동시에 참가/시작해도 서로의 상태를 지우지 않도록
`/api/room` POST가 `captains`·`bp` 필드를 병합 처리합니다 (`app/api/room/route.js` 참고).
