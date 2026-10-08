---
source: frontend/src/lib/dayEntries.ts
kind: file
---

# dayEntries.ts

저장소 경로 `frontend/src/lib/dayEntries.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_dayEntries["dayEntries.ts"]
  frontend_src_lib_dayEntries --> frontend_src_lib_calendar["calendar.ts"]
  frontend_src_lib_dayEntries --> frontend_src_lib_contract["contract.ts"]
  frontend_src_lib_dayEntries --> frontend_src_lib_loading["loading.ts"]
  frontend_src_lib_dayEntries --> frontend_src_lib_roster["roster.ts"]
  frontend_src_lib_dayEntries --> frontend_src_lib_slots["slots.ts"]
  frontend_src_lib_dayEntries_test["dayEntries.test.ts"] --> frontend_src_lib_dayEntries
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_lib_dayEntries
  frontend_src_routes_DayDialogParts["DayDialogParts.tsx"] --> frontend_src_lib_dayEntries
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_lib_dayEntries
  frontend_src_routes_SchedulerViews["SchedulerViews.tsx"] --> frontend_src_lib_dayEntries
  frontend_src_routes_SettingsEnsemble["SettingsEnsemble.tsx"] --> frontend_src_lib_dayEntries
```

## imports

- [[graph/frontend/src/lib/calendar|calendar.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]
- [[graph/frontend/src/lib/slots|slots.ts]]

## imported by

- [[graph/frontend/src/lib/dayEntries.test|dayEntries.test.ts]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/DayDialogParts|DayDialogParts.tsx]]
- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/SchedulerViews|SchedulerViews.tsx]]
- [[graph/frontend/src/routes/SettingsEnsemble|SettingsEnsemble.tsx]]
