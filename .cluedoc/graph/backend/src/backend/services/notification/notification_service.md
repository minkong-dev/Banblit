---
source: backend/src/backend/services/notification/notification_service.py
kind: file
---

# notification_service.py

저장소 경로 `backend/src/backend/services/notification/notification_service.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_notification_notification_service["notification_service.py"]
  backend_src_backend_services_notification_notification_service --> backend_src_backend_db_models["models.py"]
  backend_src_backend_services_notification_pipeline["pipeline.py"] --> backend_src_backend_services_notification_notification_service
```

## imports

- [[graph/backend/src/backend/db/models|models.py]]

## imported by

- [[graph/backend/src/backend/services/notification/pipeline|pipeline.py]]

## 함수와 호출

- `notify_assignment_updated`: `backend.db.models`
- `notify_rejected`: `backend.db.models`
- `list_notifications`
- `mark_all_read`
