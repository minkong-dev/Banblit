---
source: frontend/src/routes/Notices.tsx
kind: file
---

# Notices.tsx

저장소 경로 `frontend/src/routes/Notices.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_Notices["Notices.tsx"]
  frontend_src_routes_Notices --> frontend_src_components_PostBoard["PostBoard.tsx"]
  frontend_src_routes_Notices --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_Notices --> frontend_src_lib_account["account.ts"]
  frontend_src_App["App.tsx"] --> frontend_src_routes_Notices
```

## imports

- [[graph/frontend/src/components/PostBoard|PostBoard.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/account|account.ts]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
