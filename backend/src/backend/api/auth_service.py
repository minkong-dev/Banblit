import hashlib
import hmac
import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.api.board_input import require_non_empty
from backend.api.auth_input import (
    require_cohort,
    require_email,
    require_name,
    require_password,
)
from backend.api.permission_service import grant_full_permissions
from backend.db.models import Member

# scrypt 는 표준 라이브러리(hashlib)가 제공하는 메모리-하드 KDF다 — bcrypt·argon2용
# 패키지를 새로 깔지 않고도 비밀번호를 안전하게 저장할 수 있어 이 값들을 쓴다.
# 값은 OWASP 권고 최솟값(N=2^14, r=8, p=1)을 그대로 따른다.
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32

# 옛 형식("소금$파생값" 두 토막)은 강도를 저장하지 않았다 — 그 시절엔 이 값으로
# 계산했다. 위 _SCRYPT_* 를 나중에 올려도 이 값은 그대로 둬야 옛 계정을 검증할 수 있다.
_LEGACY_SCRYPT_N = 2**14
_LEGACY_SCRYPT_R = 8
_LEGACY_SCRYPT_P = 1

MEMBERS_EMAIL_CONSTRAINT = "members_email_key"
# 이름·학과·학번·기수가 모두 같으면 같은 사람이다. 그 조합을 막는 조건의 이름이다.
MEMBERS_IDENTITY_CONSTRAINT = "members_name_department_student_no_cohort_key"


def hash_password(password: str) -> str:
    """"scrypt$n$r$p$소금$파생값"을 16진수로 이어 돌려준다. 소금은 호출마다 새로 뽑는다.

    맨 앞 "scrypt"는 이름표다 — 나중에 다른 KDF로 갈아탈 때 형식을 구분하는 데 쓴다.
    강도(n·r·p)를 값 자체에 적어 두면, 나중에 강도를 올려도 옛 계정은 자기가 저장될
    때의 강도로 계속 검증할 수 있다.
    """
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_DKLEN
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """토막 수로 형식을 가른다 — 두 토막이면 옛 형식(고정 강도), 여섯 토막이면 새
    형식(저장된 강도)이다. dklen은 저장하지 않고 파생값 길이로 그대로 알아낸다."""
    parts = stored.split("$")
    if len(parts) == 2:
        salt_hex, derived_hex = parts
        n, r, p = _LEGACY_SCRYPT_N, _LEGACY_SCRYPT_R, _LEGACY_SCRYPT_P
    else:
        _, n_text, r_text, p_text, salt_hex, derived_hex = parts
        n, r, p = int(n_text), int(r_text), int(p_text)
    dklen = len(bytes.fromhex(derived_hex))
    candidate = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt_hex), n=n, r=r, p=p, dklen=dklen
    )
    # 길이가 같아도 시간차 비교(==)는 앞자리부터 다르면 더 빨리 끝난다. 그 시간차로
    # 파생값을 한 글자씩 추측하지 못하도록 hmac.compare_digest로 항상 같은 시간에 비교한다.
    return hmac.compare_digest(candidate, bytes.fromhex(derived_hex))


def _needs_rehash(stored: str) -> bool:
    """저장된 문자열만 보고, 지금 강도(_SCRYPT_N/R/P)와 다른지 판정한다.

    옛 두 토막 형식은 강도 표기가 아예 없으므로 무조건 다시 계산해야 한다.
    """
    parts = stored.split("$")
    if len(parts) != 6:
        return True
    _, n_text, r_text, p_text, _, _ = parts
    return (int(n_text), int(r_text), int(p_text)) != (_SCRYPT_N, _SCRYPT_R, _SCRYPT_P)


def _is_first_account(session: Session) -> bool:
    # 권한을 가진 사람은 인원을 고정하지 않지만(.cluedoc/accounts-and-roles), 아무도
    # 없이 시작할 수는 없다. 가장 먼저 가입하는 사람에게 열한 가지를 전부 주어
    # 그다음부터는 그 사람이 권한을 나눠 주거나 새로 정의하게 한다.
    already_signed_up = session.scalar(
        select(Member.id).where(Member.password_hash.is_not(None))
    )
    return already_signed_up is None


def _signup_conflict(error: IntegrityError) -> ValueError | None:
    """어긴 조건을 사람이 읽을 문장으로 바꾼다. 우리가 아는 조건이 아니면 None."""
    constraint = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
    if constraint == MEMBERS_EMAIL_CONSTRAINT:
        return ValueError("이미 가입된 이메일입니다")
    if constraint == MEMBERS_IDENTITY_CONSTRAINT:
        return ValueError("이미 가입된 사람입니다 — 이름·학과·학번·기수가 같습니다")
    return None


def _commit_signup(session: Session) -> None:
    """이메일 중복 사전 검사와 commit 사이에는 잠금이 없다. room_service.commit_room과
    같은 얼개로, 동시에 들어온 같은 이메일 가입 중 나중 커밋만 여기서 잡는다."""
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        known = _signup_conflict(error)
        if known is None:
            raise
        raise known from error


def signup(
    session: Session,
    name: str,
    department: str,
    student_no: str,
    email: str,
    password: str,
    cohort: int,
) -> Member:
    """새 계정을 만든다. 이름은 중복을 허용하고, 이메일만 겹칠 수 없다.

    기수를 함께 받는 것은 동명이인 때문이다 — 화면에서 두 사람을 가르는 값이 이름 옆의
    기수뿐이라, 가입할 때 받아 두지 않으면 나중에 채울 길이 없다."""
    clean_name = require_name(name)
    clean_department = require_non_empty(department, "학과")
    clean_student_no = require_non_empty(student_no, "학번")
    clean_email = require_email(email)
    require_password(password)
    clean_cohort = require_cohort(cohort)
    if session.scalar(select(Member.id).where(Member.email == clean_email)) is not None:
        raise ValueError("이미 가입된 이메일입니다")

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
    try:
        # 신원 조건(이름·학과·학번·기수)은 여기서 터진다 — 아래 커밋보다 앞이다.
        session.flush()
    except IntegrityError as error:
        session.rollback()
        known = _signup_conflict(error)
        if known is None:
            raise
        raise known from error
    # 계정보다 먼저 판정해 둔 first 를 여기서 쓴다 — 위 flush 로 본인이 이미 들어가
    # 있어, 지금 다시 세면 "첫 계정"이 아니게 된다.
    if first:
        grant_full_permissions(session, member.id)
    _commit_signup(session)
    return member


def update_profile(
    session: Session, member: Member, name: str, cohort: int | None
) -> Member:
    """내 이름과 기수를 고친다. 이메일은 여기서 다루지 않는다 — 로그인 식별자라
    바꾸려면 새 주소가 내 것인지 확인하는 절차가 따로 있어야 한다."""
    member.name = require_name(name)
    member.cohort = None if cohort is None else require_cohort(cohort)
    session.commit()
    return member


def change_password(
    session: Session, member: Member, current: str, next_password: str
) -> None:
    """비밀번호를 바꾼다. 지금 비밀번호를 먼저 묻는다 — 남이 켜 둔 화면 앞에 앉은
    사람이 그대로 비밀번호를 갈아 끼우지 못하게 한다."""
    if not verify_password(current, member.password_hash):
        raise PermissionError("지금 비밀번호가 맞지 않습니다")
    require_password(next_password)
    member.password_hash = hash_password(next_password)
    session.commit()


def login(session: Session, email: str, password: str) -> Member:
    """이메일이 없거나 비밀번호가 틀려도 같은 문장으로 거절한다 — 어느 쪽이 틀렸는지
    알려주면 그 이메일이 가입돼 있는지를 알려주는 셈이 된다."""
    member = session.scalar(select(Member).where(Member.email == email.strip()))
    if member is None or member.password_hash is None or not verify_password(
        password, member.password_hash
    ):
        raise ValueError("이메일 또는 비밀번호가 올바르지 않습니다")
    # 비밀번호를 맞춘 순간에만 원문 비밀번호를 다시 손에 쥘 수 있다. 이때 옛 강도로
    # 저장돼 있던 값을 지금 강도로 갈아 끼워, 사용자가 아무것도 하지 않아도 옮겨간다.
    if _needs_rehash(member.password_hash):
        member.password_hash = hash_password(password)
        session.commit()
    return member

