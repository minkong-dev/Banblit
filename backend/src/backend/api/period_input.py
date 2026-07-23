from datetime import date, datetime, time, timedelta

from backend.db.models import Room, UnavailableTime
from backend.scheduling.assignment import Room as EngineRoom
from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_slots

WEEK = timedelta(days=7)


def dates_in_period(starts_on: date, ends_on: date) -> list[date]:
    """기간의 시작일부터 종료일까지, 양 끝을 포함한 날짜 목록."""
    span = (ends_on - starts_on).days
    return [starts_on + timedelta(days=offset) for offset in range(span + 1)]


def expand_unavailable(
    rows: list[UnavailableTime],
    window_start: datetime,
    window_end: datetime,
) -> list[TimeInterval]:
    """불가능시간을 기간 안에 실제로 걸리는 구간들로 풀어낸다.

    매주 반복이면 7일 간격으로 되풀이하되, 반복 종료일이 있으면 그 날짜까지만 만든다.
    기간과 조금도 겹치지 않는 구간은 버린다 — 엔진에 넘겨도 아무 영향이 없다.
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
    if not bool(row.repeats_weekly):
        return [row.starts_at]

    limit = window_end
    if row.repeat_until is not None:
        # 반복 종료일은 "그 날짜까지"라는 뜻이므로 그날의 끝까지 인정한다.
        limit = min(limit, datetime.combine(row.repeat_until + timedelta(days=1), time()))

    starts: list[datetime] = []
    current = row.starts_at
    while current < limit:
        starts.append(current)
        current += WEEK
    return starts


def room_key(room_name: str, day: date) -> str:
    """엔진에 넘길 합주실 이름. 엔진은 한 합주실에 이어진 운영시간 하나만 줄 수 있어,
    날짜마다 별개의 합주실로 넘긴다. 오류 메시지에 그대로 나오므로 사람이 읽을 수 있게 둔다."""
    return f"{room_name} ({day.isoformat()})"


def build_engine_rooms(
    rooms: list[Room], days: list[date]
) -> tuple[list[EngineRoom], dict[str, int], dict[str, str]]:
    """합주실 × 날짜를 엔진 합주실 목록으로 펼치고, 되돌릴 대응표를 함께 만든다."""
    engine_rooms: list[EngineRoom] = []
    room_id_by_key: dict[str, int] = {}
    room_name_by_key: dict[str, str] = {}
    # 방 이름 자체가 다른 방의 (이름+날짜) 표기와 우연히 같아질 수 있다. 생성된 키들끼리만
    # 비교하면 이 경우를 놓치므로, 원본 방 이름 전체도 함께 겹침 대상에 넣는다.
    room_names = {room.name for room in rooms}
    for day in days:
        for room in rooms:
            key = room_key(room.name, day)
            if key in room_id_by_key or key in room_names:
                # 조용히 덮어쓰면 배정 결과가 엉뚱한 방에 저장된다.
                raise ValueError(f"합주실 이름이 겹칩니다: {key}")
            engine_rooms.append(
                EngineRoom(
                    name=key,
                    open_period=TimeInterval(
                        start=datetime.combine(day, room.opens_at),
                        end=datetime.combine(day, room.closes_at),
                    ),
                )
            )
            room_id_by_key[key] = room.id
            room_name_by_key[key] = room.name
    return engine_rooms, room_id_by_key, room_name_by_key


def auto_slots_per_team(engine_rooms: list[EngineRoom], team_count: int) -> int:
    """전체 칸을 팀 수로 나눠 팀마다 가질 자리 개수를 정한다(나머지는 남는 자리)."""
    if team_count <= 0:
        raise ValueError("배정할 팀이 없습니다")

    total = sum(len(generate_slots(room.open_period)) for room in engine_rooms)
    per_team = total // team_count
    if per_team == 0:
        raise ValueError(
            f"전체 자리({total}칸)가 팀 수({team_count})보다 적어 "
            f"팀마다 한 칸도 줄 수 없습니다"
        )
    return per_team
