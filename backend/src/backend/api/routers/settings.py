from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.api.schemas import SettingsOut, SettingsUpdateIn
from backend.services.settings_service import (
    session_minutes,
    set_settings,
    slot_minutes,
)
from backend.db.pipeline import get_session

router = APIRouter()


# slot_minutes(칸 하나의 길이, 분 단위)는 화면이 달력을 그릴 때, session_minutes(합주 1회 길이)는
# 배정 결과를 설명할 때 필요하므로 로그인한 사람이면 누구나 읽습니다.
# 요청자의 신원을 쓰지 않으므로 사용하지 않는 매개변수를 남기지 않도록 dependencies 에 넣습니다.
@router.get("/settings", response_model=SettingsOut, dependencies=[Depends(require_account)])
def read_settings(session: Session = Depends(get_session)) -> SettingsOut:
    return SettingsOut(
        slot_minutes=slot_minutes(session), session_minutes=session_minutes(session)
    )


# 수정은 합주실 운영을 맡은 사람의 일이라 room_edit 를 씁니다. 권한 항목을 새로 만들지 않는 이유는
# 권한 항목이 늘면 권한 항목을 다루는 서버 코드도 같이 늘기 때문입니다(db/models.py 의 Permission).
@router.patch(
    "/settings",
    response_model=SettingsOut,
    dependencies=[Depends(require_permission("room_edit"))],
)
def update_settings(
    req: SettingsUpdateIn,
    session: Session = Depends(get_session),
) -> SettingsOut:
    slot, length = set_settings(session, req.slot_minutes, req.session_minutes)
    return SettingsOut(slot_minutes=slot, session_minutes=length)
