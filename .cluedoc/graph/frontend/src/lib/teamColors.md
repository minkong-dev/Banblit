---
source: frontend/src/lib/teamColors.ts
kind: file
---

# teamColors.ts

저장소 경로 `frontend/src/lib/teamColors.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_teamColors["teamColors.ts"]
  frontend_src_components_queries["queries.ts"] --> frontend_src_lib_teamColors
  frontend_src_lib_assignment["assignment.ts"] --> frontend_src_lib_teamColors
  frontend_src_lib_roster["roster.ts"] --> frontend_src_lib_teamColors
  frontend_src_lib_teamColors_test["teamColors.test.ts"] --> frontend_src_lib_teamColors
  frontend_src_main["main.tsx"] --> frontend_src_lib_teamColors
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_lib_teamColors
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/assignment|assignment.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]
- [[graph/frontend/src/lib/teamColors.test|teamColors.test.ts]]
- [[graph/frontend/src/main|main.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
