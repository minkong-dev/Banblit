from datetime import date, datetime, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import AssignmentRun, Period
from conftest import AccountFactory

HEAD = ("박서연", "head@example.com")
MEMBER = ("김민수", "m@example.com")


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
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    later = _period(db_session, date(2026, 10, 1), date(2026, 10, 2))
    earlier = _period(db_session, date(2026, 9, 1), date(2026, 9, 2))
    db_session.commit()

    response = api_client.get("/periods", cookies=head)

    assert response.status_code == 200
    ids = [p["id"] for p in response.json()["periods"]]
    assert ids == [earlier.id, later.id]


def test_period_is_created_with_string_dates_and_times(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account(*HEAD)

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
        cookies=head,
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


def test_period_creation_rejects_an_unknown_kind(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account(*HEAD)

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
        cookies=head,
    )

    assert response.status_code == 422
    assert "kind" in response.json()["detail"]


def test_period_creation_rejects_ends_on_before_starts_on(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account(*HEAD)

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
        cookies=head,
    )

    assert response.status_code == 422
    assert "종료일" in response.json()["detail"]


def test_period_is_patched_with_only_the_sent_fields(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    period = _period(db_session, date(2026, 9, 1), date(2026, 9, 10))
    db_session.commit()

    response = api_client.patch(
        f"/periods/{period.id}", json={"ends_on": "2026-09-20"}, cookies=head
    )

    assert response.status_code == 200
    body = response.json()["period"]
    assert body["starts_on"] == "2026-09-01"
    assert body["ends_on"] == "2026-09-20"
    assert body["kind"] == "open"


def test_period_is_patched_with_a_new_kind_starts_on_everyday_and_run_times(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
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
        cookies=head,
    )

    assert response.status_code == 200
    body = response.json()["period"]
    assert body["kind"] == "focused"
    assert body["starts_on"] == "2026-09-02"
    assert body["ends_on"] == "2026-09-10"
    assert body["everyday"] is True
    assert body["first_run_at"] == "08:00"
    assert body["second_run_at"] == "20:00"


def test_period_patch_rejects_an_unknown_kind(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    period = _period(db_session, date(2026, 9, 1), date(2026, 9, 10))
    db_session.commit()

    response = api_client.patch(
        f"/periods/{period.id}", json={"kind": "party"}, cookies=head
    )

    assert response.status_code == 422
    assert "kind" in response.json()["detail"]


def test_period_patch_rejects_ends_on_before_the_kept_starts_on(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    period = _period(db_session, date(2026, 9, 10), date(2026, 9, 20))
    db_session.commit()

    response = api_client.patch(
        f"/periods/{period.id}", json={"ends_on": "2026-09-01"}, cookies=head
    )

    assert response.status_code == 422
    assert "종료일" in response.json()["detail"]


def test_period_patch_of_unknown_id_is_rejected(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account(*HEAD)

    response = api_client.patch(
        "/periods/999999", json={"everyday": True}, cookies=head
    )

    assert response.status_code == 422
    assert "기간" in response.json()["detail"]


def test_period_patch_can_turn_everyday_back_off(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    period = _period(db_session, date(2026, 9, 1), date(2026, 9, 10))
    db_session.commit()
    on = api_client.patch(
        f"/periods/{period.id}", json={"everyday": True}, cookies=head
    )
    assert on.json()["period"]["everyday"] is True

    response = api_client.patch(
        f"/periods/{period.id}", json={"everyday": False}, cookies=head
    )

    assert response.status_code == 200
    assert response.json()["period"]["everyday"] is False


def test_period_patch_does_not_leak_a_rejected_kind_change(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """검증이 끝나기 전에 값부터 대입하면, 거절된 요청의 일부가 저장될 수 있습니다.

    kind 변경과 잘못된 날짜 순서를 함께 보낼 경우 요청 전체가 거절되어야 합니다. kind 를
    날짜 검증보다 먼저 대입하면, commit 하지 않아도 session 에 dirty 상태로 남습니다. 뒤이은
    조회(GET)가 같은 session 에서 autoflush 를 일으킬 경우, commit 한 적 없는 kind 변경이
    그대로 저장됩니다. update_room 처럼 검증을 모두 통과한 뒤에만 대입해야 방지할 수 있습니다.
    """
    _, head = account(*HEAD)
    period = _period(db_session, date(2026, 9, 10), date(2026, 9, 20), kind="open")
    db_session.commit()

    response = api_client.patch(
        f"/periods/{period.id}",
        json={"kind": "focused", "ends_on": "2026-09-01"},
        cookies=head,
    )
    assert response.status_code == 422

    after = api_client.get("/periods", cookies=head).json()["periods"]
    saved_kind = next(p["kind"] for p in after if p["id"] == period.id)
    assert saved_kind == "open"


def test_period_is_deleted_and_leaves_the_list(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    period = _period(db_session, date(2026, 9, 1), date(2026, 9, 10), kind="focused")
    db_session.commit()

    response = api_client.delete(f"/periods/{period.id}", cookies=head)

    assert response.status_code == 204
    listed = api_client.get("/periods", cookies=head).json()["periods"]
    assert [p["id"] for p in listed] == []


def test_period_delete_of_unknown_id_is_rejected(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account(*HEAD)

    response = api_client.delete("/periods/999999", cookies=head)

    assert response.status_code == 422
    assert "기간" in response.json()["detail"]


def test_period_delete_also_removes_its_assignment_runs(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """기간의 계산 기록은 외래 키 CASCADE 로 함께 삭제됩니다. Period 에 ORM relationship 이 없으므로 DB 가 삭제합니다."""
    _, head = account(*HEAD)
    period = _period(db_session, date(2026, 9, 1), date(2026, 9, 10), kind="focused")
    db_session.add(
        AssignmentRun(
            period_id=period.id,
            run_on=date(2026, 9, 1),
            slot="first",
            ran_at=datetime(2026, 9, 1, 9, 0),
        )
    )
    db_session.commit()

    response = api_client.delete(f"/periods/{period.id}", cookies=head)

    assert response.status_code == 204
    db_session.expire_all()
    assert db_session.scalars(select(AssignmentRun)).all() == []


def _focused_body(starts_on: str, ends_on: str, everyday: bool = False) -> dict[str, object]:
    return {
        "kind": "focused",
        "starts_on": starts_on,
        "ends_on": ends_on,
        "everyday": everyday,
        "first_run_at": "09:00",
        "second_run_at": "21:00",
    }


def test_focused_period_overlapping_another_focused_period_is_rejected(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """집중 합주기간끼리는 하루라도 겹치면 등록을 거절합니다(patch_note 8번). 종료일 당일도 겹침입니다."""
    _, head = account(*HEAD)
    _period(db_session, date(2026, 9, 1), date(2026, 9, 10), kind="focused")
    db_session.commit()

    response = api_client.post(
        "/periods", json=_focused_body("2026-09-10", "2026-09-20"), cookies=head
    )

    assert response.status_code == 422
    assert "겹" in response.json()["detail"]


def test_everyday_focused_period_overlaps_every_later_focused_period(
    api_client: TestClient, account: AccountFactory
) -> None:
    """"매일" 기간은 종료일이 없으므로(사용자 결정 2026-09-11) 저장된 종료일 뒤의 기간과도 겹칩니다."""
    _, head = account(*HEAD)
    created = api_client.post(
        "/periods", json=_focused_body("2026-09-01", "2026-09-01", everyday=True), cookies=head
    )
    assert created.status_code == 201

    response = api_client.post(
        "/periods", json=_focused_body("2027-01-01", "2027-01-05"), cookies=head
    )

    assert response.status_code == 422


def test_focused_period_patched_into_an_overlap_is_rejected(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    _period(db_session, date(2026, 9, 1), date(2026, 9, 10), kind="focused")
    later = _period(db_session, date(2026, 9, 20), date(2026, 9, 30), kind="focused")
    db_session.commit()

    response = api_client.patch(
        f"/periods/{later.id}", json={"starts_on": "2026-09-05"}, cookies=head
    )

    assert response.status_code == 422
    assert "겹" in response.json()["detail"]


def test_open_period_may_overlap_a_focused_period(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    _period(db_session, date(2026, 9, 1), date(2026, 9, 30), kind="focused")
    db_session.commit()

    response = api_client.post("/periods", json=_NEW_PERIOD, cookies=head)

    assert response.status_code == 201


_NEW_PERIOD = {
    "kind": "open",
    "starts_on": "2026-09-14",
    "ends_on": "2026-09-27",
    "everyday": False,
    "first_run_at": "09:00",
    "second_run_at": "21:00",
}


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/periods", None),
        ("POST", "/periods", _NEW_PERIOD),
        ("PATCH", "/periods/1", {"everyday": True}),
        ("DELETE", "/periods/1", None),
    ],
)
def test_period_endpoints_reject_a_request_without_a_login(
    api_client: TestClient, method: str, path: str, body: dict[str, object] | None
) -> None:
    response = api_client.request(method, path, json=body)

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/periods", _NEW_PERIOD),
        ("PATCH", "/periods/1", {"everyday": True}),
        ("DELETE", "/periods/1", None),
    ],
)
def test_period_writes_are_rejected_for_a_plain_member(
    api_client: TestClient,
    account: AccountFactory,
    method: str,
    path: str,
    body: dict[str, object] | None,
) -> None:
    account(*HEAD)
    _, member = account(*MEMBER)

    response = api_client.request(method, path, json=body, cookies=member)

    assert response.status_code == 403


def test_periods_are_listed_for_a_plain_member(
    api_client: TestClient, account: AccountFactory
) -> None:
    account(*HEAD)
    _, member = account(*MEMBER)

    response = api_client.get("/periods", cookies=member)

    assert response.status_code == 200


# ── 팀별합주 시간대 ────────────────────────────────────────────────────────
#
# 합주실 개방시각과는 다른 값입니다. 합주실이 09시에 열어도 팀별합주는 17시부터만 배정합니다.
# 정하지 않은 기간은 그날 합주실 개방시각 전체를 씁니다.

_BASE = {
    "kind": "focused",
    "starts_on": "2026-09-14",
    "ends_on": "2026-09-27",
    "everyday": False,
    "first_run_at": "09:00",
    "second_run_at": "21:00",
}


def test_a_new_period_has_no_practice_window(
    api_client: TestClient, account: AccountFactory
) -> None:
    """정하지 않으면 두 쌍 모두 null 입니다. 지금까지의 동작과 같습니다."""
    _, head = account(*HEAD)

    period = api_client.post("/periods", json=_BASE, cookies=head).json()["period"]

    assert period["practice_window"] == {"weekday": None, "weekend": None}


def test_a_period_is_created_with_a_practice_window(
    api_client: TestClient, account: AccountFactory
) -> None:
    """평일은 저녁만, 주말은 낮부터 씁니다."""
    _, head = account(*HEAD)
    window = {
        "weekday": {"starts_at": "17:00", "ends_at": "23:00"},
        "weekend": {"starts_at": "09:00", "ends_at": "23:00"},
    }

    response = api_client.post(
        "/periods", json={**_BASE, "practice_window": window}, cookies=head
    )

    assert response.status_code == 201
    assert response.json()["period"]["practice_window"] == window


def test_only_the_weekday_window_can_be_set(
    api_client: TestClient, account: AccountFactory
) -> None:
    """주말은 합주실 개방시각 전체를 쓰고 평일만 좁힐 수 있습니다. 두 쌍은 서로 독립입니다."""
    _, head = account(*HEAD)
    window = {"weekday": {"starts_at": "17:00", "ends_at": "23:00"}, "weekend": None}

    period = api_client.post(
        "/periods", json={**_BASE, "practice_window": window}, cookies=head
    ).json()["period"]

    assert period["practice_window"] == window


def test_a_practice_window_that_ends_before_it_starts_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    window = {"weekday": {"starts_at": "23:00", "ends_at": "17:00"}, "weekend": None}

    response = api_client.post(
        "/periods", json={**_BASE, "practice_window": window}, cookies=head
    )

    assert response.status_code == 422


def test_the_practice_window_is_replaced_by_a_patch(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    made = api_client.post(
        "/periods",
        json={**_BASE, "practice_window": {"weekday": {"starts_at": "17:00", "ends_at": "23:00"}, "weekend": None}},
        cookies=head,
    ).json()["period"]
    later = {"weekday": {"starts_at": "18:00", "ends_at": "22:00"}, "weekend": None}

    response = api_client.patch(
        f"/periods/{made['id']}", json={"practice_window": later}, cookies=head
    )

    assert response.status_code == 200
    assert response.json()["period"]["practice_window"] == later


def test_a_patch_without_the_practice_window_keeps_it(
    api_client: TestClient, account: AccountFactory
) -> None:
    """다른 값만 보낸 요청이 시간대를 지우면, 화면의 다른 입력을 고칠 때마다 시간대가 사라집니다."""
    _, head = account(*HEAD)
    window = {"weekday": {"starts_at": "17:00", "ends_at": "23:00"}, "weekend": None}
    made = api_client.post(
        "/periods", json={**_BASE, "practice_window": window}, cookies=head
    ).json()["period"]

    api_client.patch(f"/periods/{made['id']}", json={"everyday": True}, cookies=head)

    kept = api_client.get("/periods", cookies=head).json()["periods"][0]
    assert kept["practice_window"] == window


def test_the_practice_window_is_cleared_by_sending_empty_pairs(
    api_client: TestClient, account: AccountFactory
) -> None:
    """두 쌍을 모두 null 로 보내면 합주실 개방시각 전체로 되돌아갑니다."""
    _, head = account(*HEAD)
    made = api_client.post(
        "/periods",
        json={**_BASE, "practice_window": {"weekday": {"starts_at": "17:00", "ends_at": "23:00"}, "weekend": None}},
        cookies=head,
    ).json()["period"]

    api_client.patch(
        f"/periods/{made['id']}",
        json={"practice_window": {"weekday": None, "weekend": None}},
        cookies=head,
    )

    kept = api_client.get("/periods", cookies=head).json()["periods"][0]
    assert kept["practice_window"] == {"weekday": None, "weekend": None}
