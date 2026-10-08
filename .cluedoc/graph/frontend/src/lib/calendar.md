---
source: frontend/src/lib/calendar.ts
kind: file
---

# calendar.ts

저장소 경로 `frontend/src/lib/calendar.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_calendar["calendar.ts"]
  frontend_src_lib_assignment["assignment.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_calendar_test["calendar.test.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_dayEntries["dayEntries.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_notifications["notifications.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_pipeline["pipeline.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_slots["slots.ts"] --> frontend_src_lib_calendar
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_DayDialogParts["DayDialogParts.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_lib_calendar
```

## imports

- 없음

## imported by

- [[graph/frontend/src/lib/assignment|assignment.ts]]
- [[graph/frontend/src/lib/calendar.test|calendar.test.ts]]
- [[graph/frontend/src/lib/dayEntries|dayEntries.ts]]
- [[graph/frontend/src/lib/notifications|notifications.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/slots|slots.ts]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/DayDialogParts|DayDialogParts.tsx]]
- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]
