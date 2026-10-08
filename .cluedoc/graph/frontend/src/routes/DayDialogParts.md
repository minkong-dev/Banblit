---
source: frontend/src/routes/DayDialogParts.tsx
kind: file
---

# DayDialogParts.tsx

저장소 경로 `frontend/src/routes/DayDialogParts.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_DayDialogParts["DayDialogParts.tsx"]
  frontend_src_routes_DayDialogParts --> frontend_src_components_Dropdown["Dropdown.tsx"]
  frontend_src_routes_DayDialogParts --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_DayDialogParts --> frontend_src_lib_calendar["calendar.ts"]
  frontend_src_routes_DayDialogParts --> frontend_src_lib_dayEntries["dayEntries.ts"]
  frontend_src_routes_DayDialogParts --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_DayDialogParts --> frontend_src_lib_roster["roster.ts"]
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_routes_DayDialogParts
  frontend_src_routes_SchedulerViews["SchedulerViews.tsx"] --> frontend_src_routes_DayDialogParts
```

## imports

- [[graph/frontend/src/components/Dropdown|Dropdown.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/lib/calendar|calendar.ts]]
- [[graph/frontend/src/lib/dayEntries|dayEntries.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]

## imported by

- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/SchedulerViews|SchedulerViews.tsx]]
