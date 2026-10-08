---
source: frontend/src/components/PostBoard.tsx
kind: file
---

# PostBoard.tsx

저장소 경로 `frontend/src/components/PostBoard.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_PostBoard["PostBoard.tsx"]
  frontend_src_components_PostBoard --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_components_PostBoard --> frontend_src_components_Pager["Pager.tsx"]
  frontend_src_components_PostBoard --> frontend_src_components_PostActions["PostActions.tsx"]
  frontend_src_components_PostBoard --> frontend_src_components_PostAttachments["PostAttachments.tsx"]
  frontend_src_components_PostBoard --> frontend_src_components_PostComments["PostComments.tsx"]
  frontend_src_components_PostBoard --> frontend_src_components_RichText["RichText.tsx"]
  frontend_src_components_PostBoard --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_PostBoard --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_components_PostBoard --> frontend_src_lib_contract["contract.ts"]
  frontend_src_components_PostBoard --> frontend_src_lib_loading["loading.ts"]
  frontend_src_components_PostBoard --> frontend_src_lib_paging["paging.ts"]
  frontend_src_components_PostBoard --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_Board["Board.tsx"] --> frontend_src_components_PostBoard
  frontend_src_routes_Notices["Notices.tsx"] --> frontend_src_components_PostBoard
```

## imports

- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/Pager|Pager.tsx]]
- [[graph/frontend/src/components/PostActions|PostActions.tsx]]
- [[graph/frontend/src/components/PostAttachments|PostAttachments.tsx]]
- [[graph/frontend/src/components/PostComments|PostComments.tsx]]
- [[graph/frontend/src/components/RichText|RichText.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/hooks|hooks.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/paging|paging.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]

## imported by

- [[graph/frontend/src/routes/Board|Board.tsx]]
- [[graph/frontend/src/routes/Notices|Notices.tsx]]
