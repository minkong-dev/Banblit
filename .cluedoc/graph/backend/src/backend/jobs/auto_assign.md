---
source: backend/src/backend/jobs/auto_assign.py
kind: file
---

# auto_assign.py

저장소 경로 `backend/src/backend/jobs/auto_assign.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_jobs_auto_assign["auto_assign.py"]
  backend_src_backend_jobs_auto_assign --> backend_src_backend_db_models["models.py"]
  backend_src_backend_jobs_auto_assign --> backend_src_backend_db_pipeline["pipeline.py"]
  backend_src_backend_jobs_auto_assign --> backend_src_backend_services_board_pipeline["pipeline.py"]
  backend_src_backend_jobs_auto_assign --> backend_src_backend_services_notification_pipeline["pipeline.py"]
  backend_src_backend_jobs_auto_assign --> backend_src_backend_services_period_pipeline["pipeline.py"]
  backend_tests_integration_db_test_auto_assign["test_auto_assign.py"] --> backend_src_backend_jobs_auto_assign
  backend_tests_integration_db_test_notifications["test_notifications.py"] --> backend_src_backend_jobs_auto_assign
```

## imports

- [[graph/backend/src/backend/db/models|models.py]]
- [[graph/backend/src/backend/db/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/board/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/notification/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/period/pipeline|pipeline.py]]

## imported by

- [[graph/backend/tests/integration/db/test_auto_assign|test_auto_assign.py]]
- [[graph/backend/tests/integration/db/test_notifications|test_notifications.py]]

## 함수와 호출

- `due_slots`
- `run_due_assignments`: `backend.services.period.pipeline`
- `_ran_slots_today`
- `_run_one`: `backend.services.notification.pipeline`, `backend.services.period.pipeline`
- `_mark_ran`: `backend.db.models`
- `enabled_from_env`
- `interval_seconds_from_env`
- `main`: `backend.db.pipeline`, `backend.services.board.pipeline`
