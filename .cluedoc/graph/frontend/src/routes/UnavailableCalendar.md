---
source: frontend/src/routes/UnavailableCalendar.tsx
kind: file
---

# UnavailableCalendar.tsx

저장소 경로 `frontend/src/routes/UnavailableCalendar.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_UnavailableCalendar["UnavailableCalendar.tsx"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_components_CalendarBar["CalendarBar.tsx"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_components_CalendarViews["CalendarViews.tsx"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_components_MemberSearch["MemberSearch.tsx"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_components_Modal["Modal.tsx"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_components_TeamSearch["TeamSearch.tsx"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_lib_calendar["calendar.ts"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_lib_dayEntries["dayEntries.ts"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_lib_loading["loading.ts"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_lib_roster["roster.ts"]
  frontend_src_routes_UnavailableCalendar --> frontend_src_lib_unavailableMap["unavailableMap.ts"]
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_routes_UnavailableCalendar
```

## imports

- [[graph/frontend/src/components/CalendarBar|CalendarBar.tsx]]
- [[graph/frontend/src/components/CalendarViews|CalendarViews.tsx]]
- [[graph/frontend/src/components/MemberSearch|MemberSearch.tsx]]
- [[graph/frontend/src/components/Modal|Modal.tsx]]
- [[graph/frontend/src/components/TeamSearch|TeamSearch.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/calendar|calendar.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/dayEntries|dayEntries.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]
- [[graph/frontend/src/lib/unavailableMap|unavailableMap.ts]]

## imported by

- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]
