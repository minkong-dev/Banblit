---
source: backend/src/backend/services/unavailable/unavailable_service.py
kind: file
---

# unavailable_service.py

저장소 경로 `backend/src/backend/services/unavailable/unavailable_service.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_unavailable_unavailable_service["unavailable_service.py"]
  backend_src_backend_services_unavailable_unavailable_service --> backend_src_backend_db_models["models.py"]
  backend_src_backend_services_unavailable_unavailable_service --> backend_src_backend_services_notification_pipeline["pipeline.py"]
  backend_src_backend_services_unavailable_unavailable_service --> backend_src_backend_services_permission_pipeline["pipeline.py"]
  backend_src_backend_services_unavailable_unavailable_service --> backend_src_backend_services_settings_pipeline["pipeline.py"]
  backend_src_backend_services_unavailable_unavailable_service --> backend_src_backend_services_validation_pipeline["pipeline.py"]
  backend_src_backend_services_unavailable_pipeline["pipeline.py"] --> backend_src_backend_services_unavailable_unavailable_service
```

## imports

- [[graph/backend/src/backend/db/models|models.py]]
- [[graph/backend/src/backend/services/notification/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/permission/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/settings/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/validation/pipeline|pipeline.py]]

## imported by

- [[graph/backend/src/backend/services/unavailable/pipeline|pipeline.py]]

## 함수와 호출

- `_require_self`
- `_require_read`: `backend.services.permission.pipeline`
- `list_unavailable`
- `list_all_unavailable`
- `create_unavailable`: `backend.db.models`, `backend.services.settings.pipeline`, `backend.services.validation.pipeline`
- `update_unavailable`: `backend.services.settings.pipeline`, `backend.services.validation.pipeline`
- `reject_unavailable`: `backend.services.notification.pipeline`, `backend.services.permission.pipeline`, `backend.services.validation.pipeline`
- `delete_unavailable`
