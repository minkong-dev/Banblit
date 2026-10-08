---
source: backend/src/backend/services/room/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/room/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_room_pipeline["pipeline.py"]
  backend_src_backend_services_room_pipeline --> backend_src_backend_services_room_room_service["room_service.py"]
  backend_src_backend_api_routers_rooms["rooms.py"] --> backend_src_backend_services_room_pipeline
  backend_src_backend_services_period_ensemble_service["ensemble_service.py"] --> backend_src_backend_services_room_pipeline
  backend_src_backend_services_reservation_reservation_service["reservation_service.py"] --> backend_src_backend_services_room_pipeline
  backend_tests_integration_db_test_room_endpoints["test_room_endpoints.py"] --> backend_src_backend_services_room_pipeline
```

## imports

- [[graph/backend/src/backend/services/room/room_service|room_service.py]]

## imported by

- [[graph/backend/src/backend/api/routers/rooms|rooms.py]]
- [[graph/backend/src/backend/services/period/ensemble_service|ensemble_service.py]]
- [[graph/backend/src/backend/services/reservation/reservation_service|reservation_service.py]]
- [[graph/backend/tests/integration/db/test_room_endpoints|test_room_endpoints.py]]
