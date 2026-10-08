---
source: frontend/src/routes/Assignment.tsx
kind: file
---

# Assignment.tsx

저장소 경로 `frontend/src/routes/Assignment.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_Assignment["Assignment.tsx"]
  frontend_src_routes_Assignment --> frontend_src_components_Dropdown["Dropdown.tsx"]
  frontend_src_routes_Assignment --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_routes_Assignment --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_Assignment --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_Assignment --> frontend_src_lib_account["account.ts"]
  frontend_src_routes_Assignment --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_Assignment --> frontend_src_lib_assignment["assignment.ts"]
  frontend_src_routes_Assignment --> frontend_src_lib_confirm["confirm.ts"]
  frontend_src_routes_Assignment --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_Assignment --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_Assignment --> frontend_src_lib_toast["toast.ts"]
  frontend_src_routes_Assignment --> frontend_src_routes_AssignmentPanels["AssignmentPanels.tsx"]
  frontend_src_App["App.tsx"] --> frontend_src_routes_Assignment
```

## imports

- [[graph/frontend/src/components/Dropdown|Dropdown.tsx]]
- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/account|account.ts]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/assignment|assignment.ts]]
- [[graph/frontend/src/lib/confirm|confirm.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]
- [[graph/frontend/src/routes/AssignmentPanels|AssignmentPanels.tsx]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
