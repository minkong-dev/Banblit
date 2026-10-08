---
source: backend/src/backend/db/engine.py
kind: file
---

# engine.py

저장소 경로 `backend/src/backend/db/engine.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_db_engine["engine.py"]
  backend_src_backend_db_pipeline["pipeline.py"] --> backend_src_backend_db_engine
  backend_tests_unit_test_db_engine["test_db_engine.py"] --> backend_src_backend_db_engine
```

## imports

- 없음

## imported by

- [[graph/backend/src/backend/db/pipeline|pipeline.py]]
- [[graph/backend/tests/unit/test_db_engine|test_db_engine.py]]

## 함수와 호출

- `_timeout_seconds`
- `create_db_engine`
