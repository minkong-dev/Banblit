---
source: backend/src/backend/services/period/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/period/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_period_pipeline["pipeline.py"]
  backend_src_backend_services_period_pipeline --> backend_src_backend_db_models["models.py"]
  backend_src_backend_services_period_pipeline --> backend_src_backend_db_pipeline["pipeline.py"]
  backend_src_backend_services_period_pipeline --> backend_src_backend_services_notification_pipeline["pipeline.py"]
  backend_src_backend_services_period_pipeline --> backend_src_backend_services_period_close_service["close_service.py"]
  backend_src_backend_services_period_pipeline --> backend_src_backend_services_period_ensemble_service["ensemble_service.py"]
  backend_src_backend_services_period_pipeline --> backend_src_backend_services_period_period_crud_service["period_crud_service.py"]
  backend_src_backend_services_period_pipeline --> backend_src_backend_services_period_period_service["period_service.py"]
  backend_src_backend_api_routers_periods["periods.py"] --> backend_src_backend_services_period_pipeline
  backend_src_backend_api_routers_schedule["schedule.py"] --> backend_src_backend_services_period_pipeline
  backend_src_backend_jobs_auto_assign["auto_assign.py"] --> backend_src_backend_services_period_pipeline
  backend_src_backend_services_unavailable_unavailable_service["unavailable_service.py"] --> backend_src_backend_services_period_pipeline
  backend_tests_integration_db_test_focus_cancels_reservations["test_focus_cancels_reservations.py"] --> backend_src_backend_services_period_pipeline
  backend_tests_integration_db_test_period_service["test_period_service.py"] --> backend_src_backend_services_period_pipeline
  backend_tests_unit_test_auto_assign_rules["test_auto_assign_rules.py"] --> backend_src_backend_services_period_pipeline
  backend_tests_unit_test_record_points["test_record_points.py"] --> backend_src_backend_services_period_pipeline
```

## imports

- [[graph/backend/src/backend/db/models|models.py]]
- [[graph/backend/src/backend/db/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/notification/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/period/close_service|close_service.py]]
- [[graph/backend/src/backend/services/period/ensemble_service|ensemble_service.py]]
- [[graph/backend/src/backend/services/period/period_crud_service|period_crud_service.py]]
- [[graph/backend/src/backend/services/period/period_service|period_service.py]]

## imported by

- [[graph/backend/src/backend/api/routers/periods|periods.py]]
- [[graph/backend/src/backend/api/routers/schedule|schedule.py]]
- [[graph/backend/src/backend/jobs/auto_assign|auto_assign.py]]
- [[graph/backend/src/backend/services/unavailable/unavailable_service|unavailable_service.py]]
- [[graph/backend/tests/integration/db/test_focus_cancels_reservations|test_focus_cancels_reservations.py]]
- [[graph/backend/tests/integration/db/test_period_service|test_period_service.py]]
- [[graph/backend/tests/unit/test_auto_assign_rules|test_auto_assign_rules.py]]
- [[graph/backend/tests/unit/test_record_points|test_record_points.py]]

## 함수와 호출

- `schedule_report`: `backend.services.period.period_service`
- `stored_report`: `backend.services.period.period_service`
- `run_period_assignment`: `backend.db.pipeline`, `backend.services.period.period_service`
- `fix_closed_period`: `backend.db.pipeline`, `backend.services.notification.pipeline`, `backend.services.period.period_service`
- `apply_saved_record`: `backend.db.pipeline`, `backend.services.notification.pipeline`, `backend.services.period.close_service`
