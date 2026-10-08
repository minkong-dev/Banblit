---
source: frontend/src/routes/Teams.tsx
kind: file
---

# Teams.tsx

저장소 경로 `frontend/src/routes/Teams.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_Teams["Teams.tsx"]
  frontend_src_routes_Teams --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_routes_Teams --> frontend_src_components_MemberPicker["MemberPicker.tsx"]
  frontend_src_routes_Teams --> frontend_src_components_Modal["Modal.tsx"]
  frontend_src_routes_Teams --> frontend_src_components_Pager["Pager.tsx"]
  frontend_src_routes_Teams --> frontend_src_components_SeatRow["SeatRow.tsx"]
  frontend_src_routes_Teams --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_Teams --> frontend_src_components_icons["icons.tsx"]
  frontend_src_routes_Teams --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_account["account.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_confirm["confirm.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_loading["loading.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_paging["paging.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_roster["roster.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_teamColors["teamColors.ts"]
  frontend_src_routes_Teams --> frontend_src_lib_toast["toast.ts"]
  frontend_src_App["App.tsx"] --> frontend_src_routes_Teams
```

## imports

- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/MemberPicker|MemberPicker.tsx]]
- [[graph/frontend/src/components/Modal|Modal.tsx]]
- [[graph/frontend/src/components/Pager|Pager.tsx]]
- [[graph/frontend/src/components/SeatRow|SeatRow.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/icons|icons.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/account|account.ts]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/confirm|confirm.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/paging|paging.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]
- [[graph/frontend/src/lib/teamColors|teamColors.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
