from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import Comment, Member, Post, Team, TeamSlot

# account fixture(테스트마다 준비해 주는 값)를 호출한 순서가 곧 역할입니다. 이 파일의 첫 호출이 헤드매니저입니다.
from conftest import AccountFactory, seat


def _team(session: Session, name: str) -> Team:
    team = Team(name=name)
    session.add(team)
    session.flush()
    return team


def _member(session: Session, name: str) -> Member:
    """로그인과 무관하게 DB 제약만 검증하는 용도입니다. 순수 SQLAlchemy 객체로 생성합니다."""
    member = Member(name=name)
    session.add(member)
    session.flush()
    return member


def _join(session: Session, member_id: int, team: Team) -> None:
    seat(session, team.id, member_id)
    session.flush()


def test_notice_is_created_and_listed(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "공지 제목", "body": "공지 내용"}, cookies=head
    )

    assert response.status_code == 201
    post = response.json()["post"]
    assert post["title"] == "공지 제목"
    assert post["team_id"] is None
    assert post["author"] == "박서연"
    assert post["comment_count"] == 0

    listed = api_client.get("/notices", cookies=head)
    assert listed.status_code == 200
    assert [p["id"] for p in listed.json()["posts"]] == [post["id"]]


def test_notices_are_listed_newest_first(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    first = api_client.post(
        "/notices", json={"title": "첫 글", "body": "내용"}, cookies=head
    ).json()["post"]
    second = api_client.post(
        "/notices", json={"title": "둘째 글", "body": "내용"}, cookies=head
    ).json()["post"]

    response = api_client.get("/notices", cookies=head)

    ids = [p["id"] for p in response.json()["posts"]]
    assert ids == [second["id"], first["id"]]


def test_notice_creation_rejects_an_empty_title(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "  ", "body": "내용"}, cookies=head
    )

    assert response.status_code == 422
    assert "제목" in response.json()["detail"]


def test_notice_creation_rejects_an_empty_body(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "제목", "body": "  "}, cookies=head
    )

    assert response.status_code == 422
    assert "내용" in response.json()["detail"]


def test_notice_reading_requires_authentication(api_client: TestClient) -> None:
    """공지 목록은 로그인 뒤 메인 캘린더 안에서만 보여집니다. 방문자에게는 공개하지 않습니다."""
    response = api_client.get("/notices")

    assert response.status_code == 401


def test_notice_reading_allows_a_member_without_a_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """공지의 '전체 공개'는 팀과 무관하다는 의미입니다. 어느 팀에도 없는 사람이 봅니다."""
    _, head = account("박서연", "head@example.com")
    _, loner = account("이도현", "member@example.com")
    api_client.post("/notices", json={"title": "공지 제목", "body": "내용"}, cookies=head)

    response = api_client.get("/notices", cookies=loner)

    assert response.status_code == 200
    assert [post["title"] for post in response.json()["posts"]] == ["공지 제목"]


def test_notice_creation_requires_a_head_manager(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")  # 맨 처음이라 헤드매니저
    _, member = account("이도현", "member@example.com")

    response = api_client.post(
        "/notices", json={"title": "제목", "body": "내용"}, cookies=member
    )

    assert response.status_code == 403


def test_notice_creation_requires_authentication(api_client: TestClient) -> None:
    response = api_client.post("/notices", json={"title": "제목", "body": "내용"})

    assert response.status_code == 401


def test_notice_creation_rejects_a_title_over_the_length_limit(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "가" * 201, "body": "내용"}, cookies=head
    )

    assert response.status_code == 422


def test_notice_creation_rejects_a_body_over_the_length_limit(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "제목", "body": "가" * 20001}, cookies=head
    )

    assert response.status_code == 422


def test_team_post_is_created_by_a_team_member(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = account("박서연", "a@example.com")
    _join(db_session, author_id, team)
    db_session.commit()

    response = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "팀 공지", "body": "내용"}, cookies=author
    )

    assert response.status_code == 201
    post = response.json()["post"]
    assert post["team_id"] == team.id
    assert post["author"] == "박서연"


def test_team_post_creation_rejects_a_non_member_author(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    team = _team(db_session, "새벽 네시")
    _, outsider = account("이도현", "b@example.com")

    response = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "팀 공지", "body": "내용"}, cookies=outsider
    )

    assert response.status_code == 403


def test_team_post_creation_rejects_an_unknown_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, author = account("박서연", "a@example.com")

    response = api_client.post(
        "/teams/999999/posts", json={"title": "제목", "body": "내용"}, cookies=author
    )

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_team_posts_are_listed_only_for_that_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    team = _team(db_session, "새벽 네시")
    other = _team(db_session, "파랑주의보")
    author_id, author = account("박서연", "a@example.com")
    _join(db_session, author_id, team)
    _join(db_session, author_id, other)
    db_session.commit()

    api_client.post(
        f"/teams/{team.id}/posts", json={"title": "우리팀 글", "body": "내용"}, cookies=author
    )
    api_client.post(
        f"/teams/{other.id}/posts", json={"title": "다른팀 글", "body": "내용"}, cookies=author
    )

    response = api_client.get(f"/teams/{team.id}/posts", cookies=author)

    posts = response.json()["posts"]
    assert len(posts) == 1
    assert posts[0]["title"] == "우리팀 글"


def test_team_posts_list_is_empty_for_a_team_with_no_posts(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = account("박서연", "a@example.com")
    _join(db_session, author_id, team)
    db_session.commit()

    response = api_client.get(f"/teams/{team.id}/posts", cookies=author)

    assert response.status_code == 200
    assert response.json()["posts"] == []


def test_team_posts_endpoint_rejects_an_unknown_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, author = account("박서연", "a@example.com")

    response = api_client.get("/teams/999999/posts", cookies=author)

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_team_posts_read_requires_team_membership(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    team = _team(db_session, "새벽 네시")
    _, outsider = account("이도현", "b@example.com")

    response = api_client.get(f"/teams/{team.id}/posts", cookies=outsider)

    assert response.status_code == 403


def test_team_posts_read_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")

    response = api_client.get(f"/teams/{team.id}/posts")

    assert response.status_code == 401


def test_post_detail_includes_comments(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "제목", "body": "내용"}, cookies=head
    ).json()["post"]["id"]

    comment = api_client.post(
        f"/posts/{post_id}/comments", json={"body": "댓글 내용"}, cookies=head
    )
    assert comment.status_code == 201
    assert comment.json()["comment"]["author"] == "박서연"

    response = api_client.get(f"/posts/{post_id}", cookies=head)

    assert response.status_code == 200
    body = response.json()
    assert body["post"]["id"] == post_id
    assert body["post"]["comment_count"] == 1
    assert len(body["comments"]) == 1
    assert body["comments"][0]["body"] == "댓글 내용"


def test_post_detail_rejects_an_unknown_post(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.get("/posts/999999", cookies=head)

    assert response.status_code == 422
    assert "글" in response.json()["detail"]


def test_post_detail_of_a_team_post_requires_membership(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = account("박서연", "a@example.com")
    _join(db_session, author_id, team)
    db_session.commit()
    post_id = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "제목", "body": "내용"}, cookies=author
    ).json()["post"]["id"]

    _, outsider = account("이도현", "b@example.com")
    response = api_client.get(f"/posts/{post_id}", cookies=outsider)

    assert response.status_code == 403


def test_post_detail_of_a_notice_needs_no_team_membership(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "제목", "body": "내용"}, cookies=head
    ).json()["post"]["id"]

    _, member = account("이도현", "member@example.com")
    response = api_client.get(f"/posts/{post_id}", cookies=member)

    assert response.status_code == 200


def test_comment_creation_rejects_an_empty_body(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "제목", "body": "내용"}, cookies=head
    ).json()["post"]["id"]

    response = api_client.post(
        f"/posts/{post_id}/comments", json={"body": "  "}, cookies=head
    )

    assert response.status_code == 422
    assert "댓글" in response.json()["detail"]


def test_comment_creation_rejects_a_non_member_author_on_a_team_post(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = account("박서연", "a@example.com")
    _join(db_session, author_id, team)
    db_session.commit()
    post_id = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "제목", "body": "내용"}, cookies=author
    ).json()["post"]["id"]

    _, outsider = account("이도현", "b@example.com")
    response = api_client.post(
        f"/posts/{post_id}/comments", json={"body": "댓글"}, cookies=outsider
    )

    assert response.status_code == 403


def test_comment_creation_allows_a_team_member_on_a_team_post(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = account("박서연", "a@example.com")
    _join(db_session, author_id, team)
    db_session.commit()
    post_id = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "제목", "body": "내용"}, cookies=author
    ).json()["post"]["id"]

    response = api_client.post(
        f"/posts/{post_id}/comments", json={"body": "댓글"}, cookies=author
    )

    assert response.status_code == 201


def test_post_author_is_taken_from_the_token_not_the_request_body(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    # author_id 는 schema 에 없으므로 보내도 무시되어야 합니다. 반환되는 작성자는
    # 언제나 인증 cookie 로 확인한 계정입니다.
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/notices",
        json={"title": "제목", "body": "내용", "author_id": 999999},
        cookies=head,
    )

    assert response.status_code == 201
    assert response.json()["post"]["author"] == "박서연"


def test_comment_creation_rejects_a_body_over_the_length_limit(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "제목", "body": "내용"}, cookies=head
    ).json()["post"]["id"]

    response = api_client.post(
        f"/posts/{post_id}/comments", json={"body": "가" * 2001}, cookies=head
    )

    assert response.status_code == 422


def test_post_title_blank_after_trim_is_rejected_at_the_database_level(
    db_session: Session,
) -> None:
    author = _member(db_session, "박서연")
    db_session.commit()

    db_session.add(
        Post(
            team_id=None,
            title="   ",
            body="내용",
            author_id=author.id,
            created_at=datetime.now(),
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_post_body_blank_after_trim_is_rejected_at_the_database_level(
    db_session: Session,
) -> None:
    author = _member(db_session, "박서연")
    db_session.commit()

    db_session.add(
        Post(
            team_id=None,
            title="제목",
            body="   ",
            author_id=author.id,
            created_at=datetime.now(),
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_comment_body_blank_after_trim_is_rejected_at_the_database_level(
    db_session: Session,
) -> None:
    author = _member(db_session, "박서연")
    db_session.commit()
    post = Post(
        team_id=None,
        title="제목",
        body="내용",
        author_id=author.id,
        created_at=datetime.now(),
    )
    db_session.add(post)
    db_session.flush()

    db_session.add(
        Comment(
            post_id=post.id,
            body="   ",
            author_id=author.id,
            created_at=datetime.now(),
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


# ── 글 수정 ────────────────────────────────────────────────────────────────


def test_editing_a_post_requires_authentication(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    author_id, head = account("박서연", "head@example.com")
    made = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()

    response = api_client.patch(
        f"/posts/{made['post']['id']}", json={"title": "새 제목", "body": "새 본문"}
    )

    assert response.status_code == 401
    assert author_id is not None


def test_only_the_author_can_edit_a_post(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _, other = account("이도현", "member@example.com")
    made = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()

    response = api_client.patch(
        f"/posts/{made['post']['id']}",
        json={"title": "가로챈 제목", "body": "본문"},
        cookies=other,
    )

    assert response.status_code == 403


def test_the_author_can_edit_their_own_post(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    made = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()
    post_id = made["post"]["id"]

    response = api_client.patch(
        f"/posts/{post_id}", json={"title": "고친 제목", "body": "고친 본문"}, cookies=head
    )

    assert response.status_code == 200
    assert response.json()["post"]["title"] == "고친 제목"
    assert api_client.get(f"/posts/{post_id}", cookies=head).json()["post"]["body"] == "고친 본문"


def test_editing_a_post_rejects_an_empty_title(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    made = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()

    response = api_client.patch(
        f"/posts/{made['post']['id']}", json={"title": "   ", "body": "본문"}, cookies=head
    )

    assert response.status_code == 422


# ── 댓글 수정·삭제 ─────────────────────────────────────────────────────────


def _comment(api_client: TestClient, cookies: dict[str, str], post_id: int) -> int:
    made = api_client.post(
        f"/posts/{post_id}/comments", json={"body": "댓글"}, cookies=cookies
    )
    return int(made.json()["comment"]["id"])


def test_only_the_author_can_edit_a_comment(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _, other = account("이도현", "member@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]
    comment_id = _comment(api_client, head, post_id)

    response = api_client.patch(
        f"/comments/{comment_id}", json={"body": "가로챈 댓글"}, cookies=other
    )

    assert response.status_code == 403


def test_the_author_can_edit_their_own_comment(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]
    comment_id = _comment(api_client, head, post_id)

    response = api_client.patch(
        f"/comments/{comment_id}", json={"body": "고친 댓글"}, cookies=head
    )

    assert response.status_code == 200
    assert response.json()["comment"]["body"] == "고친 댓글"


def test_editing_a_comment_rejects_an_empty_body(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]
    comment_id = _comment(api_client, head, post_id)

    response = api_client.patch(f"/comments/{comment_id}", json={"body": " "}, cookies=head)

    assert response.status_code == 422


def test_only_the_author_can_delete_a_comment(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _, other = account("이도현", "member@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]
    comment_id = _comment(api_client, head, post_id)

    assert api_client.delete(f"/comments/{comment_id}", cookies=other).status_code == 403


def test_the_author_can_delete_their_own_comment(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]
    comment_id = _comment(api_client, head, post_id)

    assert api_client.delete(f"/comments/{comment_id}", cookies=head).status_code == 204
    assert db_session.get(Comment, comment_id) is None


# ===== 블라인드 =====
# 블라인드는 글을 지우지 않고 목록과 상세에서 완전히 가립니다. 댓글은 글에 딸린 것이라 함께 가려집니다.
# 가리는 사람과 되돌리는 사람은 board_moderate 를 가진 사람뿐입니다.


def test_a_blinded_post_disappears_for_its_own_author(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """작성자 본인도 볼 수 없습니다. 글 전체를 격리하는 것이 목적이라 예외를 두지 않습니다."""
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]

    blinded = api_client.put(f"/posts/{post_id}/blind", cookies=head)

    assert blinded.status_code == 204
    assert api_client.get("/notices", cookies=head).json()["posts"] == []
    assert api_client.get(f"/posts/{post_id}", cookies=head).status_code == 422


def test_blinding_needs_the_moderate_permission(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _, other = account("이도현", "member@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]

    response = api_client.put(f"/posts/{post_id}/blind", cookies=other)

    assert response.status_code == 403
    assert len(api_client.get("/notices", cookies=other).json()["posts"]) == 1


def test_a_blinded_post_comes_back_when_the_blind_is_lifted(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]
    api_client.put(f"/posts/{post_id}/blind", cookies=head)

    lifted = api_client.delete(f"/posts/{post_id}/blind", cookies=head)

    assert lifted.status_code == 204
    assert [p["id"] for p in api_client.get("/notices", cookies=head).json()["posts"]] == [post_id]


def test_only_a_moderator_reads_the_blinded_list(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """격리된 글은 이 목록에서만 보입니다. 판단에 필요한 제목·본문이 함께 반환됩니다."""
    _, head = account("박서연", "head@example.com")
    _, other = account("이도현", "member@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]
    api_client.put(f"/posts/{post_id}/blind", cookies=head)

    mine = api_client.get("/blinded-posts", cookies=head)

    assert api_client.get("/blinded-posts", cookies=other).status_code == 403
    assert mine.status_code == 200
    assert [(p["id"], p["title"]) for p in mine.json()["posts"]] == [(post_id, "공지")]


def test_the_blinded_list_shows_who_blinded_each_post(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """권한자가 여럿일 때 누가 가렸는지 사후에 확인할 수 있어야 합니다. 해제하면 그 기록도 함께 비웁니다."""
    _, head = account("박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "공지", "body": "본문"}, cookies=head
    ).json()["post"]["id"]

    api_client.put(f"/posts/{post_id}/blind", cookies=head)
    blinded = api_client.get("/blinded-posts", cookies=head).json()["posts"][0]
    api_client.delete(f"/posts/{post_id}/blind", cookies=head)
    back = api_client.get("/notices", cookies=head).json()["posts"][0]

    assert blinded["blinded_by"] == "박서연"
    assert back["blinded_by"] is None


def test_a_moderator_cannot_edit_someone_elses_post(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """board_moderate 는 삭제와 블라인드까지입니다. 남의 글 내용을 고치는 것은 허용하지 않습니다."""
    _, head = account("박서연", "head@example.com")
    member_id, member = account("이도현", "member@example.com")
    team = _team(db_session, "밴드")
    _join(db_session, member_id, team)
    db_session.commit()
    post_id = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "글", "body": "본문"}, cookies=member
    ).json()["post"]["id"]

    response = api_client.patch(
        f"/posts/{post_id}", json={"title": "고친 제목", "body": "본문"}, cookies=head
    )

    assert response.status_code == 403


def test_a_moderator_still_deletes_someone_elses_post(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    member_id, member = account("이도현", "member@example.com")
    team = _team(db_session, "밴드")
    _join(db_session, member_id, team)
    db_session.commit()
    post_id = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "글", "body": "본문"}, cookies=member
    ).json()["post"]["id"]

    response = api_client.delete(f"/posts/{post_id}", cookies=head)

    assert response.status_code == 204
