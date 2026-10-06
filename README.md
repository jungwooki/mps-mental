# MPS Mental

`mps_basecamp`의 mental, mental-diary, mental-evidence 내용과 스타일을 분리한 멘탈코치 워크스페이스입니다. 첫 화면은 `index.html`입니다. 기존 베이스캠프와 예약 데이터는 수정하지 않습니다.

1920×1080에서 메뉴 240px, 회차 목록 264px, 차팅 영역 944px, 우측 요약 360px로 배치하며 차팅과 요약이 겹치지 않도록 공간을 확보합니다. 박스·입력란·버튼 모서리는 5px입니다. 현재 선수의 이름·고유번호·소속·담당 코치를 별도 정보 박스로 표시하고, 동명이인을 구분할 수 있도록 선택 목록·주간 미팅·복사 내용에도 선수 식별 정보를 포함합니다.

## 실행

워크스페이스 루트에서 다음 명령을 실행합니다.

```sh
python3 mps-mental/server.py
```

http://127.0.0.1:8787/mps-mental/ 에서 엽니다. 파일을 더블클릭하는 `file://` 방식 대신 HTTP로 실행하세요. 서버는 기본적으로 이 컴퓨터에서만 접속 가능합니다.

## 데이터 저장

예약 서비스와 같은 Firebase 프로젝트 `mpsreserve`의 기본 Cloud Firestore 데이터베이스를 사용합니다. 예약의 `reservations` 컬렉션과 구분하여 다음 경로에 저장합니다.

| 컬렉션 | 내용 |
| --- | --- |
| `mental_players/{선수ID}` | 선수 정보, 담당 코치, 공유 다이어리 |
| `mental_sessions/{회차ID}` | 상담일, 주제, 관찰, 상담 기록, 다이어리 회고, 행동 약속, 다음 질문 |
| `mental_summaries/{선수ID}` | 최근 최대 4회 요약, 원본 회차 ID, 모델, 수정 시각 |

입력 즉시 기기에 임시 저장하고, 650ms 동안 입력이 멈추면 Firebase에 저장합니다. 새 회차도 처음부터 독립된 문서로 생성됩니다. 서버 저장이 확인된 뒤에만 ‘Firebase 저장 완료’로 표시합니다. 실패·오프라인일 때는 대기 기록을 보존하고 연결 복구 또는 재시도 버튼으로 저장합니다. 서버에 아직 보내지 못한 내용이 있으면 페이지를 나갈 때 브라우저가 확인할 수 있습니다.

여러 코치가 서로 다른 필드를 수정하면 변경 필드만 병합합니다. 같은 필드를 동시에 수정하면 마지막 서버 저장 내용이 적용됩니다. 회차 순서는 상담일과 생성 시각을 기준으로 표시합니다. 내용이 없는 초안은 AI 요약에 포함하지 않습니다.

Firebase 저장·조회는 로그인한 코치 계정으로만 작동합니다. 2026-10-02 사용자 요청에 따라 로그인 첫 화면을 적용하고, 멘탈 컬렉션의 조회·저장을 코치 claim으로 제한하는 보안 규칙을 실제 게시했습니다. 다른 컬렉션은 사용자가 제공한 기존 공개 접근을 그대로 유지했습니다. 관리자는 모든 선수와 회차를 관리합니다. 화면에 비밀번호를 하드코딩하지 않고 Firebase Auth로 검증합니다.

‘베이스캠프 기록 가져오기’는 같은 출처의 이 브라우저에 저장된 실제 멘탈 관리 선수를 가져옵니다. 샘플 선수와 이미 등록된 문서는 건너뜁니다. 다른 도메인에서 사용하던 베이스캠프 브라우저 저장소는 자동으로 읽을 수 없습니다.

선수 기기의 원본 다이어리는 기존과 같이 브라우저 저장 방식입니다. 코치가 공유받아 붙여넣은 다이어리와 회차별 회고는 Firebase에 저장합니다.

## AI 요약 연결

서버가 OpenAI Responses API로 실제 요약을 요청합니다. 키는 HTML·Firebase·브라우저에 저장하지 않습니다.

1. `.env.example`을 `.env`로 복사합니다.
2. `.env`의 `OPENAI_API_KEY`에 서비스 키를 입력합니다.
3. 필요하면 `OPENAI_MODEL`을 변경합니다. 기본값은 `gpt-4.1-mini`입니다.
4. 서버를 재시작합니다.

```sh
cp mps-mental/.env.example mps-mental/.env
python3 mps-mental/server.py
```

서버 환경변수에 직접 설정해도 됩니다. 키가 없을 때는 실제 AI 요약이 실행되지 않고 화면에 설정 필요 상태가 표시됩니다. 서버는 Firebase ID 토큰을 Google에 검증한 다음 AI를 호출합니다.

입력이 끝나고 서버 저장이 완료되면 약 10초 후 선택된 선수의 최근 최대 4회를 자동 요약합니다. 내용이 바뀌지 않았다면 재호출하지 않습니다. 새 기록, 수정된 상담, 공유 다이어리를 반영합니다. 생성 중 원본이 바뀌거나 코치가 요약을 수정하면 이전 요청 결과로 덮어쓰지 않습니다. 요약은 자동 저장되고 코치가 수정하거나 복사할 수 있습니다. 진단이나 없는 점수·리포트 내용은 생성하지 않도록 구성했습니다.

정적 호스팅만 사용할 경우 Firebase 저장은 작동하지만 Python AI 서버를 별도로 운영해야 합니다. 다른 서버에 연결하려면 `config.js`의 엔드포인트와 서버의 허용 출처 정책을 해당 배포에 맞게 설정하세요. 현재 서버는 같은 출처 요청을 허용합니다.

### Vercel 배포

`api/*.py`가 기존 서버의 인증·권한 검증을 사용하는 Vercel Functions로 배포됩니다.
프로젝트 Root Directory는 이 저장소 루트, Framework Preset은 Other로 설정하고,
별도 정적 출력 폴더를 지정하지 않습니다. `requirements.txt`로 Python 의존성을 설치합니다.

Vercel 프로젝트 Settings → Environment Variables의 Production에 다음 값을 설정한 뒤 재배포하세요.

- `OPENAI_API_KEY`: 새로 발급한 실제 키. 로컬 `.env`는 배포되지 않습니다.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: `mpsreserve` Firebase 서비스 계정 JSON 전체를 비공개 환경변수로 입력합니다. 토큰 검증용 서버 인증정보이며 Git에 파일로 추가하지 않습니다.
- `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`: 필요할 때만 지정합니다.

배포 후 `/api/health`가 JSON으로 `ready: true`를 반환하는지 확인합니다.
이 상태는 OpenAI 키 존재 여부만 확인하며 실제 키 유효성이나 Firebase 인증 성공을 의미하지는 않습니다.
로그인 후 최근 회차 요약과 녹음 요약을 확인하세요.

참고: [OpenAI 텍스트 생성](https://developers.openai.com/api/docs/guides/text), [Firebase 실시간 조회](https://firebase.google.com/docs/firestore/query-data/listen), [Firebase 인증 REST API](https://firebase.google.com/docs/reference/rest/auth).

## 포함 자료

코칭리포트와 서베이 일반 결과, 멘탈 상세·유형 리포트는 6점 만점 지표 또는 종합 MGI 중 5.5점 이상인 영역이 있으면 과도한 자기신념이나 실제 수행보다 긍정적인 응답의 가능성을 추가 확인하도록 안내합니다. 5.5점은 MPS의 코칭 확인 기준이며 검증된 진단 절단점으로 제시하지 않습니다. 100점·백분율·유형 유사도·집단 평균에 이 기준을 적용하지 않습니다. 일반 결과의 복사와 이미지 저장에도 안내가 포함됩니다. 코칭 가이드의 구간 선택에는 해당 구간 안의 실제 원점수가 5.5 이상일 때 적용하는 조건부 안내를 표시합니다.

공통 규칙은 `resources/report-score-notice.js`에 있고, `prepare_reports.py`가 각 리포트에 연결합니다. `build_source.py`로 자료를 다시 복사해도 동일한 안내가 다시 적용됩니다. 인쇄용 안내는 5px 모서리와 전체를 감싸는 얇은 테두리로 표시하며 A4 페이지 안에 들어오도록 간격을 조정했습니다.

자기보고의 응답 편향과 행동 관찰·코치 의견을 함께 확인하는 접근은 [PCDEQ-C 개발 연구의 제한점 및 활용 제안](https://pmc.ncbi.nlm.nih.gov/articles/PMC8601555/)을 참고했습니다. 이 논문이 5.5점 기준 또는 과도한 자기신념의 판별을 검증했다는 의미는 아닙니다.

3개 원본 화면의 내용 외에 서베이, 멘탈코치 수행 가이드, 다이어리, 프로그램 소개, 멘탈 심화 샘플을 `resources`에 복사했습니다. 설명 가이드도 이 폴더에서 작동합니다. 예약 버튼은 기존 `../mps-res/index.html`로 연결합니다.

`build_source.py`와 `shell.html`은 원본 화면을 다시 추출할 때 사용하는 제작 파일입니다. 실행에는 필요하지 않으며, 원본을 다시 추출하면 `index.html`이 재생성됩니다.

## 검증

```sh
node mps-mental/tests/core.test.mjs
node mps-mental/tests/score-notice.test.mjs
python3 -m unittest discover -s mps-mental/tests -p 'test_*.py'
```

2026-10-02 확인 결과:

- 실제 Firebase: 임시 선수, 5개 회차, 공유 다이어리, 요약 저장 및 별도 브라우저 조회.
- 새로고침 복원과 실시간 동기화, 오프라인 수정 후 서버 저장 복구.
- 최근 4회는 5회 기록 중 2~5회만 포함하며 다른 선수와 빈 초안을 제외.
- 요약 응답 수신 → Firebase 저장 → 다른 브라우저 반영 → 복사 성공 흐름은 모의 AI 응답으로 검증.
- 서버의 키 누락, 인증 누락·오류, 4회 초과, 모델 빈 응답 처리와 OpenAI 요청 형식 검증.
- 원본 연구 근거 4편, 다이어리 코칭 질문 4단계, 설명 가이드 이미지, HTML 로컬 링크 확인.
- 390px 모바일 화면에서 가로 넘침 없음. 우측 하단 요약 도구는 모바일에서 접힌 상태로 시작.
- API 키가 제공되지 않아 실제 OpenAI 모델 생성은 미검증. 검증용 Firebase 문서는 삭제.

## 회차 상담 녹음·전사·요약

기존 회차 `note` 아래에 녹음을 붙였습니다. 시작할 때만 마이크 권한을 요청하며 일시정지/재개/종료/취소를 지원합니다. 원문 녹취와 다섯 항목의 요약은 별도로 미리보기합니다. **메모에 삽입**을 누르면 현재 메모 뒤에 날짜가 있는 요약을 추가하고 기존 `write('sessions', id, {note})` 자동저장을 사용합니다. 승인 전 결과는 localStorage/Firestore에 저장하지 않습니다. 전체 녹취는 이번 버전에서 영구 저장하지 않으며, 승인된 요약만 기존 `note`에 남깁니다. 컬렉션/필드 변경은 없습니다.

선수·회차·코치 UID를 시작 시 고정하고 요청과 삽입에서 다시 확인합니다. 변경 시 요청을 취소하고 미리보기와 음성을 폐기합니다. 전사 실패 시 음성을 메모리에 유지해 재시도하고, 전사 성공 시 음성을 폐기합니다. 요약 실패 시 녹취를 유지해 다시 요약합니다. 삽입 후 저장 실패 시 기존 기기 임시저장과 재시도 큐가 메모를 보존합니다. 페이지를 닫거나 새로고침하면 승인 전 초안은 폐기됩니다.

### 실행 및 서버 환경

```sh
python3 -m venv mps-mental/.venv
mps-mental/.venv/bin/pip install -r mps-mental/requirements.txt
# mps-mental/.env.example을 .env로 복사하고 서버에서만 키 설정
mps-mental/.venv/bin/python mps-mental/server.py --port 8787
```

- `OPENAI_API_KEY`: 서버 환경 또는 비공개 `.env`에만 설정합니다.
- `OPENAI_TRANSCRIBE_MODEL`: 기본 `gpt-4o-transcribe`, 한국어 `language='ko'`. 음성 파일은 SDK 업로드만 사용하며 서버 디스크에 기록하지 않습니다.
- `OPENAI_MODEL`: 기본 `gpt-4.1-mini`. Responses API strict JSON Schema, `store=False`를 사용합니다.
- 설치 확인 버전: OpenAI Python 2.48.0, firebase-admin 7.7.0. Python 3.9.6에서 검증했습니다. 운영은 지원되는 Python 런타임을 사용하세요.
- HTTPS 또는 localhost에서 최신 Chrome/Safari를 사용합니다. WebM/Opus 우선, Safari MP4 대체, Ogg 지원입니다. 24MB 또는 45분 이내로 회차 녹음을 나누어 사용합니다. 초과 시 재녹음 안내가 나오므로 긴 상담은 짧게 나눠 진행하세요.

새 API는 기존 서버의 `/mps-mental/api/transcribe`(음성 Blob) 및 `/mps-mental/api/consultation-summary`(JSON 녹취)입니다. 두 요청 모두 Firebase ID token과 `X-Player-ID`, `X-Session-ID`가 필요합니다. 서버는 Admin SDK로 `mpsreserve` 토큰을 검증하고 코치 claim·담당 선수·Firestore 실제 회차의 `playerId`를 확인합니다. 같은 사용자/단계의 빠른 반복 요청은 제한합니다. 기존 최근 4회 API도 같은 코치/선수/회차 권한 검증을 적용했습니다. 새 Functions/새 Firebase 프로젝트는 만들지 않았습니다.

### 운영 전 Firebase 설정 — 필수

현재 `mpsreserve`에는 아래 코치 계정·claim·멘탈 제한 규칙을 적용했습니다. 새 환경이나 새 계정 추가 시 아래 절차를 사용합니다.

1. Firebase Console의 기존 **mpsreserve** Authentication에서 Email/Password를 활성화하고 코치 계정을 생성합니다. 화면의 ‘코치 로그인’에서 해당 계정으로 로그인합니다. 익명 사용자는 녹음 API 및 최근 4회 AI 요청을 사용할 수 없습니다.
2. 신뢰된 Admin 환경에서 코치 UID에 custom claims를 부여합니다. 일반 코치는 `mentalCoach: true`, `mentalAdmin: false`, `mentalPlayerIds: [실제 선수 ID...]`. 전체 관리자는 `mentalCoach: true`, `mentalAdmin: true`. 사용자 문서에 입력한 담당 코치 이름은 권한 근거로 사용하지 않습니다.
   ```sh
   # GOOGLE_APPLICATION_CREDENTIALS는 비공개 경로의 Admin 자격 증명을 가리키도록 환경에서 설정
   mps-mental/.venv/bin/python mps-mental/security/set_coach_claims.py COACH_UID --player PLAYER_ID
   # 관리자만 --admin 사용. 기존 claims는 보존하며 담당 선수 목록은 지정한 목록으로 교체합니다.
   ```
   claim 갱신 후 다시 로그인합니다. custom claims는 Firebase 1,000바이트 제한이 있으므로 많은 선수는 관리자 권한 또는 향후 별도 ACL 설계가 필요합니다. 브라우저의 일반 코치 조회는 담당 선수 목록을 30개씩 나누어 조회합니다. 선수 등록 및 최초 담당 배정은 관리자가 수행합니다.
3. `security/mental-firestore.rules`는 사용자가 제공한 기존 전체 공개 규칙을 바탕으로 작성한 **전체 교체안**입니다. 세 멘탈 컬렉션만 코치 권한으로 제한하고 다른 컬렉션은 기존 공개 접근을 유지합니다. Console의 현재 규칙이 제공된 공개 규칙과 같은 경우 전체 교체할 수 있습니다. 이후 다른 규칙이 추가되었다면 먼저 비교·병합해야 합니다. 공개 catch-all은 멘탈 컬렉션을 제외합니다. 기존 전체 공개 allow를 함께 남기면 멘탈 보호가 무효화됩니다. 이 변경은 멘탈 이외 데이터의 공개 접근을 강화하지 않습니다.
4. Rules Simulator/Emulator로 비로그인·익명·미담당 선수 접근 거절, 코치 담당 선수 조회/저장, 회차 `playerId` 변경 거절을 확인한 후 Console에서 적용합니다. 기존 익명 차팅 접근도 제한되므로 코치 로그인 전 데이터가 표시되지 않는 것이 정상입니다.
5. 기존 데이터와 예약 접근이 유지되는지 확인합니다. 기존 다른 앱에도 같은 mental 컬렉션을 사용하는 페이지가 있다면 코치 로그인/제한 조회를 맞춰야 합니다.

기존 App Check는 없습니다. 이번 버전은 ID token과 서버 권한 검증을 사용하며 App Check를 새로 구성했다고 주장하지 않습니다. 음성과 녹취는 OpenAI로 전송되므로 상담 당사자의 동의를 받은 뒤 시작하고, 운영 계정의 API 데이터 보관 정책도 확인하세요. `store=False`가 모든 공급자 로그의 즉시 삭제를 의미하지는 않습니다.

### 배포

정적 HTML만 Firebase Hosting/Vercel에 올리면 Python API는 동작하지 않습니다. 기존 서버를 HTTPS 뒤에서 실행하고 같은 origin의 `/mps-mental/api/*`를 서버에 연결해야 합니다. 배포 플랫폼은 현재 이 폴더에 연결되어 있지 않으며 Functions/Vercel Console 변경은 수행하지 않았습니다. Vercel 사용 시 별도 서버 서비스에 같은 경로를 프록시하거나 실제 Python 런타임 배포 구성을 마련한 뒤 확인하세요. Admin 서비스 계정 파일은 웹 루트나 저장소에 두지 않습니다. 토큰 서명 검증은 Google 공개 인증서를 사용하지만 Admin SDK Auth 클라이언트 초기화에도 서버의 Application Default Credentials가 필요합니다. Google 환경에서는 서비스 계정 실행 권한을 사용하고, 로컬에서는 비공개 Admin 자격 증명 경로를 `GOOGLE_APPLICATION_CREDENTIALS`로 지정하세요. claim 관리 스크립트도 Admin 자격 증명이 필요합니다.

### 검증

```sh
mps-mental/.venv/bin/python -m unittest discover -s mps-mental/tests -p 'test*.py'
node mps-mental/tests/core.test.mjs
node mps-mental/tests/score-notice.test.mjs
node mps-mental/tests/recording.test.mjs
node --check mps-mental/app.js
node --check mps-mental/recording.js
```

프레임워크 package.json/lint/typecheck/build 명령은 없습니다. 정적 모듈 문법검사와 서버 컴파일/테스트를 사용합니다. `tests/browser_fixture.py`는 127.0.0.1:8790에서만 실행하는 브라우저 검증 서버입니다. 별도 테스트 선수와 메모리 저장소, 가짜 인증/AI 응답을 사용하고 Firebase/OpenAI에 연결하지 않습니다. **운영 서버로 사용하거나 배포하지 마세요.** 실제 `app.js`와 `recording.js`를 실행하되 Firebase import만 테스트 모듈로 교체합니다.

검증 범위: 녹음 UI와 일시정지/재개, 미리보기 후 수동 삽입, 기존 메모 보존, 저장 실패 후 재시도/새로고침 유지, 마이크 거절, 전사·요약 오류/재시도, 선수·회차 전환 및 지연 응답 폐기. 실제 OpenAI 호출/실제 코치 claim/배포된 Rules 검증은 운영 설정 후 별도로 필요합니다. Chromium의 실제 MediaRecorder를 합성 음성 스트림으로 검증할 수 있지만 실제 마이크 하드웨어·모바일 Safari 권한 동작은 기기에서 확인해야 합니다.

API 구현 참고: [OpenAI File transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

브라우저 회귀 테스트 재실행:
```sh
python3 mps-mental/tests/browser_fixture.py
# 다른 터미널
npx --yes --package agent-browser agent-browser --session mental-test open 'http://127.0.0.1:8790/mps-mental/?player=p1#chart'
npx --yes --package agent-browser agent-browser --session mental-test eval --stdin < mps-mental/tests/browser_flow.js
```

## 로그인 첫 화면 및 계정 추가

등록된 사용자만 워크스페이스에 진입합니다. 로그인 ID `admin`은 `config.js`의 `loginAliases`에서 기존 Firebase 이메일 계정에 연결했습니다. 비밀번호는 Firebase Auth에서 검증하며 소스나 `.env`에 저장하지 않습니다. 기존 익명 로그인은 자동 실행하지 않습니다. 로그인 전에는 선수·회차 컬렉션을 조회하거나 기기 캐시를 표시하지 않습니다. 로그아웃 시 녹음과 화면 데이터를 정리하고 로그인 화면으로 돌아갑니다.

추후 아이디 추가: Firebase Authentication에서 이메일·비밀번호 계정을 만든 뒤 `security/set_coach_claims.py UID --admin`으로 전체 관리 권한을 부여하고, `config.js`의 `loginAliases`에 로그인 ID와 이메일을 추가합니다. 이메일 자체로 로그인할 수도 있습니다. 일반 코치의 담당 선수 제한은 기존 `--player` 옵션으로 유지할 수 있습니다.

실제 검증: 관리자 로그인 성공, 새로고침 로그인 유지, 로그아웃 후 차팅 화면 숨김, 비로그인 Firestore 조회 HTTP 403, 관리자 조회 HTTP 200. 규칙 교체 전 원본은 `security/previous-firestore.rules`에 보관했습니다.

## 멘탈 리포트와 관리 선수의 분리

06 멘탈 리포트에서 전체 검사 결과를 별도로 조회합니다. 리포트 선수를 열거나 Excel을 업로드해도 관리 선수로 자동 등록하지 않습니다. MPS인증 멘탈퍼포먼스 → 선수 등록 → 이름 또는 차트번호 검색 → 선택 → 가져오기 → 저장하기 순서로 등록합니다. 없는 선수는 직접 입력합니다. 같은 이름만으로 합치지 않고 리포트 원본 ID로 중복 등록을 확인합니다.

`mental_report_players`는 리포트 전용 선수 목록, `mental_reports`는 검사 회차 원본입니다. 관리 선수는 `mental_players`에 별도로 저장하고 `reportSourcePlayerId`로 연결합니다. 2026mental2의 원본 778건을 777개의 리포트 선수 ID로 이전했습니다. 잘못 자동 등록했던 777건은 비공개 백업 후 사용자 수정·회차·요약이 없는 문서만 제거했고, 기존 관리 선수와 상담 기록을 보존했습니다. 원본 폴더는 수정하지 않았습니다.

음성 전사는 기본적으로 `gpt-4o-transcribe-diarize`로 화자를 구분합니다. 선수·코치 역할은 자동 추측하지 않으며 미리보기에서 코치가 지정하고 다시 요약할 수 있습니다.

등록 흐름 회귀 검증은 새 테스트 서버에서 `tests/enrollment_browser_flow.js`를 agent-browser eval --stdin으로 실행합니다. 차트번호로 동명이인 구분, 가져오기·취소 시 미등록, 명시적 저장, 원본 ID 연결, 중복 등록 방지, 기존 상담 보존의 9개 검증을 포함합니다.

## 선수 상담 스냅샷과 기존 다이어리 연결

선수 차팅 최상단에 연결된 최신 검사 원본의 5대 지표·8대 세부 지표를 3줄 가로 막대로 표시합니다. 평균 선은 같은 성장단계의 검사 기록 집계이며, 표본 수와 비교 불가 상태를 표시합니다. 평균 대비 ±0.30점은 상담 단서를 강조하는 화면 기준이며 임상 절단점이 아닙니다. 기존 리포트의 8개 유형 중 해당 유형과 코칭 단서를 표시하고 5.5점 이상 안내를 유지합니다. 관리자 평균은 Firebase 검사 기록을 실시간 집계하며, 일반 코치는 접근할 수 있는 원본과 이전 시점의 익명 집계 평균을 사용합니다.

다이어리는 기존 `20260916 diary`를 사용합니다. 원본 폴더는 수정하지 않고 mps-mental 안의 기존 복사본에 연결 모듈을 추가했습니다. 차팅의 ‘선수 다이어리 열기’는 고유 선수 ID로 분리된 브라우저 임시 저장소와 `mental_players/{id}.diaryRecords`에 연결합니다. 기존 개인 저장소를 이름만으로 가져오지 않습니다. 예전 기록은 기존 다이어리의 내 설정 → 기록 백업 파일을 받아 차팅의 기존 백업 가져오기에서 선수 이름·차트번호·백업 프로필을 확인한 뒤 연결합니다.

기존 마음(1~5), 작은 시도, 몸, 수면, 부담·피로·운동 자가 체크와 원문을 그대로 보존합니다. 차팅은 최신 3개 기록, 최근 14일 최대 7개 마음 흐름, 반복한 행동, 수면·부담 신호와 다음 상담 질문을 표시합니다. 최근 다이어리 최대 4개는 기존 최근 4회 AI 요약 입력에도 반영합니다. 체크 항목을 검사 점수로 환산하지 않습니다. 연결 페이지는 로그인한 담당 코치 또는 관리자 권한을 확인하며, 선수용 별도 공개 로그인이나 공유 링크를 새로 열지는 않습니다.

최근 4회 AI 요약은 우측 하단에서 기본적으로 접혀 있습니다. 회차의 ‘메모 삭제’는 상담 메모만 비우고 같은 회차의 `noteDeletionHistory`에 원문·삭제 시각·삭제 코치 UID를 남깁니다. 나머지 회차 필드는 보존하며 삭제 이력은 AI 요약 입력에 포함하지 않습니다.

검증: 서버 16개 테스트, Node 6개 테스트 파일, 브라우저 스냅샷·삭제 이력 13개와 기존 다이어리 저장 연결 6개 검증. 브라우저 쓰기 검증은 실제 개인정보를 바꾸지 않는 격리 Firebase 모형으로 수행합니다. 1920×1080과 390px에서 가로 넘침이 없는 것을 확인했습니다. `prepare_diary.py`는 기존 자료를 다시 복사할 때 연결 코드를 유지합니다.

2026-10-03 화면 배치 조정: 회차·상담 기록을 먼저 표시하고 리포트 스냅샷과 최근 다이어리를 하단으로 옮겼습니다. 이름 옆에 최신 검사 기준 성장단계, 뼈나이, 생활나이, 뼈−생활 나이 차이와 성장 유형을 표시합니다. 기존 지연 판정 −6개월 기준에 맞춰 화면 구분을 −6개월 이하 지연성장, +6개월 이상 조기성장, 그 사이 평균성장으로 표시하며, 정보가 없으면 미확인으로 표시합니다. 이는 화면의 성장 속도 구분이며 새 진단 기준으로 제시하지 않습니다. ‘차팅할 선수’ 라벨과 자동 저장 안내 문장, ‘목표는 한 번에 하나만’ 코칭 문구는 제거했으며 선수 선택과 자동 저장 기능은 유지합니다.

## EMR 화면 구성 · 업로드 참고 이미지 반영

상담 기록을 좌측의 넓은 주 작업 영역, 회차 목록을 우측의 282~300px 보조 영역으로 배치했습니다. 상담일·담당자·주제 → 녹음 → 상담 내용 → 관찰·다이어리 회고 → 다음 행동·질문 순서로 작성합니다. 우측 회차 카드에는 날짜·주제·메모 미리보기가 표시되며, 이전 회차의 행동 약속과 질문이 있으면 현재 상담 옆에서 확인합니다. 작은 화면에서는 작성 영역 다음에 회차 목록을 배치합니다.

`emr.css`가 최종 화면 스타일을 담당합니다. 업로드된 EMR 참고 이미지의 흰 바탕, 옅은 회청색, 얇은 전체 테두리, 절제된 파란색 강조를 적용했습니다. 코너는 5px로 유지하며 선택된 회차에 장식용 한쪽 테두리를 사용하지 않습니다. 선수·성장 정보는 상단, 리포트와 최근 다이어리는 하단, AI 요약은 기본 접힌 우측 하단에 유지됩니다.

검증: 1920×1080 화면에서 좌측 작성부/우측 회차 배치와 하단 스냅샷을 확인했고, 390px에서 가로 넘침이 없음을 확인했습니다. `tests/emr_browser_flow.js`의 9개 검증은 긴 메모의 회차 전환 보존, 이전 회차 행동 표시, 자동 저장과 DOM 읽기 순서를 확인합니다. 녹음·전사·삽입·재시도 관련 기존 브라우저 검증 22개와 Node 테스트 6개 파일도 통과했습니다.

### 최신 배치: 메뉴 → 선수 → 회차 → 상담·메모

사용자가 다시 지정한 참고 화면에 맞춰 위의 좌측 작성/우측 회차 배치를 교체했습니다. 1920px에서 메뉴 144px, 관리 선수 목록 218px, 선택 선수의 회차 목록 276px, 나머지는 상담·메모 영역입니다. 선수 이름·차트번호 검색으로 관리 선수를 선택하며, 회차 목록은 해당 선수만 최신순으로 표시합니다. 회차를 클릭하면 메모 미리보기가 아래로 펼쳐지고, 우측 상담 이력에서도 제목을 눌러 전체 입력 영역을 펼치거나 접습니다. 동일 선수와 회차 ID를 사용하므로 기존 저장 자료의 이관은 없습니다.

새 검증 `tests/columns_browser_flow.js`에서 4열 순서, 최신순, 차트번호 검색, 선수별 회차 분리, 회차/상담 접기·펼치기, 전환 시 메모 보존, 자동 저장 등 12개 검증을 통과했습니다. 녹음 관련 기존 22개 브라우저 검증도 통과했습니다.

## 2026-10-05 코치 UX 개편

`coach-ux.css`는 `2026mental2/index.html`의 크림·세이지·테라코타 색상과 카드 디자인을 워크스페이스에 적용합니다. 선수 선택 시 상담 준비(지난 약속·지표·다이어리), 새 상담/회차 선택 시 기록, 다음 행동 입력 시 마무리로 전환합니다. 세부 관찰은 선택 펼침 영역입니다. 마무리는 기존 자동 저장을 확인하는 동작이며 별도 완료 상태를 데이터에 추가하지 않습니다. 저장 실패·대기 시 성공 메시지를 표시하지 않습니다. 1100px 이하에서는 선수 선택 상자를 사용하고, 모바일 회차 목록은 가로로 탐색합니다.

검증: 격리된 8790 테스트 서버에서 `tests/coaching_ux_browser_flow.js`로 단계 전환·실제 테스트 저장소 반영·저장 실패·선수 전환·가로 넘침을 확인했습니다. 실제 Firebase 및 음성/AI 서비스 호출 검증은 이번 UI 변경에 포함하지 않았습니다.

## 회차 상담 삭제

상담 기록의 ‘회차 상담 삭제’를 누르면 선수·회차·상담일을 표시한 ‘삭제하시겠습니까?’ 대화상자가 열립니다. ‘삭제취소’ 또는 Esc는 변경 없이 닫습니다. ‘삭제’는 담당 코치 권한을 다시 확인하고 기존 자동저장 경로로 `deletedAt`·`deletedBy`를 기록합니다. 원본 문서를 보존하는 논리 삭제이며, 삭제 회차는 목록·회차 수·다이어리 회고·최근 4회 요약 입력에서 제외됩니다. 마지막 회차 삭제 시 준비 화면으로 이동합니다. 저장 실패 시 기존 대기 큐와 재시도를 사용합니다.

격리 테스트: `tests/session_delete_browser_flow.js`에서 확인·취소·삭제·저장·타 선수 격리·마지막 회차 삭제를 검증합니다.

## 회차 완료 표시

‘상담 마무리’는 회차에 `completedAt`·`completedBy`를 저장합니다. 해당 변경의 서버 저장이 확인되면 회차 목록 오른쪽에 작은 초록 원(상담 마무리 완료)을 표시합니다. 저장 실패·대기 중에는 새 완료 표시를 보이지 않으며, 재시도 성공 후 표시합니다. 새로고침 후 유지되고 기존 회차는 자동으로 완료 처리하지 않습니다. 완료 후 메모 수정은 완료 상태를 유지합니다. `tests/session_completion_browser_flow.js`로 저장 실패/재시도·회차 격리·빈 회차 차단을 검증합니다.
