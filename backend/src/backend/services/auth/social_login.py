# 소셜 로그인(OAuth 2.0, 제공자의 로그인으로 사용자 번호를 확인하는 규약)의 기능 파일입니다.
# 제공자 설정, 인가 주소 생성, code 를 사용자 번호로 교환, 연결 행의 저장과 조회를 담당합니다.
# 환경변수를 읽는 위치, timeout, redirect 주소는 pipeline.py 가 전달합니다.

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from http.client import HTTPException
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.contract import SocialProvider

from backend.db.models import Member, SocialAccount

logger = logging.getLogger(__name__)
# 제공자 요청이 실패했을 때의 문장입니다. 원인(상태 코드, 주소)은 로그에만 남깁니다.
PROVIDER_FAILED = "소셜 로그인 제공자의 응답을 받지 못했어요. 잠시 후 다시 시도해주세요."


class SocialError(ValueError):
    """소셜 로그인과 연결의 실패입니다. code 는 callback 이 화면 주소에 붙이는 판정 값이고, 문장은 화면이 code 로 만듭니다.

    code 는 provider(제공자 응답 실패), unlinked(연결된 계정 없음), taken(다른 멤버에 연결된 소셜 계정), already(이 멤버가 같은 제공자를 이미 연결)
    4가지입니다. 화면 쪽은 frontend/src/lib/account.ts 의 socialNotice 가 같은 값을 씁니다.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ProviderConfig:
    name: SocialProvider
    client_id: str
    client_secret: str
    authorize_url: str
    token_url: str
    userinfo_url: str
    # 요청할 범위입니다. 사용자 번호만 받으므로 최소 범위입니다.
    scope: str
    # 사용자 정보 응답에서 사용자 번호가 담긴 key 입니다.
    user_id_key: str


# 제공자마다 고정인 주소와 key 입니다. client_id, client_secret 은 환경변수로 받아 provider_config 가 채웁니다.
_ENDPOINTS: dict[SocialProvider, dict[str, str]] = {
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid",
        "user_id_key": "sub",
    },
    "kakao": {
        "authorize_url": "https://kauth.kakao.com/oauth/authorize",
        "token_url": "https://kauth.kakao.com/oauth/token",
        "userinfo_url": "https://kapi.kakao.com/v2/user/me",
        "scope": "",
        "user_id_key": "id",
    },
}


def provider_config(name: SocialProvider, client_id: str, client_secret: str) -> ProviderConfig | None:
    """client_id 가 비어 있으면 None 을 반환합니다. 카카오는 client_secret 이 선택이라 비어 있어도 설정을 반환합니다."""
    if client_id == "" or (name == "google" and client_secret == ""):
        return None
    return ProviderConfig(name=name, client_id=client_id, client_secret=client_secret, **_ENDPOINTS[name])


def authorize_url(config: ProviderConfig, redirect_uri: str, state: str) -> str:
    """사용자를 보낼 제공자의 로그인 주소를 반환합니다. state 는 callback 에서 같은 값이 돌아오는지 확인하는 값입니다."""
    params = {
        "client_id": config.client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
    }
    if config.scope != "":
        params["scope"] = config.scope
    return f"{config.authorize_url}?{urlencode(params)}"


def _http_json(request: Request, timeout: float) -> dict[str, Any]:
    """request 를 보내고 JSON 본문을 dict 로 반환합니다. 연결 실패, 4xx/5xx, 끊긴 응답, JSON 아님은 전부 PROVIDER_FAILED 의 ValueError 입니다.

    URLError, HTTPError 는 OSError 의 하위 class 이고, 응답 도중 끊김(RemoteDisconnected, IncompleteRead)은 http.client.HTTPException 입니다.
    """
    try:
        with urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (OSError, HTTPException, ValueError) as error:
        logger.warning("소셜 로그인 제공자 요청 실패 — %s %s: %s", request.get_method(), request.full_url, error)
        raise SocialError("provider", PROVIDER_FAILED) from error
    if not isinstance(body, dict):
        logger.warning("소셜 로그인 제공자 응답이 객체가 아닙니다 — %s", request.full_url)
        raise SocialError("provider", PROVIDER_FAILED)
    return body


def fetch_provider_user_id(config: ProviderConfig, code: str, redirect_uri: str, timeout: float) -> str:
    """callback 으로 받은 code 를 access token 으로 교환하고, 그 token 으로 조회한 사용자 번호를 문자열로 반환합니다."""
    form = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": config.client_id,
        "redirect_uri": redirect_uri,
    }
    if config.client_secret != "":
        form["client_secret"] = config.client_secret
    token_request = Request(
        config.token_url,
        data=urlencode(form).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    token_body = _http_json(token_request, timeout)
    access_token = token_body.get("access_token")
    if not isinstance(access_token, str) or access_token == "":
        logger.warning("소셜 로그인 제공자가 access token 을 반환하지 않았습니다 — %s", config.token_url)
        raise SocialError("provider", "소셜 로그인 제공자가 access token 을 반환하지 않았어요")

    user_request = Request(config.userinfo_url, headers={"Authorization": f"Bearer {access_token}"})
    user_body = _http_json(user_request, timeout)
    user_id = user_body.get(config.user_id_key)
    # Google 의 sub 는 문자열, 카카오의 id 는 정수입니다. table 에는 문자열로 저장합니다. bool 은 int 의 하위 class 라 따로 거절합니다.
    if isinstance(user_id, bool) or not isinstance(user_id, (str, int)) or str(user_id) == "":
        logger.warning("소셜 로그인 제공자가 사용자 번호를 반환하지 않았습니다 — %s", config.userinfo_url)
        raise SocialError("provider", "소셜 로그인 제공자가 사용자 번호를 반환하지 않았어요")
    return str(user_id)


def find_member(session: Session, provider: SocialProvider, provider_user_id: str) -> Member | None:
    """provider 의 provider_user_id 에 연결된 멤버를 반환합니다. 연결이 없으면 None 입니다."""
    return session.scalar(
        select(Member)
        .join(SocialAccount, SocialAccount.member_id == Member.id)
        .where(SocialAccount.provider == provider, SocialAccount.provider_user_id == provider_user_id)
    )


def linked_providers(session: Session, member_id: int) -> list[SocialProvider]:
    """member_id 에 연결된 제공자 이름을 provider 순으로 반환합니다."""
    rows = session.scalars(
        select(SocialAccount.provider).where(SocialAccount.member_id == member_id).order_by(SocialAccount.provider)
    ).all()
    return list(rows)


def link(session: Session, member_id: int, provider: SocialProvider, provider_user_id: str, now: datetime) -> None:
    """member_id 에 provider 의 provider_user_id 를 연결하고 commit 합니다.

    같은 소셜 계정이 다른 멤버에 연결되어 있거나, 이 멤버가 같은 provider 를 이미 연결했으면 SocialError 입니다.
    """
    owner = find_member(session, provider, provider_user_id)
    if owner is not None and owner.id != member_id:
        raise SocialError("taken", "이미 다른 계정에 연결된 소셜 계정이에요")
    if provider in linked_providers(session, member_id):
        raise SocialError("already", "이미 연결된 제공자예요")
    session.add(SocialAccount(member_id=member_id, provider=provider, provider_user_id=provider_user_id, linked_at=now))
    # 위 2개 조회와 이 INSERT 사이에 다른 요청이 같은 연결을 먼저 저장하면 unique 제약이 거절합니다. 그 경우도 422 로 응답합니다.
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise SocialError("taken", "이미 연결된 소셜 계정이에요") from error


def unlink_social(session: Session, member_id: int, provider: SocialProvider) -> None:
    """member_id 의 provider 연결을 삭제하고 commit 합니다. 연결이 없으면 ValueError 입니다."""
    row = session.scalar(
        select(SocialAccount).where(SocialAccount.member_id == member_id, SocialAccount.provider == provider)
    )
    if row is None:
        raise ValueError("존재하지 않는 연결이에요")
    session.delete(row)
    session.commit()
