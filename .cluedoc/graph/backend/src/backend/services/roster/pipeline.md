---
source: backend/src/backend/services/roster/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/roster/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_roster_pipeline["pipeline.py"]
  backend_src_backend_services_roster_pipeline --> backend_src_backend_db_models["models.py"]
  backend_src_backend_services_roster_pipeline --> backend_src_backend_services_permission_pipeline["pipeline.py"]
  backend_src_backend_services_roster_pipeline --> backend_src_backend_services_roster_avatar_service["avatar_service.py"]
  backend_src_backend_services_roster_pipeline --> backend_src_backend_services_roster_roster_service["roster_service.py"]
  backend_src_backend_api_routers_auth["auth.py"] --> backend_src_backend_services_roster_pipeline
  backend_src_backend_api_routers_roster["roster.py"] --> backend_src_backend_services_roster_pipeline
  backend_src_backend_services_board_board_service["board_service.py"] --> backend_src_backend_services_roster_pipeline
  backend_src_backend_services_reservation_reservation_service["reservation_service.py"] --> backend_src_backend_services_roster_pipeline
  backend_tests_integration_db_test_avatar_endpoints["test_avatar_endpoints.py"] --> backend_src_backend_services_roster_pipeline
  backend_tests_integration_db_test_roster_endpoints["test_roster_endpoints.py"] --> backend_src_backend_services_roster_pipeline
```

## imports

- [[graph/backend/src/backend/db/models|models.py]]
- [[graph/backend/src/backend/services/permission/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/roster/avatar_service|avatar_service.py]]
- [[graph/backend/src/backend/services/roster/roster_service|roster_service.py]]

## imported by

- [[graph/backend/src/backend/api/routers/auth|auth.py]]
- [[graph/backend/src/backend/api/routers/roster|roster.py]]
- [[graph/backend/src/backend/services/board/board_service|board_service.py]]
- [[graph/backend/src/backend/services/reservation/reservation_service|reservation_service.py]]
- [[graph/backend/tests/integration/db/test_avatar_endpoints|test_avatar_endpoints.py]]
- [[graph/backend/tests/integration/db/test_roster_endpoints|test_roster_endpoints.py]]

## 함수와 호출

- `create_team`: `backend.services.roster.roster_service.create_team`
- `replace_slots`: `backend.services.roster.roster_service.replace_slots`
- `save_avatar`: `backend.services.roster.avatar_service.save_avatar`
- `search_members`: `backend.services.roster.roster_service.search_members`
- `assign_slot_members`: `backend.services.permission.pipeline`, `backend.services.roster.roster_service.assign_slot_members`
- `clear_slot`: `backend.services.permission.pipeline`, `backend.services.roster.roster_service.clear_slot`
