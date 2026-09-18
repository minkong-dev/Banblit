# AUDIT — 전수조사 결과

> 임시 문서다. 승인과 수정이 끝나면 trash/ 로 옮긴다.
> 검사 시각 2026-09-16 · 대상 backend/src(7,295줄)·frontend/src(12,083줄)·저장소 바깥 자산
> · 리뷰어가 찾은 위반 87건 · 러너가 남긴 질문 363건

## 용어

| 말 | 뜻 |
|---|---|
| 리뷰어 | 규칙(`refactoring` 스킬)을 아는 사람의 눈으로 위반을 찾는 검사자. 모듈별 4명 |
| 러너 | 코딩을 갓 배운 신입의 눈으로 "모르겠는 것"을 적는 검사자. 서버·화면 각 1명 |
| 겹치는 자리 | 규칙에도 걸리고 배우는 사람도 못 읽는 곳. 가장 먼저 고칠 곳 |
| 죽은 코드 | 정의됐으나 저장소 어디에서도 호출·참조되지 않는 것 |

---

## 0. 이미 처리한 것 (사용자 지시, 2026-09-16)

| 항목 | 처리 |
|---|---|
| 죽은 의존성 `@tiptap/extension-link` | 삭제. StarterKit 이 전이 의존성으로 이미 담고 있고 소스는 `StarterKit.configure({link})` 만 사용 |
| 이미지 자산 22MB | 원본 16장을 `frontend/images-src/` 로 이동(보관, 빌드 제외). `public/images` 에는 WebP 7장 + 미리보기 JPG 1장, 합계 **1.3MB**(89% 감소) |
| `og:image` | `in_six_strings.jpg` → `preview.jpg`(1200x630). 카카오톡·페이스북 크롤러가 WebP 를 읽지 못할 수 있어 JPG 로 유지 |
| 루트 임시 스크린샷 3장, `trash/head-compare;C` | 사용자가 직접 삭제 |

미결: 마이그레이션 36개 → 첫 배포용 1개 통합 (진행 예정)

---

## 1. 즉시 고쳐야 하는 것 — 오류 없이 잘못된 결과를 내보내는 것

배포 환경에서만 드러나거나, 사용자가 알아채지 못한 채 틀린 값을 받는 항목이다.

| # | 위치 | 무엇이 잘못되었는가 | 그대로 두면 |
|---|---|---|---|
| **1-1** | `api/rate_limit.py:359-371` `caller_of` | X-Forwarded-For 의 **맨 뒤** 값을 요청자로 사용한다. 배포 경로는 Caddy → nginx → api 로 reverse proxy 가 2개라 맨 뒤 값이 언제나 Caddy 컨테이너 IP 다 | 모든 사용자가 같은 rate limit 을 공유한다. 로그인이 서비스 전체 합산 5분당 10회, 메일이 1시간당 5회가 되어 정상 사용자가 429 를 받는다 |
| **1-2** | `api/schemas.py:474-475, 517-518, 523-524, 455-456` | 시각 타입이 `datetime` 이라 pydantic 이 `+09:00` 이 붙은 값을 통과시킨다. tzinfo 를 거부하는 코드는 `scheduling/interval.py:18` 하나뿐이고 예약·불가능시간 경로는 거치지 않는다 | offset 이 조용히 삭제되어 9시간 어긋난 예약이 오류 없이 생성된다. 프로젝트 제약("시각에 시간대를 붙이지 않는다")을 서버가 강제하지 않는 상태다 |
| **1-3** | `routes/SettingsBlinded.tsx:31-32` | 블라인드 해제 후 `["notices"]`·`["posts"]` 를 무효화하는데, 게시판 목록의 실제 queryKey 는 `["board", listPath]` 다. 그 이름의 query 는 저장소에 없다 | **블라인드를 해제해도 원래 게시판 목록에 글이 다시 나타나지 않는다** |
| **1-4** | `lib/calendar.ts:80-96` `takenGrid`·`isRangeFree` | 점유 판정만 한 시간 칸으로 고정되어 있다(`slotMinutes` 매개변수 자체가 없다). 서버·DB 는 반열린 구간 겹침으로 판정한다 | 점유 단위 30분에서 18:00–18:30 예약 1건이 18:00–19:00 전체를 막아, 비어 있는 18:30–19:00 을 예약할 수 없다 |
| **1-5** | `lib/settings.ts:131` `capacity()` | `slotsBetween()` 을 세 번째 인자 없이 호출해 언제나 60분으로 계산한다 | 점유 단위 30분이면 설정 화면의 "하루/전체/팀당/남는 자리" 숫자가 실제의 절반으로 표시된다 |
| **1-6** | `lib/jobs.ts:19` vs `scheduling/resolution.py:11` | 화면 상한 60초, 서버 상한 300초 | 계산이 61초를 넘기면 화면은 실패 문구를 표시하고 서버는 계속 계산해 저장한다. 사용자는 실패한 배정이 나중에 반영되는 것을 본다 |
| **1-7** | `services/auth_service.py:130-137` `update_profile` | 이 함수만 `commit_translating` 없이 `session.commit()` 을 직접 호출한다 | 이름·기수를 다른 사람과 같게 수정하면 409 "다른 데이터가 참조하고 있어 처리할 수 없습니다" 가 나온다. 실제 원인("이미 가입된 사람입니다")과 전혀 다른 문구다 |
| **1-8** | `routes/Scheduler.tsx:172` | 오류를 `reason(error)` 가 아니라 `String()` 으로 출력한다 | 합주실 조회만 실패하면 "스케줄을 불러오지 못했어요**null**" 이 표시된다 |
| **1-9** | `routes/DayDialog.tsx:144, 178` | "요청이 많아 지연되고 있어요" 인데 실제 조건은 **합주실이 0개**다 | 합주실을 등록하지 않은 상태에서 예약을 누르면 "잠시 후 다시 시도" 를 안내받고 영원히 예약할 수 없다 |
| **1-10** | `api/job_runner.py:243-247` | `future.set_result()` 가 `finished_at` 설정보다 **먼저** 실행된다 | 그 사이 조회가 들어오면 `status="done"` 인데 `finished_at=None` 인 응답이 나간다 |

### 1-11. 팀 병합 기준이 이름과 번호로 갈렸다 (겹치는 자리)

`db/schedule_store.py:28-48` `merge_runs` 는 `team_id`·`room_id`(번호)로, `lib/slots.ts:13-31` `mergeSessions` 는 이름 문자열로 동일성을 판정한다. `lib/dayEntries.ts:90-93` 이 이미 갖고 있는 번호를 버리고 이름만 남긴다.

같은 이름의 팀 2개가 같은 합주실에서 18–19시, 19–20시를 각각 배정받으면 **화면은 18–20시 한 건으로 병합해 표시하고 서버는 2건으로 저장한다.** 프로젝트 제약("사람은 이름이 아니라 번호로 구분한다")과 `slots.ts:39` 자기 주석이 동시에 어긋난다.

---

## 2. 리뷰어가 찾은 위반 — 구조

### 2-1. 대형 파일 3개의 절단선

| 파일 | 줄 | 들고 있는 것 | 자를 곳 |
|---|---|---|---|
| `components/PostBoard.tsx` | 807 | 목록·상세·댓글·첨부·권한버튼·**작성 form** 6개 책임 | `PostWriteForm.tsx`(109–282) `PostAttachments.tsx`(340–408) `PostActions.tsx`(410–550) `PostComments.tsx`(284–335, 552–635). 남는 것 약 200줄 |
| `routes/Settings.tsx` | 708 | 탭 5개는 이미 별도 파일인데 합주실(288줄)·기간(353줄)만 남아 있다 | `SettingsRooms.tsx` `SettingsPeriods.tsx` `SettingsReadout.tsx`. 남는 것 약 130줄 |
| `routes/Teams.tsx` | 562 | JSX 없는 서버 쓰기 함수 3개(216–254)가 화면 파일 안에 있다 | `lib/teams.ts`(216–254) `routes/TeamForm.tsx`(256–437). 남는 것 약 200줄 |

### 2-2. 같은 것이 여러 곳에 복사되어 있다

| 대상 | 벌 수 | 위치 |
|---|---|---|
| 팀 소속 확인·합주실 조회·팀 조회·"그런 기간이 없습니다" | 최대 4벌 | `board_service.py:20` ↔ `reservation_service.py:32` 등 |
| 로딩/오류/빈목록 3단 사다리 | 9곳 | `lib/loading.ts` 의 `loadState`·`stateText` 가 이미 있는데 3곳만 쓴다 |
| modal 아래 "취소/저장" 버튼 줄 | 4곳 | `SettingsForm.tsx` 의 `FormTail` 이 같은 일을 하나 form 전용이다 |
| 초점 복원 훅 | 2벌 | `PostBoard.tsx:38-73` ↔ `SettingsForm.tsx:13-43` |
| `invalidateQueries` key 목록 | 5곳 | `Teams.tsx`·`SettingsMembers.tsx` 가 같은 묶음을 손으로 나열 |
| 좌석 목록 UI | 2벌 | `Teams.tsx:166-208` `Lineup` ↔ `304-327` `SeatRows` |
| 토스트 표시 | 2벌 | `AppShell.tsx:103-105` ↔ `Account.tsx:79`. CSS 도 두 벌 |
| 확인 dialog | 2방식 | `lib/confirm.ts` 를 쓰는 8곳 ↔ `window.confirm` 직접 3곳. **같은 파일 안에서 갈렸다**(PostBoard 600 vs 439·480) |
| `Date → YYYY-MM-DD` | 3곳 | `calendar.ts:160` `dayEntries.ts:159` `SchedulerViews.tsx:34` |
| `endLabel` 계산 | 3곳 | `slotLabels` 를 export 해 두었는데 두 곳이 다시 쓴다 |
| `MINUTES_PER_HOUR = 60` | 4곳 | `calendar.ts` `slots.ts` `assignment.ts` `settings.ts` |
| 점유 단위 허용 집합 | 3곳 | DB CHECK 는 `{5,6,10,12,15,20,30,60}`, API·화면은 6 을 뺀 7개 |

### 2-3. 라우터가 도메인 판단과 DB 쓰기를 직접 한다

`routers/auth.py:182-183`(탈퇴 전체), `routers/roster.py:228-236`(조회·검증·권한 확인 4가지), `routers/boards.py:342-345`(첨부·글 삭제 **순서** 규칙). 대응 서비스가 이미 있어 옮길 자리가 있다.

### 2-4. 성능

| 대상 | 내용 | 판단 |
|---|---|---|
| `assignments`·`assignment_backups` index | `period_id`(+`saved_at`)로 조회·삭제하는데 index 가 없다. PostgreSQL 은 외래 키에 index 를 자동 생성하지 않는다. 배정 저장 1회가 두 table 을 4회 seq scan 한다 | **해당함** — index 2개 추가로 끝난다 |
| 게시판·알림 목록 상한 | `LIMIT` 도 cursor 도 없이 전 행을 반환한다. 알림은 배정 1회마다 전원에게 1행씩 생성되고 삭제 경로가 없어 단조 증가한다 | **해당함** — 같은 저장소 `list_members` 에 cursor 방식 전례가 있다 |
| `Scheduler.tsx:116-131` | 달력 집계 4개 + 정렬에 `useMemo` 가 없다. 탭 변경·주 이동·시각 선택마다 한 달치를 다시 계산한다 | **해당함** — 같은 저장소 `Assignment.tsx:121-145` 는 전부 `useMemo` 다. 두 화면의 기준이 다르다 |
| 나머지 index 6곳, `permission_service.py:152-156` | 행 수가 멤버 수에 묶여 상한이 있다 | **과함** — 위 index 작업에 얹는 정도 |

### 2-5. 접근성

| # | 위치 | 내용 |
|---|---|---|
| a | `AppShell.tsx:176`, `NotificationMenu.tsx:77` | 닫힌 popover 가 `opacity:0` 뿐이라 DOM·초점 순서에 남는다. 키보드 Tab 이 보이지 않는 "로그아웃" 버튼으로 이동한다 |
| b | `components/Field.tsx:48, 62` | `aria-describedby` 와 `role="alert"` 가 없다. 계정 5개 화면이 전부 이 컴포넌트를 쓴다. 스크린 리더가 "잘못됨" 만 읽고 무엇이 잘못됐는지 읽지 않는다 |
| c | `AppShell.tsx:115-132` `Tabs` | `role="tablist"` 를 선언했으나 화살표 키 이동·`aria-controls`·`tabpanel` 이 없다. 4개 화면이 쓴다 |
| d | `components/Modal.tsx:47` | X 버튼은 `close()` 를 부르고 취소·저장 버튼은 언마운트만 한다. 저장 후 초점이 `<body>` 로 떨어진다 |
| e | `SchedulerViews.tsx:101-110` | `aria-label` 이 버튼 이름을 날짜로 **대체**해 "예약 가능"·항목 3개가 전달되지 않는다. 마감된 날은 `disabled` 라 초점조차 못 간다 |
| f | `SettingsMembers.tsx:409-421` 외 2곳 | `<th>` 만 `aria-hidden` 이고 `<td>` 는 그대로라 열 수가 어긋난다 |

### 2-6. 죽은 코드·쓰레기 코드

**`console.log`·`print`·TODO·FIXME·주석 처리된 죽은 코드·쓰이지 않는 import 는 서버·화면 통틀어 0건이다.**

| 대상 | 위치 |
|---|---|
| 쓰이지 않는 prop `sideExtra` | `AppShell.tsx:53, 56, 96` — 넘기는 화면이 한 곳도 없다 |
| 언제나 빈 값인 prop `writeNote` | `PostBoard.tsx:114, 121, 215` + 그것을 렌더하는 조건문 |
| import 되지 않는 `BLINDED_KEY` | `SettingsBlinded.tsx:15` — `PostBoard.tsx:424` 가 같은 값을 문자열로 다시 쓴다 |
| CSS 규칙 없는 className `calbody` | `Scheduler.tsx:229` |
| 참조되지 않는 CSS 클래스 `.picks`·`.posbad` | `styles/account.css:132-141` (11줄) |
| 파일 밖에서 쓰이지 않는 `export` | `AssignmentPanels.tsx:17` `TeamCounts`, 그 외 타입 4개(`EmbedKind`·`Opening`·`ProfileTeam`·`SignUpForm`) |
| 테스트 전용 코드가 배포 코드에 | `rate_limit.py:300, 303-306, 348-349` (`_LIMITERS`·`reset_all`·`size`) |

---

## 3. 러너가 남긴 질문 363건 — 답이 어디에 있어야 하는가

서버 러너 183건, 화면 러너 180건이다. 대부분이 **주석이 없어서** 쪽이다.

### 3-1. 주석이 없어서 (약 250건) — 그 자리에 한두 줄이면 끝난다

놓치기 쉬운 문법·연산자가 여기 몰려 있다. 서버: `@` 데코레이터, `->`, `|`, `:=`, `*`(키워드 전용 인자), `**`, `...`, `Depends`, `yield`, `with_for_update`, `on_conflict_do_update`, `autoflush`, `lru_cache`, `frozen=True`. 화면: `?.`, `??`, `...`(spread), `as const`, `satisfies`, `<T>`, `!`, `void`, `key={}` 재마운트, `useRef` vs `useState` 선택 기준.

**`refactoring` 스킬 7절이 "놓치기 쉬운 연산자 설명"을 주석의 정당한 용도로 이미 허용한다.** 지금은 그 허용을 거의 쓰지 않았다.

### 3-2. 이름이 말해주지 않아서 (약 40건)

| 질문 | 위치 |
|---|---|
| "팀"을 뜻하는 타입이 5개다. 어느 자리에 어느 것을 쓰는지 이름으로 모르겠다 | `Team`·`DayTeam`·`ProfileTeam`·`MyTeam`·`TeamSlot` |
| `passwordMessage`·`signupPasswordMessage`·`strongPasswordMessage` 중 어느 화면이 어느 것을 쓰는지 모르겠다 | `lib/validate.ts` |
| `confirmed`·`shown`·`roundSessions`·`days`·`colors` 가 각각 무엇인지 구분이 안 된다 | `Assignment.tsx:121-161` |
| 글 작성자와 댓글 작성자가 한 식 안에서 둘 다 `author` 다 | `routers/boards.py:463-464` |
| `for d in days` 의 `d` 가 무엇인지 모르겠다 | `routers/periods.py:51` |

### 3-3. 구조 때문에 (약 70건) — 주석으로 덮을 수 없다

| 질문 | 어디를 봐야 답이 나왔는가 |
|---|---|
| 겹치는 예약을 미리 조회하지 않고 commit 실패를 기다린다. 사용자에게 무엇이 보이는지 따라갈 수 없다 | `db/commit.py` → `RESERVATION_MESSAGES` → `api/app.py` **세 파일** |
| 제약 이름 문자열(`teams_color_exhausted` 등)이 코드 어디에서도 만들어지지 않는다. 실제와 맞는지 확인할 방법이 없다 | migration 파일 (`backend/src` 밖) |
| 겹침 금지(EXCLUDE)·팀 색 트리거가 "SQLAlchemy 로 표현할 수 없어" migration 에 있다 | migration 파일. `backend/src` 만 읽어서는 실제 규칙을 알 수 없다 |
| `say("로그인했어요")` 의 문구가 화면 어디에 나타나는지 모르겠다 | `lib/toast.ts` + `Account.tsx:79` + `AppShell.tsx:103` **세 곳** |
| 팀 색 `var(--...)` 를 누가 정의하는지 모르겠다 | `lib/teamColors.ts` + `main.tsx:15` |
| 본문에 넣을 수 있는 형식 목록이 3곳에 있다. 어느 것이 정본인가 | `ACCEPTED_MIME`·`IMAGE`/`AUDIO`·`ALLOWED_EXTENSIONS` |
| 어느 API 주소가 어느 화면에서 쓰이는지 알 수 없다. 주석의 "화면이 …" 가 어디인지 안 적혀 있다 | `frontend/` (backend 밖) |

### 3-4. 코드에 답이 아예 없는 것 (약 20건) — 문서로 가야 한다

- 이 프로그램이 무엇을 하는지 코드만으로는 끝까지 알 수 없다. "합주실"·"기수"·"집중 합주기간"·"전체합주"·"조율안"·"배정기록"·"포지션"의 뜻
- 자동 배정이 왜 하루 2번인지, 조율안을 누가 보고 무엇을 결정하는지
- `(사용자 결정 2026-09-11)`·`patch_note 8번`·`.cluedoc/boards` 표시가 무엇을 가리키는지 코드 안에서 찾을 수 없다

---

## 4. 문체·주석 — 위치 약 90곳

### 4-1. 금지된 순우리말 동사 (약 60곳)

2026-09-15 에 강하게 지적받은 항목이다. 단어 치환으로 끝난다.

| 현재 | 규칙상 | 대표 위치 |
|---|---|---|
| 지우다 | 삭제하다 | `auto_assign.py:64,65,208` `boards.py:119` `board_service.py:184,220,222,223` `models.py:407,520,543` `AppShell.tsx:61` `PostBoard.tsx:131,160,161,410` |
| 고치다 | 수정하다 | `settings_service.py:1` `board_service.py:61,62,287` `reservation_service.py:187` |
| 바꾸다 | 변경하다 | `settings_service.py:26` `teamColors.ts:36` `settings.ts:46` `richText.ts:72,80` `Dropdown.tsx:82` `Account.tsx:346`(화면 문구) `Landing.tsx:185` |
| 고르다 | 선택하다 | `roster_service.py:21,23,198` `permission_service.py:60` `theme.ts:1` `dropdown.ts:25` `calendar.ts:48,98` `DayDialog.tsx:203,248`(화면 문구) |
| 비우다 | 초기화하다 / 값을 넣지 않다 | `auth.py:179` `roster.py:222` `AppShell.tsx:50,188` `Settings.tsx:466` |
| 정하다 | 결정하다 | `notifications.py:26` `schedule.py:222` `Modal.tsx:18` `Scheduler.tsx:60` |

### 4-2. 기술 용어를 임의의 한글로 치환 (6곳)

| 현재 | 원래 용어 | 위치 |
|---|---|---|
| 창 길이 | window | `rate_limit.py:318` — **같은 파일 3곳은 `window` 라고 쓴다.** 사용자에게 보이는 문구이기도 하다 |
| 정상 확인 | health check | `app.py:96` — 로그를 "health" 로 검색해도 나오지 않는다 |
| 큐 / 대기열 / queued | 하나로 | `job_runner.py:224, 239, 196` — **한 파일에서 같은 대상을 3가지로 부른다** |
| 떨구다 | drop | `RichText.tsx:65,74,107,138,190` |
| 재생기 | audio player | `RichText.tsx:133` |
| 그립니다/렌더합니다/렌더링/표시합니다 | 하나로 | 화면 전반 |

### 4-3. 화면 문구가 어긋난다

- **로딩 문구가 7가지다** — "불러오는 중…"·"검색 중…"·"알림을 불러오는 중이에요"·"이전 배정기록 불러오는 중…"·"멤버를 불러오고 있어요…"·"가려 둔 글을 불러오고 있어요."·"예약을 내역을 불러오고 있어요."(**조사 오타**)
- 어미가 갈렸다 — 전체가 "~해요" 인데 `PostBoard.tsx:301,695`·`SettingsMembers.tsx:280` 3곳만 "~습니다"
- `permission_service.py` 만 "~해요" 체다. 나머지 19개 서비스는 "~합니다"
- `routers/roster.py:234` **"가지고있지" 띄어쓰기 오타**가 화면에 그대로 표시된다
- 같은 기능이 "블라인드" 와 "가리다" 두 이름을 갖는다. 스크린 리더가 읽는 이름과 보이는 문구가 다른 자리도 있다
- 기수가 없을 때 표기가 4가지다 — `""`·"기수 없음"·"—"·`""`

### 4-4. 주석이 실제와 다르다

| 위치 | 내용 |
|---|---|
| `lib/calendar.ts:3-4` | 정본으로 `SLOT_MINUTES` 를 가리키는데 **그 이름은 저장소에 없다**(`DEFAULT_SLOT_MINUTES` 로 개명). 같은 오류가 `.cluedoc/` 3곳과 `CLAUDE.md:195` 에도 있다. 게다가 이 주석은 `DAYS_PER_WEEK` 위에 붙어 설명 대상이 없다 |
| `permission_service.py:260` | "18가지 항목" — 실제 `Permission` 은 **20개**다 |
| `auth_session.py:43-44` | "login_sessions table" — 실제 이름은 `sessions` 다 |
| `settings_service.py:26` | "DB 의 CHECK 가 거절합니다" — 실제로는 `schemas.py:491` 의 Literal 이 먼저 거절해 DB 까지 가지 않는다 |
| `routers/boards.py:119-120` | 블라인드 권한 설명이 `notice_write` 권한 endpoint 위에 있다. 초안 endpoint 가 사이에 삽입되며 어긋났다 |
| `PostBoard.tsx:337-339` | `AttachmentList` 설명이 `AttachmentRow` 위에 붙어 있다 |
| `auth_dependency.py:42` | 예시가 `require_permission("room_manage")` 인데 그 권한은 목록에 없다 |
| "slot(1시간 단위 시간 칸)" | 저장소 **25곳**. 칸 크기는 5~60분 설정값이 된 지 오래다 |

### 4-5. 의인화·서술 (writing-style 9·18번)

"조용히 60으로 도는 것보다 낫습니다"(`settings_service.py:12`), "말없이 사라집니다"(`settings_service.py:29`, `pipeline.ts:299`), "아무도 모른 채 쌓입니다"(`board_service.py:223`, `auto_assign.py:208`), "흐려집니다"(`board_service.py:62`), "쓸모가 없어집니다"(`board_service.py:61`), "손대지 않습니다"(`settings_service.py:28`), "첫 색을 줍니다"(`schemas.py:222`), "맞힐 수 있습니다"(`rate_limit.py:282`, `auth.py:46`)

### 4-6. 주석에 결정 이력 (7절 위반)

`(사용자 결정 2026-09-11)` 류가 `schemas.py:365,373` `auth.py:177` `roster.py:245` `auto_assign.py:79` `permission_service.py:70` `period_service.py:128` 등 8곳 이상. 괄호만 삭제하고 문장은 남기면 된다. 단 `schemas.py:259-260` 은 **현재 데이터 상태**(학과·학번이 null 인 행이 실재)를 설명하므로 남길 이유가 있다.

---

## 5. 규칙에는 걸렸으나 이 프로젝트에는 과하다고 판단한 것

고르실 수 있게 이유와 함께 적는다. **조치를 권하지 않는다.**

| 규칙 | 걸린 자리 | 과하다고 보는 이유 |
|---|---|---|
| 2절 — 모듈 간 통신은 message broker | `api` → `services`·`db`·`scheduling` 직접 import 전부 | 서버가 1개 프로세스다. 2절 스스로 요청-응답 1:1 구간을 직접 호출 예외로 인정한다 |
| 4절 — 모듈은 각자의 컨테이너에서 | `api` 와 `services` 가 같은 프로세스 | `jobs/auto_assign.py` 는 이미 별도 컨테이너다. 나머지를 쪼개면 지연만 늘어난다 |
| 1절 — 기능 파일의 모듈 전역 상수 | 서비스 10개 파일 | 이 규칙이 막으려는 것은 가변 state 인데 전부 불변값이다 |
| 2절 — 공유 규격 파일에 계산 | `db/models.py:60-90` SQL 문자열 생성 | 옮기면 CHECK 제약과 Literal 목록이 분리되어 더 중요한 목적을 잃는다 |
| 검증 규칙 서버·화면 이중 구현 | `input.py` ↔ `validate.ts` | 언어가 달라 공유할 수 없고 즉시 피드백에 화면 검증이 필요하다. 값 일치 + 상호 참조 주석이 도달 가능한 최선이다 |
| Immutability | `job_runner._Entry`, `RateLimiter._seen` | 작업 등록부와 카운터는 본질이 가변이다. 외부 반환값 `Job` 은 이미 `frozen=True` 다 |
| `coding-style.md` camelCase | Python 전반 | 그 문서는 TypeScript 기준이고 `CLAUDE.md` 5장이 snake_case 로 우선 규정한다. **위반이 아니다** |
| `schemas.py` 559줄 | — | 800줄 아래이고, 2절이 요구하는 "메시지 규격은 한 세트"를 지키려면 모으는 편이 맞다 |
| `api/` 에 시퀀스 파일 없음 | — | `app.py` 가 그 역할을 한다. 이름만 다르다 |
| SMTP health check | `app.py:87-100` | 매번 SMTP 접속을 시도하면 health check 자체가 느려진다. 메일은 이미 별도 스레드 + 10초 timeout 으로 격리되어 있다 |

---

## 6. 판단이 필요한 것 — 승인 시 방향을 정해 주셔야 합니다

| # | 사항 | 선택지 |
|---|---|---|
| 6-1 | `job_runner`·rate limiter 인스턴스 위치 | 정석대로 `app.py` 로 올리고 `Depends` 로 받는다 / FastAPI 관용대로 모듈 레벨에 둔다 |
| 6-2 | `attachment_service.py:163-169` 삭제 순서 | 게시글 삭제(`boards.py:342-344`)는 "고아 파일이 남지 않게" 같은 순서를 의도적으로 택하고 주석도 있다. 이 함수만 주석이 없다 — 의도인가 누락인가 |
| 6-3 | 첨부 총량 상한 | 파일 1건은 nginx 가 300MB 로 막지만 글당·저장소 전체 상한이 없다. 개발 실행(`uvicorn` 직접)에는 상한이 0이다 |
| 6-4 | 경계 검증 위치 | `slot_minutes` 만 pydantic Literal 이고 나머지는 서비스 검증이다. 오류 문구가 영어(pydantic)와 한국어로 갈린다. 어느 쪽에 맞출 것인가 |
| 6-5 | 서버 상태를 로컬 상태로 복사 | `PostBoard.tsx:500-501` `SettingsAccount.tsx:40-41` `Teams.tsx:361-364`. 20초마다 refetch 하므로 **두 사람이 같은 글을 수정하면 나중에 저장한 쪽이 앞선 수정을 덮어쓴다.** 해법(`key` 재마운트)이 `SettingsEnsemble.tsx:165` 에 이미 있다 |
| 6-6 | `Teams.tsx:245-254` `writeSeats` | DELETE·PUT 을 순차로 보내는데 중간 실패 시 되돌리지 않는다. 자리 3개 중 2번째가 실패하면 1번만 반영된 팀이 남는다 |
| 6-7 | `lib/toast.ts` 의 모듈 레벨 가변 state | 1절 위반이지만 `useSyncExternalStore` 가 외부 저장소를 요구한다. 규칙의 예외로 명시할 것인가, `pipeline.ts` 로 옮길 것인가 |
| 6-8 | 서비스 파일 단위 테스트 | 20개 중 4개만 파일 단위 테스트가 있다. 나머지 16개는 endpoint 통합테스트로만 검증된다 |
| 6-9 | `jobs` 모듈 단위 테스트 | `enabled_from_env`·`interval_seconds_from_env` 는 테스트가 0건이다. `AUTO_ASSIGN_ENABLED` 오타 하나로 자동 배정이 멈춰도 아무 테스트도 실패하지 않는다 |
| 6-10 | 기수 없을 때 표기 | "기수 없음" 과 빈칸 중 하나로 |

---

## 7. 가장 먼저 고칠 후보 셋

1. **1장 전체 (오류 없이 틀린 결과)** — 11건. 사용자가 알아채지 못한 채 잘못된 값을 받는다. 그중 1-1·1-2 는 배포 환경에서만 드러나고, 1-3·1-4 는 지금 QA 에서 바로 부딪힌다.
2. **4-1 순우리말 동사 60곳 + 4-4 틀린 주석 8곳** — 단어 치환이라 위험이 0 에 가깝고, 2026-09-15 지적 사항이다. 4-4 의 `SLOT_MINUTES` 는 코드·문서·`CLAUDE.md` 가 전부 없는 이름을 가리키고 있다.
3. **2-1 대형 파일 3개 절단** — 절단선이 이미 명확하고, 저장소 안에 전례(Settings 탭 5개 분리)가 있다. `PostBoard.tsx` 의 작성 form 은 `PostWrite.tsx` 한 곳에서만 쓰인다.

---

## 처리 결과

항목을 끝낼 때마다 여기에 적는다 — 고침 / 넘김 / 안 고쳐도 됨.

| 항목 | 결과 | 날짜 |
|---|---|---|
| 0장 죽은 의존성 | 고침 | 2026-09-16 |
| 0장 이미지 자산 22MB → 1.3MB | 고침 | 2026-09-16 |
| 마이그레이션 36개 → 1개 통합 | 고침 (`840f27b`) | 2026-09-16 |
| dev DB 에 남아 있던 `posts_title_not_blank`·`posts_body_not_blank` | 고침 — 통합 중 발견 | 2026-09-16 |
| permission set 의 `permission_grant` 중복 | 고침 — 통합 중 발견 | 2026-09-16 |
| `models.py` CheckConstraint 3개에 이름 명시 | 고침 | 2026-09-16 |
| 1-1 rate limit 요청자 판정 | 고침 — `TRUSTED_PROXY_COUNT`(배포 2·개발 1)로 뒤에서 N번째 값을 사용. 테스트 `tests/unit/test_rate_limit.py` | 2026-09-18 |
| 1-2 시각의 offset 통과 | 고침 — 요청 모델 3개를 pydantic `NaiveDatetime` 으로 변경, offset 이 붙으면 422. 테스트 `tests/unit/test_schemas.py` | 2026-09-18 |
| 1-3 블라인드 해제 후 목록 미갱신 | 고침 — `BOARD_KEY`·`boardListKey`(`lib/boards.ts`)로 queryKey 를 한 곳에서 생성. 테스트 `lib/boards.test.ts` | 2026-09-18 |
| 1-4 점유 판정이 1시간 칸 고정 | 고침 — `takenGrid`·`isRangeFree`·`acceptsDrag` 에 `slotMinutes` 추가, `firstTaken` 신설. 테스트 `lib/calendar.test.ts` | 2026-09-18 |
| 1-5 `capacity()` 가 60분 고정 | 고침 — 원인 기술을 정정합니다. 표시 값이 절반이 되는 것이 아니라, 60분 격자에 맞지 않는 합주실(18:30 개방)이 0칸으로 계산되고 팀당 몫이 1시간 단위로만 나뉘었습니다. 테스트 `lib/settings.test.ts`·`lib/pipeline.test.ts` | 2026-09-18 |
| 1-6 화면 상한 60초 < 서버 상한 | 고침 — 390초(서버 300+60초에 여유 30초). 큐 대기 시간은 포함하지 않음(`jobs.ts` 의 `ponytail:` 주석). 테스트 `lib/jobs.test.ts` | 2026-09-18 |
| 1-7 `update_profile` 의 오류 문구 | 고침 — `commit_translating` 사용. 상태 코드는 가입과 같은 422. 테스트 `tests/integration/db/test_auth_endpoints.py` | 2026-09-18 |
| 1-8 `String(error)` | 고침 — `reason()` 사용. 1줄 변경이라 테스트는 추가하지 않음(`reason` 은 `lib/api.test.ts` 가 검증) | 2026-09-18 |
| 1-9 합주실 0개일 때 "지연" 문구 | 고침 — `room === null` 분기를 분리. 144행은 조건이 `memberId === null`(계정 미조회)이라 그대로 둠. route 화면은 단위 테스트가 없어 테스트는 추가하지 않음 | 2026-09-18 |
| 1-10 `finished_at` 기록 순서 | 고침 — Future 보다 먼저 기록. 테스트 `tests/unit/test_job_runner.py` | 2026-09-18 |
| 1-11 팀 병합 기준(이름·번호) | 안 고쳐도 됨 — `teams.name`·`rooms.name` 에 UNIQUE 제약이 있어 같은 이름의 팀 2개가 생성될 수 없음. 사실과 다른 `slots.ts` 주석만 교정 | 2026-09-18 |
| 화면 lint 11건 | 4건 고침(`pipeline.test.ts`·`Assignment.tsx` 2건·`SettingsReservations.tsx`). 남은 7건은 `autoFocus` 4건·`Landing.tsx:99` 클릭 2건·`Account.tsx:140` label 1건으로 상호작용 변경이라 승인 대기 | 2026-09-18 |
| mypy 테스트 파일 2건 | 고침 — `Period \| None` 을 `assert` 로 좁힘 | 2026-09-18 |
| 날짜 모달의 "내 일정" 목록이 그날 항목만 표시 | 고침 — 결함이었습니다(문서 불일치가 아님). 개발자님 지시는 "내 불가능 일정 전부를 나열"입니다. `allOffEntries`·`offWhenLabel`(`lib/dayEntries.ts`) 추가, 테스트 `lib/dayEntries.test.ts`, `.cluedoc/scheduler/README.md:160` 갱신 | 2026-09-18 |
| 4-1 순우리말 동사 | 고침 — 지우다·고치다·바꾸다(바뀌다)·고르다·비우다·정하다를 한자어 동사로 치환. 화면 문구 포함("시각을 선택해요", "변경하는 중…" 등). "고르게"(균등하게)는 다른 뜻이라 제외 | 2026-09-18 |
| 4-2 임의로 치환한 용어 | 고침 — "창 길이"→window 길이, "정상 확인"→health check, "떨구다"→drop, "재생기"→audio player·video player. 큐/대기열/queued 통일과 "그립니다/렌더합니다" 통일은 미착수 | 2026-09-18 |
| 4-3 화면 오타 2건 | 고침 — "예약을 내역을", "가지고있지". 로딩 문구 7가지·어미 불일치·"블라인드/가리다"는 미착수 | 2026-09-18 |
| 4-4 실제와 다른 주석 | 고침 — `SLOT_MINUTES`(`calendar.ts`·`.cluedoc/practice-room-and-periods`), "18가지 항목", `login_sessions`, `room_manage`, "1시간 단위 시간 칸" 13곳. `CLAUDE.md:195` 는 자동 수정 대상이 아니라 그대로. `settings_service.py:26`·`boards.py:119`·`PostBoard.tsx:337` 의 위치 어긋남은 미착수 | 2026-09-18 |
| 4-5 의인화 표현 | 고침 — 9줄 | 2026-09-18 |
| 4-6 `(사용자 결정 …)` | 고침 — 괄호 22곳 삭제, 문장은 유지 | 2026-09-18 |
| 2-4 `assignments`·`assignment_backups` index | 고침 — migration `3c9d41b7e2a5` + `models.py`. 테스트 `test_migration_chain.py`. **dev DB 에는 아직 적용하지 않음**(`docker compose run --rm dev alembic upgrade head`) | 2026-09-18 |
| 2-6 죽은 코드 | 고침 — `sideExtra`·`writeNote`·`calbody`·`.picks`·`.posbad` 삭제, `BLINDED_KEY` 를 `lib/boards.ts` 로 이동해 두 화면이 공유. `rate_limit.py` 의 `_LIMITERS`·`reset_all` 은 `tests/conftest.py` 의 테스트 격리에 필요해 그대로. 밖에서 쓰이지 않는 `export` 5개는 미착수 | 2026-09-18 |
| `backend/Dockerfile` 의 `uv sync` 캐시 마운트 | 고침 — 3곳. `docker compose build dev` 로 확인 | 2026-09-18 |
| 2-1·2-2·2-3·2-5, 2-4 의 목록 상한·`Scheduler` useMemo, 3장, 5장, 6장 | **미착수** | — |

## 마감 시점 상태 (2026-09-16)

- 검사: pytest 591 통과, mypy `src` 오류 0, 화면 테스트 322 통과, 화면 빌드·타입 검사 통과
- **화면 lint 는 11건(오류 9·경고 2) 실패합니다.** 이번 작업에서 `.ts`·`.tsx` 를 하나도
  수정하지 않았으므로 이전부터 있던 상태입니다. 대상은 `MemberSearch.tsx`·`PostBoard.tsx`·
  `pipeline.test.ts`·`Account.tsx`·`Assignment.tsx`·`Landing.tsx`·`SettingsMembers.tsx`·
  `SettingsReservations.tsx` 입니다. `dev_history/2026-09-16.md` 의 "lint 통과" 기록과 어긋납니다
- E2E 는 실행하지 않았습니다
- 빌드 산출물은 3.2MB 입니다(이전에는 이미지만 22MB)

## 마감 시점에 추가로 확인된 것

| 대상 | 내용 |
|---|---|
| 불가능 일정 목록 | 날짜 모달의 "내 일정" 탭이 **그날 항목만** 표시합니다. `.cluedoc/scheduler/README.md:160` 에는 "내가 등록한 불가능 일정을 나열한다"고만 적혀 있고 그날 한정이라는 말이 없습니다 |
| 합주실 삭제 | endpoint·화면 둘 다 없고 권한 항목에도 `room_delete` 가 없습니다. `.cluedoc/practice-room-and-periods/README.md:124` 에 "합주실 삭제는 미구현입니다" 로 적혀 있습니다. 팀·기간은 `team_delete`·`period_delete` 가 있습니다 |
| `backend/Dockerfile` | `RUN uv sync` 세 곳(23·34·54행)에 캐시 마운트가 없습니다. `pyproject.toml` 이나 `uv.lock` 이 바뀌어 레이어가 무효화되면 의존성 69MiB 를 네트워크에서 처음부터 다시 받습니다. `--mount=type=cache,target=/root/.cache/uv` 를 붙이면 로컬 캐시에서 풉니다 |
