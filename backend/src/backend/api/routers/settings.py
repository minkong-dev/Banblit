from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.api.schemas import SettingsOut, SettingsUpdateIn
from backend.api.settings_service import set_slot_minutes, slot_minutes
from backend.db.pipeline import get_session

router = APIRouter()


# 칸 크기는 화면이 달력을 그릴 때 필요하므로 로그인한 사람이면 누구나 읽습니다. 요청자의
# 신원을 쓰지 않으므로 사용하지 않는 매개변수를 남기지 않도록 dependencies 에 넣습니다.
@router.get("/settings", response_model=SettingsOut, dependencies=[Depends(require_account)])
def read_settings(session: Session = Depends(get_session)) -> SettingsOut:
    return SettingsOut(slot_minutes=slot_minutes(session))


# 고치는 것은 합주실 운영을 맡은 사람의 일이라 room_edit 를 씁니다. 항목을 새로 만들지 않는 것은
# 권한 항목이 늘면 그것을 다루는 서버 코드도 같이 늘기 때문입니다(db/models.py 의 Permission).
@router.patch(
    "/settings",
    response_model=SettingsOut,
    dependencies=[Depends(require_permission("room_edit"))],
)
def update_settings(
    req: SettingsUpdateIn,
    session: Session = Depends(get_session),
) -> SettingsOut:
    return SettingsOut(slot_minutes=set_slot_minutes(session, req.slot_minutes))
