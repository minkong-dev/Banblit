---
source: backend/src/backend/jobs/__init__.py
kind: file
---

# __init__.py

저장소 경로 `backend/src/backend/jobs/__init__.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_jobs___init__["__init__.py"]
  backend_tests_integration_db_test_auto_assign["test_auto_assign.py"] --> backend_src_backend_jobs___init__
  backend_tests_integration_db_test_notifications["test_notifications.py"] --> backend_src_backend_jobs___init__
```

## imports

- 없음

## imported by

- [[graph/backend/tests/integration/db/test_auto_assign|test_auto_assign.py]]
- [[graph/backend/tests/integration/db/test_notifications|test_notifications.py]]
