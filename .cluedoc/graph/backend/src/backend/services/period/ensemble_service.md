---
source: backend/src/backend/services/period/ensemble_service.py
kind: file
---

# ensemble_service.py

저장소 경로 `backend/src/backend/services/period/ensemble_service.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_period_ensemble_service["ensemble_service.py"]
  backend_src_backend_services_period_ensemble_service --> backend_src_backend_db_models["models.py"]
  backend_src_backend_services_period_ensemble_service --> backend_src_backend_services_period_period_crud_service["period_crud_service.py"]
  backend_src_backend_services_period_ensemble_service --> backend_src_backend_services_room_pipeline["pipeline.py"]
  backend_src_backend_services_period_ensemble_service --> backend_src_backend_services_settings_pipeline["pipeline.py"]
  backend_src_backend_services_period_ensemble_service --> backend_src_backend_services_validation_pipeline["pipeline.py"]
  backend_src_backend_services_period_pipeline["pipeline.py"] --> backend_src_backend_services_period_ensemble_service
```

## imports

- [[graph/backend/src/backend/db/models|models.py]]
- [[graph/backend/src/backend/services/period/period_crud_service|period_crud_service.py]]
- [[graph/backend/src/backend/services/room/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/settings/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/validation/pipeline|pipeline.py]]

## imported by

- [[graph/backend/src/backend/services/period/pipeline|pipeline.py]]

## 함수와 호출

- `_ensemble_times`: `backend.services.settings.pipeline`, `backend.services.validation.pipeline`
- `set_ensemble`: `backend.services.period.period_crud_service`, `backend.services.room.pipeline`, `backend.services.validation.pipeline`
- `delete_ensemble`: `backend.services.period.period_crud_service`
- `set_ensemble_day`: `backend.services.period.period_crud_service`, `backend.services.room.pipeline`, `backend.services.validation.pipeline`
- `delete_ensemble_day`: `backend.services.period.period_crud_service`, `backend.services.validation.pipeline`
- `days_by_period`
