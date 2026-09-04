from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import Comment, Member, Membership, Position, Post, Team


def _team(session: Session, name: str) -> Team:
    team = Team(name=name)
    session.add(team)
    session.flush()
    return team


def _member(session: Session, name: str) -> Member:
    """로그인과 무관한, DB 제약만 확인하는 검사용 — 순수 SQLAlchemy 객체로 넣는다."""
    member = Member(name=name)
    session.add(member)
    session.flush()
    return member


def _account(api_client: TestClient, name: str, email: str) -> tuple[int, dict[str, str]]:
    """가입시켜 실제 계정을 만들고, (계정 번호, 인증 쿠키)를 돌려준다.

    이 파일의 첫 _account 호출이 곧 헤드매니저다(맨 처음 가입한 사람이 맡는 규칙).
    signup 응답의 Set-Cookie를 클라이언트 쿠키 저장소에 그대로 넣지 않는 이유는,
    한 시험 안에서 여러 계정(헤드매니저·일반 멤버 등)을 오가며 요청해야 해서다 —
    호출마다 cookies= 로 원하는 계정의 쿠키를 골라 실어야 서로 덮어쓰지 않는다.
    """
    body = api_client.post(
        "/signup",
        json={"name": name, "email": email, "password": "password123", "positions": ["보컬"]},
    ).json()
    session_token = api_client.cookies.get("banblit_session")
    api_client.cookies.clear()
    cookies = {"banblit_session": session_token}
    return body["account"]["id"], cookies


def _join(session: Session, member_id: int, team: Team) -> None:
    position_id = session.scalars(
        select(Position.id).where(Position.name == "보컬")
    ).one()
    session.add(
        Membership(member_id=member_id, team_id=team.id, position_id=position_id)
    )
    session.flush()


def test_notice_is_created_and_listed(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "공지 제목", "body": "공지 내용"}, cookies=head
    )

    assert response.status_code == 201
    post = response.json()["post"]
    assert post["title"] == "공지 제목"
    assert post["team_id"] is None
    assert post["author"] == "박서연"
    assert post["comment_count"] == 0

    listed = api_client.get("/notices")
    assert listed.status_code == 200
    assert [p["id"] for p in listed.json()["posts"]] == [post["id"]]


def test_notices_are_listed_newest_first(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")

    first = api_client.post(
        "/notices", json={"title": "첫 글", "body": "내용"}, cookies=head
    ).json()["post"]
    second = api_client.post(
        "/notices", json={"title": "둘째 글", "body": "내용"}, cookies=head
    ).json()["post"]

    response = api_client.get("/notices")

    ids = [p["id"] for p in response.json()["posts"]]
    assert ids == [second["id"], first["id"]]


def test_notice_creation_rejects_an_empty_title(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "  ", "body": "내용"}, cookies=head
    )

    assert response.status_code == 422
    assert "제목" in response.json()["detail"]


def test_notice_creation_rejects_an_empty_body(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "제목", "body": "  "}, cookies=head
    )

    assert response.status_code == 422
    assert "내용" in response.json()["detail"]


def test_notice_creation_requires_a_head_manager(
    api_client: TestClient, db_session: Session
) -> None:
    _account(api_client, "박서연", "head@example.com")  # 맨 처음이라 헤드매니저
    _, member = _account(api_client, "이도현", "member@example.com")

    response = api_client.post(
        "/notices", json={"title": "제목", "body": "내용"}, cookies=member
    )

    assert response.status_code == 403


def test_notice_creation_requires_authentication(api_client: TestClient) -> None:
    response = api_client.post("/notices", json={"title": "제목", "body": "내용"})

    assert response.status_code == 401


def test_notice_creation_rejects_a_title_over_the_length_limit(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "가" * 201, "body": "내용"}, cookies=head
    )

    assert response.status_code == 422


def test_notice_creation_rejects_a_body_over_the_length_limit(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")

    response = api_client.post(
        "/notices", json={"title": "제목", "body": "가" * 20001}, cookies=head
    )

    assert response.status_code == 422


def test_team_post_is_created_by_a_team_member(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = _account(api_client, "박서연", "a@example.com")
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
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    _, outsider = _account(api_client, "이도현", "b@example.com")

    response = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "팀 공지", "body": "내용"}, cookies=outsider
    )

    assert response.status_code == 403


def test_team_post_creation_rejects_an_unknown_team(
    api_client: TestClient, db_session: Session
) -> None:
    _, author = _account(api_client, "박서연", "a@example.com")

    response = api_client.post(
        "/teams/999999/posts", json={"title": "제목", "body": "내용"}, cookies=author
    )

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_team_posts_are_listed_only_for_that_team(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    other = _team(db_session, "파랑주의보")
    author_id, author = _account(api_client, "박서연", "a@example.com")
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
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = _account(api_client, "박서연", "a@example.com")
    _join(db_session, author_id, team)
    db_session.commit()

    response = api_client.get(f"/teams/{team.id}/posts", cookies=author)

    assert response.status_code == 200
    assert response.json()["posts"] == []


def test_team_posts_endpoint_rejects_an_unknown_team(
    api_client: TestClient, db_session: Session
) -> None:
    _, author = _account(api_client, "박서연", "a@example.com")

    response = api_client.get("/teams/999999/posts", cookies=author)

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_team_posts_read_requires_team_membership(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    _, outsider = _account(api_client, "이도현", "b@example.com")

    response = api_client.get(f"/teams/{team.id}/posts", cookies=outsider)

    assert response.status_code == 403


def test_team_posts_read_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")

    response = api_client.get(f"/teams/{team.id}/posts")

    assert response.status_code == 401


def test_post_detail_includes_comments(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")
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
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")

    response = api_client.get("/posts/999999", cookies=head)

    assert response.status_code == 422
    assert "글" in response.json()["detail"]


def test_post_detail_of_a_team_post_requires_membership(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = _account(api_client, "박서연", "a@example.com")
    _join(db_session, author_id, team)
    db_session.commit()
    post_id = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "제목", "body": "내용"}, cookies=author
    ).json()["post"]["id"]

    _, outsider = _account(api_client, "이도현", "b@example.com")
    response = api_client.get(f"/posts/{post_id}", cookies=outsider)

    assert response.status_code == 403


def test_post_detail_of_a_notice_needs_no_team_membership(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "제목", "body": "내용"}, cookies=head
    ).json()["post"]["id"]

    _, member = _account(api_client, "이도현", "member@example.com")
    response = api_client.get(f"/posts/{post_id}", cookies=member)

    assert response.status_code == 200


def test_comment_creation_rejects_an_empty_body(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")
    post_id = api_client.post(
        "/notices", json={"title": "제목", "body": "내용"}, cookies=head
    ).json()["post"]["id"]

    response = api_client.post(
        f"/posts/{post_id}/comments", json={"body": "  "}, cookies=head
    )

    assert response.status_code == 422
    assert "댓글" in response.json()["detail"]


def test_comment_creation_rejects_a_non_member_author_on_a_team_post(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = _account(api_client, "박서연", "a@example.com")
    _join(db_session, author_id, team)
    db_session.commit()
    post_id = api_client.post(
        f"/teams/{team.id}/posts", json={"title": "제목", "body": "내용"}, cookies=author
    ).json()["post"]["id"]

    _, outsider = _account(api_client, "이도현", "b@example.com")
    response = api_client.post(
        f"/posts/{post_id}/comments", json={"body": "댓글"}, cookies=outsider
    )

    assert response.status_code == 403


def test_comment_creation_allows_a_team_member_on_a_team_post(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    author_id, author = _account(api_client, "박서연", "a@example.com")
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
    api_client: TestClient, db_session: Session
) -> None:
    # author_id 가 이제 스키마에 없으니 보내도 조용히 무시돼야 한다 — 응답의 글쓴이는
    # 언제나 토큰이 가리키는 계정이다.
    _, head = _account(api_client, "박서연", "head@example.com")

    response = api_client.post(
        "/notices",
        json={"title": "제목", "body": "내용", "author_id": 999999},
        cookies=head,
    )

    assert response.status_code == 201
    assert response.json()["post"]["author"] == "박서연"


def test_comment_creation_rejects_a_body_over_the_length_limit(
    api_client: TestClient, db_session: Session
) -> None:
    _, head = _account(api_client, "박서연", "head@example.com")
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
