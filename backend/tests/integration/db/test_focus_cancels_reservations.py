"""집중 합주기간을 만들거나 넓히면 그 안의 예약을 취소하고 예약자에게 알립니다(2026-09-28 사용자 결정).

집중 합주기간에는 새 예약을 받지 않지만, 기간보다 먼저 잡힌 예약은 남아 자동 배정과 같은 합주실·시간에 겹쳤습니다.
기간을 막는 대신 예약을 밀어냅니다. 취소 기준은 "지금 새로 예약하면 거절되는가"이고, 예약 화면과 같은 판정을 씁니다.
"""

from datetime import date, datetime, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from conftest import AccountFactory

from backend.db.models import Member, Period, Reservation, Room
from backend.services.period.pipeline import delete_ensemble, delete_ensemble_day, set_ensemble_day
from test_reservation_endpoints import _reserve, _room

INSIDE = "2027-03-10"
OUTSIDE = "2027-03-20"
FOCUS = {
    "kind": "focused",
    "starts_on": "2027-03-08",
    "ends_on": "2027-03-14",
    "everyday": False,
    "first_run_at": "09:00",
    "second_run_at": "21:00",
}


def _cancelled(db_session: Session, reservation_id: int) -> bool:
    db_session.expire_all()
    row = db_session.scalars(select(Reservation).where(Reservation.id == reservation_id)).one()
    return row.cancelled_at is not None


def test_creating_a_focused_period_cancels_the_reservations_inside_it(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, admin = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    db_session.commit()
    inside = _reserve(api_client, admin, room, INSIDE, 19, 21)
    outside = _reserve(api_client, admin, room, OUTSIDE, 19, 21)
    assert inside["status"] == 201 and outside["status"] == 201

    assert api_client.post("/periods", json=FOCUS, cookies=admin).status_code == 201

    assert _cancelled(db_session, inside["body"]["reservations"][0]["id"]) is True
    assert _cancelled(db_session, outside["body"]["reservations"][0]["id"]) is False
    kinds = [row["kind"] for row in api_client.get("/notifications", cookies=admin).json()["notifications"]]
    assert "reservation_cancelled" in kinds


def test_widening_a_focused_period_cancels_the_reservations_it_now_covers(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, admin = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    db_session.commit()
    later = _reserve(api_client, admin, room, OUTSIDE, 19, 21)
    period = api_client.post("/periods", json=FOCUS, cookies=admin).json()["period"]
    assert _cancelled(db_session, later["body"]["reservations"][0]["id"]) is False

    widened = api_client.patch(f"/periods/{period['id']}", json={"ends_on": "2027-03-25"}, cookies=admin)

    assert widened.status_code == 200
    assert _cancelled(db_session, later["body"]["reservations"][0]["id"]) is True


def _ensemble_setup(db_session: Session) -> tuple[Period, Room, Member]:
    """2027-03-08~14 집중 합주기간, 03-13 하루를 전체 합주 날짜로(1번방 18~22시) 둡니다."""
    member = Member(name="예약자")
    room = Room(name="1번방", opens_at=time(9, 0), closes_at=time(23, 0))
    db_session.add_all([member, room])
    db_session.flush()
    period = Period(
        kind="focused", starts_on=date(2027, 3, 8), ends_on=date(2027, 3, 14), everyday=False,
        first_run_at=time(9, 0), second_run_at=time(21, 0),
        ensemble_starts_on=date(2027, 3, 13), ensemble_ends_on=date(2027, 3, 13), ensemble_room_id=room.id,
        ensemble_starts_at=time(18, 0), ensemble_ends_at=time(22, 0),
    )
    db_session.add(period)
    db_session.commit()
    return period, room, member


def _booking(db_session: Session, room: Room, member: Member, start: int, end: int) -> Reservation:
    row = Reservation(
        room_id=room.id, member_id=member.id, created_at=datetime(2027, 1, 1),
        starts_at=datetime(2027, 3, 13, start), ends_at=datetime(2027, 3, 13, end),
    )
    db_session.add(row)
    db_session.commit()
    return row


def test_removing_the_ensemble_cancels_the_reservations_it_used_to_allow(db_session: Session) -> None:
    # 전체 합주 날짜의 전체 합주 외 시간(10~12시)은 예약할 수 있었습니다. 전체 합주를 지우면 그날은 일반 집중 합주일입니다.
    period, room, member = _ensemble_setup(db_session)
    row = _booking(db_session, room, member, 10, 12)

    delete_ensemble(db_session, period.id)

    assert _cancelled(db_session, row.id) is True


def test_removing_a_narrower_day_time_cancels_what_now_overlaps_the_default(db_session: Session) -> None:
    # 03-13 을 18~19시로 좁혀 두면 20~21시 예약이 가능합니다. 날짜별 시각을 지우면 기본 18~22시와 겹칩니다.
    period, room, member = _ensemble_setup(db_session)
    set_ensemble_day(db_session, period.id, "2027-03-13", "18:00", "19:00")
    row = _booking(db_session, room, member, 20, 21)

    delete_ensemble_day(db_session, period.id, "2027-03-13")

    assert _cancelled(db_session, row.id) is True


def test_the_period_change_and_the_cancellations_are_saved_in_one_commit(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 기간 변경 뒤 예약 취소를 두 번째 commit 으로 저장하면, 두 번째 commit 이 실패했을 때 기간만 바뀌고
    # 취소·알림은 저장되지 않습니다. 두 번째 commit 을 실패하게 두고, 한 번의 commit 으로 둘 다 저장되는지 확인합니다.
    period, room, member = _ensemble_setup(db_session)
    row = _booking(db_session, room, member, 10, 12)
    real_commit = db_session.commit
    commits = {"count": 0}

    def commit_failing_from_the_second_call() -> None:
        commits["count"] += 1
        if commits["count"] >= 2:
            raise OperationalError("두 번째 commit", None, Exception("연결 끊김"))
        real_commit()

    monkeypatch.setattr(db_session, "commit", commit_failing_from_the_second_call)

    delete_ensemble(db_session, period.id)

    assert commits["count"] == 1
    assert _cancelled(db_session, row.id) is True
    db_session.expire_all()
    saved = db_session.get(Period, period.id)
    assert saved is not None and saved.ensemble_room_id is None
