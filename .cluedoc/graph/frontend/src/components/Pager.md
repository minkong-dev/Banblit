---
source: frontend/src/components/Pager.tsx
kind: file
---

# Pager.tsx

저장소 경로 `frontend/src/components/Pager.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_Pager["Pager.tsx"]
  frontend_src_components_Pager --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_Pager --> frontend_src_lib_paging["paging.ts"]
  frontend_src_components_Pager_test["Pager.test.tsx"] --> frontend_src_components_Pager
  frontend_src_components_PostBoard["PostBoard.tsx"] --> frontend_src_components_Pager
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_components_Pager
```

## imports

- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/lib/paging|paging.ts]]

## imported by

- [[graph/frontend/src/components/Pager.test|Pager.test.tsx]]
- [[graph/frontend/src/components/PostBoard|PostBoard.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
