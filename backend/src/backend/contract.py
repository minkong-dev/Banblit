"""모듈 2개 이상이 같은 값을 참조해야 하는 선언만 두는 파일입니다. 계산, 판단, 분기를 두지 않습니다.

참조하는 모듈은 db(CHECK 제약 문구), api(요청 검증), services(설정 저장), scheduling(slot 분할)입니다.
"""

# Literal[...] 은 허용 값을 타입으로 선언하고(mypy 가 다른 값을 거절), get_args 는 그 허용 값을 tuple 로 꺼냅니다.
# 함께 써서 타입 검사와 실행 시 검증(CHECK 제약, 요청 검증)이 같은 목록 1개를 참조하게 합니다.
from typing import Literal, get_args

# 점유 단위(slot, 칸)로 선택할 수 있는 값(분)입니다. 세 말은 같은 뜻으로, 예약과 배정이 시간을 나누는 최소 단위 1개입니다.
# 전부 60 의 약수라 정시가 언제나 격자 위에 있습니다.
# 6 은 60 의 약수지만 제외합니다 — 합주실을 6분 단위로 예약하는 경우가 없습니다.
#
# 이 목록에 작성되어 있는 내용을 기준으로 합니다. API(api/schemas.py), DB CHECK 제약(db/models.py), 화면
# (frontend/src/lib/settings.ts 의 SLOT_MINUTE_CHOICES)이 같은 값을 사용해야 합니다.
SlotMinutes = Literal[5, 10, 12, 15, 20, 30, 60]
SLOT_MINUTE_CHOICES: tuple[SlotMinutes, ...] = get_args(SlotMinutes)

# settings.slot_minutes 의 기본값입니다.
DEFAULT_SLOT_MINUTES = 60

# 합주 1회가 진행되는 길이(분)입니다. 칸 하나의 크기와는 다른 값입니다 — 칸은 합주를 "시작할 수 있는
# 간격"이고, 이 값은 "한 번 시작하면 몇 분 동안 이어지는지"입니다. 30분 격자에 60분 합주면
# 18:00·18:30·19:00 어디서든 시작해 1시간 뒤에 끝납니다.
DEFAULT_SESSION_MINUTES = 60

# 합주 1회 길이의 상한(분)입니다. 상한이 없으면 하루 운영 시간보다 긴 값이 저장되어,
# 배정할 수 있는 session 이 0개인 설정이 error 없이 저장됩니다.
MAX_SESSION_MINUTES = 240

# 기간마다 지정하는 팀 1개의 하루 배정 시간 상한(periods.daily_max_hours)과 연속 배정 시간 상한(periods.max_consecutive_hours)입니다.
# 단위는 시간이고 1 이상 MAX_DAILY_HOURS 이하, 연속 상한은 하루 상한 이하입니다(사용자 결정 2026-10-20).
# API(api/schemas.py), DB CHECK 제약(db/models.py), 화면(frontend/src/lib/settings.ts)이 같은 값을 씁니다.
MAX_DAILY_HOURS = 12
DEFAULT_DAILY_MAX_HOURS = 2
DEFAULT_MAX_CONSECUTIVE_HOURS = 2

# 반려할 수 있는 대상입니다. 반려는 관리 권한자(reservation_manage, unavailable_manage)가 다른 멤버가 등록한 예약이나 불가능 일정을
# 사유와 함께 삭제하는 동작입니다. 관리 권한자가 다른 멤버의 예약을 취소하거나 불가능 일정을 삭제하면
# 사유를 담은 알림이 원래 등록한 멤버에게 갑니다. 알림 table 의 CHECK 제약(db/models.py), 알림 응답
# (api/schemas.py), 화면(frontend/src/lib/contract.ts 의 RejectTarget)이 같은 값을 씁니다.
REJECT_TARGETS: tuple[str, ...] = ("reservation", "unavailable")

# 반려 사유의 최대 글자 수입니다. 알림 한 칸에 표시하므로 문단 하나 분량으로 제한합니다.
# 요청 검증(api/schemas.py)과 화면의 입력칸(frontend/src/lib/contract.ts)이 같은 값을 씁니다.
REJECT_REASON_MAX_LENGTH = 300

# 종료 시간이 시작 시간보다 이를 때 허용하는 유일한 종료 시간입니다. 이 값이면 다음 날 00:00 에 끝나는 범위로 봅니다
# (사용자 결정 2026-10-12). 화면이 24:00 까지만 표시하므로 그 뒤의 시각은 거부합니다. DB CHECK 제약(db/models.py),
# 입력 검증(services/validation/rules.py), 화면(frontend/src/lib/settings.ts 의 LATEST_CLOSE_NEXT_DAY)이 같은 값을 씁니다.
LATEST_CLOSE_NEXT_DAY = "00:00"

# 권한 항목입니다. 생성, 수정, 삭제, 조회를 따로 두어 권한 세트를 만드는 사람이 항목을 1개씩 선택하게 합니다.
# 항목 목록은 이 코드에 고정하고, 활성화 여부만 permission_sets 에 저장합니다.
Permission = Literal[
    "room_create",  # 합주실 생성
    "room_edit",  # 합주실 여는 시각·닫는 시각 수정
    "room_delete",  # 합주실 삭제(그 합주실의 예약·배정 결과·스케줄링 기록도 함께 삭제)
    "period_create",  # 기간 생성
    "period_edit",  # 기간 수정
    "period_delete",  # 기간 삭제(그 기간의 배정 결과·계산 기록·스케줄링 기록도 함께 삭제)
    "team_create",  # 팀 생성
    "team_edit",  # 팀 이름·포지션 구성 수정
    "team_delete",  # 팀 삭제
    "member_add",  # 팀 포지션에 멤버 배정
    "member_remove",  # 팀 포지션에서 다른 멤버 제외
    "member_expel",  # 멤버 추방(계정 삭제)
    "notice_write",  # 공지 작성
    "board_moderate",  # 다른 사용자의 글·댓글 삭제와 글 블라인드(수정은 작성자만 가능)
    "board_read_all",  # 소속되지 않은 팀의 팀 게시판 조회(작성은 소속 팀만 가능)
    "reservation_manage",  # 다른 사용자의 예약 수정과 반려(사유를 담은 알림과 함께 취소)
    "unavailable_read",  # 다른 사용자의 불가능 일정 조회
    "unavailable_manage",  # 다른 사용자의 불가능 일정 반려(사유를 담은 알림과 함께 삭제. 등록·수정은 본인만 가능)
    "assign_run",  # 배정 계산 실행
    "assign_read",  # 계산 결과 조회
    "proposal_confirm",  # 스케줄링 기록 조회와 적용
    "permission_manage",  # permission set 생성·수정·삭제
    "permission_grant",  # 멤버에게 permission set 부여·회수
]

PERMISSIONS: tuple[Permission, ...] = get_args(Permission)

# 팀을 생성할 때 선택하는 포지션(악기 역할) 종류입니다. 자리 하나가 이 중 하나를 할당받습니다.
# 같은 포지션을 2자리 이상 두면 ordinal(순서 번호, 1부터)로 구분합니다. 예: 일렉 2자리는
# (일렉, 1)과 (일렉, 2)입니다.
Instrument = Literal["보컬", "일렉", "통기타", "베이스", "신디", "드럼"]
INSTRUMENTS: tuple[Instrument, ...] = get_args(Instrument)

# 팀 색입니다. @radix-ui/colors 의 이름 25개 중 바로 옆 색과 거의 같은 5개(ruby, violet, bronze, cyan, grass)를
# 뺀 20개입니다. 순서가 곧 자동 배정 순서입니다. DB CHECK 제약(db/models.py), 팀 생성(services/roster/roster_service.py),
# 화면(frontend/src/lib/teamColors.ts)이 같은 값을 씁니다.
TeamColor = Literal[
    "tomato", "red", "crimson", "pink", "plum", "purple", "iris", "indigo", "blue", "sky",
    "teal", "jade", "green", "mint", "lime", "yellow", "amber", "orange", "gold", "brown",
]
TEAM_COLORS: tuple[TeamColor, ...] = get_args(TeamColor)

# 기간의 종류입니다. open 은 선착순 예약 기간이고, 집중 합주기간(focused)은 예약을 받지 않고 자동 배정이 실행되는 기간입니다. DB CHECK 제약(db/models.py)과
# 입력 검증(services/validation/rules.py)이 같은 값을 씁니다.
PeriodKind = Literal["open", "focused"]
PERIOD_KINDS: tuple[PeriodKind, ...] = get_args(PeriodKind)

# 알림의 종류입니다. 문구는 이 코드에 두지 않습니다. table 에는 종류만 저장하고 사람이 읽을
# 문장은 화면이 만듭니다. 그래서 문구를 수정하면 이미 저장된 알림에도 적용되고, table 을
# 수정할 필요가 없습니다.
# reservation_cancelled: 집중 합주기간이 생기거나 넓어져 예약이 취소되었습니다(services/reservation/reservation_service.py).
# rejected: 관리 권한자가 예약이나 불가능 일정을 사유와 함께 반려했습니다(services/notification/notification_service.py).
# assignment_fixed: 마감 일시가 지나 배정이 확정되었습니다(jobs/auto_assign.py). 전체 멤버에게 갑니다.
# assignment_unfixed: 스케줄링 기록 확정 권한자가 사유와 함께 확정을 해제했습니다(services/period/close_service.py). 전체 멤버에게 갑니다.
# assignment_updated: 관리자가 스케줄링 기록 1개를 적용해 현재 배정안이 바뀌었습니다(services/period/pipeline.py 의 apply_saved_record). 전체 멤버에게 갑니다.
NotificationKind = Literal["assignment_updated", "reservation_cancelled", "rejected", "assignment_fixed", "assignment_unfixed"]
NOTIFICATION_KINDS: tuple[NotificationKind, ...] = get_args(NotificationKind)

# 배정 계산 작업의 상태입니다. 작업 실행(api/job_runner.py)과 응답(api/schemas.py)이 같은 값을 씁니다.
JobStatus = Literal["queued", "running", "done", "failed"]

# 자동 배정이 실행되는 하루 2회의 계산 시각입니다. 불가능 일정이 하루 중에도 추가되므로 1회보다 자주 다시 계산하되,
# 매번 계산하면 기록이 과하게 쌓여 2회로 둡니다(사용자 결정). "first" 는 기간의 first_run_at, "second" 는 second_run_at 입니다.
# 자동 배정(jobs/auto_assign.py)과 실행 기록 table 의 CHECK 제약(db/models.py)이 같은 값을 씁니다.
RunSlot = Literal["first", "second"]
RUN_SLOTS: tuple[RunSlot, ...] = get_args(RunSlot)

# 로그인 session 이 없거나 만료되어 401 로 거절할 때 응답 본문의 code 입니다. 화면(frontend/src/lib/contract.ts 의
# SESSION_REJECTED_CODE)은 문구가 아니라 이 값으로 로그인 화면 이동을 판정하므로, 문구를 수정해도 판정이 바뀌지 않습니다.
SESSION_REJECTED_CODE = "session_rejected"
