---
source: backend/src/backend/api/schemas.py
kind: file
---

# schemas.py

저장소 경로 `backend/src/backend/api/schemas.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_api_schemas["schemas.py"]
  backend_src_backend_api_schemas --> backend_src_backend_contract["contract.py"]
  backend_src_backend_api_routers_auth["auth.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_boards["boards.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_notifications["notifications.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_periods["periods.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_permissions["permissions.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_reservations["reservations.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_rooms["rooms.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_roster["roster.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_schedule["schedule.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_settings["settings.py"] --> backend_src_backend_api_schemas
  backend_src_backend_api_routers_unavailable["unavailable.py"] --> backend_src_backend_api_schemas
  backend_tests_unit_test_schemas["test_schemas.py"] --> backend_src_backend_api_schemas
```

## imports

- [[graph/backend/src/backend/contract|contract.py]]

## imported by

- [[graph/backend/src/backend/api/routers/auth|auth.py]]
- [[graph/backend/src/backend/api/routers/boards|boards.py]]
- [[graph/backend/src/backend/api/routers/notifications|notifications.py]]
- [[graph/backend/src/backend/api/routers/periods|periods.py]]
- [[graph/backend/src/backend/api/routers/permissions|permissions.py]]
- [[graph/backend/src/backend/api/routers/reservations|reservations.py]]
- [[graph/backend/src/backend/api/routers/rooms|rooms.py]]
- [[graph/backend/src/backend/api/routers/roster|roster.py]]
- [[graph/backend/src/backend/api/routers/schedule|schedule.py]]
- [[graph/backend/src/backend/api/routers/settings|settings.py]]
- [[graph/backend/src/backend/api/routers/unavailable|unavailable.py]]
- [[graph/backend/tests/unit/test_schemas|test_schemas.py]]
