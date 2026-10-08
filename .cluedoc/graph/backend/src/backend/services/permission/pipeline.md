---
source: backend/src/backend/services/permission/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/permission/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_permission_pipeline["pipeline.py"]
  backend_src_backend_services_permission_pipeline --> backend_src_backend_services_permission_permission_service["permission_service.py"]
  backend_src_backend_api_auth_dependency["auth_dependency.py"] --> backend_src_backend_services_permission_pipeline
  backend_src_backend_api_routers_auth["auth.py"] --> backend_src_backend_services_permission_pipeline
  backend_src_backend_api_routers_permissions["permissions.py"] --> backend_src_backend_services_permission_pipeline
  backend_src_backend_api_routers_roster["roster.py"] --> backend_src_backend_services_permission_pipeline
  backend_src_backend_services_auth_auth_service["auth_service.py"] --> backend_src_backend_services_permission_pipeline
  backend_src_backend_services_board_board_service["board_service.py"] --> backend_src_backend_services_permission_pipeline
  backend_src_backend_services_reservation_reservation_service["reservation_service.py"] --> backend_src_backend_services_permission_pipeline
  backend_src_backend_services_roster_roster_service["roster_service.py"] --> backend_src_backend_services_permission_pipeline
  backend_src_backend_services_unavailable_unavailable_service["unavailable_service.py"] --> backend_src_backend_services_permission_pipeline
  backend_tests_integration_db_test_permission_endpoints["test_permission_endpoints.py"] --> backend_src_backend_services_permission_pipeline
```

## imports

- [[graph/backend/src/backend/services/permission/permission_service|permission_service.py]]

## imported by

- [[graph/backend/src/backend/api/auth_dependency|auth_dependency.py]]
- [[graph/backend/src/backend/api/routers/auth|auth.py]]
- [[graph/backend/src/backend/api/routers/permissions|permissions.py]]
- [[graph/backend/src/backend/api/routers/roster|roster.py]]
- [[graph/backend/src/backend/services/auth/auth_service|auth_service.py]]
- [[graph/backend/src/backend/services/board/board_service|board_service.py]]
- [[graph/backend/src/backend/services/reservation/reservation_service|reservation_service.py]]
- [[graph/backend/src/backend/services/roster/roster_service|roster_service.py]]
- [[graph/backend/src/backend/services/unavailable/unavailable_service|unavailable_service.py]]
- [[graph/backend/tests/integration/db/test_permission_endpoints|test_permission_endpoints.py]]
