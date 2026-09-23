"""프로필 사진의 업로드·표시·삭제 시나리오입니다.

사진은 계정 1개에 1장입니다. 저장 폴더와 저장 방식은 게시판 첨부(attachment_service)와 같은
것을 사용하고, 크기와 확장자 규칙만 사진용으로 따로 둡니다.
"""

import io
import threading
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from backend.db.models import Member
from backend.services import avatar_service
from conftest import AccountFactory

Cookies = dict[str, str]

ME = ("박서연", "seoyeon@example.com")
OTHER = ("김민수", "minsu@example.com")
# PNG 파일의 첫 8바이트입니다. 내용까지 검사하지는 않지만, 실제 사진과 같은 머리말을 씁니다.
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture()
def storage_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "attachments"
    monkeypatch.setenv("ATTACHMENT_DIR", str(root))
    return root


def _upload(
    api_client: TestClient, cookies: Cookies, name: str = "얼굴.png", data: bytes = PNG
) -> httpx.Response:
    return api_client.post(
        "/me/avatar", files={"file": (name, data, "image/png")}, cookies=cookies
    )


def _stored_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [path for path in root.rglob("*") if path.is_file()]


def test_uploading_a_photo_makes_it_readable_by_account_number(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    member_id, cookies = account(*ME)

    uploaded = _upload(api_client, cookies)

    assert uploaded.status_code == 200
    shown = api_client.get(f"/members/{member_id}/avatar", cookies=cookies)
    assert shown.status_code == 200
    assert shown.content == PNG
    # 브라우저가 내용을 보고 형식을 다시 정하지 못하게 합니다 — 첨부 파일 표시 경로와 같은 규칙입니다.
    assert shown.headers["X-Content-Type-Options"] == "nosniff"


def test_an_account_without_a_photo_answers_not_found(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    member_id, cookies = account(*ME)

    assert api_client.get(f"/members/{member_id}/avatar", cookies=cookies).status_code == 404


def test_a_second_upload_replaces_the_first_and_leaves_one_file(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, cookies = account(*ME)
    _upload(api_client, cookies)

    _upload(api_client, cookies, data=PNG + b"second")

    assert len(_stored_files(storage_dir)) == 1


def test_deleting_removes_the_file_and_the_column(
    api_client: TestClient,
    db_session: Session,
    account: AccountFactory,
    storage_dir: Path,
) -> None:
    member_id, cookies = account(*ME)
    _upload(api_client, cookies)

    removed = api_client.delete("/me/avatar", cookies=cookies)

    assert removed.status_code == 204
    assert api_client.get(f"/members/{member_id}/avatar", cookies=cookies).status_code == 404
    assert _stored_files(storage_dir) == []
    db_session.expire_all()
    assert db_session.scalar(select(Member.avatar).where(Member.id == member_id)) is None


@pytest.mark.parametrize("name", ["악보.pdf", "노래.mp3", "문서.docx"])
def test_only_image_files_are_accepted(
    api_client: TestClient, account: AccountFactory, storage_dir: Path, name: str
) -> None:
    _, cookies = account(*ME)

    refused = _upload(api_client, cookies, name=name)

    assert refused.status_code == 422
    assert _stored_files(storage_dir) == []


def test_a_photo_over_the_limit_is_refused_and_nothing_is_left_on_disk(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, cookies = account(*ME)

    refused = _upload(
        api_client, cookies, data=b"0" * (avatar_service.MAX_AVATAR_BYTES + 1)
    )

    assert refused.status_code == 422
    assert _stored_files(storage_dir) == []


def test_another_members_photo_is_readable_by_anyone_signed_in(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    """사진은 로그인한 사람이면 누구나 볼 수 있습니다. 명단·검색 화면에 서로의 사진이 표시됩니다."""
    my_id, my_cookies = account(*ME)
    _, other_cookies = account(*OTHER)
    _upload(api_client, my_cookies)

    assert api_client.get(f"/members/{my_id}/avatar", cookies=other_cookies).status_code == 200


def test_a_visitor_without_a_session_cannot_see_a_photo(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    my_id, my_cookies = account(*ME)
    _upload(api_client, my_cookies)

    assert api_client.get(f"/members/{my_id}/avatar").status_code == 401


def test_my_account_carries_the_stored_photo_name(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    """화면이 이 값을 보고 사진을 다시 불러옵니다. 사진 주소는 계정 번호로 고정이라,
    값이 바뀌지 않으면 브라우저가 옛 사진을 계속 표시합니다."""
    _, cookies = account(*ME)
    assert api_client.get("/me", cookies=cookies).json()["account"]["avatar"] is None

    _upload(api_client, cookies)

    stored = api_client.get("/me", cookies=cookies).json()["account"]["avatar"]
    assert stored is not None and stored.endswith(".png")

    api_client.delete("/me/avatar", cookies=cookies)
    assert api_client.get("/me", cookies=cookies).json()["account"]["avatar"] is None


def test_an_upload_during_another_session_does_not_leave_an_orphan_file(
    api_client: TestClient,
    account: AccountFactory,
    storage_dir: Path,
    test_engine: Engine,
) -> None:
    """session A 가 사진을 바꾸는 동안 session B 가 사진을 올립니다.

    B 가 계정 행을 잠그고 읽으면 A 가 commit 한 파일명을 보고 그 파일을 지웁니다. 잠그지 않으면
    A 가 바꾸기 전의 파일명을 읽어 A 의 파일을 그대로 남깁니다 — 어느 행에서도 참조하지 않는
    파일이 디스크에 쌓입니다.
    """
    member_id, cookies = account(*ME)
    _upload(api_client, cookies)

    def upload_from_another_session() -> None:
        with Session(test_engine) as session:
            member = session.get(Member, member_id)
            assert member is not None
            avatar_service.save_avatar(session, member, "둘.png", io.BytesIO(PNG))

    with Session(test_engine) as locking:
        locked = locking.scalars(
            select(Member).where(Member.id == member_id).with_for_update()
        ).one()
        # A 가 올린 사진입니다. 파일도 실제로 만들어 둡니다.
        first = locked.avatar
        assert first is not None
        mine = "0123456789abcdef0123456789abcdef.png"
        (storage_dir / mine).write_bytes(PNG)
        locked.avatar = mine
        locking.flush()

        worker = threading.Thread(target=upload_from_another_session)
        worker.start()
        worker.join(timeout=1.0)

        locking.commit()

    worker.join(timeout=10.0)
    assert not worker.is_alive()
    # 처음 사진은 A 가, A 의 사진은 B 가 지웁니다. 남는 것은 B 가 올린 1장뿐입니다.
    (storage_dir / first).unlink(missing_ok=True)
    assert len(_stored_files(storage_dir)) == 1
