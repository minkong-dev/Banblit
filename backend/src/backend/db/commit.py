"""제약 위반을 사람이 읽을 수 있는 문장으로 변환하여 발생시키는 한 자리입니다.

commit(또는 flush)에서 IntegrityError 가 발생하면 되돌리고, 위반된 제약 이름이 messages 에
있으면 그 문장을 담은 예외를, 없으면 원래 예외를 그대로 발생시킵니다. 정확하지 않은 문구를
반환하면 엉뚱한 곳을 수정하게 만들기 때문입니다.

이름 중복은 이 함수에서만 검증합니다. 저장 전 사전 SELECT 검사는 두 요청이 동시에
들어오면 둘 다 통과하므로 경쟁 상태를 막을 수 없고, 제약이 어차피 검증하기 때문입니다.
"""

from collections.abc import Callable, Mapping

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


def constraint_name(error: IntegrityError) -> str | None:
    # psycopg 가 제공하는 예외 진단 정보에서 위반된 제약의 이름을 추출합니다.
    return getattr(getattr(error.orig, "diag", None), "constraint_name", None)


def commit_translating(
    session: Session,
    messages: Mapping[str, str],
    action: Callable[[], object] | None = None,
    error_type: type[ValueError] = ValueError,
) -> None:
    """action(기본값: session.commit)을 실행합니다. 제약에 위반하면 되돌리고 messages 의 문장으로 변환합니다."""
    try:
        (session.commit if action is None else action)()
    except IntegrityError as error:
        session.rollback()
        message = messages.get(constraint_name(error) or "")
        if message is None:
            raise
        raise error_type(message) from error
