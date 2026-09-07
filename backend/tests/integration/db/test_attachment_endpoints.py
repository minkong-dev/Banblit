from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# account 픽스처를 부른 순서가 곧 역할이다 — 이 파일의 첫 호출이 헤드매니저다.
from conftest import AccountFactory

Cookies = dict[str, str]


@pytest.fixture()
def storage_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """첨부를 검사 전용 폴더에 저장하게 하고, 그 폴더를 돌려준다."""
    root = tmp_path / "attachments"
    monkeypatch.setenv("ATTACHMENT_DIR", str(root))
    return root


def _stored_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [path for path in root.rglob("*") if path.is_file()]


def _make_team(api_client: TestClient, head: Cookies, name: str) -> int:
    team = api_client.post("/teams", json={"name": name}, cookies=head).json()["team"]
    return int(team["id"])


def _join_team(api_client: TestClient, cookies: Cookies, team_id: int) -> None:
    position_id = api_client.get("/positions", cookies=cookies).json()["positions"][0][
        "id"
    ]
    api_client.post(
        f"/teams/{team_id}/members",
        json={"position_id": position_id},
        cookies=cookies,
    )


def _notice(api_client: TestClient, head: Cookies) -> int:
    post = api_client.post(
        "/notices", json={"title": "공지 제목", "body": "공지 내용"}, cookies=head
    ).json()["post"]
    return int(post["id"])


def test_attachment_is_uploaded_listed_and_downloaded(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = _notice(api_client, head)

    response = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("악보.pdf", b"score-bytes", "application/pdf")},
        cookies=head,
    )

    assert response.status_code == 201
    attachment = response.json()["attachment"]
    assert attachment["name"] == "악보.pdf"
    assert attachment["size"] == len(b"score-bytes")
    assert attachment["post_id"] == post_id

    listed = api_client.get(f"/posts/{post_id}/attachments", cookies=head)
    assert [item["id"] for item in listed.json()["attachments"]] == [attachment["id"]]

    downloaded = api_client.get(f"/attachments/{attachment['id']}", cookies=head)
    assert downloaded.status_code == 200
    assert downloaded.content == b"score-bytes"
    # 브라우저가 내용을 열지 않고 받게 하는 헤더다. HTML·SVG 가 열리면 그 안의
    # 스크립트가 우리 화면 권한으로 돈다.
    assert downloaded.headers["content-disposition"].startswith("attachment")
    assert downloaded.headers["x-content-type-options"] == "nosniff"


def test_post_detail_carries_attachments(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = _notice(api_client, head)
    api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("메모.txt", b"memo", "text/plain")},
        cookies=head,
    )

    detail = api_client.get(f"/posts/{post_id}", cookies=head).json()

    assert [item["name"] for item in detail["attachments"]] == ["메모.txt"]


def test_disallowed_extension_is_rejected(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = _notice(api_client, head)

    response = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("payload.exe", b"MZ", "application/octet-stream")},
        cookies=head,
    )

    assert response.status_code == 422
    assert _stored_files(storage_dir) == []


def test_only_the_author_can_attach_to_a_post(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    _, other = account("김도윤", "other@example.com")
    post_id = _notice(api_client, head)

    response = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("남의글.txt", b"nope", "text/plain")},
        cookies=other,
    )

    assert response.status_code == 403
    assert _stored_files(storage_dir) == []


def test_non_member_cannot_download_team_board_attachment(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    _, outsider = account("김도윤", "outsider@example.com")
    team_id = _make_team(api_client, head, "밴드가")
    _join_team(api_client, head, team_id)
    post_id = api_client.post(
        f"/teams/{team_id}/posts",
        json={"title": "팀 글", "body": "팀 내용"},
        cookies=head,
    ).json()["post"]["id"]
    attachment_id = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("연습.txt", b"practice", "text/plain")},
        cookies=head,
    ).json()["attachment"]["id"]

    assert (
        api_client.get(f"/attachments/{attachment_id}", cookies=outsider).status_code
        == 403
    )
    assert (
        api_client.get(
            f"/posts/{post_id}/attachments", cookies=outsider
        ).status_code
        == 403
    )


def test_teammate_who_is_not_the_author_can_read_and_download(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    _, teammate = account("김도윤", "mate@example.com")
    team_id = _make_team(api_client, head, "밴드가")
    _join_team(api_client, head, team_id)
    _join_team(api_client, teammate, team_id)
    post_id = api_client.post(
        f"/teams/{team_id}/posts",
        json={"title": "팀 글", "body": "팀 내용"},
        cookies=head,
    ).json()["post"]["id"]
    attachment_id = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("연습.txt", b"practice", "text/plain")},
        cookies=head,
    ).json()["attachment"]["id"]

    listed = api_client.get(f"/posts/{post_id}/attachments", cookies=teammate)
    assert [item["id"] for item in listed.json()["attachments"]] == [attachment_id]

    downloaded = api_client.get(f"/attachments/{attachment_id}", cookies=teammate)
    assert downloaded.status_code == 200
    assert downloaded.content == b"practice"
    # 읽는 것은 팀 소속 전체, 지우는 것은 글쓴이만이다.
    assert (
        api_client.delete(f"/attachments/{attachment_id}", cookies=teammate).status_code
        == 403
    )


def test_download_requires_login(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = _notice(api_client, head)
    attachment_id = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("공지.txt", b"notice", "text/plain")},
        cookies=head,
    ).json()["attachment"]["id"]

    assert api_client.get(f"/attachments/{attachment_id}").status_code == 401


def test_deleting_the_post_removes_the_stored_file(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = _notice(api_client, head)
    api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("악보.pdf", b"score", "application/pdf")},
        cookies=head,
    )
    assert len(_stored_files(storage_dir)) == 1

    assert api_client.delete(f"/posts/{post_id}", cookies=head).status_code == 204
    assert _stored_files(storage_dir) == []


def test_author_deletes_one_attachment(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    _, other = account("김도윤", "other@example.com")
    post_id = _notice(api_client, head)
    attachment_id = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("악보.pdf", b"score", "application/pdf")},
        cookies=head,
    ).json()["attachment"]["id"]

    assert api_client.delete(f"/attachments/{attachment_id}", cookies=other).status_code == 403
    assert api_client.delete(f"/attachments/{attachment_id}", cookies=head).status_code == 204
    assert _stored_files(storage_dir) == []


def test_traversal_filename_never_escapes_the_storage_root(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = _notice(api_client, head)

    response = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("../../etc/passwd.txt", b"root:x:0:0", "text/plain")},
        cookies=head,
    )

    assert response.status_code == 201
    written = _stored_files(storage_dir)
    assert len(written) == 1
    # 저장 이름은 서버가 만든다 — 보낸 이름이 경로로 쓰이면 저장소 밖에 쓰인다.
    assert written[0].parent == storage_dir
    assert "passwd" not in written[0].name
    assert not (storage_dir.parent / "etc").exists()
