from dataclasses import dataclass
from datetime import date, datetime, time, timedelta


@dataclass(frozen=True)
class TimeInterval:
    """시작 시간과 종료 시간이 있는 시간 구간입니다.

    생성 시 검증하여 잘못된 구간을 만들 수 없게 방지합니다. 이 class 에서 검증하지 않으면
    엔진이 error 를 발생시키지 않고 잘못된 배정안을 출력합니다.
    """

    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        # tzinfo(시간대 정보)가 있는 datetime은 거부합니다. 시간대 지원은 미구현입니다.
        if self.start.tzinfo is not None or self.end.tzinfo is not None:
            raise ValueError(
                "시간대가 붙은 시각은 아직 지원하지 않습니다. 시간대 없는 시각을 넣으십시오"
            )
        if self.end <= self.start:
            raise ValueError("종료 시간은 시작 시간보다 뒤여야 해요")


def day_window(day: date, starts: time, ends: time) -> TimeInterval:
    """day 의 starts 부터 ends 까지의 구간입니다. ends 가 starts 보다 이르거나 같으면 다음 날의 ends 까지입니다.

    시각 2개로 저장하는 하루 중의 범위(합주실 운영 시간, 팀별 합주 시간대, 전체 합주 시각)를 비교할 때 사용합니다.
    ends 가 00:00 인지는 검증하지 않습니다. 저장 전에 require_clock_range 와 DB CHECK 제약이 검증합니다.
    """
    end_day = day + timedelta(days=1) if ends <= starts else day
    return TimeInterval(datetime.combine(day, starts), datetime.combine(end_day, ends))
