---
source: frontend/src/lib/notifications.ts
kind: file
---

# notifications.ts

저장소 경로 `frontend/src/lib/notifications.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_notifications["notifications.ts"]
  frontend_src_lib_notifications --> frontend_src_lib_calendar["calendar.ts"]
  frontend_src_lib_notifications --> frontend_src_lib_contract["contract.ts"]
  frontend_src_lib_notifications --> frontend_src_lib_slots["slots.ts"]
  frontend_src_components_RejectDialog["RejectDialog.tsx"] --> frontend_src_lib_notifications
  frontend_src_lib_notifications_test["notifications.test.ts"] --> frontend_src_lib_notifications
  frontend_src_lib_pipeline["pipeline.ts"] --> frontend_src_lib_notifications
```

## imports

- [[graph/frontend/src/lib/calendar|calendar.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/slots|slots.ts]]

## imported by

- [[graph/frontend/src/components/RejectDialog|RejectDialog.tsx]]
- [[graph/frontend/src/lib/notifications.test|notifications.test.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
