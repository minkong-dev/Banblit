from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from backend.db.models import Room, UnavailableTime
from backend.scheduling.pipeline import Member as EngineMember
from backend.scheduling.pipeline import Room as EngineRoom
from backend.scheduling.pipeline import Team as EngineTeam
from backend.scheduling.pipeline import TimeInterval, generate_slots

DAY = timedelta(days=1)
WEEK = timedelta(days=7)


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
    step = _repeat_step(row)
    if step is None:
        return [row.starts_at]

    limit = window_end
    if row.repeat_until is not None:
        # 반복 종료일은 "그 날짜까지"라는 뜻이므로 그날의 끝까지 인정합니다.
        limit = min(limit, datetime.combine(row.repeat_until + timedelta(days=1), time()))

    starts: list[datetime] = []
    current = row.starts_at
    while current < limit:
        starts.append(current)
        current += step
    return starts


def _repeat_step(row: UnavailableTime) -> timedelta | None:
    """반복 간격을 반환합니다. 반복이 아니면 None 을 반환합니다.

    session 에 추가하지 않은 객체는 열의 기본값이 아직 적용되지 않아 None 일 수 있으므로
    bool() 로 변환합니다. 매일·매주가 둘 다 켜진 경우는 경계에서 거부되므로 이 함수에서는 매일 반복을 먼저 확인합니다.
    """
    if bool(row.repeats_daily):
        return DAY
    if bool(row.repeats_weekly):
        return WEEK
    return None


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


def auto_slots_per_team(
    engine_rooms: list[EngineRoom], team_count: int, slot_minutes: int
) -> int:
    """전체 slot(시간 칸)을 팀 수로 나누어 팀마다 가질 slot 개수를 반환합니다(나머지는 남는 slot)."""
    if team_count <= 0:
        raise ValueError("배정할 팀이 없습니다")

    total = sum(
        len(generate_slots(room.open_period, slot_minutes)) for room in engine_rooms
    )
    per_team = total // team_count
    if per_team == 0:
        raise ValueError(
            f"전체 자리({total}칸)가 팀 수({team_count})보다 적어 "
            f"팀마다 한 칸도 줄 수 없습니다"
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
