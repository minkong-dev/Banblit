---
source: backend/src/backend/services/storage/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/storage/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_storage_pipeline["pipeline.py"]
  backend_src_backend_services_storage_pipeline --> backend_src_backend_services_storage_file_store["file_store.py"]
  backend_src_backend_services_board_attachment_service["attachment_service.py"] --> backend_src_backend_services_storage_pipeline
  backend_src_backend_services_roster_avatar_service["avatar_service.py"] --> backend_src_backend_services_storage_pipeline
  backend_tests_unit_test_board_rules["test_board_rules.py"] --> backend_src_backend_services_storage_pipeline
```

## imports

- [[graph/backend/src/backend/services/storage/file_store|file_store.py]]

## imported by

- [[graph/backend/src/backend/services/board/attachment_service|attachment_service.py]]
- [[graph/backend/src/backend/services/roster/avatar_service|avatar_service.py]]
- [[graph/backend/tests/unit/test_board_rules|test_board_rules.py]]
