---
source: backend/tests/integration/db/test_db_connection.py
kind: file
---

# test_db_connection.py

저장소 경로 `backend/tests/integration/db/test_db_connection.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_tests_integration_db_test_db_connection["test_db_connection.py"]
  backend_tests_integration_db_test_db_connection --> backend_src_backend_db_pipeline["pipeline.py"]
```

## imports

- [[graph/backend/src/backend/db/pipeline|pipeline.py]]

## imported by

- 없음

## 함수와 호출

- `test_database_answers_select_one`: `backend.db.pipeline`
