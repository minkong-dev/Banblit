from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# account fixture(테스트마다 준비해 주는 값)를 호출한 순서가 곧 역할입니다. 이 파일의 첫 호출이 헤드매니저입니다.
from conftest import AccountFactory

Cookies = dict[str, str]


@pytest.fixture()
def storage_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """첨부 파일을 테스트 전용 폴더에 저장하도록 설정하고, 그 폴더를 반환합니다."""
    root = tmp_path / "attachments"
    monkeypatch.setenv("ATTACHMENT_DIR", str(root))
    return root


def _stored_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [path for path in root.rglob("*") if path.is_file()]


def _make_team(api_client: TestClient, head: Cookies, name: str) -> int:
    team = api_client.post(
        "/teams", json={"name": name, "slots": {"보컬": 4}}, cookies=head
    ).json()["team"]
    return int(team["id"])


def _seat(api_client: TestClient, head: Cookies, team_id: int, member_id: int) -> None:
    """빈 자리 하나를 찾아 그 멤버를 배정합니다. 배정은 member_add 권한을 가진 사람만 할 수
    있으므로 언제나 헤드매니저의 cookie 로 호출합니다."""
    slots = api_client.get(f"/teams/{team_id}/slots", cookies=head).json()["slots"]
    free = next(slot for slot in slots if slot["member_id"] is None)
    api_client.put(
        f"/teams/{team_id}/slots/{free['id']}",
        json={"member_id": member_id},
        cookies=head,
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
    # 브라우저가 파일 내용을 표시하지 않게 하는 헤더입니다. HTML·SVG 가 표시되면 그 안의
    # 스크립트가 이 서비스 화면의 권한으로 실행됩니다.
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


def test_a_reader_can_attach_to_someone_elses_notice(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    # 댓글에 넣은 사진은 그 글의 attachment 로 올라갑니다. 글쓴이만 올릴 수 있으면
    # 댓글은 쓸 수 있는데 사진은 넣을 수 없습니다. 댓글 작성과 같은 규칙을 적용합니다.
    _, head = account("박서연", "head@example.com")
    _, other = account("김도윤", "other@example.com")
    post_id = _notice(api_client, head)

    response = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("댓글사진.txt", b"ok", "text/plain")},
        cookies=other,
    )

    assert response.status_code == 201
    assert len(_stored_files(storage_dir)) == 1


def test_non_member_cannot_attach_to_a_team_board_post(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    # 권한을 완화해도 팀 소속 확인은 유지합니다. 팀 게시판 글은 그 팀 사람만 읽습니다.
    head_id, head = account("박서연", "head@example.com")
    _, outsider = account("김도윤", "outsider@example.com")
    team_id = _make_team(api_client, head, "밴드가")
    _seat(api_client, head, team_id, head_id)
    post_id = api_client.post(
        f"/teams/{team_id}/posts",
        json={"title": "팀 글", "body": "팀 내용"},
        cookies=head,
    ).json()["post"]["id"]

    response = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("남의팀.txt", b"nope", "text/plain")},
        cookies=outsider,
    )

    assert response.status_code == 403
    assert _stored_files(storage_dir) == []


def test_non_member_cannot_download_team_board_attachment(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    head_id, head = account("박서연", "head@example.com")
    _, outsider = account("김도윤", "outsider@example.com")
    team_id = _make_team(api_client, head, "밴드가")
    _seat(api_client, head, team_id, head_id)
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
    head_id, head = account("박서연", "head@example.com")
    mate_id, teammate = account("김도윤", "mate@example.com")
    team_id = _make_team(api_client, head, "밴드가")
    _seat(api_client, head, team_id, head_id)
    _seat(api_client, head, team_id, mate_id)
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
    # 조회는 팀 소속 전체가, 삭제는 작성자만 할 수 있습니다.
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
    # 저장 파일 이름은 서버가 생성합니다. 제출된 이름이 경로로 사용되면 저장소 밖에 기록됩니다.
    assert written[0].parent == storage_dir
    assert "passwd" not in written[0].name
    assert not (storage_dir.parent / "etc").exists()


def test_a_moderator_cannot_attach_to_someone_elses_post(
    api_client: TestClient, account: AccountFactory, storage_dir: Path
) -> None:
    """업로드는 그 글의 작성자만 합니다. board_moderate 는 남의 글에 파일을 붙이는 권한이 아닙니다.

    이 권한자는 팀 소속을 확인하지 않으므로, 막지 않으면 어느 팀의 어느 글에도 파일을 붙일 수 있습니다.
    """
    _, head = account("박서연", "head@example.com")
    member_id, member = account("김도윤", "other@example.com")
    team_id = _make_team(api_client, head, "밴드")
    _seat(api_client, head, team_id, member_id)
    post_id = int(
        api_client.post(
            f"/teams/{team_id}/posts",
            json={"title": "글", "body": "본문"},
            cookies=member,
        ).json()["post"]["id"]
    )

    response = api_client.post(
        f"/posts/{post_id}/attachments",
        files={"file": ("남의글.txt", b"nope", "text/plain")},
        cookies=head,
    )

    assert response.status_code == 403
    assert _stored_files(storage_dir) == []
