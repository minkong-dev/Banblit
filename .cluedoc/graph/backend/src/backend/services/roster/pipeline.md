---
source: backend/src/backend/services/roster/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/roster/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_roster_pipeline["pipeline.py"]
  backend_src_backend_services_roster_pipeline --> backend_src_backend_services_roster_avatar_service["avatar_service.py"]
  backend_src_backend_services_roster_pipeline --> backend_src_backend_services_roster_roster_service["roster_service.py"]
  backend_src_backend_api_routers_auth["auth.py"] --> backend_src_backend_services_roster_pipeline
  backend_src_backend_api_routers_roster["roster.py"] --> backend_src_backend_services_roster_pipeline
  backend_src_backend_services_reservation_reservation_service["reservation_service.py"] --> backend_src_backend_services_roster_pipeline
  backend_tests_integration_db_test_roster_endpoints["test_roster_endpoints.py"] --> backend_src_backend_services_roster_pipeline
```

## imports

- [[graph/backend/src/backend/services/roster/avatar_service|avatar_service.py]]
- [[graph/backend/src/backend/services/roster/roster_service|roster_service.py]]

## imported by

- [[graph/backend/src/backend/api/routers/auth|auth.py]]
- [[graph/backend/src/backend/api/routers/roster|roster.py]]
- [[graph/backend/src/backend/services/reservation/reservation_service|reservation_service.py]]
- [[graph/backend/tests/integration/db/test_roster_endpoints|test_roster_endpoints.py]]
