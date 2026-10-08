---
source: backend/src/backend/services/unavailable/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/unavailable/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_unavailable_pipeline["pipeline.py"]
  backend_src_backend_services_unavailable_pipeline --> backend_src_backend_services_unavailable_unavailable_service["unavailable_service.py"]
  backend_src_backend_api_routers_unavailable["unavailable.py"] --> backend_src_backend_services_unavailable_pipeline
```

## imports

- [[graph/backend/src/backend/services/unavailable/unavailable_service|unavailable_service.py]]

## imported by

- [[graph/backend/src/backend/api/routers/unavailable|unavailable.py]]
