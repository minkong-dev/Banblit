---
source: frontend/src/components/CalendarViews.tsx
kind: file
---

# CalendarViews.tsx

저장소 경로 `frontend/src/components/CalendarViews.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_CalendarViews["CalendarViews.tsx"]
  frontend_src_components_CalendarViews --> frontend_src_lib_dayEntries["dayEntries.ts"]
  frontend_src_components_CalendarViews --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_components_CalendarViews --> frontend_src_lib_roster["roster.ts"]
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_components_CalendarViews
  frontend_src_routes_UnavailableCalendar["UnavailableCalendar.tsx"] --> frontend_src_components_CalendarViews
```

## imports

- [[graph/frontend/src/lib/dayEntries|dayEntries.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]

## imported by

- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/UnavailableCalendar|UnavailableCalendar.tsx]]
