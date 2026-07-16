from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class TimeInterval:
    start: datetime
    end: datetime
