import hashlib
import hmac
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.services.input import (
    require_cohort,
    require_email,
    require_non_empty,
    require_password,
    require_student_no,
)
from backend.services.permission_service import grant_full_permissions
from backend.db.models import Member
from backend.db.pipeline import commit_translating

# scrypt 는 표준 라이브러리(hashlib)가 제공하는 메모리-하드 KDF(Key Derivation Function)입니다. bcrypt·argon2용
# 추가 패키지를 설치하지 않고도 비밀번호를 안전하게 저장할 수 있으므로 scrypt 를 사용합니다.
# 매개변수는 OWASP 권고 최솟값(N=2^14, r=8, p=1)을 따릅니다.
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32

# 데이터베이스 제약(constraint) 위반 시 표시할 오류 메시지입니다. 이메일은 계정 하나에 하나이며,
# 이름·학과·학번·기수가 모두 같으면 같은 사람으로 판정합니다.
MEMBER_MESSAGES = {
    "members_email_key": "이미 가입된 이메일입니다",
    "members_name_department_student_no_cohort_key": "이미 가입된 사람입니다 — 이름·학과·학번·기수가 같습니다",
}


def hash_password(password: str) -> str:
    """"scrypt$n$r$p$salt$derived_key" 형식의 문자열을 반환합니다. salt 는 호출마다 새로 생성합니다.

    맨 앞 "scrypt"는 형식 표식입니다. 나중에 다른 KDF로 변경하면 형식을 구분하는 데 사용합니다.
    n·r·p 값을 저장된 해시에 포함하면, 나중에 강도를 올려도 기존 계정은 저장 당시의 강도로 검증됩니다.
    """
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_DKLEN
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """저장된 해시에서 읽은 n·r·p로 다시 계산하여 비교합니다. dklen 은 저장하지 않고 파생값의 길이로 복원합니다."""
    _, n_text, r_text, p_text, salt_hex, derived_hex = stored.split("$")
    n, r, p = int(n_text), int(r_text), int(p_text)
    dklen = len(bytes.fromhex(derived_hex))
    candidate = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt_hex), n=n, r=r, p=p, dklen=dklen
    )
    # == 비교는 앞자리부터 다르면 더 빨리 끝나므로 비교 시간으로 해시 값을 한 글자씩 추측할 수 있습니다.
    # hmac.compare_digest 는 값과 무관하게 항상 같은 시간에 비교합니다.
    return hmac.compare_digest(candidate, bytes.fromhex(derived_hex))


def _needs_rehash(stored: str) -> bool:
    """저장된 해시에서 읽은 n·r·p 가 현재의 _SCRYPT_N·_SCRYPT_R·_SCRYPT_P 와 다른지 판정합니다."""
    _, n_text, r_text, p_text, _, _ = stored.split("$")
    return (int(n_text), int(r_text), int(p_text)) != (_SCRYPT_N, _SCRYPT_R, _SCRYPT_P)


def _is_first_account(session: Session) -> bool:
    # 권한을 가진 사람의 수는 정해져 있지 않지만(.cluedoc/accounts-and-roles), 권한을 가진 사람이 0명이면
    # 권한을 배정할 사람이 없습니다. 가장 먼저 가입하는 사람에게 모든 권한을 부여하면, 그다음부터는
    # 그 사람이 다른 사람에게 권한을 배정하거나 permission set(권한 집합)을 새로 정의합니다.
    already_signed_up = session.scalar(
        select(Member.id).where(Member.password_hash.is_not(None))
    )
    return already_signed_up is None


def signup(
    session: Session,
    name: str,
    department: str,
    student_no: str,
    email: str,
    password: str,
    cohort: int,
) -> Member:
    """새 계정을 만듭니다. 이름 중복은 허용합니다. 이메일이 같거나 이름·학과·학번·기수가 모두 같은 계정이 있으면 거부합니다.

    cohort 를 받는 이유는 동명이인 때문입니다. 화면에서 두 사람을 구분하는 유일한 값이 이름 옆의 기수이므로, 가입 시 입력받지 않으면 나중에 채울 수 없습니다."""
    clean_name = require_non_empty(name, "이름")
    clean_department = require_non_empty(department, "학과")
    clean_student_no = require_student_no(student_no)
    clean_email = require_email(email)
    require_password(password)
    clean_cohort = require_cohort(cohort)

    first = _is_first_account(session)
    member = Member(
        name=clean_name,
        department=clean_department,
        student_no=clean_student_no,
        cohort=clean_cohort,
        email=clean_email,
        password_hash=hash_password(password),
    )
    session.add(member)
    # 이메일·신원 제약 위반은 아래 commit 이 아니라 이 flush 에서 감지됩니다.
    commit_translating(session, MEMBER_MESSAGES, session.flush)
    # first 는 flush 전에 계산한 값입니다. flush 후에 _is_first_account 를 다시 호출하면 방금 추가한
    # 계정이 포함되어 False 를 반환합니다.
    if first:
        grant_full_permissions(session, member.id)
    commit_translating(session, MEMBER_MESSAGES)
    return member


def update_profile(
    session: Session, member: Member, name: str, cohort: int | None
) -> Member:
    """로그인 사용자의 이름과 기수를 수정합니다. 이메일은 이 함수에서 수정하지 않습니다. 로그인 식별자이므로 변경하려면 새 주소의 소유권을 확인하는 별도 절차가 필요합니다."""
    member.name = require_non_empty(name, "이름")
    member.cohort = None if cohort is None else require_cohort(cohort)
    session.commit()
    return member


def change_password(
    session: Session, member: Member, current: str, next_password: str
) -> None:
    """비밀번호를 변경합니다. 현재 비밀번호를 먼저 확인하므로, 다른 사람이 사용 중인 기기에서 비밀번호를 무단으로 변경할 수 없습니다."""
    # password_hash 가 없는 계정은 이 경로로 비밀번호를 변경할 수 없습니다. 비교할 값이 없기 때문입니다.
    if member.password_hash is None or not verify_password(current, member.password_hash):
        raise PermissionError("지금 비밀번호가 맞지 않습니다")
    require_password(next_password)
    member.password_hash = hash_password(next_password)
    session.commit()


def login(session: Session, email: str, password: str) -> Member:
    """이메일이 없거나 비밀번호가 틀려도 같은 오류 메시지를 반환합니다. 어느 쪽이 틀렸는지 알리면 가입된 이메일을 공개하는 보안 문제가 됩니다."""
    member = session.scalar(select(Member).where(Member.email == email.strip()))
    if member is None or member.password_hash is None or not verify_password(
        password, member.password_hash
    ):
        raise ValueError("이메일 또는 비밀번호가 올바르지 않습니다")
    # 비밀번호 검증에 성공한 순간만 평문 비밀번호를 알 수 있습니다. 이때 기존 강도로 저장된 해시를 현재 강도로 다시 생성하여 자동으로 업그레이드합니다.
    if _needs_rehash(member.password_hash):
        member.password_hash = hash_password(password)
        session.commit()
    return member

