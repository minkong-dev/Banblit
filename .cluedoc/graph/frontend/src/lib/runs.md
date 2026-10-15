---
source: frontend/src/lib/runs.ts
kind: file
---

# runs.ts

저장소 경로 `frontend/src/lib/runs.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_runs["runs.ts"]
  frontend_src_lib_runs --> frontend_src_lib_calendar["calendar.ts"]
  frontend_src_lib_runs --> frontend_src_lib_contract["contract.ts"]
  frontend_src_lib_runs_test["runs.test.ts"] --> frontend_src_lib_runs
  frontend_src_routes_AssignmentPanels["AssignmentPanels.tsx"] --> frontend_src_lib_runs
```

## imports

- [[graph/frontend/src/lib/calendar|calendar.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]

## imported by

- [[graph/frontend/src/lib/runs.test|runs.test.ts]]
- [[graph/frontend/src/routes/AssignmentPanels|AssignmentPanels.tsx]]
