from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class TimeInterval:
    """시작과 끝이 있는 시간 구간.

    잘못된 구간을 만들 수 없게 막는다. 여기서 걸러내지 못하면
    엔진이 뒤에서 조용히 틀린 답을 낸다.
    """

    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        # tzinfo 가 붙은 시각은 거부한다. 시간대 지원은 아직 열지 않았다.
        if self.start.tzinfo is not None or self.end.tzinfo is not None:
            raise ValueError(
                "시간대가 붙은 시각은 아직 지원하지 않습니다. 시간대 없는 시각을 넣으십시오"
            )
        if self.end <= self.start:
            raise ValueError("시간 구간의 끝은 시작보다 뒤여야 합니다")
