# ===== 다른 멤버의 예약·불가능 일정 반려 =====
#
# 관리 권한을 가진 사람이 다른 멤버의 예약을 취소하거나 불가능 일정을 삭제하는 것을 "반려" 라고 부릅니다.
# 반려는 사유를 반드시 받고, 그 사유를 담은 알림을 원래 등록한 멤버에게 보냅니다. 사유 없이 지우면
# 본인은 왜 사라졌는지 모르는 채로 같은 일정을 다시 등록합니다.
#
# 예약과 불가능 일정은 같은 흐름(사유 검증 → 삭제 → 알림)을 쓰므로 한 파일에서 검증합니다.

from datetime import date, datetime, time

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.db.models import Period, Room
from conftest import AccountFactory

OPEN_DAY = "2026-09-14"


def _room(session: Session) -> Room:
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(23, 0))
    session.add(room)
    session.flush()
    return room


def _open_period(session: Session) -> None:
    session.add(
        Period(
            kind="open",
            starts_on=date(2026, 9, 14),
            ends_on=date(2026, 9, 20),
            everyday=False,
            first_run_at=time(9, 0),
            second_run_at=time(18, 0),
        )
    )
    session.flush()


def _now_is(moment: datetime) -> None:
    """예약 endpoint 가 쓰는 현재 시각을 moment 로 둡니다. api_client 가 끝날 때 원래대로 돌아갑니다."""
    from backend.api.app import app
    from backend.api.routers.reservations import current_time

    app.dependency_overrides[current_time] = lambda: moment


def _reservation(
    api_client: TestClient, db_session: Session, cookies: dict[str, str]
) -> int:
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()
    _now_is(datetime(2026, 9, 1, 12, 0))
    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=cookies,
    )
    assert response.status_code == 201, response.text
    reservation_id: int = response.json()["reservations"][0]["id"]
    return reservation_id


def _unavailable(
    api_client: TestClient, member_id: int, cookies: dict[str, str]
) -> int:
    response = api_client.post(
        f"/members/{member_id}/unavailable",
        json={"starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00"},
        cookies=cookies,
    )
    assert response.status_code == 201, response.text
    time_id: int = response.json()["time"]["id"]
    return time_id


def _notifications(api_client: TestClient, cookies: dict[str, str]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = api_client.get("/notifications", cookies=cookies).json()[
        "notifications"
    ]
    return rows


# ----- 예약 -----


def test_rejecting_a_reservation_cancels_it_and_tells_the_owner_why(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, manager = account("이도현", "dohyun@example.com")
    _, owner = account("박서연", "seoyeon@example.com")
    reservation_id = _reservation(api_client, db_session, owner)

    response = api_client.post(
        f"/reservations/{reservation_id}/reject",
        json={"reason": "  동아리방 점검 날이에요  "},
        cookies=manager,
    )

    assert response.status_code == 204
    assert api_client.get("/reservations/mine", cookies=owner).json()["reservations"] == []
    [notice] = _notifications(api_client, owner)
    # 화면이 "<언제> 예약이 반려되었어요" 를 만들려면 대상의 종류와 시작 시간이 함께 와야 합니다.
    # 사유의 앞뒤 공백은 저장하지 않습니다.
    assert notice["kind"] == "rejected"
    assert notice["target"] == "reservation"
    assert notice["target_starts_at"] == f"{OPEN_DAY}T18:00:00"
    assert notice["reason"] == "동아리방 점검 날이에요"


def test_rejecting_a_reservation_requires_the_reservation_permission(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    _, plain = account("박서연", "seoyeon@example.com")
    reservation_id = _reservation(api_client, db_session, owner)

    response = api_client.post(
        f"/reservations/{reservation_id}/reject",
        json={"reason": "점검"},
        cookies=plain,
    )

    assert response.status_code == 403


def test_cancelling_someone_elses_reservation_without_a_reason_is_refused(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    # 권한자라도 다른 멤버의 예약은 사유와 함께 반려로만 취소합니다. 사유 없는 취소 경로가 남으면
    # 알림 없이 예약이 사라집니다.
    _, manager = account("이도현", "dohyun@example.com")
    _, owner = account("박서연", "seoyeon@example.com")
    reservation_id = _reservation(api_client, db_session, owner)

    response = api_client.delete(f"/reservations/{reservation_id}", cookies=manager)

    assert response.status_code == 403
    assert len(api_client.get("/reservations/mine", cookies=owner).json()["reservations"]) == 1


# ----- 불가능 일정 -----


def test_rejecting_an_unavailable_time_deletes_it_and_tells_the_owner_why(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, manager = account("이도현", "dohyun@example.com")
    owner_id, owner = account("박서연", "seoyeon@example.com")
    time_id = _unavailable(api_client, owner_id, owner)

    response = api_client.post(
        f"/members/{owner_id}/unavailable/{time_id}/reject",
        json={"reason": "공연 리허설이라 빠질 수 없어요"},
        cookies=manager,
    )

    assert response.status_code == 204
    assert (
        api_client.get(f"/members/{owner_id}/unavailable", cookies=owner).json()["times"] == []
    )
    [notice] = _notifications(api_client, owner)
    assert notice["kind"] == "rejected"
    assert notice["target"] == "unavailable"
    assert notice["target_starts_at"] == f"{OPEN_DAY}T18:00:00"
    assert notice["reason"] == "공연 리허설이라 빠질 수 없어요"


def test_rejecting_an_unavailable_time_requires_the_unavailable_permission(
    api_client: TestClient, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")
    _, plain = account("박서연", "seoyeon@example.com")
    time_id = _unavailable(api_client, owner_id, owner)

    response = api_client.post(
        f"/members/{owner_id}/unavailable/{time_id}/reject",
        json={"reason": "점검"},
        cookies=plain,
    )

    assert response.status_code == 403


def test_rejecting_with_another_members_number_does_not_touch_the_time(
    api_client: TestClient, account: AccountFactory
) -> None:
    # 주소의 멤버 번호와 일정의 주인이 다르면 없는 일정으로 거절합니다. 번호만 바꿔 다른 사람의 일정을 지울 수 없습니다.
    _, manager = account("이도현", "dohyun@example.com")
    owner_id, owner = account("박서연", "seoyeon@example.com")
    other_id, _ = account("김도윤", "doyun@example.com")
    time_id = _unavailable(api_client, owner_id, owner)

    response = api_client.post(
        f"/members/{other_id}/unavailable/{time_id}/reject",
        json={"reason": "점검"},
        cookies=manager,
    )

    assert response.status_code == 422
    assert len(api_client.get(f"/members/{owner_id}/unavailable", cookies=owner).json()["times"]) == 1
    assert _notifications(api_client, owner) == []


# ----- 사유 검증 (두 대상 공통) -----


def test_a_rejection_without_a_reason_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, manager = account("이도현", "dohyun@example.com")
    owner_id, owner = account("박서연", "seoyeon@example.com")
    time_id = _unavailable(api_client, owner_id, owner)

    response = api_client.post(
        f"/members/{owner_id}/unavailable/{time_id}/reject",
        json={"reason": "   "},
        cookies=manager,
    )

    assert response.status_code == 422
    assert len(api_client.get(f"/members/{owner_id}/unavailable", cookies=owner).json()["times"]) == 1
    assert _notifications(api_client, owner) == []


def test_a_rejection_reason_over_the_length_limit_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    from backend.contract import REJECT_REASON_MAX_LENGTH

    _, manager = account("이도현", "dohyun@example.com")
    owner_id, owner = account("박서연", "seoyeon@example.com")
    time_id = _unavailable(api_client, owner_id, owner)

    response = api_client.post(
        f"/members/{owner_id}/unavailable/{time_id}/reject",
        json={"reason": "가" * (REJECT_REASON_MAX_LENGTH + 1)},
        cookies=manager,
    )

    assert response.status_code == 422


def test_other_notifications_carry_no_rejection_fields(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    # 반려가 아닌 알림에도 같은 field 가 오되 값은 null 입니다. 화면은 종류로 문장을 고릅니다.
    from backend.db.models import Notification

    member_id, cookies = account("이도현", "dohyun@example.com")
    db_session.add(
        Notification(member_id=member_id, kind="assignment_updated", created_at=datetime(2026, 9, 1))
    )
    db_session.commit()

    [notice] = _notifications(api_client, cookies)

    assert notice["kind"] == "assignment_updated"
    assert (notice["target"], notice["target_starts_at"], notice["reason"]) == (None, None, None)
