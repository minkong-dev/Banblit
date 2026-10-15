---
source: backend/src/backend/services/storage/file_store.py
kind: file
---

# file_store.py

저장소 경로 `backend/src/backend/services/storage/file_store.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_storage_file_store["file_store.py"]
  backend_src_backend_services_storage_pipeline["pipeline.py"] --> backend_src_backend_services_storage_file_store
```

## imports

- 없음

## imported by

- [[graph/backend/src/backend/services/storage/pipeline|pipeline.py]]

## 함수와 호출

- `storage_root`
- `display_name`
- `stored_path`
- `write_stream`
