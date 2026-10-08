---
source: frontend/src/lib/roster.ts
kind: file
---

# roster.ts

저장소 경로 `frontend/src/lib/roster.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_roster["roster.ts"]
  frontend_src_lib_roster --> frontend_src_lib_contract["contract.ts"]
  frontend_src_lib_roster --> frontend_src_lib_teamColors["teamColors.ts"]
  frontend_src_lib_roster --> frontend_src_lib_validate["validate.ts"]
  frontend_src_components_AppShell["AppShell.tsx"] --> frontend_src_lib_roster
  frontend_src_lib_dayEntries_test["dayEntries.test.ts"] --> frontend_src_lib_roster
  frontend_src_lib_dayEntries["dayEntries.ts"] --> frontend_src_lib_roster
  frontend_src_lib_pipeline["pipeline.ts"] --> frontend_src_lib_roster
  frontend_src_lib_roster_test["roster.test.ts"] --> frontend_src_lib_roster
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_lib_roster
  frontend_src_routes_DayDialogParts["DayDialogParts.tsx"] --> frontend_src_lib_roster
  frontend_src_routes_Profile["Profile.tsx"] --> frontend_src_lib_roster
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_lib_roster
  frontend_src_routes_SchedulerViews["SchedulerViews.tsx"] --> frontend_src_lib_roster
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_lib_roster
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_lib_roster
```

## imports

- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/teamColors|teamColors.ts]]
- [[graph/frontend/src/lib/validate|validate.ts]]

## imported by

- [[graph/frontend/src/components/AppShell|AppShell.tsx]]
- [[graph/frontend/src/lib/dayEntries.test|dayEntries.test.ts]]
- [[graph/frontend/src/lib/dayEntries|dayEntries.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/roster.test|roster.test.ts]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/DayDialogParts|DayDialogParts.tsx]]
- [[graph/frontend/src/routes/Profile|Profile.tsx]]
- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/SchedulerViews|SchedulerViews.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
