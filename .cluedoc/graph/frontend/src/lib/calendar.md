---
source: frontend/src/lib/calendar.ts
kind: file
---

# calendar.ts

저장소 경로 `frontend/src/lib/calendar.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_calendar["calendar.ts"]
  frontend_src_components_CalendarBar["CalendarBar.tsx"] --> frontend_src_lib_calendar
  frontend_src_components_CalendarViews["CalendarViews.tsx"] --> frontend_src_lib_calendar
  frontend_src_components_NotificationMenu["NotificationMenu.tsx"] --> frontend_src_lib_calendar
  frontend_src_components_PostBoard["PostBoard.tsx"] --> frontend_src_lib_calendar
  frontend_src_components_PostComments["PostComments.tsx"] --> frontend_src_lib_calendar
  frontend_src_lib_assignment["assignment.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_calendar_test["calendar.test.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_dayEntries["dayEntries.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_notifications["notifications.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_pipeline_test["pipeline.test.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_pipeline["pipeline.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_runs["runs.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_slots["slots.ts"] --> frontend_src_lib_calendar
  frontend_src_lib_unavailableMap["unavailableMap.ts"] --> frontend_src_lib_calendar
  frontend_src_routes_AssignmentPanels["AssignmentPanels.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_DayDialogParts["DayDialogParts.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_SettingsBlinded["SettingsBlinded.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_SettingsEnsemble["SettingsEnsemble.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_SettingsReservations["SettingsReservations.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_SettingsRooms["SettingsRooms.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_lib_calendar
  frontend_src_routes_UnavailableCalendar["UnavailableCalendar.tsx"] --> frontend_src_lib_calendar
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/CalendarBar|CalendarBar.tsx]]
- [[graph/frontend/src/components/CalendarViews|CalendarViews.tsx]]
- [[graph/frontend/src/components/NotificationMenu|NotificationMenu.tsx]]
- [[graph/frontend/src/components/PostBoard|PostBoard.tsx]]
- [[graph/frontend/src/components/PostComments|PostComments.tsx]]
- [[graph/frontend/src/lib/assignment|assignment.ts]]
- [[graph/frontend/src/lib/calendar.test|calendar.test.ts]]
- [[graph/frontend/src/lib/dayEntries|dayEntries.ts]]
- [[graph/frontend/src/lib/notifications|notifications.ts]]
- [[graph/frontend/src/lib/pipeline.test|pipeline.test.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/runs|runs.ts]]
- [[graph/frontend/src/lib/slots|slots.ts]]
- [[graph/frontend/src/lib/unavailableMap|unavailableMap.ts]]
- [[graph/frontend/src/routes/AssignmentPanels|AssignmentPanels.tsx]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/DayDialogParts|DayDialogParts.tsx]]
- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/SettingsBlinded|SettingsBlinded.tsx]]
- [[graph/frontend/src/routes/SettingsEnsemble|SettingsEnsemble.tsx]]
- [[graph/frontend/src/routes/SettingsReservations|SettingsReservations.tsx]]
- [[graph/frontend/src/routes/SettingsRooms|SettingsRooms.tsx]]
- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]
- [[graph/frontend/src/routes/UnavailableCalendar|UnavailableCalendar.tsx]]
