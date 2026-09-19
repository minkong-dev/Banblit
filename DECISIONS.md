# DECISIONS

2026-09-19 완성도 점검에서 나온 결정 14건을 기록합니다. `AUDIT.md` 는 무엇이 잘못돼 있는지를
세는 문서이고, 이 문서는 그 항목을 **어떻게 처리하기로 결정했는지**를 기록합니다.

구현이 끝난 항목은 "상태" 열에 완료와 날짜를 적습니다.

---

## 1단계 — 배포를 막는 3건

### 1-1. 첨부 파일 상한

**결정: 파일 1개 300MB, 글 1개 첨부 합계 300MB. 계정 누적 상한은 두지 않습니다.**

| 축 | 값 | 이전 |
|---|---|---|
| 파일 1개 | 300MB | 300MB(변경 없음) |
| 글 1개 첨부 합계 | 300MB | 없음 |
| 계정 누적 합계 | 없음 | 없음 |

파일 1개 상한(`frontend/nginx.conf.template:50` 의 `client_max_body_size 300m`)은 그대로 둡니다.
글 1개 합계 상한을 신규로 추가해, 같은 글에 300MB 파일을 여러 개 붙이는 경로를 차단합니다.

| 항목 | 내용 |
|---|---|
| 수정 대상 | `backend/src/backend/services/attachment_service.py` |
| 검증 방법 | 합계 초과 시 422 를 반환하는 테스트를 먼저 작성합니다 |
| 상태 | 완료 (2026-09-19). `MAX_POST_BYTES` 추가, `_write_stream` 이 limit 초과 시 복사를 중단합니다 |

**리뷰에서 발견한 결함 1건을 추가로 수정했습니다.** `python-reviewer` 20/21(95%),
`security-reviewer` 11/12(92%) 가 같은 항목을 지적했습니다.

합계를 조회한 뒤 commit 하기 전에 잠금이 없어, 같은 글에 동시에 들어온 업로드 2건이 서로의
commit 전 합계를 읽고 각자 300MB 를 배정받았습니다. 상한이 요청 수만큼 배로 늘어나 이번 수정이
막으려던 디스크 고갈을 그대로 재현할 수 있었습니다. 합계 조회 전에 `Post` 행을
`with_for_update()` 로 잠그도록 수정했습니다. 같은 방식을 `reservation_service.py` 가
이미 사용하고 있습니다.

`test_a_concurrent_upload_cannot_pass_the_total_size` 가 검증합니다. session 2개로 잠금 상황을
재현하고, 마지막에 합계가 상한을 넘지 않는지 확인합니다.

수정하지 않은 항목 2건입니다. 0바이트 파일은 이미 상한을 넘긴 글에도 저장됩니다(LOW, 디스크를
차지하지 않습니다). `_write_stream` 의 docstring 이 절약 범위를 실제보다 넓게 읽힐 수
있습니다(LOW, 동작에 영향 없습니다).

### 1-2. 백업 복구 절차

**결정: 절차를 작성하고 실제 복구를 1회 시험합니다.**

**전제 정정.** 절차가 없다고 보고했으나 `COMMAND.md` 11-5 "백업으로 복원하기" 에 이미 있었습니다.
검색어를 "복구" 로만 사용해 "복원" 으로 적힌 절을 찾지 못했습니다. 시험 결과 그 절차에 결함이
2건 있어 교정했습니다.

| 결함 | 내용 |
|---|---|
| volume 이름 | `-v banblit-attachments` 로 적혀 있는데 실제 이름은 `banblit_banblit-attachments` 입니다. compose 가 프로젝트 이름을 앞에 붙입니다. 짧은 이름으로 실행하면 docker 가 빈 volume 을 새로 생성해 거기에 압축을 풉니다. 명령은 성공으로 끝나는데 첨부는 복원되지 않습니다 |
| 오류 감지 | `psql` 에 `-v ON_ERROR_STOP=1` 이 없어, 중간 구문이 실패해도 종료 코드 0 으로 끝납니다 |

`.gitignore` 에 `backups/` 를 추가했습니다. `docker-compose.yml` 의 `BACKUP_DIR` 기본값이
`./backups` 라서, `.env` 에 값이 없으면 DB 전체와 첨부가 저장소 안에 생성됩니다.

| 항목 | 내용 |
|---|---|
| 수정 대상 | `COMMAND.md` 11-5, `.gitignore` |
| 검증 방법 | dev 에 마커 행 1개와 첨부 파일 1개를 넣고 백업한 뒤 둘 다 삭제하고 복원했습니다 |
| 상태 | 완료 (2026-09-19). DB 와 첨부 양쪽이 돌아오는 것을 확인했습니다 |

### 1-3. 화면 오류 처리

**결정: ErrorBoundary 와 catch-all route 를 둘 다 지금 추가합니다.**

| 대상 | 현재 동작 | 변경 후 |
|---|---|---|
| 렌더링 중 error | React 가 전체 트리를 unmount 해 빈 화면을 표시 | ErrorBoundary 가 오류 화면을 표시 |
| 등록되지 않은 주소 | `<Routes>` 가 아무것도 렌더링하지 않아 빈 화면 | 404 화면을 표시 |

| 항목 | 내용 |
|---|---|
| 수정 대상 | `components/ErrorBoundary.tsx`, `routes/NotFound.tsx`, `lib/fallback.ts`, `styles/fallback.css` (신규 4개), `App.tsx`, `main.tsx` |
| 검증 방법 | `lib/fallback.test.ts` 7건, E2E `account.spec.ts` 의 "등록되지 않은 주소는 없는 주소 화면을 표시한다" |
| 상태 | 완료 (2026-09-19) |

두 화면은 `body[data-shell]` 에 의존하지 않습니다. ErrorBoundary 가 잡는 error 는 `AppShell` 안에서도
발생할 수 있어, 대체 화면이 그 CSS 를 전제하면 대체 화면마저 표시하지 못합니다. `shell.css` 의
`min-width: 1060px` 도 상속하지 않습니다. 오류 화면이 좁은 화면에서 잘리면 안내와 버튼에 도달할 수 없습니다.

색·글꼴·모서리·그림자는 기존 토큰만 사용합니다. 새 색을 정의하지 않았습니다.

---

## 2단계 — 데이터 정합성

### 2-1. 동시 수정 충돌

**결정: 보류합니다. 이 항목을 다시 선택지로 제시하지 않습니다.**

같은 글 또는 프로필을 두 사용자가 동시에 수정할 경우, 후행 저장 요청이 선행 수정 내용을
덮어씁니다. optimistic locking(읽은 시점의 값을 함께 전송해 서버에서 대조하는 방식)은
`posts` 에 `updated_at` 열과 migration 이 필요합니다. 구현하지 않습니다.

| 항목 | 내용 |
|---|---|
| 대상 | `PostBoard.tsx`, `SettingsAccount.tsx:40` |
| 상태 | 보류 확정 (2026-09-19) |

### 2-2. 팀 자리 저장의 부분 반영

**결정: 일괄 저장 endpoint 를 추가합니다.**

`Teams.tsx` 의 `writeSeats` 는 `getJSON` 으로 DELETE 를 slot 개수만큼, PUT 을 slot 개수만큼
순차 호출합니다. 중간 요청이 실패할 경우 앞선 요청의 결과만 DB 에 반영된 상태로 종료됩니다.

`PUT /teams/{team_id}/slots` 하나로 좌석 배열 전체를 수신해 transaction 1개로 처리합니다.
실패 시 전체가 rollback 되므로 부분 반영 상태가 발생하지 않습니다.

| 항목 | 내용 |
|---|---|
| 수정 대상 | `api/routers/roster.py`, `api/schemas.py`, `services/roster_service.py`, `lib/roster.ts`, `routes/Teams.tsx`, `.cluedoc/teams/README.md` |
| 검증 방법 | `test_roster_endpoints.py` 6건, `lib/roster.test.ts` 2건, E2E 22건 |
| 상태 | 완료 (2026-09-19) |

endpoint 는 `PUT /teams/{team_id}/slot-members` 입니다. 변경된 자리의 최종 상태만 목록으로 받습니다.

**구현 중에 제약 1건이 드러났습니다.** `team_slots` 에 `(team_id, member_id)` unique 제약이 있고
deferrable 이 아니라, 해제와 배정이 같은 flush 에 섞이면 두 사람의 자리를 맞바꿀 때 한쪽이 두 자리를
차지하는 순간이 생겨 DB 가 409 로 거절합니다. `assign_slot_members` 가 변경 대상의 배정을 전부 해제하고
flush 한 뒤 배정합니다. `test_bulk_slot_members_can_swap_two_people` 이 검증합니다.

권한은 항목마다 판단합니다. 배정은 `member_add`, 다른 사람의 해제는 `member_remove`, 자신의 해제는
권한이 필요하지 않습니다. 자리마다 보내던 endpoint 2개와 같은 규칙입니다.

`lib/roster.ts` 의 `seatChanges` 와 그 테스트 2건을 삭제했습니다. `seatAssignments` 로 대체되어
테스트에서만 호출되는 죽은 코드가 됐습니다.

## 3단계 — 기능 범위

### 3-1. 합주실 삭제

**결정: `room_delete` 권한 항목과 삭제 endpoint, 설정 화면 버튼을 추가합니다.**

팀과 기간에는 `team_delete`·`period_delete` 가 있는데 합주실만 없습니다.

**확인이 필요한 부작용이 있습니다.** `rooms.id` 를 참조하는 4개 열의 동작이 서로 다릅니다.

| 참조하는 table | `ondelete` | 합주실 삭제 시 |
|---|---|---|
| `assignments` | CASCADE | 그 합주실의 배정기록이 함께 삭제됩니다 |
| `reservations` | CASCADE | 그 합주실의 예약이 함께 삭제됩니다 |
| `assignment_backups` | CASCADE | 그 합주실의 배정기록 백업이 함께 삭제됩니다 |
| `settings.ensemble_room_id` | 지정 없음 | 합주 지정 합주실이면 삭제가 거부됩니다 |

| 항목 | 내용 |
|---|---|
| 수정 대상 | `db/models.py`, migration `7e1a4c93d6f0`, `api/routers/rooms.py`, `api/schemas.py`, `services/room_service.py`, `lib/contract.ts`, `lib/account.ts`, `lib/confirm.ts`, `routes/Settings.tsx` |
| 검증 방법 | `test_room_endpoints.py` 5건, `lib/confirm.test.ts` 2건, `lib/account.test.ts` |
| 상태 | 완료 (2026-09-19) |

**권한 항목 추가에 따라오는 것이 2가지 있었습니다.** `permission_sets.permissions` 의 CHECK 제약이
허용 이름을 열거하므로 migration 이 필요하고, 그 migration 이 기존 20개를 전부 가진 set 에
`room_delete` 를 함께 추가해야 합니다. 추가하지 않으면 그 set 이 "모든 항목을 가진 set" 판정에서
빠져 헤드매니저가 권한을 부여하지 못하고, 마지막 full set 을 지키는 검사도 대상이 0개가 됩니다.

`PermissionSetIn.permissions` 의 상한이 20으로 적혀 있어 21개를 선택한 요청이 422 로 거절됐습니다.
`len(PERMISSIONS)` 에서 유도하도록 변경했습니다.

### 3-2. 알림 누적

**결정: 읽음 처리 시 알림 행을 삭제합니다. 보관 기간과 조회 개수 상한은 두지 않습니다.**

현재 `mark_all_read` 는 `read_at` 에 시각을 설정할 뿐 행을 삭제하지 않습니다. 이것을 DELETE 로
변경하면 읽지 않은 알림만 table 에 남으므로 누적이 발생하지 않습니다.

`read_at` 열은 언제나 null 이 되므로 사용되지 않습니다. 열 제거 여부는 구현 시 판단합니다.

**게시판 목록 상한도 두지 않습니다.** 같은 지시를 적용합니다.

| 항목 | 내용 |
|---|---|
| 수정 대상 | `backend/src/backend/services/notification_service.py` |
| 검증 방법 | 읽음 처리 후 행 수가 0이 되는지 확인하는 테스트를 먼저 작성합니다 |
| 상태 | 미착수 |

### 3-3. 점유 단위 6분

**결정: DB CHECK 에서 6 을 제거합니다.**

`models.py:116` 의 `slot_minutes BETWEEN 5 AND 60 AND 60 % slot_minutes = 0` 은 6 을 허용하고,
`schemas.py:493` 과 `settings.ts:15` 는 거부합니다. DB 조건을 5·10·12·15·20·30·60 목록으로
교체해 3곳을 일치시킵니다.

| 항목 | 내용 |
|---|---|
| 수정 대상 | `backend/src/backend/db/models.py`, migration 1건 |
| 상태 | 미착수 |


## 4단계 — 화면 lint·표기

### 4-1. lint 7건

**결정: 7곳에 `eslint-disable-next-line` 과 이유 주석을 추가합니다. 코드는 수정하지 않습니다.**

7건 전부 실제 접근성 문제가 아니라 eslint 가 의도한 동작을 위반으로 판정한 경우입니다.

| 파일 | 줄 | 규칙 | 실제 동작 |
|---|---|---|---|
| `components/MemberSearch.tsx` | 59 | `no-autofocus` | 검색 컴포넌트가 열릴 때 초점을 이동합니다 |
| `components/PostBoard.tsx` | 539 | `no-autofocus` | 글 수정 모달이 열릴 때 초점을 이동합니다 |
| `routes/SettingsMembers.tsx` | 110 | `no-autofocus` | 권한 편집 모달이 열릴 때 초점을 이동합니다 |
| `routes/Teams.tsx` | 273 | `no-autofocus` | 팀 편집 form 이 열릴 때 초점을 이동합니다 |
| `routes/Landing.tsx` | 104 | `click-events-have-key-events` | 링크를 눌렀을 때 popover 를 닫습니다 |
| `routes/Landing.tsx` | 104 | `no-noninteractive-element-interactions` | 위와 같은 줄입니다 |
| `routes/Account.tsx` | 140 | `label-has-associated-control` | `CheckMark` 컴포넌트 안에 input 이 있습니다 |

초점 이동 방식이 `autoFocus` 와 `SettingsForm.tsx` 의 `useFirstField` 2가지로 남습니다.
통일은 구조 작업에서 처리합니다.

| 항목 | 내용 |
|---|---|
| 상태 | 완료 (2026-09-19). lint 0건 확인 |

### 4-2. 기수 값이 없을 때의 표기

**결정: `-` 를 표시합니다.**

값이 없는 것과 표시가 누락된 것을 구별할 수 있고, 표 형태의 목록에서 열 정렬이 유지됩니다.

| 항목 | 내용 |
|---|---|
| 수정 대상 | 기수를 표시하는 화면 전체 |
| 상태 | 미착수 |

### 4-3. 합주실 삭제의 부작용 처리

**결정: CASCADE 를 그대로 두고 확인 dialog 를 1회 표시합니다.**

문구는 개발자님이 지정한 그대로 사용합니다.

> 기록이 있을경우 예약과 배정안, 이전 배정기록이 모두 삭제돼요. 정말 삭제할까요?

| 항목 | 내용 |
|---|---|
| 수정 대상 | `frontend/src/routes/Settings.tsx`, `frontend/src/lib/confirm.ts` |
| 상태 | 미착수 |


## 5단계 — 운영 체계

### 5-1. 장애 감지

**결정: 외부 감시 서비스를 연결합니다.**

서버 안에 검사를 두면 서버 전체가 정지했을 때 검사도 함께 정지해 알림이 발송되지 않습니다.
외부 서비스가 `https://<도메인>/api/health` 를 주기적으로 호출하고, 응답이 없거나 503 일 때
알림을 발송합니다. `/health` 는 DB 연결을 검사해 실패 시 503 을 반환합니다(`api/app.py:87`).

| 항목 | 내용 |
|---|---|
| 코드 수정 | 없습니다. 서비스 가입과 주소 등록만 필요합니다 |
| 문서 | `.cluedoc/deployment/README.md` 에 감시 주소와 알림 수신처를 기록합니다 |
| 상태 | 미착수 |

### 5-2. 자동 검사

**결정: GitHub Actions 를 추가합니다.**

push 마다 pytest, mypy, 화면 테스트, 화면 lint 를 실행하고 실패 시 알림을 발송합니다.

| 항목 | 내용 |
|---|---|
| 수정 대상 | `.github/workflows/` 신규 파일 |
| 실행 방식 | 6장의 제약에 따라 컨테이너 안에서 실행합니다 |
| 상태 | 미착수 |

### 5-3. 휴대폰 화면

**결정: 지금 대응합니다.**

`board.css`, `teams.css`, `assignment.css` 3개에 `@media` 규칙이 0개입니다. grid 가
`minmax(0, 1fr)` 이라 layout 이 깨지지는 않으나, 7열 달력(`assignment.css:16`)과 좌석 표가
좁은 화면에서 읽히는지 확인되지 않았습니다.

화면 작업이므로 6장의 제약에 따라 `example-skills:frontend-design` 스킬로 진행합니다.

| 항목 | 내용 |
|---|---|
| 수정 대상 | `frontend/src/styles/board.css`, `teams.css`, `assignment.css` |
| 상태 | 미착수 |


## 6단계 — 구조 작업 착수 시점

**결정: 1~5단계 수정과 함께 진행합니다.** 같은 파일을 수정할 때 구조 작업도 같이 처리합니다.

`refactoring` 스킬로 진행합니다(`CLAUDE.md` 2-1). 대상은 `AUDIT.md` 2-1·2-2·2-3·2-5 입니다.

| 대상 | 내용 |
|---|---|
| 대형 파일 3개 | `PostBoard.tsx` 807줄, `Settings.tsx` 710줄, `Teams.tsx` 562줄 |
| 중복 코드 | 12종류. `window.confirm` 직접 호출 3곳, `MINUTES_PER_HOUR` 4곳 등 |
| 라우터의 DB 직접 쓰기 | `routers/auth.py`, `routers/boards.py`, `routers/roster.py` |
| 접근성 | `Field.tsx` 의 오류 읽기, `Tabs` 의 화살표 키, 닫힌 popover 의 초점 |
| 초점 이동 방식 통일 | `autoFocus` 4곳과 `useFirstField` 1곳이 공존합니다(4-1) |

---

## 진행 순서

**결정: 배포를 막는 3건부터 진행합니다.**

| 순서 | 항목 | 결정 번호 |
|---|---|---|
| 1 | 첨부 상한 (글 1개 합계 300MB) | 1-1 |
| 2 | 백업 복구 절차 작성과 시험 | 1-2 |
| 3 | 화면 오류 처리 (ErrorBoundary, catch-all route) | 1-3 |
| 4 | 팀 자리 일괄 저장 endpoint | 2-2 |
| 5 | 합주실 삭제 (`room_delete`, 확인 dialog) | 3-1, 4-3 |
| 6 | 알림 읽음 시 행 삭제 | 3-2 |
| 7 | 점유 단위 6분을 DB 에서 제거 | 3-3 |
| 8 | 기수 없을 때 `-` 표시 | 4-2 |
| 9 | 휴대폰 화면 3개 | 5-3 |
| 10 | GitHub Actions | 5-2 |
| 11 | 외부 감시 서비스 연결 | 5-1 |

각 항목을 수정할 때 그 파일의 구조 작업(6단계)을 같이 처리합니다.

## 완료된 항목

| 항목 | 결정 번호 | 날짜 |
|---|---|---|
| lint 7곳에 예외 주석 추가 | 4-1 | 2026-09-19 |
| 첨부 상한 (글 1개 합계 300MB) | 1-1 | 2026-09-19 |
| 백업 복원 절차 교정과 시험 | 1-2 | 2026-09-19 |
| ErrorBoundary 와 404 화면 | 1-3 | 2026-09-19 |
| 팀 자리 일괄 저장 endpoint | 2-2 | 2026-09-19 |
| 합주실 삭제 (room_delete 권한, endpoint, 확인 dialog) | 3-1, 4-3 | 2026-09-19 |
| E2E 22건 실행 (전부 통과) | — | 2026-09-19 |

