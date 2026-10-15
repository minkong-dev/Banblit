---
source: frontend/src/components/TeamSearch.tsx
kind: file
---

# TeamSearch.tsx

저장소 경로 `frontend/src/components/TeamSearch.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_TeamSearch["TeamSearch.tsx"]
  frontend_src_components_TeamSearch --> frontend_src_components_SearchList["SearchList.tsx"]
  frontend_src_components_TeamSearch --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_TeamSearch --> frontend_src_components_queries["queries.ts"]
  frontend_src_components_TeamSearch --> frontend_src_lib_contract["contract.ts"]
  frontend_src_components_TeamSearch --> frontend_src_lib_loading["loading.ts"]
  frontend_src_components_TeamSearch --> frontend_src_lib_roster["roster.ts"]
  frontend_src_routes_UnavailableCalendar["UnavailableCalendar.tsx"] --> frontend_src_components_TeamSearch
```

## imports

- [[graph/frontend/src/components/SearchList|SearchList.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]

## imported by

- [[graph/frontend/src/routes/UnavailableCalendar|UnavailableCalendar.tsx]]
