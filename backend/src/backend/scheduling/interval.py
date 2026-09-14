from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class TimeInterval:
    """시작시간과 종료시간이 있는 시간 구간입니다.

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
            raise ValueError("시간 구간의 끝은 시작보다 뒤여야 합니다")
