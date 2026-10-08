---
source: backend/src/backend/db/health.py
kind: file
---

# health.py

저장소 경로 `backend/src/backend/db/health.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_db_health["health.py"]
  backend_src_backend_db_pipeline["pipeline.py"] --> backend_src_backend_db_health
  backend_tests_unit_test_api_health["test_api_health.py"] --> backend_src_backend_db_health
  backend_tests_unit_test_db_health["test_db_health.py"] --> backend_src_backend_db_health
```

## imports

- 없음

## imported by

- [[graph/backend/src/backend/db/pipeline|pipeline.py]]
- [[graph/backend/tests/unit/test_api_health|test_api_health.py]]
- [[graph/backend/tests/unit/test_db_health|test_db_health.py]]

## 함수와 호출

- `check_database`
