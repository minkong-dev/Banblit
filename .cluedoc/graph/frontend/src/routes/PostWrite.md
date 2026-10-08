---
source: frontend/src/routes/PostWrite.tsx
kind: file
---

# PostWrite.tsx

저장소 경로 `frontend/src/routes/PostWrite.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_PostWrite["PostWrite.tsx"]
  frontend_src_routes_PostWrite --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_routes_PostWrite --> frontend_src_components_PostWriteForm["PostWriteForm.tsx"]
  frontend_src_routes_PostWrite --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_PostWrite --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_PostWrite --> frontend_src_lib_account["account.ts"]
  frontend_src_routes_PostWrite --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_PostWrite --> frontend_src_lib_loading["loading.ts"]
  frontend_src_routes_PostWrite --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_App["App.tsx"] --> frontend_src_routes_PostWrite
```

## imports

- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/PostWriteForm|PostWriteForm.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/account|account.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
