---
source: frontend/src/routes/Scheduler.tsx
kind: file
---

# Scheduler.tsx

저장소 경로 `frontend/src/routes/Scheduler.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_Scheduler["Scheduler.tsx"]
  frontend_src_routes_Scheduler --> frontend_src_components_Dropdown["Dropdown.tsx"]
  frontend_src_routes_Scheduler --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_routes_Scheduler --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_Scheduler --> frontend_src_components_icons["icons.tsx"]
  frontend_src_routes_Scheduler --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_Scheduler --> frontend_src_lib_account["account.ts"]
  frontend_src_routes_Scheduler --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_Scheduler --> frontend_src_lib_calendar["calendar.ts"]
  frontend_src_routes_Scheduler --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_Scheduler --> frontend_src_lib_dayEntries["dayEntries.ts"]
  frontend_src_routes_Scheduler --> frontend_src_lib_loading["loading.ts"]
  frontend_src_routes_Scheduler --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_Scheduler --> frontend_src_lib_roster["roster.ts"]
  frontend_src_routes_Scheduler --> frontend_src_routes_DayDialog["DayDialog.tsx"]
  frontend_src_routes_Scheduler --> frontend_src_routes_SchedulerViews["SchedulerViews.tsx"]
  frontend_src_App["App.tsx"] --> frontend_src_routes_Scheduler
```

## imports

- [[graph/frontend/src/components/Dropdown|Dropdown.tsx]]
- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/icons|icons.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/account|account.ts]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/calendar|calendar.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/dayEntries|dayEntries.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/SchedulerViews|SchedulerViews.tsx]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
