---
source: frontend/src/components/CalendarBar.tsx
kind: file
---

# CalendarBar.tsx

저장소 경로 `frontend/src/components/CalendarBar.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_CalendarBar["CalendarBar.tsx"]
  frontend_src_components_CalendarBar --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_CalendarBar --> frontend_src_lib_calendar["calendar.ts"]
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_components_CalendarBar
  frontend_src_routes_UnavailableCalendar["UnavailableCalendar.tsx"] --> frontend_src_components_CalendarBar
```

## imports

- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/lib/calendar|calendar.ts]]

## imported by

- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/UnavailableCalendar|UnavailableCalendar.tsx]]
