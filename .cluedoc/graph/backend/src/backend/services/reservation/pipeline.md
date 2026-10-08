---
source: backend/src/backend/services/reservation/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/reservation/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_reservation_pipeline["pipeline.py"]
  backend_src_backend_services_reservation_pipeline --> backend_src_backend_services_reservation_reservation_service["reservation_service.py"]
  backend_src_backend_api_routers_reservations["reservations.py"] --> backend_src_backend_services_reservation_pipeline
  backend_src_backend_services_period_period_crud_service["period_crud_service.py"] --> backend_src_backend_services_reservation_pipeline
  backend_tests_integration_db_test_reservation_endpoints["test_reservation_endpoints.py"] --> backend_src_backend_services_reservation_pipeline
```

## imports

- [[graph/backend/src/backend/services/reservation/reservation_service|reservation_service.py]]

## imported by

- [[graph/backend/src/backend/api/routers/reservations|reservations.py]]
- [[graph/backend/src/backend/services/period/period_crud_service|period_crud_service.py]]
- [[graph/backend/tests/integration/db/test_reservation_endpoints|test_reservation_endpoints.py]]
