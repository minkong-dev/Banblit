"""permission 의 권한 이름 정리와 전체 권한 판정을 DB 없이 검증합니다."""

import pytest

from backend.contract import PERMISSIONS
from backend.services.permission.permission_service import _clean_permissions, holds_every_permission


def test_names_are_deduplicated_and_put_in_declaration_order() -> None:
    assert _clean_permissions(["room_edit", "room_create", "room_edit"]) == ["room_create", "room_edit"]


def test_an_unknown_name_is_refused() -> None:
    with pytest.raises(ValueError):
        _clean_permissions(["room_create", "fly"])


def test_every_permission_is_needed_to_be_full() -> None:
    assert holds_every_permission(list(PERMISSIONS))
    assert not holds_every_permission(list(PERMISSIONS)[1:])
