import pytest
from pydantic import BaseModel, ValidationError

from backend.api.schemas import (
    ReservationCreateIn,
    ReservationUpdateIn,
    UnavailableCreateIn,
)

# offset 이 붙은 시각을 통과시키면 offset 만 삭제되어 9시간 어긋난 값이 오류 없이 저장됩니다.
_MODELS_WITH_TIMES: list[tuple[type[BaseModel], dict[str, object]]] = [
    (UnavailableCreateIn, {}),
    (ReservationCreateIn, {"room_id": 1}),
    (ReservationUpdateIn, {}),
]


@pytest.mark.parametrize(("model", "rest"), _MODELS_WITH_TIMES)
def test_rejects_a_time_with_an_offset(
    model: type[BaseModel], rest: dict[str, object]
) -> None:
    body = {
        **rest,
        "starts_at": "2026-09-18T18:00:00+09:00",
        "ends_at": "2026-09-18T19:00:00",
    }

    with pytest.raises(ValidationError):
        model.model_validate(body)


@pytest.mark.parametrize(("model", "rest"), _MODELS_WITH_TIMES)
def test_accepts_a_time_without_an_offset(
    model: type[BaseModel], rest: dict[str, object]
) -> None:
    body = {
        **rest,
        "starts_at": "2026-09-18T18:00:00",
        "ends_at": "2026-09-18T19:00:00",
    }

    assert model.model_validate(body).starts_at.tzinfo is None  # type: ignore[attr-defined]
