---
source: frontend/src/routes/DayDialog.tsx
kind: file
---

# DayDialog.tsx

저장소 경로 `frontend/src/routes/DayDialog.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_DayDialog["DayDialog.tsx"]
  frontend_src_routes_DayDialog --> frontend_src_components_Dropdown["Dropdown.tsx"]
  frontend_src_routes_DayDialog --> frontend_src_components_Modal["Modal.tsx"]
  frontend_src_routes_DayDialog --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_DayDialog --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_DayDialog --> frontend_src_lib_calendar["calendar.ts"]
  frontend_src_routes_DayDialog --> frontend_src_lib_confirm["confirm.ts"]
  frontend_src_routes_DayDialog --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_DayDialog --> frontend_src_lib_dayEntries["dayEntries.ts"]
  frontend_src_routes_DayDialog --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_DayDialog --> frontend_src_lib_roster["roster.ts"]
  frontend_src_routes_DayDialog --> frontend_src_lib_toast["toast.ts"]
  frontend_src_routes_DayDialog --> frontend_src_routes_DayDialogParts["DayDialogParts.tsx"]
  frontend_src_routes_DayDialog --> frontend_src_routes_SettingsEnsemble["SettingsEnsemble.tsx"]
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_routes_DayDialog
```

## imports

- [[graph/frontend/src/components/Dropdown|Dropdown.tsx]]
- [[graph/frontend/src/components/Modal|Modal.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/calendar|calendar.ts]]
- [[graph/frontend/src/lib/confirm|confirm.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/dayEntries|dayEntries.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]
- [[graph/frontend/src/routes/DayDialogParts|DayDialogParts.tsx]]
- [[graph/frontend/src/routes/SettingsEnsemble|SettingsEnsemble.tsx]]

## imported by

- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
