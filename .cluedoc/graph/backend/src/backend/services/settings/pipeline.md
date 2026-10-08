---
source: backend/src/backend/services/settings/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/settings/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_settings_pipeline["pipeline.py"]
  backend_src_backend_services_settings_pipeline --> backend_src_backend_services_settings_settings_service["settings_service.py"]
  backend_src_backend_api_routers_schedule["schedule.py"] --> backend_src_backend_services_settings_pipeline
  backend_src_backend_api_routers_settings["settings.py"] --> backend_src_backend_services_settings_pipeline
  backend_src_backend_services_period_ensemble_service["ensemble_service.py"] --> backend_src_backend_services_settings_pipeline
  backend_src_backend_services_period_period_service["period_service.py"] --> backend_src_backend_services_settings_pipeline
  backend_src_backend_services_reservation_reservation_service["reservation_service.py"] --> backend_src_backend_services_settings_pipeline
  backend_src_backend_services_unavailable_unavailable_service["unavailable_service.py"] --> backend_src_backend_services_settings_pipeline
```

## imports

- [[graph/backend/src/backend/services/settings/settings_service|settings_service.py]]

## imported by

- [[graph/backend/src/backend/api/routers/schedule|schedule.py]]
- [[graph/backend/src/backend/api/routers/settings|settings.py]]
- [[graph/backend/src/backend/services/period/ensemble_service|ensemble_service.py]]
- [[graph/backend/src/backend/services/period/period_service|period_service.py]]
- [[graph/backend/src/backend/services/reservation/reservation_service|reservation_service.py]]
- [[graph/backend/src/backend/services/unavailable/unavailable_service|unavailable_service.py]]
