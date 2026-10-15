---
source: frontend/src/components/SearchList.tsx
kind: file
---

# SearchList.tsx

저장소 경로 `frontend/src/components/SearchList.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_SearchList["SearchList.tsx"]
  frontend_src_components_SearchList --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_MemberSearch["MemberSearch.tsx"] --> frontend_src_components_SearchList
  frontend_src_components_TeamSearch["TeamSearch.tsx"] --> frontend_src_components_SearchList
```

## imports

- [[graph/frontend/src/components/controls|controls.tsx]]

## imported by

- [[graph/frontend/src/components/MemberSearch|MemberSearch.tsx]]
- [[graph/frontend/src/components/TeamSearch|TeamSearch.tsx]]
