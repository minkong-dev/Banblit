from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from backend.db.models import Room, UnavailableTime
from backend.scheduling.pipeline import Member as EngineMember
from backend.scheduling.pipeline import Room as EngineRoom
from backend.scheduling.pipeline import Team as EngineTeam
from backend.scheduling.pipeline import TimeInterval, generate_slots

DAY = timedelta(days=1)
WEEK = timedelta(days=7)
# 요일 일곱 개를 전부 고른 값입니다. 매일 반복과 같습니다.
ALL_WEEKDAYS = 0b1111111
# 반복을 전개할 때 시작일로부터 계산할 최대 기간입니다. 고른 요일이 없거나 종료일이 잘못 들어와도
# 무한히 돌지 않게 하는 상한입니다. 5년이면 이 서비스의 어떤 조회 범위보다 넓습니다.
MAX_REPEAT_SPAN = timedelta(days=365 * 5)


def dates_in_period(starts_on: date, ends_on: date) -> list[date]:
    """기간의 시작일부터 종료일까지, 양 끝을 포함한 날짜 목록을 반환합니다."""
    span = (ends_on - starts_on).days
    return [starts_on + timedelta(days=offset) for offset in range(span + 1)]


def expand_unavailable(
    rows: list[UnavailableTime],
    window_start: datetime,
    window_end: datetime,
) -> list[TimeInterval]:
    """불가능 시간을 기간과 겹치는 구간 목록으로 확장합니다.

    매일 반복하면 1일, 매주 반복하면 7일 간격으로 되풀이하되, 반복 종료일이 있으면
    그 날짜까지만 생성합니다.
    기간과 전혀 겹치지 않는 구간은 제외합니다 — 엔진에 넘겨도 아무 영향이 없습니다.
    """
    expanded: list[TimeInterval] = []
    for row in rows:
        length = row.ends_at - row.starts_at
        for start in _occurrences(row, window_end):
            end = start + length
            if end <= window_start or start >= window_end:
                continue
            expanded.append(TimeInterval(start=start, end=end))
    return expanded


def _occurrences(row: UnavailableTime, window_end: datetime) -> list[datetime]:
    """이 불가능 일정이 시작하는 시각들을 반환합니다. window_end 이후는 만들지 않습니다."""
    chosen = row.repeat_weekdays or 0
    if chosen == 0:
        return [row.starts_at]

    limit = window_end
    if row.repeat_until is not None:
        # 반복 종료일은 "그 날짜까지"라는 뜻이므로 그날의 끝까지 인정합니다.
        limit = min(limit, datetime.combine(row.repeat_until + timedelta(days=1), time()))

    # 횟수는 고른 요일 전부를 한 세트로 세는 주 단위입니다. 월·화·목·금에 4 면 그 네 요일이
    # 4주 동안 반복해 16번입니다. 한 번에 하나씩 세면 4 가 월·화·목·금 한 주로 끝나 버립니다.
    # 주의 경계는 월요일입니다(date.weekday() 가 0).
    weeks = row.repeat_count
    first_monday = (row.starts_at - timedelta(days=row.starts_at.weekday())).date()
    if weeks is not None:
        # 마지막 주의 일요일까지가 끝입니다. 화면이 보는 범위와 무관하게 여기서 자릅니다.
        last_day = first_monday + timedelta(days=weeks * 7)
        limit = min(limit, datetime.combine(last_day, time()))

    starts: list[datetime] = []
    current = row.starts_at
    while current < limit:
        if chosen & (1 << current.weekday()):
            starts.append(current)
        current += DAY
        # 고른 요일이 없거나 종료일이 시작일보다 앞서면 무한히 돌 수 있으므로 상한을 둡니다.
        if current - row.starts_at > MAX_REPEAT_SPAN:
            break
    return starts



# 토요일·일요일의 date.weekday() 값입니다. 월요일이 0 이고 일요일이 6 입니다.
SATURDAY = 5


@dataclass(frozen=True)
class PracticeWindow:
    """팀별합주를 배정할 수 있는 하루 중의 시간대입니다. 평일(월~금)과 주말(토·일)이 다를 수 있습니다.

    합주실 개방시각과는 다른 값입니다. 합주실이 09시에 열어도 팀별합주는 17시부터만 배정할 수
    있습니다. 실제 배정 구간은 이 시간대와 합주실 개방시각의 교집합입니다.

    None 인 쪽은 시간대를 정하지 않았다는 뜻이고, 그날은 합주실 개방시각 전체를 씁니다.
    """

    weekday: tuple[time, time] | None
    weekend: tuple[time, time] | None

    def on(self, day: date) -> tuple[time, time] | None:
        return self.weekend if day.weekday() >= SATURDAY else self.weekday


def build_engine_rooms(
    rooms: list[Room], days: list[date], window: PracticeWindow | None = None
) -> list[EngineRoom]:
    """합주실 × 날짜를 엔진 입력 합주실 목록으로 확장합니다.

    엔진은 한 합주실에 이어진 운영시간 하나만 받으므로 날짜마다 한 번씩 전달합니다.
    번호는 DB의 합주실 번호를 그대로 사용합니다 — 날짜가 다르면 시간 구간이 달라
    같은 번호가 여러 번 나와도 slot(점유 단위 길이의 시간 칸)끼리는 겹치지 않습니다.

    window 를 넘기면 그날의 팀별합주 시간대와 겹치는 부분만 남깁니다. 겹치는 시간이 없는
    날은 목록에서 빠집니다 — 길이가 0 이거나 음수인 구간을 엔진에 넘기면 칸을 만들지 못하거나
    운영 시간이 잘못되었다고 거부합니다.
    """
    engine_rooms: list[EngineRoom] = []
    for day in days:
        limits = None if window is None else window.on(day)
        for room in rooms:
            start = datetime.combine(day, room.opens_at)
            end = datetime.combine(day, room.closes_at)
            if limits is not None:
                start = max(start, datetime.combine(day, limits[0]))
                end = min(end, datetime.combine(day, limits[1]))
            if start >= end:
                continue
            engine_rooms.append(
                EngineRoom(id=room.id, open_period=TimeInterval(start=start, end=end))
            )
    return engine_rooms


def auto_sessions_per_team(
    engine_rooms: list[EngineRoom],
    team_count: int,
    slot_minutes: int,
    session_minutes: int,
) -> int:
    """겹치지 않게 들어가는 session 총 횟수를 팀 수로 나누어, 팀마다 가질 session 횟수를 반환합니다.

    합주실 하나가 받을 수 있는 session 횟수는 그 합주실의 칸 수를 session 1회가 차지하는 칸 수로
    나눈 몫입니다. 나머지 칸은 session 1회를 채우지 못하므로 자동 배정 대상에서 빠지고, 선착순
    예약이 쓸 수 있는 칸으로 남습니다.
    """
    if team_count <= 0:
        raise ValueError("배정할 팀이 없습니다")

    slots_per_session = session_minutes // slot_minutes
    total = 0
    for room in engine_rooms:
        slots = len(generate_slots(room.open_period, slot_minutes))
        total += slots // slots_per_session

    per_team = total // team_count
    if per_team == 0:
        raise ValueError(
            f"전체 자리({total}회)가 팀 수({team_count})보다 적어 "
            f"팀마다 한 번도 줄 수 없습니다"
        )
    return per_team


def build_engine_teams(
    team_ids: list[int],
    member_ids_by_team: dict[int, list[int]],
    unavailable_by_member: dict[int, list[TimeInterval]],
) -> list[EngineTeam]:
    """팀과 그 명단을 엔진 입력으로 변환합니다.

    팀도 멤버도 DB 의 번호를 그대로 사용합니다. 멤버는 동명이인이 있어 이름으로는
    구분할 수 없고, 두 팀에 속한 한 멤버는 두 팀에서 같은 번호이므로 엔진이 같은 사람으로 처리합니다.
    """
    engine_teams: list[EngineTeam] = []
    for team_id in team_ids:
        members = [
            EngineMember(
                id=member_id,
                unavailable=list(unavailable_by_member.get(member_id, [])),
            )
            for member_id in member_ids_by_team.get(team_id, [])
        ]
        engine_teams.append(EngineTeam(id=team_id, members=members))
    return engine_teams
