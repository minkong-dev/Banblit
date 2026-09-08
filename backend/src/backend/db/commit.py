"""제약 위반을 사람이 읽을 문장으로 바꿔 올리는 한 자리.

commit(또는 flush)에서 IntegrityError 가 나면 되돌리고, 걸린 제약 이름이 messages 에
있으면 그 문장을 담은 예외를, 없으면 원래 예외를 그대로 올린다 — 아는 사고가 아닌데
아는 척 문구를 붙이면 엉뚱한 곳을 고치게 만든다.

이름 중복은 여기서만 잡는다. 저장 전에 SELECT 로 미리 보는 검사는 두 요청이 동시에
들어오면 둘 다 통과하므로 경쟁을 못 막고, 제약이 어차피 잡는다.
"""

from collections.abc import Callable, Mapping

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


def constraint_name(error: IntegrityError) -> str | None:
    # psycopg 가 예외에 실어 주는 진단 정보에서 걸린 제약의 이름을 꺼낸다.
    return getattr(getattr(error.orig, "diag", None), "constraint_name", None)


def commit_translating(
    session: Session,
    messages: Mapping[str, str],
    action: Callable[[], object] | None = None,
    error_type: type[ValueError] = ValueError,
) -> None:
    """action(기본은 session.commit)을 실행한다. 제약에 걸리면 되돌리고 문장으로 바꾼다."""
    try:
        (session.commit if action is None else action)()
    except IntegrityError as error:
        session.rollback()
        message = messages.get(constraint_name(error) or "")
        if message is None:
            raise
        raise error_type(message) from error
