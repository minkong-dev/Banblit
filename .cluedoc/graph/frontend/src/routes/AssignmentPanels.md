---
source: frontend/src/routes/AssignmentPanels.tsx
kind: file
---

# AssignmentPanels.tsx

저장소 경로 `frontend/src/routes/AssignmentPanels.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_AssignmentPanels["AssignmentPanels.tsx"]
  frontend_src_routes_AssignmentPanels --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_routes_AssignmentPanels --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_AssignmentPanels --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_AssignmentPanels --> frontend_src_lib_assignment["assignment.ts"]
  frontend_src_routes_AssignmentPanels --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_AssignmentPanels --> frontend_src_lib_loading["loading.ts"]
  frontend_src_routes_AssignmentPanels --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_AssignmentPanels --> frontend_src_lib_runs["runs.ts"]
  frontend_src_routes_AssignmentPanels --> frontend_src_lib_toast["toast.ts"]
  frontend_src_routes_Assignment["Assignment.tsx"] --> frontend_src_routes_AssignmentPanels
```

## imports

- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/assignment|assignment.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/runs|runs.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]

## imported by

- [[graph/frontend/src/routes/Assignment|Assignment.tsx]]
