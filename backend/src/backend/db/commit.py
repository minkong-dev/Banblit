"""제약 위반을 사람이 읽을 수 있는 문장으로 변환해 발생시킵니다. 이 module 외에서는 변환하지 않습니다.

commit(또는 flush)에서 IntegrityError 가 발생하면 rollback 하고, 위반된 제약 이름이 messages 에
있으면 그 문장을 담은 예외를, 없으면 원래 예외를 발생시킵니다.

이름 중복은 저장 전 SELECT 가 아니라 이 module 의 제약 위반 변환으로만 검증합니다.
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
    """action(기본값: session.commit)을 실행합니다. 제약을 위반하면 rollback 하고 messages 의 문장으로 변환합니다.

    IntegrityError 가 아닌 예외도 rollback 한 뒤 그대로 다시 발생시킵니다. action 이 commit 전에 flush·SELECT 를
    실행하는 경우(기간 수정의 예약 취소) 그 단계의 예외가 session 을 rollback 하지 않은 상태로 호출부에 전달되면,
    같은 session 의 다음 사용이 PendingRollbackError 로 실패합니다.
    """
    try:
        (session.commit if action is None else action)()
    except IntegrityError as error:
        session.rollback()
        message = messages.get(constraint_name(error) or "")
        if message is None:
            raise
        raise error_type(message) from error
    except Exception:
        session.rollback()
        raise
