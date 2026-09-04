from datetime import date, time

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.db.models import Period


def _period(
    session: Session, starts_on: date, ends_on: date, kind: str = "open"
) -> Period:
    period = Period(
        kind=kind,
        starts_on=starts_on,
        ends_on=ends_on,
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    session.add(period)
    session.flush()
    return period


def test_periods_are_listed_by_start_date_then_id(
    api_client: TestClient, db_session: Session
) -> None:
    later = _period(db_session, date(2026, 10, 1), date(2026, 10, 2))
    earlier = _period(db_session, date(2026, 9, 1), date(2026, 9, 2))
    db_session.commit()

    response = api_client.get("/periods")

    assert response.status_code == 200
    ids = [p["id"] for p in response.json()["periods"]]
    assert ids == [earlier.id, later.id]


def test_period_is_created_with_string_dates_and_times(api_client: TestClient) -> None:
    response = api_client.post(
        "/periods",
        json={
            "kind": "focused",
            "starts_on": "2026-09-14",
            "ends_on": "2026-09-27",
            "everyday": True,
            "first_run_at": "09:00",
            "second_run_at": "21:00",
        },
    )

    assert response.status_code == 201
    period = response.json()["period"]
    assert period["kind"] == "focused"
    assert period["starts_on"] == "2026-09-14"
    assert period["ends_on"] == "2026-09-27"
    assert period["everyday"] is True
    assert period["first_run_at"] == "09:00"
    assert period["second_run_at"] == "21:00"
    assert isinstance(period["id"], int)


def test_period_creation_rejects_an_unknown_kind(api_client: TestClient) -> None:
    response = api_client.post(
        "/periods",
        json={
            "kind": "party",
            "starts_on": "2026-09-14",
            "ends_on": "2026-09-27",
            "everyday": False,
            "first_run_at": "09:00",
            "second_run_at": "21:00",
        },
    )

    assert response.status_code == 422
    assert "kind" in response.json()["detail"]


def test_period_creation_rejects_ends_on_before_starts_on(
    api_client: TestClient,
) -> None:
    response = api_client.post(
        "/periods",
        json={
            "kind": "open",
            "starts_on": "2026-09-27",
            "ends_on": "2026-09-14",
            "everyday": False,
            "first_run_at": "09:00",
            "second_run_at": "21:00",
        },
    )

    assert response.status_code == 422
    assert "종료일" in response.json()["detail"]


def test_period_is_patched_with_only_the_sent_fields(
    api_client: TestClient, db_session: Session
) -> None:
    period = _period(db_session, date(2026, 9, 1), date(2026, 9, 10))
    db_session.commit()

    response = api_client.patch(
        f"/periods/{period.id}", json={"ends_on": "2026-09-20"}
    )

    assert response.status_code == 200
    body = response.json()["period"]
    assert body["starts_on"] == "2026-09-01"
    assert body["ends_on"] == "2026-09-20"
    assert body["kind"] == "open"


def test_period_is_patched_with_a_new_kind_starts_on_everyday_and_run_times(
    api_client: TestClient, db_session: Session
) -> None:
    period = _period(db_session, date(2026, 9, 1), date(2026, 9, 10), kind="open")
    db_session.commit()

    response = api_client.patch(
        f"/periods/{period.id}",
        json={
            "kind": "focused",
            "starts_on": "2026-09-02",
            "everyday": True,
            "first_run_at": "08:00",
            "second_run_at": "20:00",
        },
    )

    assert response.status_code == 200
    body = response.json()["period"]
    assert body["kind"] == "focused"
    assert body["starts_on"] == "2026-09-02"
    assert body["ends_on"] == "2026-09-10"
    assert body["everyday"] is True
    assert body["first_run_at"] == "08:00"
    assert body["second_run_at"] == "20:00"


def test_period_patch_rejects_an_unknown_kind(api_client: TestClient, db_session: Session) -> None:
    period = _period(db_session, date(2026, 9, 1), date(2026, 9, 10))
    db_session.commit()

    response = api_client.patch(f"/periods/{period.id}", json={"kind": "party"})

    assert response.status_code == 422
    assert "kind" in response.json()["detail"]


def test_period_patch_rejects_ends_on_before_the_kept_starts_on(
    api_client: TestClient, db_session: Session
) -> None:
    period = _period(db_session, date(2026, 9, 10), date(2026, 9, 20))
    db_session.commit()

    response = api_client.patch(
        f"/periods/{period.id}", json={"ends_on": "2026-09-01"}
    )

    assert response.status_code == 422
    assert "종료일" in response.json()["detail"]


def test_period_patch_of_unknown_id_is_rejected(api_client: TestClient) -> None:
    response = api_client.patch("/periods/999999", json={"everyday": True})

    assert response.status_code == 422
    assert "기간" in response.json()["detail"]


def test_period_patch_can_turn_everyday_back_off(
    api_client: TestClient, db_session: Session
) -> None:
    period = _period(db_session, date(2026, 9, 1), date(2026, 9, 10))
    db_session.commit()
    on = api_client.patch(f"/periods/{period.id}", json={"everyday": True})
    assert on.json()["period"]["everyday"] is True

    response = api_client.patch(f"/periods/{period.id}", json={"everyday": False})

    assert response.status_code == 200
    assert response.json()["period"]["everyday"] is False


def test_period_patch_does_not_leak_a_rejected_kind_change(
    api_client: TestClient, db_session: Session
) -> None:
    """검증이 끝나기 전에 값부터 대입하면, 실패한 요청의 일부가 새어 나갈 수 있다.

    kind 변경과 잘못된 날짜 순서를 함께 보내면 요청 전체가 거절되어야 한다. kind를
    날짜 검증보다 먼저 대입하면, 커밋은 안 해도 세션에 dirty 상태로 남는다. 뒤이은
    조회(GET)가 같은 세션에서 오토플러시를 일으키면, 커밋한 적 없는 kind 변경이
    그대로 저장된다 — update_room처럼 검증을 다 통과한 뒤에만 대입해야 막힌다.
    """
    period = _period(db_session, date(2026, 9, 10), date(2026, 9, 20), kind="open")
    db_session.commit()

    response = api_client.patch(
        f"/periods/{period.id}",
        json={"kind": "focused", "ends_on": "2026-09-01"},
    )
    assert response.status_code == 422

    after = api_client.get("/periods").json()["periods"]
    saved_kind = next(p["kind"] for p in after if p["id"] == period.id)
    assert saved_kind == "open"
