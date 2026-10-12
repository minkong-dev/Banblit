# 작업 계획 2026-10-12

문서 버전 1.1.0 draft

**임시 문서입니다.** 이 문서의 작업 4개가 끝나면 `trash/<날짜>-plan/` 으로 이동합니다.

이 문서는 2026-10-12 에 개발자님이 결정한 작업 4개를 다음 세션이 코드를 다시 훑지 않고 구현하도록 적은 계획입니다.
파일 경로와 줄 번호는 커밋 `035a0da` 기준입니다. 줄 번호가 어긋나면 함수 이름으로 찾습니다.
구현은 공통 규칙의 모드 3(실패하는 테스트를 먼저 쓰고, 실패를 확인한 뒤 구현)으로 하고, 작업마다 개발자님 승인을 받은 뒤 시작합니다.

## 진행 상황 (2026-10-13)

| 장 | 상태 | 커밋 |
|---|---|---|
| 4장 배정 규칙 변경 | 완료. 배포 전 | `8748ddc` 엔진·서비스·API, `af3faf7` 기록 쌓기와 적용, `0818b69` 화면, `bd89df4` 문서 |
| 4-8 운영 데이터 규모 측정 | 미실행 | — |
| 5장 합주실 00시 마감 | 시작 전 | — |
| 6장 불가능 일정 캘린더와 히트맵 | 다음 작업. 구현 전 레퍼런스 화면 조사 | — |
| 7장 리팩토링 47건 | 시작 전 | — |

**4장을 구현하며 바뀐 결정(사용자 결정 2026-10-13).** 아래가 4-5, 4-6, 4-7 의 해당 내용보다 우선합니다.

| 항목 | 결정 |
|---|---|
| 저장 | 자동 확정을 없앴습니다. 연산(수동, 자동 하루 2번)은 결과를 스케줄링 기록에 쌓기만 하고 현재 배정안을 바꾸지 않으며 알리지 않습니다 |
| 적용 | `POST /periods/{id}/backups/{saved_at}/apply` 로만 현재 배정안이 바뀌고, 그때만 알림을 보냅니다. 적용한 기록도 목록에 남습니다 |
| 이전 확정본, 되돌리기 | 삭제했습니다. `assignment_backups.kind` 열(미배포 migration `c7d2e5a18f40` 에서 직접 삭제), rollback endpoint, 되돌리기 버튼, `rollback` 권한(migration `e4a9b7c2d150`, 권한 22개) |
| 보관 | 기간마다 최근 10개(`schedule_store.RECORD_KEEP`) |
| 권한 | 기록 목록, 기록 조회, 적용 모두 `proposal_confirm`("스케줄링 기록 확정") |
| 경고 | 현재 배정안에서 session 1회라도 빠지는 인원이 불참 허용 인원을 넘으면(`ScheduleReport.over_absent`) 배정 화면에 "현재 적용중인 배정안이 불가능일정 변동으로 인해 최대 제외인원을 초과했어요. / 새로 연산된 배정안으로 업데이트하는 것을 추천드려요." 를 표시합니다 |
| 결과 설명 | 보고는 저장하지 않고 조회하는 시점의 불가능 일정으로 계산합니다. 불참자 포지션은 팀당 1자리라 1개입니다 |

배포 시 주의: 서버(`540b141`)에는 migration `b3f6a9c2d471`, `c7d2e5a18f40`, `e4a9b7c2d150` 이 적용됩니다. 기존 백업 행은 연산 결과 기록으로 남습니다.

## 0. 읽는 순서

1. 2장 결정 사항과 3장 작업 순서를 읽습니다.
2. 하려는 작업의 장(4장~7장)만 읽습니다. 각 장의 "현재 구조" 절이 관련 코드의 위치와 호출 관계이고, "변경" 절이 파일별 수정 내용입니다.
3. 모든 새 코드는 8장(리팩토링 규약 준수 기준)을 지킵니다.

## 1. 용어

| 말 | 뜻 |
|---|---|
| session | 합주 1회가 이어지는 구간. 길이는 `settings.session_minutes`(서버 DB 60분) |
| slot | 배정 엔진의 시간 칸. 길이는 `settings.slot_minutes`(서버 DB 30분). 화면 문구에는 "칸" 을 쓰지 않음 |
| 목표 횟수 | 팀 1개가 기간 안에 받아야 하는 session 수. 이번 작업 전에는 "정확히 이 수", 이후에는 "이 수까지" |
| 불참 허용 인원 | session 1회에서 불가능 일정 때문에 빠져도 되는 팀원 수의 상한. 기간마다 저장 |
| 부족분 | 목표 횟수에서 실제로 배정된 횟수를 뺀 값 |
| 불참자 | 배정된 session 시각에 불가능 일정이 있는 팀원 |
| 스케줄링 기록 | 지금 화면 문구 "이전 배정기록" 의 새 이름. `assignment_backups` table 의 행 묶음(같은 `saved_at`) 1개 |
| 이전 확정본 | 스케줄링 기록 중, 새 확정으로 밀려난 옛 확정 시간표. `kind = 'previous'` |
| 미확정 배정안 | 스케줄링 기록 중, 부족분이나 불참자가 있어 확정하지 않고 보관한 계산 결과. `kind = 'unsaved'` |
| CP-SAT | OR-Tools 의 제약 해결기. 변수, 제약, 목적식으로 이루어진 model 을 풉니다 |
| 목적식 | CP-SAT 가 조건을 충족하는 해 중 무엇을 더 좋게 볼지 정하는 식. `model.maximize` 하나만 둘 수 있음 |
| 과제약(overconstrained) | 모든 조건을 동시에 충족하는 해가 없는 입력. 이 저장소의 2026-10-12 운영 데이터가 해당 |
| 하루 창 | 날짜 1개와 시각 2개(시작 시간, 종료 시간)로 만든 실제 구간. 종료 시간이 시작 시간 이하이면 종료가 다음 날 |

## 2. 결정 사항 (사용자 결정 2026-10-12)

| 항목 | 결정 |
|---|---|
| 배정 규칙 | "팀마다 정확히 N회" 를 "팀마다 N회까지, 가장 적게 받은 팀부터 최대한" 으로 변경. 배정 결과는 항상 출력 |
| 조율안 | 멤버 1명씩 제외해 다시 계산하는 조율안과 조율안 확정 endpoint 를 삭제. 부족분과 불참자가 조율안을 대신함 |
| 불참 허용 인원 | 관리자가 기간마다 N명으로 지정. 기본값 0(지금 동작과 같음) |
| 목표 시간 | 기본값은 "전체 시간 ÷ 팀 수"(지금 동작). 관리자가 값을 넣으면 그 값 기준 |
| 토스트 | 계산이 끝나면 "스케줄링 연산에 성공했어요" 만 표시 |
| 결과 설명 | 배정 화면 캘린더 아래에 굵은 큰 문구 2종과 줄바꿈한 목록(4-6절의 문구 그대로) |
| 저장 | 부족분과 불참자가 없으면 지금처럼 자동 확정. 있으면 확정하지 않고 스케줄링 기록에 미확정 배정안으로 등록 |
| 자동 배정 | 하루 2번 계속 실행. 부족분이나 불참자가 나오면 메인 캘린더는 그대로 두고 스케줄링 기록에만 등록 |
| 용어 | "이전 배정기록" 을 "스케줄링 기록" 으로 변경 |
| 합주실 마감 | 종료 시간이 시작 시간 이하이면 다음 날로 해석(Google Places, OpenStreetMap `opening_hours` 와 같은 규칙). 시작 시간과 종료 시간이 같으면 거부 |
| 마감 표기 | 다음 날 00:00 은 화면에 "24:00" 으로 표시 |
| 자정을 넘는 블럭 | 시작한 날에 이어서 표시(A 방식). 이번에는 화면이 24:00 까지만 받음 |
| 불가능 일정 화면 | 멤버별 캘린더, 팀별 히트맵 2개 모두 구현. "타 멤버 불가능 일정 조회"(`unavailable_read`) 권한자만 |
| 보기 기간 | 주, 월 전환 |
| 불가능 일정 화면 배치 | 카드 안 상단에 캘린더 아이콘, 리스트 아이콘. 캘린더일 때만 월/주 탭과 멤버/팀 탭, 대상 입력칸. 입력칸을 누르면 modal(멤버 검색 modal 과 같은 컴포넌트로 검색과 목록을 함께 표시) |
| 리팩토링 47건 | 7장 표의 결정. 전부 추천안. 팀당 10명(`MAX_SLOTS_PER_TEAM`)은 근거 없는 임의값 |

## 3. 작업 순서와 의존 관계

| 순서 | 작업 | 장 | 앞 작업에 의존하는 이유 |
|---|---|---|---|
| 1 | 배정 규칙 변경 | 4장 | 없음. 10/28 공연 기간 배정이 지금 0건이라 가장 먼저 |
| 2 | 합주실 00시 마감 | 5장 | 4장이 수정하는 `period_input.build_engine_rooms` 를 같이 수정하므로 4장 다음 |
| 3 | 불가능 일정 캘린더, 히트맵 | 6장 | 5장의 24:00 표시 함수(`lib/calendar` 의 시각 표기)를 재사용 |
| 4 | 리팩토링 47건 | 7장 | 4~6장이 7장 항목 일부를 먼저 처리함. 7장 표의 "선처리" 열 참조 |

배포는 4장이 끝난 직후 1회 합니다. 서버는 `540b141` 에서 멈춰 있고(`ssh banblit`, `/home/ubuntu/Banblit`), 4장과 5장은 migration 을 포함합니다.
배포 명령은 서버에서 `cd ~/Banblit && ./banblit.sh update` 입니다(COMMAND.md 에 작성되어 있는 내용을 기준으로 합니다).

---

## 4. 배정 규칙 변경

### 4-1. 원인 (2026-10-12 서버 데이터로 확인)

기간 1번(공연명 "2026 여섯줄안에서 대공연")의 입력입니다.

| 값 | 내용 |
|---|---|
| 팀별 합주 날짜 | 10/28~11/10, 14일. 11/11~11/17 은 전체 합주 날이라 `period_days` 가 제외 |
| 팀별 합주 시간대 | 평일 19:00~23:00(하루 4회), 주말 16:00~23:00(하루 7회) |
| 합주실 | 동방 1개(09:00~23:00) |
| 전체 자리 | 평일 10일 × 4 + 주말 4일 × 7 = 68회 |
| 팀 수 | 13 |
| 목표 횟수 | `auto_sessions_per_team` = 68 ÷ 13 = 5. `capped_sessions_per_team` 상한(14일 × 3회 = 42)보다 작아 5 그대로 |
| 불가능 일정 | 146건(반복 포함) |

13팀이 각각 정확히 5회, 합계 65회를 68자리에 넣어야 합니다. `assignment.py:249` 의 `== sessions_per_team` 때문에 한 팀이라도 5회를 못 채우면 `feasible=False` 이고,
`resolution.resolve` 가 멤버 1명씩 제외해 다시 계산해도 자리 자체가 모자라 조율안이 0개입니다. 화면 문구 "모든 시간을 다 사용하지는 못했어요. 배정 제안 0건" 이 그 결과입니다.
2026-09-28 커밋 `51f7c18` 의 `capped_sessions_per_team` 은 하루 상한 때문에 산수상 불가능한 횟수만 막고, 불가능 일정 때문에 못 채우는 경우는 막지 않습니다.

### 4-2. 현재 구조

호출 순서입니다.

1. 수동 실행: 화면 `routes/Assignment.tsx` 의 `recompute` 가 `lib/pipeline.ts:230 runAssignment` 를 호출하고, `POST /periods/{id}/assign` 이 접수합니다.
2. `api/routers/schedule.py:137 _submit` 의 `compute` 가 `services/period/period_service.py:60 assign_period` 를 호출합니다. `result.saved` 이면 `notify_assignment_updated` 를 호출합니다.
3. 자동 실행: `jobs/auto_assign.py:134 _run_one` 이 같은 `assign_period` 를 호출하고, `_mark_ran` 뒤에 `result.saved` 이면 `notify_assignment_updated` 를 호출합니다.
4. `assign_period` 는 기간, 합주실, 팀, 명단(`_load_members`, `TeamSlot` join `Member`), 불가능 일정(`_load_unavailable`, 반복은 `period_input.expand_unavailable` 이 전개)을 읽고,
   `period_input.build_engine_rooms`, `_engine_limits`(목표 횟수), `build_engine_teams` 로 엔진 입력을 만든 뒤 `scheduling.pipeline.resolve` 를 호출합니다.
5. `scheduling/pipeline.py:30 resolve` 가 `resolution.resolve` 에 시간 상한 3개(`SOLVER_TIME_LIMIT_SECONDS` 60, `RESOLUTION_TIME_LIMIT_SECONDS` 300, `IMPROVE_SECONDS_AFTER_FIRST` 3)를 전달합니다.
6. `resolution.resolve` 가 `assignment.assign` 을 1번 호출하고, 실패하면 멤버 수만큼 다시 호출해 `ExclusionProposal` 목록을 만듭니다.
7. `assign_period` 는 `feasible` 이면 `db/schedule_store.py save_schedule` 로 저장합니다(현행을 `assignment_backups` 로 복사, 현행 삭제, 새 행 추가, `_prune_backups` 로 `BACKUP_KEEP` 2개만 유지).
8. 응답은 `api/schemas.py:72 PeriodAssignOut`(`assignment`, `proposals`, `saved`)입니다. 화면은 `lib/assignment.ts:80 runResultText` 를 토스트로 표시하고, 조율안을 `tabsOf` 의 A안, B안 탭으로 표시합니다.
9. 조율안 확정: `POST /periods/{id}/proposals/{member_id}/confirm`(권한 `proposal_confirm`)이 그 멤버를 제외하고 다시 계산해 저장합니다.

엔진 model(`scheduling/assignment.py`)의 현재 구성입니다.

| 함수 | 역할 |
|---|---|
| `_session_vars` (231) | 팀 전원이 가능한 session 후보에만 변수 생성, 팀당 합 `== sessions_per_team` |
| `_one_team_per_slot` (280) | slot 1개에 팀 1개 |
| `_one_room_per_team` (289) | 팀 1개는 같은 시각에 합주실 1곳 |
| `_one_place_per_member` (298) | 2개 이상 팀에 속한 멤버는 같은 시각에 1팀 |
| `_limit_per_day` (340) | 팀당 하루 session 수 상한 |
| `_prefer_back_to_back` (356) | 목적식. 같은 팀, 같은 합주실에서 이어지는 session 쌍 수 최대화 |
| `_solve` (313), `_StopAfterFirst` (31) | 첫 해를 찾은 뒤 `IMPROVE_SECONDS_AFTER_FIRST` 초가 지나면 중단 |

### 4-3. 새 model

변수 `x[t, i]` 는 "팀 t 가 session 후보 i 를 쓴다" 입니다. `absent(t, i)` 는 후보 i 의 시간 구간과 불가능 일정이 겹치는 팀 t 의 멤버 목록입니다.

**반드시 지키는 조건(hard)**

1. `len(absent(t, i)) <= max_absent` 인 후보에만 변수를 만듭니다. `max_absent` 가 0 이면 지금과 같습니다.
2. 팀당 `sum(x[t, ·]) <= target`.
3. slot 1개에 팀 1개(`_one_team_per_slot` 그대로).
4. 팀 1개는 같은 시각에 합주실 1곳(`_one_room_per_team` 그대로).
5. 2개 이상 팀에 속한 멤버 m 은 같은 시각에 1팀. 단, m 이 그 시각에 불가능 일정이 있으면 어느 팀에도 참석하지 않으므로 그 후보는 m 의 제약에서 제외합니다(`_one_place_per_member` 수정).
6. 하루 상한(`_limit_per_day` 그대로).

**목적식(앞 항목이 우선)**

1. 가장 적게 받은 팀의 횟수 `y` 최대화. `y <= sum(x[t, ·])` 를 모든 팀에 겁니다.
2. 전체 배정 횟수 `sum(x)` 최대화.
3. 불참 인원 합 `sum(len(absent(t, i)) * x[t, i])` 최소화.
4. 이어지는 session 쌍 수 최대화(`_prefer_back_to_back` 의 `joined`).

`model.maximize` 는 1개만 둘 수 있으므로 가중치 합 1개로 만듭니다. 아래 가중치는 뒤 항목의 최댓값 합이 앞 항목 1 단위보다 작게 잡은 값이라, 앞 항목을 1 늘리는 해가 항상 더 좋습니다.

```
J = len(joined)                       # 항목 4 의 상한
A = max_absent * target * len(teams)  # 항목 3 의 상한
W_ABSENT = J + 1
W_TOTAL  = W_ABSENT * (A + 1)
W_MIN    = W_TOTAL * (target * len(teams) + 1)
maximize( W_MIN * y + W_TOTAL * sum(x) - W_ABSENT * absent_sum + sum(joined) )
```

기간 1번 규모(팀 13, target 5, max_absent 2, J 약 200)에서 `W_MIN` 은 약 2,600만으로 CP-SAT 의 int64 범위 안입니다. 가중치 계산은 `assignment.py` 안의 함수 1개(`_objective`)에 둡니다.

**중단 규칙 변경.** 지금의 `_StopAfterFirst` 는 첫 해를 찾고 3초 뒤에 멈춥니다. 새 model 은 모든 변수가 0 인 해가 즉시 조건을 충족하므로 첫 해가 의미 없습니다.
`_StopWhenStalled` 로 교체합니다. 목적식 값이 나아진 해를 찾을 때마다 timer 를 다시 걸고, `STALL_SECONDS` 동안 나아지지 않으면 `stop_search` 를 호출합니다.
`SOLVER_TIME_LIMIT_SECONDS`(60)는 그대로 전체 상한입니다. `STALL_SECONDS` 의 값은 4-8절의 측정으로 정하고, 측정 전 기본값은 5초입니다.

**결과.** 해가 없을 수 없으므로 `Assignment.feasible` 을 삭제합니다. 시간 상한 안에 해를 1개도 찾지 못한 경우(실제로는 발생하지 않음)는
`ValueError("배정 계산이 시간 상한 안에 끝나지 않았습니다")` 를 발생시켜 job 실패로 처리합니다. `Assignment` 에 `absences: dict[int, list[tuple[RoomInterval, list[int]]]]`(팀별로 불참자가 있는 session 과 불참 멤버 번호)를 추가합니다.

### 4-4. 변경: 엔진(`backend/src/backend/scheduling/`)

| 파일 | 변경 |
|---|---|
| `availability.py` | `absent_member_ids(team, interval) -> list[int]` 추가. `is_team_available` 은 호출하는 곳이 `assignment.py:244` 뿐이라 삭제 |
| `assignment.py` | `assign` 매개변수 `sessions_per_team` 을 `target_sessions` 로, `max_absent: int` 추가, `improve_seconds_after_first` 를 `stall_seconds` 로. `_session_vars` 를 4-3절 조건 1, 2로. `_one_place_per_member` 를 조건 5로. `_objective` 추가, `_prefer_back_to_back` 은 `joined` 목록만 반환하도록 변경(maximize 는 `_objective` 1곳). `_StopAfterFirst` 를 `_StopWhenStalled` 로. `Assignment.feasible` 삭제, `absences` 추가. 모듈 docstring 1줄째를 "팀마다 합주실의 빈 시간을 target_sessions 회까지 배정하는 계산입니다." 로 |
| `resolution.py` | 삭제(`trash/2026-10-12-resolution/` 으로 이동). `Resolution`, `ExclusionProposal`, `RESOLUTION_TIME_LIMIT_SECONDS` 도 함께 사라짐 |
| `pipeline.py` | `resolve` 를 `assign` 으로 교체. 상수는 `SOLVER_TIME_LIMIT_SECONDS`, `STALL_SECONDS`. `__all__` 에서 `Resolution`, `resolve`, `RESOLUTION_TIME_LIMIT_SECONDS` 삭제, `assign` 추가. 호출 줄에 WHY 주석(상한 2개를 이 자리에서 전달하는 이유) |

`slots.py`, `interval.py` 는 4장에서 수정하지 않습니다(5장에서 `interval.py` 에 하루 창 함수를 추가).

### 4-5. 변경: 데이터와 서비스

**migration 1개**(`b3f6a9c2d471` 다음, 파일 이름 `<rev>_assign_rule_and_record_kind.py`).

| table | 변경 |
|---|---|
| `periods` | `target_hours_per_team INTEGER NULL`(CHECK `> 0`), `max_absent_members SMALLINT NOT NULL DEFAULT 0`(CHECK `>= 0`) 추가 |
| `assignment_backups` | `kind TEXT NOT NULL DEFAULT 'previous'`(CHECK `kind IN ('previous', 'unsaved')`) 추가. 기존 행은 전부 `previous` |

`db/models.py` 의 `Period`(383줄 부근 practice 열 다음), `AssignmentBackup`(660)에 열을 추가합니다. `kind` 의 허용 값은 `contract.py` 에 `RecordKind = Literal["previous", "unsaved"]` 와 `RECORD_KINDS = get_args(RecordKind)` 로 두고 CHECK 문구를 그 값에서 생성합니다(7장 S3-08 방향과 같음).

**`services/period/period_input.py`**

- `target_sessions(target_hours, auto, day_count, daily_max_minutes, session_minutes) -> int` 추가. `target_hours` 가 None 이면 `auto`(지금의 `auto_sessions_per_team` 값), 아니면 `target_hours * 60 // session_minutes`. 둘 다 `capped_sessions_per_team` 으로 자릅니다.

**`services/period/period_service.py`**

- `assign_period` 를 계산만 하는 함수로 바꿉니다. 저장(`save_schedule`)과 `saved` 를 삭제하고, `PeriodAssignResult` 를 아래로 교체합니다.

```python
@dataclass(frozen=True)
class PeriodAssignResult:
    assignment: EngineAssignment      # sessions_by_team, open_slots, absences
    target_sessions: int
    team_names: dict[int, str]
    room_names: dict[int, str]
```

- `excluded_member_id` 매개변수, `_without_member` 를 삭제합니다(조율안 확정이 유일한 사용처).
- `_engine_limits` 가 `period.target_hours_per_team`, `period.max_absent_members` 를 읽어 `target_sessions`, `max_absent` 를 반환하게 합니다.
- `schedule_report(session, period, rows) -> ScheduleReport` 추가. 저장된 행(현행 또는 스케줄링 기록 1개)과 지금의 불가능 일정으로 부족분과 불참자를 계산합니다(사용자 결정: 저장하지 않고 볼 때마다 계산). 입력 행 형식은 `db/schedule_store.AssignmentRow` 입니다.

```python
@dataclass(frozen=True)
class Shortfall:
    team_id: int
    team: str
    assigned_hours: float

@dataclass(frozen=True)
class Absence:
    team_id: int
    team: str
    member_id: int
    member: str
    cohort: int | None
    positions: list[str]   # TeamSlot.instrument, 같은 팀에서 여러 포지션이면 전부
    sessions: int          # 불참하는 session 수

@dataclass(frozen=True)
class ScheduleReport:
    target_hours: float
    shortfalls: list[Shortfall]   # 목표보다 적게 받은 팀만
    absences: list[Absence]       # 불참자만
```

  포지션은 `_load_members` 와 같은 join 에 `TeamSlot.instrument`, `Member.cohort` 를 추가해 읽습니다. 불참 판정은 엔진과 같은 `scheduling.pipeline` 의 `absent_member_ids` 를 씁니다(같은 규칙 2벌 금지).
  목표 시간은 `_engine_limits` 와 같은 계산을 씁니다. `assign_period` 와 `schedule_report` 가 같은 private 함수 `_target_sessions(session, period, team_count, engine_rooms, days)` 를 호출합니다.
- `clean(report) -> bool` 은 두 목록이 모두 비었는지입니다.

**`services/period/pipeline.py`(시퀀스 파일)** 에 순서 함수 1개를 추가합니다. 지금 router 와 jobs 3곳에 흩어진 "저장 후 알림"(7장 S3-02)이 이 함수 1곳으로 모입니다.

```python
def run_period_assignment(session, period_id, team_ids, room_ids, now) -> PeriodRun:
    result = assign_period(...)                 # 계산만 합니다
    rows = assignment_rows(result.assignment)
    report = schedule_report(session, period, rows)
    if clean(report):
        save_schedule(session, period_id, rows, saved_at=now)      # 현행을 이전 확정본으로 보관하고 교체합니다
        notify_assignment_updated(session, period_id, now)         # 확정 시간표가 바뀐 경우에만 알립니다
        return PeriodRun(result, report, saved=True, record_at=None)
    save_record(session, period_id, rows, saved_at=now, kind="unsaved")  # 메인 캘린더는 그대로 둡니다
    return PeriodRun(result, report, saved=False, record_at=now)
```

호출 줄마다 WHY 주석을 둡니다(7절 규칙). `notify_assignment_updated` 호출은 services 끼리의 직접 호출(2절 예외)이고 refactoring-local 의 예외 목록에 1줄 추가합니다.

**호출하는 쪽**

| 파일 | 변경 |
|---|---|
| `api/routers/schedule.py` `_submit` | `compute` 가 `run_period_assignment` 1개만 호출. `excluded_member_id` 매개변수 삭제 |
| `api/routers/schedule.py` `confirm_period_proposal` | 삭제 |
| `jobs/auto_assign.py` `_run_one` | `assign_period` 대신 `run_period_assignment`. 알림 호출 삭제(시퀀스가 처리). `_mark_ran` 은 지금처럼 계산 뒤에 호출하되, `run_period_assignment` 안의 commit 이 먼저 일어나므로 순서는 "계산과 저장, 실행 기록" 순서가 됩니다. `AutoRun.saved` 는 유지 |

**`db/schedule_store.py`**

| 함수 | 변경 |
|---|---|
| `save_schedule` | `_archive_current` 가 `kind='previous'` 로 보관. 나머지 같음 |
| `save_record` (신규) | 행을 `kind` 와 `saved_at` 으로 `assignment_backups` 에 추가하고 `_prune_backups` |
| `apply_record(session, period_id, saved_at)` (신규) | 현행을 `previous` 로 보관하고, 그 기록의 행으로 현행을 교체하고, 그 기록을 삭제. `rollback_schedule` 의 일반형 |
| `rollback_schedule` | "가장 최근 `previous` 기록에 `apply_record`" 로 줄임. `/rollback` endpoint 와 버튼은 유지 |
| `_prune_backups` | `kind` 마다 따로 남길 개수를 셈. 개수는 매개변수로 받음 |
| `list_backup_rounds`, `BackupRound` | `kind` 추가 |

남길 개수는 `db/pipeline.py` 에 `RECORD_KEEP: dict[RecordKind, int] = {"previous": 2, "unsaved": 2}` 로 두고 `save_schedule`, `save_record` 에 전달합니다(7장 S3-10 선처리). `BACKUP_KEEP` 은 삭제합니다.

**알림.** 미확정 배정안이 등록될 때는 알림을 만들지 않습니다(확정 시간표가 바뀌지 않음, 지금 동작과 같음).

### 4-6. 변경: API 계약

| endpoint | 변경 |
|---|---|
| `POST /periods/{id}/assign` | 응답 `job.result` 가 아래 `PeriodAssignOut` |
| `POST /periods/{id}/proposals/{member_id}/confirm` | 삭제 |
| `GET /periods/{id}/schedule` | `ScheduleOut` 에 `report: ScheduleReportOut | null` 추가. 확정 시간표가 없으면 null |
| `GET /periods/{id}/backups` | `BackupOut` 에 `kind` 추가 |
| `GET /periods/{id}/backups/{saved_at}` | `BackupRoundOut` 에 `kind`, `report` 추가 |
| `POST /periods/{id}/backups/{saved_at}/apply` | 신규. `apply_record` 호출 후 `notify_assignment_updated`. 권한은 기록의 `kind` 로 판정: `previous` 는 `rollback`, `unsaved` 는 `proposal_confirm`. 응답 `RollbackOut` 과 같은 `{ "applied": bool }` |
| `GET/POST/PATCH /periods` | `PeriodOut`, `PeriodCreateIn`, `PeriodUpdateIn` 에 `assign_rule` 추가 |

```python
class AssignmentOut(BaseModel):          # feasible 삭제
    slots_by_team: dict[str, list[RoomSlotOut]]
    open_slots: list[RoomSlotOut]

class ShortfallOut(BaseModel): team_id: int; team: str; assigned_hours: float
class AbsenceOut(BaseModel):  team_id: int; team: str; member_id: int; member: str
                              cohort: int | None; positions: list[Instrument]; sessions: int
class ScheduleReportOut(BaseModel): target_hours: float; shortfalls: list[ShortfallOut]; absences: list[AbsenceOut]

class PeriodAssignOut(BaseModel):        # proposals 삭제
    assignment: AssignmentOut
    report: ScheduleReportOut
    saved: bool
    record_saved_at: datetime | None     # 미확정 배정안으로 등록했으면 그 saved_at

class AssignRuleOut(BaseModel):
    target_hours: int | None             # null 이면 전체 시간 ÷ 팀 수
    max_absent: int
class AssignRuleIn(AssignRuleOut): ...   # PATCH 에서 보내지 않으면 저장값 유지, 보내면 두 값 모두 교체
```

`AssignRuleIn` 은 `PracticeWindowIn`(schemas.py 157)과 같은 방식입니다. "보내지 않음" 과 "null 로 삭제" 를 구분해야 다른 값만 수정하는 PATCH 가 목표 시간을 삭제하지 않습니다.
서비스 쪽은 `period_crud_service.WindowIn`(50)과 같은 꼴로 `AssignRuleIn` dataclass 를 두고 `create_period`, `update_period` 의 마지막 매개변수로 받습니다. `routers/periods.py` 의 `_window_in`, `_window_out` 옆에 `_rule_in`, `_rule_out` 을 둡니다.

권한 `proposal_confirm` 은 key 를 유지합니다(permission CHECK migration 3개가 이 문자열을 가짐). 뜻만 "스케줄링 기록 확정" 으로 바꿉니다(`db/models.py:64` 주석, `frontend/src/lib/account.ts:117` 문구).

### 4-7. 변경: 화면

화면의 외형(결과 설명 구역의 글꼴 크기, 간격)은 `example-skills:frontend-design` 스킬로 만듭니다(CLAUDE.md 6장). 아래는 로직, 상태, 서버 통신입니다.

| 파일 | 변경 |
|---|---|
| `lib/contract.ts` (201~207) | `AssignmentOut.feasible` 삭제. `AssignOut` 을 `{ saved, record_saved_at, assignment, report }` 로. `ScheduleReport`, `Shortfall`, `Absence` 타입 추가. `Backup` 에 `kind: RecordKind`. `ScheduleOut` 에 `report`. `Period` 에 `assign_rule: { target_hours: number | null; max_absent: number }` |
| `lib/assignment.ts` | `View` 에서 `proposal` 삭제(`{kind:"now"} \| {kind:"round"; at}`). `tabKey`, `viewOf`, `tabsOf(roundAt)` 단순화. `runResultText` 삭제. `reportLines(report)` 추가(아래 문구를 만드는 순수 함수) |
| `lib/pipeline.ts` (230) | `runAssignment` 의 `excludeMemberId` 삭제. `applyRecord(periodId, savedAt)` 추가(`POST .../backups/{saved_at}/apply`) |
| `routes/Assignment.tsx` | `recompute.onSuccess` 의 토스트를 `say("스케줄링 연산에 성공했어요")` 로. `saved` 가 false 이면 `setView({ kind: "round", at: result.record_saved_at })` 로 그 미확정 배정안을 캘린더에 표시. `confirm` mutation 을 `applyRecord` 로 교체. `proposals`, `proposalIndex`, `proposal` 삭제 |
| `routes/AssignmentPanels.tsx` | `AssignmentStatus` 의 조율안 분기(138~161) 삭제. 기록 보기 분기(120)는 `kind` 가 `unsaved` 이고 `proposal_confirm` 권한이 있으면 "이 배정안으로 확정" 버튼을 표시. 캘린더 아래에 `ScheduleReportBlock` 추가(현재 확정본은 `schedule.report`, 기록은 `round.report`). `PastRunsPanel` 제목을 "스케줄링 기록" 으로, 항목에 `kind` 표시("미확정 배정안", "이전 확정본"), 빈 목록 문구 "스케줄링 기록이 없어요." |
| `routes/SettingsPeriods.tsx` `PeriodFields` | "스케줄링" 묶음에 입력칸 2개 추가: "팀당 목표 시간"(빈칸이면 자동, placeholder 에 자동 계산값 "자동 N시간"), "불참 허용 인원"(0 이상 정수). 자동 계산값은 `lib/settings.ts capacity().perTeam` 을 씁니다. `periodFields` 에 `assign_rule` 추가 |
| `lib/settings.ts` | `assignRuleMessage(rule)` 검증 함수 추가(정수, 범위). `capacity` 의 `perTeam` 주석 "모든 팀이 정확히 같은 개수" 를 "목표 횟수의 기본값" 으로 |
| `lib/account.ts` (117, 124) | `proposal_confirm` 이름 "스케줄링 기록 확정", `rollback` 문구의 "이전 배정기록" 을 "스케줄링 기록" 으로 |
| `lib/confirm.ts` (30~55) | "이전 배정기록" 문구를 "스케줄링 기록" 으로 |
| `components/queries.ts` | `["backups", id]`, `["backup-round", id, at]` key 상수를 여기 둡니다(7장 S3-31 선처리) |

**결과 설명 문구**(개발자님 문장 그대로. 해당 목록이 비면 그 문단을 표시하지 않습니다).

```
(큰 글자, 굵게) 팀 당 {목표}시간을 배정받아야하나, 더 적게 배정받은 팀이 있어요.

{팀} {배정 시간}시간 배정
{팀} {배정 시간}시간 배정

(큰 글자, 굵게) 일부 인원을 제외하고 진행해야하는 팀이 있어요.

{팀} {포지션} {멤버}
{팀} {포지션} {멤버}

를 제외해야 연산이 가능했어요.
```

- `{멤버}` 는 `lib/roster.ts:76 memberLabel(name, cohort)`(동명이인 구분)로 만듭니다.
- 포지션이 2개 이상이면 쉼표로 잇습니다.
- 한 줄로 이어 쓰지 않고 항목마다 줄을 바꿉니다(사용자 결정).

### 4-8. 테스트와 검증

먼저 쓸 실패 테스트입니다. 각 테스트의 실패를 확인한 뒤 구현합니다.

| 파일 | 테스트 |
|---|---|
| `backend/tests/unit/test_assignment.py` | 자리가 모자라면 해가 나오고 팀마다 목표 이하 / 가장 적게 받은 팀이 최대인지(팀 3, 자리 7, 목표 3 이면 3,2,2) / `max_absent=0` 이면 불참자가 없음 / `max_absent=1` 이면 1명 불참 후보를 쓰고 `absences` 에 기록 / 불가능 일정이 있는 겹치는 멤버는 두 팀 동시 배정을 막지 않음(조건 5) / 불참 최소가 연속 배정보다 우선 |
| `backend/tests/unit/test_resolution.py` | 파일을 `trash/` 로 이동(대상 코드 삭제) |
| `backend/tests/unit/test_period_input.py` | `target_sessions`: null 이면 자동값, 값이 있으면 시간 환산, 하루 상한으로 자름 |
| `backend/tests/integration/db/test_period_service.py` | `schedule_report`: 부족 팀과 배정 시간, 불참자의 포지션 2개, cohort |
| `backend/tests/integration/db/test_schedule_store.py` | `save_record` 가 현행을 바꾸지 않음 / `apply_record` 가 현행을 `previous` 로 보관하고 교체 / `kind` 별 보관 개수 |
| `backend/tests/integration/db/test_assign_jobs.py`, `test_period_endpoints.py` | 깨끗하면 `saved=True`, 아니면 `saved=False` 와 `record_saved_at`, 조율안 확정 endpoint 404 |
| `backend/tests/integration/db/test_auto_assign.py` | 부족분이 있으면 현행 유지, 기록 1개 추가, 알림 0개 |
| `backend/tests/integration/db/test_migration_chain.py` | 새 revision 이 head |
| `frontend/src/lib/assignment.test.ts` | `reportLines` 문구, 빈 목록이면 문단 생략, `tabsOf(roundAt)` |
| `frontend/e2e/assignment.spec.ts` | 조율안 탭 시나리오를 미확정 배정안 확정 시나리오로 교체 |

**운영 데이터 규모 측정.** 서버 DB 를 복사하지 않고, `backend/scripts/` 에 임시 시드(팀 13, 합주실 1, 기간 1번과 같은 날짜와 시간대, 팀원 4~5명, 반복 불가능 일정 약 146건)를 만들어
`max_absent` 0, 1, 2 와 `STALL_SECONDS` 3, 5, 10 의 조합으로 계산 시간과 결과(최소 횟수, 총 횟수, 불참 합)를 표로 남깁니다. 표는 개발일지에 적습니다.

명령(COMMAND.md 1-2, 12-1 에 작성되어 있는 내용을 기준으로 합니다): `docker compose run --rm dev pytest -q`, 화면 vitest, e2e.

---

## 5. 합주실 00시 마감

### 5-1. 규칙

시각 2개(시작 시간, 종료 시간)로 저장하는 하루 중의 범위는 3종류입니다. 모두 같은 규칙을 씁니다.

| 범위 | 저장 위치 |
|---|---|
| 합주실 개방, 마감 | `rooms.opens_at`, `closes_at` |
| 팀별 합주 시간대 | `periods.practice_weekday_*`, `practice_weekend_*` |
| 전체 합주 시각 | `periods.ensemble_starts_at`, `ensemble_ends_at`, `ensemble_days.starts_at`, `ends_at` |

- 저장은 지금처럼 `TIME` 열 2개입니다. 날짜를 붙여 저장하지 않습니다.
- 비교할 때만 하루 창으로 바꿉니다. `day_window(day, starts, ends)` 는 `datetime.combine(day, starts)` 부터, `ends <= starts` 이면 `datetime.combine(day + 1일, ends)`, 아니면 `datetime.combine(day, ends)` 까지입니다.
- `starts == ends` 는 거부합니다(사용자 결정).
- 화면이 24:00 까지만 표시하므로, 입력 검증은 "종료 시간이 시작 시간보다 늦거나, 종료 시간이 00:00" 만 허용합니다. 이 제한은 `contract.py` 의 `LATEST_CLOSE_NEXT_DAY = "00:00"` 상수 1개로 두고, 화면이 자정 이후 블럭(A 방식)을 지원하면 이 상수와 검증만 수정합니다.

### 5-2. 변경: 서버

| 위치 | 지금 | 변경 |
|---|---|---|
| `scheduling/interval.py` | 없음 | `day_window(day, starts, ends) -> TimeInterval` 추가. `scheduling/pipeline.py` 의 `__all__` 에 추가 |
| `services/validation/input.py:207` `require_closes_after_opens` | `closes_at <= opens_at` 이면 거부 | `require_clock_range(starts, ends, label)` 로 교체. 같으면 거부, `ends < starts` 이면서 `ends != LATEST_CLOSE_NEXT_DAY` 이면 거부 |
| `services/validation/input.py:229` `require_same_day` | 시작일과 종료일이 다르면 거부 | 삭제. 아래 `require_within_room_window` 가 대신함 |
| `services/validation/input.py:234` `require_within_room_hours` | `starts_at.time() < opens_at or ends_at.time() > closes_at` | `require_within_room_window(opens, closes, starts_at, ends_at)` 로 교체. `starts_at.date()` 와 그 전날의 하루 창 중 하나가 예약 구간을 포함하면 통과 |
| `services/room/room_service.py:23, 38` | `require_closes_after_opens` 호출 | `require_clock_range` 호출 |
| `services/reservation/reservation_service.py:137~138, 313~314` | `require_same_day`, `require_within_room_hours` | `require_within_room_window` 1개 |
| `services/reservation/reservation_service.py:106~107` | 전체 합주 시각과 예약을 `time()` 끼리 비교 | 예약 시작일의 하루 창(전체 합주 시각)과 예약 구간의 겹침으로 비교 |
| `services/period/ensemble_service.py:38~45` `_ensemble_times` | `end <= start` 거부, `start < room.opens_at or end > room.closes_at` 거부 | `require_clock_range`, 그리고 기준일 1개(아무 날짜)에 대해 전체 합주 하루 창이 합주실 하루 창 안인지 |
| `services/period/period_crud_service.py:68~85` `_pair_columns` | 시간대 쌍을 저장 | 저장 전에 `require_clock_range` |
| `services/period/period_input.py:117~121` `build_engine_rooms` | `combine(day, opens)`, `combine(day, closes)`, 시간대도 같은 날 | `day_window` 로 합주실 창과 시간대 창을 만들고 교집합 |
| `db/models.py:350, 409, 419~420, 440` | CHECK `closes_at > opens_at` 등 4개 | CHECK `<>` 로. migration 1개(`<rev>_clock_ranges_past_midnight.py`) |

`period_service.open_slots_in_period` 는 `build_engine_rooms` 를 거치므로 따로 수정하지 않습니다. `generate_slots` 는 `TimeInterval` 만 받으므로 날짜를 넘는 구간도 그대로 분할합니다.

### 5-3. 변경: 화면

| 위치 | 변경 |
|---|---|
| `lib/settings.ts` `minutesOf` 를 쓰는 검증(`gridMessage` 85, `ensembleTimeMessage` 150, 시간대 검증, `slotsBetween` 165) | 종료 분을 `rangeEndMinutes(starts, ends)`(종료 ≤ 시작이면 +1440)로 계산. 같으면 오류, `ends < starts` 이면서 00:00 이 아니면 오류 |
| `lib/calendar.ts:139` `roomBounds` | `closes_at` 이 00:00 이고 개방보다 이르면 close 를 24 로 |
| `lib/slots.ts:71` `isoAt` | index 가 24시에 해당하면 다음 날 `T00:00:00` 을 반환 |
| `lib/slots.ts` `slotLabel`, `routes/SchedulerViews.tsx:159` `hourLabel` | 24 를 "24:00" 으로 표시 |
| `lib/dayEntries.ts:120~121` | 전체 합주 종료가 00:00 이면 index 를 24시로 |
| `routes/SettingsRooms.tsx:105` | 마감 표기를 `clockEndLabel`("00:00" 이 마감이면 "24:00")로. 함수는 `lib/calendar.ts` 에 둡니다 |
| `routes/SettingsRooms.tsx:22` `BLANK_ROOM` | 변경 없음 |

`TimeRange`(`components/controls.tsx:147`)는 `<input type="time">` 이라 24:00 을 입력할 수 없습니다. 입력은 00:00 으로 받고 표시만 24:00 입니다.

### 5-4. 테스트

| 파일 | 테스트 |
|---|---|
| `backend/tests/unit/test_input.py` | `require_clock_range`: 18:00~00:00 통과, 18:00~18:00 거부, 18:00~02:00 거부(제한 상수) / `require_within_room_window`: 22:00~다음 날 00:00 예약 통과, 23:00~다음 날 01:00 거부 |
| `backend/tests/unit/test_period_input.py` | `build_engine_rooms`: 마감 00:00 이면 창이 다음 날 00:00 까지, 시간대 19:00~00:00 교집합 |
| 신규 `backend/tests/unit/test_interval.py` 또는 기존 interval 테스트 | `day_window` 3경우(같은 날, 다음 날, 같음 거부는 호출하는 쪽) |
| `backend/tests/integration/db/test_room_endpoints.py`, `test_reservation_endpoints.py` | 마감 00:00 합주실 생성, 23:00~24:00 예약 |
| `frontend/src/lib/settings.test.ts`, `calendar.test.ts`, `slots` 테스트 | 위 함수 각각 |

---

## 6. 불가능 일정 캘린더와 히트맵

### 6-1. 현재 구조

- 화면: `routes/SettingsUnavailable.tsx` `UnavailableCards`. 관리자 메뉴의 불가능 일정 구역이고, `lib/adminMenu.ts` 가 `unavailable_read` 권한자에게만 항목을 보입니다.
- 서버 조회: `lib/pipeline.ts:261 loadAllUnavailable` 가 `GET /unavailable` 을 호출합니다. 응답 `MemberUnavailable`(`lib/contract.ts:264`)은 반복 설정(`repeat_weekdays`, `repeat_count`, `repeat_until`)을 전개하지 않은 행입니다. 서버 권한 판정은 `services/unavailable/unavailable_service.py` 의 `_require_read` 입니다.
- 반복 전개: `lib/dayEntries.ts:205 repeatDays(item, days)`, 날짜별 항목: `offByDay(times, openHour, days)`(151). 대시보드 달력이 이미 쓰는 함수입니다.
- 달력 부품: `routes/SchedulerViews.tsx` 의 `MonthView`(40), `WeekView`(164). 둘 다 `entriesOf(key)` 로 항목을 받고 값을 보유하지 않습니다. 월/주 전환과 이전/다음 버튼 markup 은 `routes/Scheduler.tsx:220~229` 에 있습니다(`.calbar`, `.seg`).
- 검색 modal: `components/MemberPicker.tsx`(Modal 안에 `MemberSearch`). `MemberSearch` 는 서버 검색(`/members/search`)과 목록 표시를 함께 합니다.
- 팀 명단: `["members", id]` 조회(`components/queries.ts:107` 부근, 7장 S3-31 이 정리 대상).

### 6-2. 화면 구성 (사용자 결정 2026-10-12)

```
┌ 카드 ───────────────────────────────────────────────┐
│ 불가능 일정              [캘린더 아이콘] [리스트 아이콘] │
│ (캘린더일 때만) [월|주]  [멤버|팀]  [ 대상 입력칸 ]     │
│ (캘린더일 때만) < 이전   2026년 10월   다음 >           │
│ 본문: 리스트(지금 표) / 멤버 캘린더 / 팀 히트맵          │
└─────────────────────────────────────────────────────┘
```

- 아이콘 2개는 카드 안 제목 줄 오른쪽에 둡니다(`SectionHead` 의 children). 캘린더 아이콘과 리스트 아이콘은 `components/icons.tsx` 에 없으므로 2개를 추가합니다.
- 대상 입력칸은 읽기 전용 입력칸이고, 누르면 modal 을 엽니다. 멤버 탭은 멤버 검색 modal, 팀 탭은 팀 검색 modal 입니다.
- 멤버 캘린더: 선택한 멤버 1명의 불가능 일정을 `MonthView`, `WeekView` 로 표시합니다. 반복 일정은 전개합니다.
- 팀 히트맵: 주 보기는 요일 7열 × 시간 줄 grid, 칸마다 "그 시간에 불가능 일정이 있는 팀원 수 / 팀원 수" 를 색 농도로 표시합니다. 칸을 누르면 그 시간의 불가능 팀원 이름(`memberLabel`) 목록을 보여 줍니다. 사유는 표시하지 않습니다.
  월 보기는 날짜 칸마다 그날 가장 많이 빠진 시간의 인원을 표시합니다.
- 시간 범위는 합주실 개방, 마감 중 가장 넓은 범위(`roomBounds`, 5장 반영 후 24시 포함)입니다.

외형(아이콘 배치, 히트맵 색 단계, 간격)은 `example-skills:frontend-design` 스킬로 만들고, 색 짝은 `ui-ux-pro-max` 로 찾아봅니다(CLAUDE.md 2장, 6장). 만들기 전에 여러 사람 일정 히트맵을 보여 주는 서비스(When2meet, Doodle, Google 캘린더의 여러 캘린더 겹쳐 보기)의 화면을 조사해 개발자님께 보여 드립니다(메모리 "만들기 전에 레퍼런스부터").

### 6-3. 변경

| 파일 | 변경 |
|---|---|
| `components/MemberSearch.tsx` | 목록 markup 을 `components/SearchList.tsx`(검색 입력칸과 버튼 목록만 그리는 부품, 서버 호출 없음)로 꺼냄. `MemberSearch` 는 서버 조회와 `SearchList` 조합으로 남음. 기존 사용처 `MemberPicker` 3곳은 수정 없음 |
| `components/TeamSearch.tsx` (신규) | 팀 목록(`useTeams`)을 이름으로 거른 뒤 `SearchList` 에 전달 |
| `components/PickerModal.tsx` (신규) 또는 `MemberPicker` 확장 | Modal 안에 `MemberSearch` 나 `TeamSearch` 를 넣는 공용 modal. `MemberPicker` 를 이 부품으로 바꿀지는 구현 때 사용처 3곳을 보고 정합니다 |
| `components/icons.tsx` | `CalendarIcon`, `ListIcon` 추가 |
| `lib/unavailableMap.ts` (신규, React 무의존) | `offCount(times, memberIds, day, hour)`, `heatByWeek(times, members, dayKeys, open, close)`, `heatByMonth(...)`, `offMembersAt(...)`. 반복 전개는 `lib/dayEntries.repeatDays` 를 재사용(같은 규칙 2벌 금지) |
| `routes/SettingsUnavailable.tsx` | 보기 상태(리스트/캘린더, 월/주, 멤버/팀, 선택 대상, 이전/다음 cursor)와 카드 머리만 담당. 리스트는 지금 표를 `UnavailableList` 로 꺼내 그대로 |
| `routes/UnavailableCalendar.tsx` (신규) | 멤버 캘린더(`MonthView`, `WeekView` 재사용), 팀 히트맵 grid 와 칸 상세 |
| `routes/Scheduler.tsx:220~229` | 월/주 전환과 이전/다음 markup 을 `components/CalendarBar.tsx` 로 꺼내 대시보드와 불가능 일정 화면이 함께 씀 |

`MonthView`, `WeekView` 는 `routes/SchedulerViews.tsx` 에 있어 다른 route 가 import 하면 routes 끼리의 import 가 됩니다(7장 S3-27 과 같은 문제). 두 부품을 `components/CalendarViews.tsx` 로 옮긴 뒤 두 화면이 components 에서 import 합니다. `entryClass`, `entryName`(`routes/DayDialogParts.tsx`)도 함께 `lib/dayEntries.ts` 로 옮깁니다(7장 S3-36 선처리).

### 6-4. 테스트

| 파일 | 테스트 |
|---|---|
| `frontend/src/lib/unavailableMap.test.ts` (신규) | 반복 일정이 있는 2명의 시간별 인원, 팀원이 아닌 사람 제외, 월 보기의 하루 최대값, 24시 마감 범위 |
| `frontend/src/components/SearchList.test.tsx` (신규) | 빈 검색어면 전체, 검색어로 거름, 선택 콜백 |
| `frontend/e2e/settings.spec.ts` | 아이콘 전환, 멤버 선택 후 캘린더 표시, 팀 히트맵 칸 상세 |

---

## 7. 리팩토링 47건

아래 표가 결정 전부입니다. 47건 모두 추천안이 선택되었습니다. 카드 원문(`AUDIT.html`), 결정 파일(`AUDIT.result.json`), 생성 스크립트(`make_audit3.py`)는 `trash/2026-10-12-refactor-audit/` 에 있고, `trash/` 는 push 하지 않으므로 이 PC 에만 있습니다. 4~6장이 먼저 처리하는 항목은 "선처리" 열에 적었고, 7장 작업 때는 남은 부분만 합니다.
2026-10-08 audit 의 1, 2, 4, 5, 6단계 결정은 `dev_history/2026-10-08.md` "지금 상태" 에 있습니다(S1-01~04 승인, S1-02 서버 문구 "~해요" 체 통일, S2-01 파일 저장 함수를 `services/storage` 로 분리, S2-02, S2-03 상한값을 `contract.py` 로).

| 카드 | 결정 | 선처리 |
|---|---|---|
| S3-01 | `services/*/pipeline.py` 11개 중 5개(auth, board, period, roster, validation)에 순서 함수와 조절 값. 나머지 6개는 refactoring-local 에 "모을 것 없음", 숫자 12를 11로 | 4장이 period 의 배정 순서를 처리 |
| S3-02 | 배정 후 알림 순서를 period pipeline 1곳으로 | 4장 `run_period_assignment` 로 완료 |
| S3-03 | router 9곳의 판정, 계산, 삭제 순서를 services 로. 단위테스트 약 9개 | |
| S3-04 | jobs 의 기간, 팀, 합주실 조회를 period, roster pipeline 함수로 | |
| S3-05 | 2단계 S2-01(storage 분리)과 함께 `board_service.py` 의 roster 복사본 2개 삭제 | |
| S3-06 | `notify_reservations_cancelled` 추가, reservation 의 Notification 직접 생성 삭제 | |
| S3-07 | Literal 4종만 `contract.py` 로, ORM class 직접 import 는 refactoring-local 예외 | 4장의 `RecordKind` 는 처음부터 `contract.py` |
| S3-08 | 허용 값 4쌍을 `contract.py` Literal 1세트로, 감시 테스트 삭제 | |
| S3-09 | rate limiter 4개와 job_runner 생성을 `app.py` 로, `_LIMITERS`, `reset_all` 삭제 | |
| S3-10 | `BACKUP_KEEP` 을 `db/pipeline.py` 로 | 4장 `RECORD_KEEP` 으로 완료 |
| S3-11 | `commit_with_cancellations` 외 6개 함수에 `now` 인자 | |
| S3-12 | `APP_ORIGIN` 기본값 삭제, 비면 오류 로그와 발송 중단, 개발 값은 override 로 | |
| S3-13 | `db/engine.py` 에 `statement_timeout` 25초, `lock_timeout` 5초, 넘으면 503 | |
| S3-14 | CP-SAT `num_workers` 상한(코어 수의 절반)을 `scheduling/pipeline.py` 에 | 4장 측정 때 같이 측정 |
| S3-15 | auto-assign container healthcheck(마지막 실행 시각 파일) | |
| S3-16 | services 5개 모듈 단위테스트 파일 5개 | |
| S3-17 | jobs, auth_dependency, scheduling pipeline 단위테스트 3개 | 4장이 scheduling pipeline 테스트를 다시 씀 |
| S3-18 | services docstring 의 설계 배경을 pipeline 호출 줄로(S3-01 이후) | |
| S3-19 | 주석의 변경 이력 삭제, 결정 표시를 "(사용자 결정 2026-10-07)" 형식으로 | |
| S3-20 | 틀린 경로, 이름, 사실 주석 수정. `roster_service.py:32~33` 은 "근거 없는 임의값" 으로(사용자 답) | |
| S3-21 | comprehension 4곳을 for 문으로 | |
| S3-22 | reservation 반환 tuple 순서를 `ReservationRow` 와 같게(S3-03 과 함께) | |
| S3-23 | routes 함수 크기: DayDialog, Assignment, PhotoEdit, SetRail, Lineup, PeriodCard, RoomCard 먼저 | 4장이 Assignment 를 줄임 |
| S3-24 | components 함수 크기: S3-30 이후 WriteForm, RichText, AppShell 먼저 | |
| S3-25 | DayDialog 보기/편집 분리, SettingsPage 구역을 App.tsx 주소로 | |
| S3-26 | PostBoard 목록/상세 분기를 routes 로, e2e 로 포커스 복귀 확인 | |
| S3-27 | `EnsembleDayEditor` 를 components 로 | 6장의 `CalendarViews` 이동과 같은 방식 |
| S3-28 | `lib/toast.ts` 를 `components/toast.ts` 로 | |
| S3-29 | 순수 함수는 직접 import, 서버 호출 조합만 `lib/pipeline.ts` | |
| S3-30 | 게시판 서버 호출 13개를 `lib/pipeline.ts` 로 | |
| S3-31 | 2곳 이상에서 쓰는 query key 와 조회를 `components/queries.ts` 로 | 4장의 backups key |
| S3-32 | `/settings` 타입, 기본값, 폼 타입을 `contract.ts` 참조로 | |
| S3-33 | `RollbackOut` 추가, 합주실 모양 1개, DayDialogParts 는 `Member` | 4장이 `rolled_back` 응답을 다시 정의 |
| S3-34 | refactoring-local 의 화면 규격 줄을 "field 타입은 `lib/contract.ts`, 조회 hook 과 key 는 `components/queries.ts`" 로 | |
| S3-35 | 기수 검증, 시각 글자, 일정 시각 글자, 비밀번호 일치 판정을 lib 함수 1개씩 | 5장의 `clockEndLabel` 이 시각 글자 함수와 같은 파일 |
| S3-36 | routes 의 순수 함수 중 여러 파일 사용, 서버 쓰기·조회, 검증부터 lib 으로 | 6장이 `entryClass`, `entryName` 이동 |
| S3-37 | 불가능 일정 Entry 에 실제 이름 field | |
| S3-38 | 세션 만료 판정을 서버 code field 로. **S1-02 문구 통일보다 먼저** | |
| S3-39 | `DayDialog.tsx:120` flatMap 을 for 문으로 | |
| S3-40 | S3-36 뒤 routes 화면 분기 2~3곳 테스트 | |
| S3-41 | S3-30 과 함께, 남는 hook, 함수 테스트 2~3개 | |
| S3-42 | lib 설계 배경 주석 5곳 삭제 또는 이동 | |
| S3-43 | 위치 잃은 주석 2곳, 중복 header 2줄 정리 | |
| S3-44 | refactoring-local 에 "jobs 도 진입점" 1줄 | |
| S3-45 | 그대로(메일 실패는 mailer 로그) | |
| S3-46 | refactoring-local 에 routes, components 시퀀스 파일 적용하지 않음 | |
| S3-47 | 그대로 | |

순서는 refactoring 스킬의 적용 순서(모듈 경계, 통신, 이름)대로 서버 S3-01~S3-22, 화면 S3-23~S3-43, 문서 S3-34·S3-44·S3-46 순서입니다. 1건씩 수정하고 수정 직후 테스트를 실행합니다(audit 5단계).

---

## 8. 새 코드의 리팩토링 규약 준수 기준

4~6장의 새 코드가 처음부터 지키는 규칙입니다. 전역 `refactoring` 스킬과 `refactoring-local` 에 작성되어 있는 내용을 기준으로 합니다.

| 규칙 | 4~6장에서 지키는 방법 |
|---|---|
| 1절 시퀀스 파일 | 배정 순서는 `services/period/pipeline.py run_period_assignment`. 엔진 상한은 `scheduling/pipeline.py`. 보관 개수는 `db/pipeline.py`. 기능 파일은 매개변수로 받음 |
| 1절 모듈 밖 참조 | services 는 `scheduling.pipeline`, `db.pipeline` 만 import. 화면 route 끼리 import 하지 않음(`CalendarViews` 를 components 로) |
| 1절 기능 파일 state | 새 기능 파일에 모듈 전역 가변 값 없음. 현재 시각은 매개변수 `now` 로 받음(S3-11 원칙) |
| 2절 규격 1세트 | `RecordKind` 는 `contract.py`, 화면 타입은 `lib/contract.ts`, query key 는 `components/queries.ts` |
| 2절 규격 변경 순서 | 4-6절 schema 를 먼저 수정, 화면 타입, 서버와 화면 구현, 양쪽 테스트 순서 |
| 3절 단위테스트 | 엔진, `period_input`, `lib/unavailableMap` 은 DB 없이 단위테스트. DB 가 필요한 `schedule_report`, `schedule_store` 는 integration |
| 7절 주석 | 기능 파일은 WHAT, 시퀀스 파일 호출 줄은 WHY. 변경 이력과 날짜 서술 금지. 사용자 결정은 "(사용자 결정 2026-10-12)" |
| 8절 읽기 | comprehension 은 단일 조건만. 값 1개에 의미 2개 금지(불참자 번호와 이름을 따로 받음). 화면 함수는 markup 외 담당 1개 이하이거나 50줄 미만 |
| 문체 | 주석과 화면 문구는 `writing-style` 과 `writing-style-local`. 화면 안내문 "~해요", 버튼 한자어 명사형 |

---

## 9. 보류: 로그인 후 스케줄표로 이동하지 않는 문제

일부 사용자 제보입니다. 원인은 확정하지 않았습니다.

- 로그인하면 서버가 쿠키 2개(`banblit_session` httpOnly, `banblit_signed_in` 표시용)를 설정합니다(`api/routers/auth.py:69~92`, 배포는 `COOKIE_SECURE=true`).
- 화면은 `navigate("/scheduler")` 뒤 `App.tsx:32 RequireAuth` 가 `lib/api.ts:65 isSignedIn`(표시용 쿠키)을 읽고, 없으면 `/login` 으로 보냅니다.
- 그래서 "로그인했어요" 토스트 뒤 로그인 화면에 머무는 증상이면, 그 브라우저가 쿠키를 저장하지 않은 경우입니다(인앱 브라우저, 쿠키 차단, 시크릿 모드 후보). http 접속은 Caddy 가 https 로 전환하므로 원인이 아닙니다.
- 필요한 정보: 증상(로그인 화면에 머묾, 스케줄표가 보였다가 돌아감, 빈 화면), 기기와 앱, 주소. 서버 Caddy 접속 기록(`/var/log/caddy/access.log`)에서 `/api/login` 다음 요청을 보면 앞의 두 증상이 구분됩니다.

## 10. 남은 결정

| 항목 | 기본값(결정 전까지 이 값으로 구현) |
|---|---|
| 미확정 배정안 등록 때 관리자 알림 | 만들지 않음 |
| 스케줄링 기록 보관 개수 | 이전 확정본 2개, 미확정 배정안 2개 |
| `STALL_SECONDS` | 5초. 4-8절 측정 후 수정 |
| `/backups` 주소 이름 | 유지. 화면 문구만 "스케줄링 기록" |
| 팀 목표 시간 단위 | 정수 시간. session 길이로 나누어 떨어지지 않으면 내림 |

## 11. 끝난 뒤 갱신할 문서

- `.cluedoc/` paper: 배정(auto-assignment), 합주실과 기간(practice-room-and-periods), 불가능 일정 화면. cluedoc 스킬로 상위, 본인, 하위 paper 를 함께 갱신합니다.
- `COMMAND.md`: 측정용 임시 시드 실행 명령을 실행해 확인한 뒤 추가합니다.
- `.claude/skills/writing-style-local/SKILL.md`: 확정 표기 표의 "배정기록" 행에 화면 문구 "스케줄링 기록", 새 용어 "미확정 배정안", "이전 확정본".
- `.claude/skills/refactoring-local/SKILL.md`: services 직접 호출 예외에 `period.pipeline` 의 `notify_assignment_updated`, S3-34, S3-44, S3-46 의 줄.
- 개발일지 `dev_history/2026-10-12.md`.
