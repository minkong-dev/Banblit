from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_permission
from backend.api.permission_service import (
    create_permission_set,
    delete_permission_set,
    grant_permission_set,
    list_permission_sets,
    revoke_permission_set,
    set_holders,
    update_permission_set,
)
from backend.api.schemas import (
    PermissionSetEnvelopeOut,
    PermissionSetIn,
    PermissionSetOut,
    PermissionSetsOut,
)
from backend.db.models import PermissionSet
from backend.db.pipeline import get_session

router = APIRouter()

# 여섯 통로 모두 permission_grant 하나로 막는다. 그 항목이 없으면 남의 권한도
# 자기 권한도 건드리지 못한다 — 본인이냐 남이냐로 가르는 예외는 두지 않는다.
_grant_only = Depends(require_permission("permission_grant"))


def _set_out(permission_set: PermissionSet, member_ids: list[int]) -> PermissionSetOut:
    return PermissionSetOut(
        id=permission_set.id,
        name=permission_set.name,
        permissions=permission_set.permissions,  # type: ignore[arg-type]
        member_ids=member_ids,
    )


@router.get("/permission-sets", response_model=PermissionSetsOut, dependencies=[_grant_only])
def read_permission_sets(session: Session = Depends(get_session)) -> PermissionSetsOut:
    return PermissionSetsOut(
        permission_sets=[
            _set_out(row, member_ids) for row, member_ids in list_permission_sets(session)
        ]
    )


@router.post(
    "/permission-sets",
    response_model=PermissionSetEnvelopeOut,
    status_code=201,
    dependencies=[_grant_only],
)
def create_set(
    req: PermissionSetIn, session: Session = Depends(get_session)
) -> PermissionSetEnvelopeOut:
    try:
        permission_set = create_permission_set(session, req.name, list(req.permissions))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return PermissionSetEnvelopeOut(permission_set=_set_out(permission_set, []))


@router.patch(
    "/permission-sets/{set_id}",
    response_model=PermissionSetEnvelopeOut,
    dependencies=[_grant_only],
)
def patch_set(
    set_id: int, req: PermissionSetIn, session: Session = Depends(get_session)
) -> PermissionSetEnvelopeOut:
    try:
        permission_set = update_permission_set(
            session, set_id, req.name, list(req.permissions)
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    # 고친 묶음이 지금 누구에게 붙어 있는지까지 돌려준다 — 화면이 바로 다음에
    # 보여줄 목록이 그것이다.
    return PermissionSetEnvelopeOut(
        permission_set=_set_out(permission_set, set_holders(session, set_id))
    )


@router.delete("/permission-sets/{set_id}", status_code=204, dependencies=[_grant_only])
def delete_set(set_id: int, session: Session = Depends(get_session)) -> None:
    try:
        delete_permission_set(session, set_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post(
    "/members/{member_id}/permission-sets/{set_id}",
    status_code=201,
    dependencies=[_grant_only],
)
def grant_set(
    member_id: int, set_id: int, session: Session = Depends(get_session)
) -> None:
    try:
        grant_permission_set(session, member_id, set_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete(
    "/members/{member_id}/permission-sets/{set_id}",
    status_code=204,
    dependencies=[_grant_only],
)
def revoke_set(
    member_id: int, set_id: int, session: Session = Depends(get_session)
) -> None:
    try:
        revoke_permission_set(session, member_id, set_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
