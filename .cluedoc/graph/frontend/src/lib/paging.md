---
source: frontend/src/lib/paging.ts
kind: file
---

# paging.ts

저장소 경로 `frontend/src/lib/paging.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_paging["paging.ts"]
  frontend_src_components_Pager["Pager.tsx"] --> frontend_src_lib_paging
  frontend_src_components_PostBoard["PostBoard.tsx"] --> frontend_src_lib_paging
  frontend_src_lib_paging_test["paging.test.ts"] --> frontend_src_lib_paging
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_lib_paging
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/Pager|Pager.tsx]]
- [[graph/frontend/src/components/PostBoard|PostBoard.tsx]]
- [[graph/frontend/src/lib/paging.test|paging.test.ts]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
